-- Customer webhooks move onto @profullstack/webhooks 0.2.1.
--
-- 007_federation_partners created `webhooks` and `webhook_deliveries`, but no
-- code ever sent a delivery. The hub replaces both: endpoints plus a durable
-- delivery outbox (retries with backoff, delivery log, auto-disable after 20
-- failures in a row). Its tables are the package's own schemaSql('pg', 'hub_')
-- so a later switch to postgresStore needs no data change. They are prefixed
-- hub_ because `webhook_deliveries` already exists.
--
-- Only the server (service role) touches these tables: RLS on, no policies,
-- and the claim RPC is granted to service_role alone.
--
-- Idempotent: safe to re-run.

create table if not exists public.hub_webhook_endpoints (
  id text primary key,
  owner text not null,
  url text not null,
  secret text not null,
  events text not null default '["*"]',
  description text not null default '',
  enabled integer not null default 1,
  failures integer not null default 0,
  disabled_reason text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_endpoints_owner on public.hub_webhook_endpoints(owner);

create table if not exists public.hub_webhook_deliveries (
  id text primary key,
  endpoint_id text not null,
  owner text not null,
  event_id text not null,
  event_type text not null,
  payload text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_at bigint not null,
  last_status integer,
  last_error text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_deliveries_due on public.hub_webhook_deliveries(status, next_at);
create index if not exists hub_webhook_deliveries_endpoint on public.hub_webhook_deliveries(endpoint_id, created_at);
create index if not exists hub_webhook_deliveries_owner on public.hub_webhook_deliveries(owner, created_at);

alter table public.hub_webhook_endpoints enable row level security;
alter table public.hub_webhook_deliveries enable row level security;
revoke all on public.hub_webhook_endpoints from anon, authenticated;
revoke all on public.hub_webhook_deliveries from anon, authenticated;
grant all on public.hub_webhook_endpoints to service_role;
grant all on public.hub_webhook_deliveries to service_role;

-- Take up to p_limit due deliveries and lease them until p_lease_until, so two
-- app processes never send the same row (the package's postgresStore claim,
-- as an RPC because PostgREST cannot express FOR UPDATE SKIP LOCKED).
create or replace function public.claim_hub_webhook_deliveries(p_now bigint, p_limit integer, p_lease_until bigint)
returns setof public.hub_webhook_deliveries
language sql
volatile
set search_path to 'public'
as $function$
  update public.hub_webhook_deliveries
     set next_at = p_lease_until
   where id in (
     select id from public.hub_webhook_deliveries
      where status = 'pending' and next_at <= p_now
      order by next_at
      limit p_limit
      for update skip locked
   )
  returning *;
$function$;
revoke execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) to service_role;

-- Carry every existing endpoint over with its id, owner and secret.
--
-- Owner: the old table is either user-owned (user_id) or federation-partner
-- owned (partner_id), never both. Users keep their auth uuid as the owner;
-- partners become 'partner:<uuid>', which is what /api/v1/webhooks resolves a
-- partner API key or partner JWT to.
--
-- Secret: old secrets are 'whsec_' || 64 hex chars (generate_webhook_secret()),
-- and the obvious way to verify them is the whole string as the HMAC key
-- (UTF-8 bytes). The package base64-decodes whatever follows 'whsec_', which
-- would silently give a different key. So each one is re-stored as
-- 'whsec_' || base64(old string): the same key bytes, so a receiver holding the
-- old secret still verifies. Postgres wraps base64 at 76 chars, hence the
-- replace(). legacySecretToHub() in src/lib/server/webhooks/hub.js is the same
-- transform, with a test.
--
-- Status: 'active' -> enabled. failure_count carries over. Old event names
-- that the app does not emit simply never match.
insert into public.hub_webhook_endpoints
  (id, owner, url, secret, events, description, enabled, failures, disabled_reason, created_at, updated_at)
select
  w.id::text,
  case when w.user_id is not null then w.user_id::text else 'partner:' || w.partner_id::text end,
  w.url,
  case
    when w.secret like 'whsec\_%' escape '\'
      then 'whsec_' || replace(encode(convert_to(w.secret, 'UTF8'), 'base64'), E'\n', '')
    else w.secret
  end,
  case when cardinality(w.events) > 0 then to_jsonb(w.events)::text else '["*"]' end,
  coalesce(w.metadata->>'description', ''),
  case when w.status = 'active' then 1 else 0 end,
  coalesce(w.failure_count, 0),
  case when w.status = 'active' then null else 'disabled before migration' end,
  (extract(epoch from coalesce(w.created_at, now())) * 1000)::bigint,
  (extract(epoch from coalesce(w.updated_at, now())) * 1000)::bigint
from public.webhooks w
where w.user_id is not null or w.partner_id is not null
on conflict (id) do nothing;

-- The old tables stay for history only; nothing reads or writes them now.
comment on table public.webhooks is 'DEPRECATED: migrated to hub_webhook_endpoints (020_webhooks_hub). Read-only history.';
comment on table public.webhook_deliveries is 'DEPRECATED: never written by any sender; superseded by hub_webhook_deliveries (020_webhooks_hub).';
