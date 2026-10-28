/**
 * Customer webhooks for LaunchPadder, on @profullstack/webhooks.
 *
 * Endpoints and a durable outbox live in Supabase (hub_webhook_* tables, see
 * supabase/migrations/020_webhooks_hub.sql). `emitWebhook` queues; the drainer
 * started once at server boot (src/hooks.server.js `init`) sends with retries
 * and backoff, signed with Standard Webhooks headers (webhook-id,
 * webhook-timestamp, webhook-signature). Bodies are CloudEvents.
 *
 * Owners: a user's auth uuid, or 'partner:<uuid>' for a federation partner
 * (see src/lib/server/api-auth.js).
 *
 * This module has no SvelteKit imports so the services (and their mocha tests)
 * can import it directly.
 */

import { createClient } from '@supabase/supabase-js';
import { Webhooks } from '@profullstack/webhooks';
import { supabaseStore } from './supabase-store.js';

/** The events LaunchPadder emits. */
export const WEBHOOK_EVENT_TYPES = Object.freeze([
  'submission.created',
  'submission.approved',
  'submission.rejected',
  'badge.issued'
]);

export const WEBHOOK_SOURCE =
  process.env.WEBHOOK_SOURCE || process.env.PUBLIC_SITE_URL || 'https://launchpadder.com';

/**
 * Old endpoints were created with generate_webhook_secret(): 'whsec_' + 64 hex
 * chars, meant to be used whole as the HMAC key (UTF-8 bytes). The package
 * base64-decodes what follows 'whsec_', which would be a different key. Re-store
 * as 'whsec_' + base64(old string) so the key bytes do not change. The SQL in
 * 020_webhooks_hub.sql does exactly this; this is the same transform, for tests
 * and any re-import.
 * @param {string} secret
 */
export function legacySecretToHub(secret) {
  if (!secret.startsWith('whsec_')) return secret;
  return 'whsec_' + Buffer.from(secret, 'utf8').toString('base64');
}

/**
 * @param {import('@profullstack/webhooks').WebhookStore} store
 * @param {Partial<import('@profullstack/webhooks').WebhooksOptions>} [options]
 */
export function createHooks(store, options = {}) {
  return new Webhooks({
    store,
    source: WEBHOOK_SOURCE,
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    maxEndpoints: 10,
    guard: process.env.NODE_ENV === 'production' ? {} : { allowHttp: true },
    log: (m) => console.warn(`[webhooks] ${m}`),
    ...options
  });
}

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** @type {Webhooks | null | undefined} undefined = not built yet */
let hub;

/**
 * The process-wide hub, or null when the service role key is not configured
 * (webhooks are then off: emits are dropped and the API answers 503).
 * SvelteKit bundles this module once for hooks and routes, so a module-level
 * instance is shared and the one init() started is the one that drains.
 * @returns {Webhooks | null}
 */
export function getHooks() {
  if (hub === undefined) {
    const client = serviceClient();
    hub = client ? createHooks(supabaseStore(client)) : null;
  }
  return hub;
}

/** Replace the hub (tests). Pass undefined to reset to the lazy default. */
export function setHooks(hooks) {
  hub = hooks;
}

/** Start the background drainer once per server process. */
export function startWebhooks() {
  const hooks = getHooks();
  if (!hooks) {
    console.warn('[webhooks] SUPABASE_SERVICE_ROLE_KEY not set: customer webhooks are off');
    return null;
  }
  return hooks.start();
}

/**
 * Queue an event for `owner`'s subscribed endpoints. Never throws: a webhook
 * problem must not fail the request that caused the event.
 * @param {string | null | undefined} owner
 * @param {string} type
 * @param {unknown} data
 * @param {{ subject?: string }} [options]
 */
export async function emitWebhook(owner, type, data, options = {}) {
  if (!owner) return { id: null, queued: 0 };
  try {
    const hooks = getHooks();
    if (!hooks) return { id: null, queued: 0 };
    return await hooks.emit(String(owner), type, data, options);
  } catch (err) {
    console.error(`[webhooks] emit ${type} failed:`, err?.message || err);
    return { id: null, queued: 0 };
  }
}

/** The public shape of a submission in event payloads. */
export function submissionPayload(s, extra = {}) {
  const meta = s?.rewritten_meta || s?.original_meta || {};
  return {
    id: s?.id,
    url: s?.url,
    title: meta.title ?? null,
    description: meta.description ?? null,
    slug: s?.slug ?? null,
    status: s?.status,
    tags: s?.tags ?? [],
    submitted_by: s?.submitted_by ?? null,
    created_at: s?.created_at ?? null,
    published_at: s?.published_at ?? null,
    reviewed_at: s?.reviewed_at ?? null,
    ...extra
  };
}

/** Emit submission.created for a freshly inserted submission row. */
export function emitSubmissionCreated(submission) {
  return emitWebhook(submission?.submitted_by, 'submission.created', submissionPayload(submission), {
    subject: submission?.id
  });
}

/**
 * Emit submission.approved / submission.rejected after a moderation decision.
 * Other decisions (escalated, ...) are not customer events.
 */
export function emitSubmissionReviewed(submission, decision, notes = '') {
  if (decision !== 'approved' && decision !== 'rejected') return Promise.resolve({ id: null, queued: 0 });
  const extra = decision === 'rejected' ? { reason: notes || null } : {};
  return emitWebhook(
    submission?.submitted_by,
    `submission.${decision}`,
    submissionPayload({ ...submission, status: decision }, extra),
    { subject: submission?.id }
  );
}

/** Emit badge.issued. */
export function emitBadgeIssued(userId, badge) {
  return emitWebhook(
    userId,
    'badge.issued',
    {
      user_id: userId,
      user_badge_id: badge.user_badge_id ?? null,
      badge: {
        slug: badge.slug,
        name: badge.name ?? null,
        level: badge.level ?? null,
        category: badge.category ?? null
      },
      assignment_type: badge.assignment_type ?? null,
      reason: badge.reason ?? null,
      earned_at: badge.earned_at ?? new Date().toISOString()
    },
    { subject: badge.user_badge_id || badge.slug }
  );
}

/**
 * Badges awarded inside Postgres (the check_badges_after_submission trigger)
 * never pass through JS, so after a submission insert look up what the user
 * earned since `sinceIso` and emit badge.issued for each. Uses the service
 * client (user_badges is RLS-protected). Never throws.
 */
export async function emitBadgesIssuedSince(userId, sinceIso, client = undefined) {
  if (!userId) return 0;
  try {
    const sb = client === undefined ? serviceClient() : client;
    if (!sb || !getHooks()) return 0;
    const { data, error } = await sb
      .from('user_badges')
      .select('id, assignment_type, assignment_reason, earned_at, badge_definitions(slug, name, level, category)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('earned_at', sinceIso);
    if (error || !data) return 0;
    for (const row of data) {
      const def = row.badge_definitions || {};
      await emitBadgeIssued(userId, {
        user_badge_id: row.id,
        slug: def.slug,
        name: def.name,
        level: def.level,
        category: def.category,
        assignment_type: row.assignment_type,
        reason: row.assignment_reason,
        earned_at: row.earned_at
      });
    }
    return data.length;
  } catch (err) {
    console.error('[webhooks] badge lookup failed:', err?.message || err);
    return 0;
  }
}
