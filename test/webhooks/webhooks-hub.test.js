/**
 * Customer webhooks on @profullstack/webhooks: the supabase-js store, the
 * migrated-secret trap, the domain events the services emit, and API auth.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { verifySignature, webhooksApi } from '@profullstack/webhooks';
import { supabaseStore, HUB_TABLES } from '../../src/lib/server/webhooks/supabase-store.js';
import {
  createHooks,
  setHooks,
  legacySecretToHub,
  emitBadgesIssuedSince,
  WEBHOOK_EVENT_TYPES
} from '../../src/lib/server/webhooks/hub.js';
import { resolveApiCaller } from '../../src/lib/server/api-auth.js';
import { ModerationService } from '../../src/lib/services/moderation-service.js';
import { BadgeService } from '../../src/lib/services/badge-service.js';
import { SubmissionService } from '../../src/lib/services/submission-service.js';
import { fakeSupabase } from '../mocks/fake-supabase-hub.js';

const USER = '11111111-1111-4111-8111-111111111111';
const HOOK_URL = 'https://hooks.example.test/launchpadder';

/** A hub on the fake Supabase store, with a fetch that records every request. */
function testHub() {
  const sb = fakeSupabase();
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), headers: new Headers(init.headers), body: init.body });
    return new Response('ok', { status: 200 });
  };
  const hooks = createHooks(supabaseStore(sb), {
    fetchImpl,
    guard: { lookup: async () => ['93.184.216.34'] },
    log: () => {}
  });
  return { sb, hooks, sent };
}

const endpointRow = (over = {}) => ({
  id: 'wh_1',
  owner: USER,
  url: HOOK_URL,
  secret: 'whsec_dGVzdA==',
  events: JSON.stringify(['*']),
  description: '',
  enabled: 1,
  failures: 0,
  disabled_reason: null,
  created_at: 1000,
  updated_at: 1000,
  ...over
});

describe('webhooks: supabase store', () => {
  it('round-trips endpoints through the hub_ table columns', async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    const ep = {
      id: 'wh_1', owner: USER, url: HOOK_URL, secret: 'whsec_abc=', events: ['submission.*'],
      description: '', enabled: true, failures: 0, disabledReason: null, createdAt: 1000, updatedAt: 1000
    };
    await store.insertEndpoint(ep);
    expect(sb.rows(HUB_TABLES.endpoints)[0]).to.include({ events: '["submission.*"]', enabled: 1, created_at: 1000 });
    expect(await store.getEndpoint('wh_1')).to.deep.equal(ep);
    expect(await store.getEndpoint('nope')).to.equal(null);

    await store.updateEndpoint('wh_1', { enabled: false, failures: 3, disabledReason: 'off', updatedAt: 2000 });
    expect(await store.getEndpoint('wh_1')).to.include({ enabled: false, failures: 3, disabledReason: 'off', updatedAt: 2000 });

    await store.insertEndpoint({ ...ep, id: 'wh_0', createdAt: 500 });
    await store.insertEndpoint({ ...ep, id: 'wh_x', owner: 'someone-else' });
    expect((await store.listEndpoints(USER)).map((e) => e.id)).to.deep.equal(['wh_0', 'wh_1']);
  });

  it('claims due deliveries once and leases them', async () => {
    const sb = fakeSupabase();
    const store = supabaseStore(sb);
    const d = {
      id: 'dlv_1', endpointId: 'wh_1', owner: USER, eventId: 'ev', eventType: 'submission.created',
      payload: '{}', status: 'pending', attempts: 0, nextAt: 5000, lastStatus: null, lastError: null,
      createdAt: 1000, updatedAt: 1000
    };
    await store.insertDeliveries([d, { ...d, id: 'dlv_2', nextAt: 9000 }, { ...d, id: 'dlv_3', status: 'delivered', nextAt: 0 }]);
    expect((await store.claimDue(6000, 10, 60000)).map((x) => x.id)).to.deep.equal(['dlv_1']);
    expect(await store.claimDue(6000, 10, 60000)).to.deep.equal([]);
    expect((await store.getDelivery('dlv_1')).nextAt).to.equal(66000);
  });
});

