/**
 * /api/v1/webhooks: the @profullstack/webhooks API, scoped to the caller.
 * Auth: a federation partner API key (X-API-Key) or partner JWT, a Supabase
 * user bearer token, or the session cookie. See $lib/server/api-auth.js.
 *
 *   GET    /                      endpoints + event_types
 *   POST   /                      { url, events?, description? } -> { endpoint, secret }
 *   GET|PATCH|DELETE /:id
 *   GET    /:id/secret            POST /:id/rotate      POST /:id/test
 *   GET    /:id/deliveries        GET /deliveries       POST /deliveries/:id/retry
 */

import { json } from '@sveltejs/kit';
import { webhooksApi } from '@profullstack/webhooks';
import { resolveApiCaller } from '$lib/server/api-auth.js';
import { getHooks } from '$lib/server/webhooks/hub.js';

const BASE_PATH = '/api/v1/webhooks';

/** @type {import('./$types').RequestHandler} */
async function handle(event) {
  const caller = await resolveApiCaller(event);
  if (!caller) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hooks = getHooks();
  if (!hooks) {
    return json({ error: 'Webhooks are not configured on this instance' }, { status: 503 });
  }
  const api = webhooksApi(hooks, { basePath: BASE_PATH, owner: () => caller.owner });
  try {
    return (await api(event.request)) ?? json({ error: 'Not found' }, { status: 404 });
  } catch (err) {
    console.error('[webhooks api]', err);
    return json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
