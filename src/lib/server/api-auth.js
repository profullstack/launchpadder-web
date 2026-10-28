/**
 * Who is calling an API route, for routes that need a stable owner id.
 *
 * Accepted, in order:
 *  1. X-API-Key: fed_key_...      a federation partner's API key  -> 'partner:<uuid>'
 *  2. Authorization: Bearer <jwt>  a partner JWT from /api/v1/auth/token -> 'partner:<uuid>'
 *                                  (only when JWT_SECRET is set: an unset secret would let
 *                                  anyone mint one), or a Supabase user access token -> '<user uuid>'
 *  3. the session cookie (locals.user, set in hooks.server.js)    -> '<user uuid>'
 *
 * The same rules the v1 API documents (src/routes/api/v1/+layout.server.js);
 * that file's `handle` is never called by SvelteKit (layouts have no handle),
 * so routes that need auth call this directly.
 */

import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

function client(serviceRole) {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = serviceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY
    : process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function activePartner(sb, column, value) {
  if (!sb) return null;
  const { data, error } = await sb
    .from('federation_partners')
    .select('id, status')
    .eq(column, value)
    .eq('status', 'active')
    .maybeSingle();
  return error ? null : data;
}

/**
 * @param {{ request: Request, locals: any }} event
 * @param {{ supabase?: any, admin?: any }} [deps] clients (tests)
 * @returns {Promise<{ owner: string, type: 'user' | 'federation_partner', id: string } | null>}
 */
export async function resolveApiCaller(event, deps = {}) {
  const { request, locals } = event;
  const admin = deps.admin !== undefined ? deps.admin : client(true);

  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    if (!apiKey.startsWith('fed_key_')) return null;
    const partner = await activePartner(admin, 'api_key', apiKey);
    return partner ? { owner: `partner:${partner.id}`, type: 'federation_partner', id: partner.id } : null;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    if (process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded?.type === 'federation_partner' && decoded.partner_id) {
          const partner = await activePartner(admin, 'id', decoded.partner_id);
          return partner ? { owner: `partner:${partner.id}`, type: 'federation_partner', id: partner.id } : null;
        }
      } catch {
        // not a partner token: try it as a Supabase user token
      }
    }

    const sb = deps.supabase !== undefined ? deps.supabase : client(false);
    if (!sb) return null;
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { owner: data.user.id, type: 'user', id: data.user.id };
  }

  if (locals?.user?.id) {
    return { owner: locals.user.id, type: 'user', id: locals.user.id };
  }

  return null;
}