describe('webhooks: migrated endpoints keep their secret', () => {
  // generate_webhook_secret() in 007_federation_partners.sql: 'whsec_' || 64 hex chars
  const OLD = 'whsec_' + 'a1b2c3d4e5f6'.repeat(5) + 'a1b2';

  it('re-stores whsec_<hex> as whsec_<base64 of the whole old string>', () => {
    expect(OLD).to.have.length(70);
    const migrated = legacySecretToHub(OLD);
    expect(migrated.startsWith('whsec_')).to.equal(true);
    expect(Buffer.from(migrated.slice(6), 'base64').toString('utf8')).to.equal(OLD);
    expect(legacySecretToHub('not-a-whsec')).to.equal('not-a-whsec');
  });

  it('a receiver keyed with the old secret string verifies a hub delivery', async () => {
    const { sb, hooks, sent } = testHub();
    sb.rows(HUB_TABLES.endpoints).push(endpointRow({ secret: legacySecretToHub(OLD) }));

    await hooks.emit(USER, 'submission.approved', { id: 'sub_1' }, { subject: 'sub_1' });
    expect(await hooks.drain()).to.equal(1);
    expect(sent).to.have.length(1);

    const { headers, body } = sent[0];
    // the old secret's UTF-8 bytes as the HMAC key, standard webhook content
    const ok = verifySignature({ headers, body, secret: Buffer.from(OLD, 'utf8') });
    expect(ok.ok).to.equal(true);

    const expected = createHmac('sha256', Buffer.from(OLD, 'utf8'))
      .update(`${headers.get('webhook-id')}.${headers.get('webhook-timestamp')}.${body}`)
      .digest('base64');
    expect(headers.get('webhook-signature')).to.equal(`v1,${expected}`);

    // and the trap: storing the old string as-is would have changed the key
    expect(verifySignature({ headers, body, secret: OLD }).ok).to.equal(false);
  });
});

describe('webhooks: domain events', () => {
  let hub;
  beforeEach(() => {
    hub = testHub();
    hub.sb.rows(HUB_TABLES.endpoints).push(endpointRow());
    setHooks(hub.hooks);
  });
  afterEach(() => setHooks(undefined));

  const payloads = async () => {
    await hub.hooks.drain();
    return hub.sent.map((s) => JSON.parse(s.body));
  };

  it('declares the events it emits', () => {
    expect([...WEBHOOK_EVENT_TYPES]).to.deep.equal([
      'submission.created', 'submission.approved', 'submission.rejected', 'badge.issued'
    ]);
  });

  function moderationSupabase(submission) {
    return {
      from(table) {
        if (table === 'moderation_reviews') return { insert: async () => ({ error: null }) };
        const q = {
          update: () => q, eq: () => q, in: () => q,
          select: () => Object.assign(Promise.resolve({ data: [submission], error: null }), {
            single: async () => ({ data: submission, error: null })
          })
        };
        return q;
      }
    };
  }

  const submission = {
    id: 'sub_1', url: 'https://product.example', submitted_by: USER, status: 'approved',
    rewritten_meta: { title: 'Product', description: 'Does things' }, slug: 'product', tags: ['ai'],
    created_at: '2026-10-28T00:00:00Z'
  };

  it('submission.created goes to the submitter when a launch is submitted', async () => {
    const inserted = { ...submission, status: 'pending' };
    const supabase = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          insert: () => q,
          single: async () => (q.inserting ? { data: inserted, error: null } : { data: null, error: { code: 'PGRST116' } })
        };
        q.insert = () => ((q.inserting = true), q);
        return q;
      }
    };
    const svc = new SubmissionService({
      supabase,
      metadataFetcher: { fetchMetadata: async () => ({ title: 'Product', description: 'Does things' }) },
      fallbackMetadataFetcher: null,
      aiRewriter: null,
      enhancedAIService: null,
      useEnhancedAI: false
    });
    const row = await svc.createSubmission({ url: 'https://product.example' }, USER);
    expect(row.id).to.equal('sub_1');
    const [ev] = await payloads();
    expect(ev).to.include({ type: 'submission.created', subject: 'sub_1' });
    expect(ev.data).to.include({ id: 'sub_1', url: 'https://product.example', status: 'pending', submitted_by: USER });
  });

  it('submission.approved goes to the submitter when a moderator approves', async () => {
    const svc = new ModerationService({ supabase: moderationSupabase(submission) });
    await svc.reviewSubmission('sub_1', 'mod_1', 'approved', 'looks good');
    const [ev] = await payloads();
    expect(ev).to.include({ type: 'submission.approved', subject: 'sub_1', specversion: '1.0' });
    expect(ev.data).to.include({ id: 'sub_1', title: 'Product', status: 'approved' });
  });

  it('submission.rejected carries the moderator note as reason (bulk too)', async () => {
    const svc = new ModerationService({ supabase: moderationSupabase({ ...submission, status: 'rejected' }) });
    await svc.bulkModerate(['sub_1'], 'mod_1', 'rejected', 'spam');
    const [ev] = await payloads();
    expect(ev.type).to.equal('submission.rejected');
    expect(ev.data).to.include({ reason: 'spam', status: 'rejected' });
  });

  it('badge.issued on a manual award and on auto awards', async () => {
    const svc = new BadgeService({
      rpc: async (fn) =>
        fn === 'award_badge'
          ? { data: '22222222-2222-4222-8222-222222222222', error: null }
          : { data: [{ awarded_badge_slug: 'active-community-member' }], error: null }
    });
    expect((await svc.awardBadge(USER, 'verified-maker', 'manual', null, 'checked')).success).to.equal(true);
    expect((await svc.autoCheckAndAwardBadges(USER)).success).to.equal(true);
    const evs = await payloads();
    expect(evs.map((e) => [e.type, e.data.badge.slug])).to.deep.equal([
      ['badge.issued', 'verified-maker'],
      ['badge.issued', 'active-community-member']
    ]);
    expect(evs[0].data).to.include({ user_badge_id: '22222222-2222-4222-8222-222222222222', reason: 'checked' });
  });

  it('badge.issued for badges a submission trigger awarded in SQL', async () => {
    const badgeRows = [{
      id: 'ub_1', assignment_type: 'automatic', assignment_reason: 'criteria', earned_at: submission.created_at,
      badge_definitions: { slug: 'high-quality-submissions', name: 'High Quality', level: 'silver', category: 'quality' }
    }];
    let since;
    const client = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          gte: (_c, v) => ((since = v), Promise.resolve({ data: badgeRows, error: null }))
        };
        return q;
      }
    };
    expect(await emitBadgesIssuedSince(USER, submission.created_at, client)).to.equal(1);
    expect(since).to.equal(submission.created_at);
    const [ev] = await payloads();
    expect(ev.type).to.equal('badge.issued');
    expect(ev.data.badge).to.deep.equal({ slug: 'high-quality-submissions', name: 'High Quality', level: 'silver', category: 'quality' });
  });

  it('an endpoint only gets the events it subscribed to, and other owners get nothing', async () => {
    hub.sb.rows(HUB_TABLES.endpoints)[0].events = JSON.stringify(['badge.*']);
    const svc = new ModerationService({ supabase: moderationSupabase({ ...submission, submitted_by: 'other-user' }) });
    await svc.reviewSubmission('sub_1', 'mod_1', 'approved');
    await new BadgeService({ rpc: async () => ({ data: 'x', error: null }) }).awardBadge('other-user', 'verified-maker');
    expect(await payloads()).to.deep.equal([]);
  });

  it('a webhook failure never breaks the moderation request', async () => {
    setHooks({ emit: async () => { throw new Error('db down'); } });
    const svc = new ModerationService({ supabase: moderationSupabase(submission) });
    const res = await svc.reviewSubmission('sub_1', 'mod_1', 'approved');
    expect(res.id).to.equal('sub_1');
  });
});

describe('webhooks: /api/v1/webhooks caller', () => {
  const req = (headers = {}) => new Request('https://launchpadder.test/api/v1/webhooks', { headers });
  const partnerClient = (partner) => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: partner, error: null }) };
      return q;
    }
  });
  const userClient = (user) => ({
    auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: {}, error: { message: 'bad' } }) }
  });
  let savedSecret;
  beforeEach(() => { savedSecret = process.env.JWT_SECRET; });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it('no credentials: no caller, and the API answers 401', async () => {
    const caller = await resolveApiCaller({ request: req(), locals: {} }, { admin: null, supabase: null });
    expect(caller).to.equal(null);
    const api = webhooksApi(testHub().hooks, { basePath: '/api/v1/webhooks', owner: () => caller?.owner });
    expect((await api(req())).status).to.equal(401);
  });

  it('a partner API key owns partner:<id>', async () => {
    const caller = await resolveApiCaller(
      { request: req({ 'x-api-key': 'fed_key_abc' }), locals: {} },
      { admin: partnerClient({ id: 'p1', status: 'active' }) }
    );
    expect(caller).to.deep.equal({ owner: 'partner:p1', type: 'federation_partner', id: 'p1' });
    expect(await resolveApiCaller({ request: req({ 'x-api-key': 'fed_key_x' }), locals: {} }, { admin: partnerClient(null) })).to.equal(null);
    expect(await resolveApiCaller({ request: req({ 'x-api-key': 'nope' }), locals: {} }, { admin: partnerClient({ id: 'p1' }) })).to.equal(null);
  });

  it('a partner JWT counts only when JWT_SECRET is set', async () => {
    const token = jwt.sign({ type: 'federation_partner', partner_id: 'p2' }, 'your-secret-key');
    delete process.env.JWT_SECRET;
    const unset = await resolveApiCaller(
      { request: req({ authorization: `Bearer ${token}` }), locals: {} },
      { admin: partnerClient({ id: 'p2' }), supabase: userClient(null) }
    );
    expect(unset).to.equal(null);

    process.env.JWT_SECRET = 'real-secret';
    const good = jwt.sign({ type: 'federation_partner', partner_id: 'p2' }, 'real-secret');
    const caller = await resolveApiCaller(
      { request: req({ authorization: `Bearer ${good}` }), locals: {} },
      { admin: partnerClient({ id: 'p2' }), supabase: userClient(null) }
    );
    expect(caller.owner).to.equal('partner:p2');
  });

  it('a Supabase user token or the session cookie owns the user id', async () => {
    const bearer = await resolveApiCaller(
      { request: req({ authorization: 'Bearer user-access-token' }), locals: {} },
      { admin: null, supabase: userClient({ id: USER }) }
    );
    expect(bearer.owner).to.equal(USER);
    const session = await resolveApiCaller({ request: req(), locals: { user: { id: USER } } }, { admin: null, supabase: null });
    expect(session).to.deep.equal({ owner: USER, type: 'user', id: USER });
  });
});
