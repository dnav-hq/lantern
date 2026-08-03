-- Real ESV API usage metering — server-side, against the shared quota.
--
-- WHY. Crossway's ESV API enforces a per-application quota (5,000/day,
-- 1,000/hour, 60/minute) shared across every Lantern user simultaneously (see
-- docs/proposals/translations-esv-niv.md). Before making ESV more prominent,
-- Dennis needs to see how much of that shared budget is actually being
-- consumed day to day, on real data rather than guesswork.
--
-- WHY A DEDICATED STORE, NOT telemetry_events (0004). That buffer exists to
-- protect HQ's ingest from a hostile or runaway client: it caps an install at
-- 20 rows/minute and 500/day and silently drops anything above that. Real ESV
-- traffic under load is exactly the volume shape those caps exist to guard
-- against, so routing usage rows through it would UNDERCOUNT precisely when an
-- accurate number matters most. This table has no such caps — it is written by
-- the server itself, once per real upstream call, never by an untrusted client.
--
-- WHY NOT RATE-LIMIT RESPONSE HEADERS. Checked api.esv.org's published API
-- docs (overview + passage/text endpoint) for an X-RateLimit-* or similar
-- remaining-quota header — none is documented, and the response shape
-- (`{ query, canonical, parsed, passage_meta, passages }`) has no quota field
-- either. Crossway's only quota signal is a 429 when the shared budget is
-- exhausted (already handled below). So this falls back to the documented
-- alternative: counting queries in a dedicated store.
--
-- WHAT COUNTS. Only real upstream Crossway calls — i.e. every time the proxy
-- (supabase/functions/esv-proxy) actually reaches out to api.esv.org, which is
-- exactly a client cache miss and exactly what the shared quota meters. A
-- client cache hit never reaches the proxy at all, so it can't appear here by
-- construction. Requests that never reach api.esv.org (no key configured,
-- malformed input, wrong HTTP method) are correctly never metered either.
--
-- PRIVACY. Only a timestamp and a coarse status. No passage reference, book,
-- chapter, user id, or install id — this is operational metering of the app's
-- own API consumption, not user tracking, so public/privacy.html needs no
-- change (nothing user-identifying or content-identifying is ever stored).

create table if not exists public.esv_api_usage (
  id           uuid primary key default gen_random_uuid(),

  -- Server time of the upstream call. All windows the scalars below compute
  -- (24h / 1h) filter on this.
  occurred_at  timestamptz not null default now(),

  -- Coarse outcome only — never enough detail to reconstruct what was
  -- fetched. 'ok' = a normal response, 'quota' = Crossway's own 429,
  -- 'error' = unreachable or a non-2xx/429 upstream failure. All three still
  -- represent a real call against the shared quota (a 429 counts against it
  -- same as a 200 — Crossway metered the request, not just the ones it liked).
  status       text not null default 'ok' check (status in ('ok', 'quota', 'error'))
);

-- Every read (the scalar windows below, and the retention prune) filters on
-- occurred_at, so it needs an index same as telemetry_events (see 0003).
create index if not exists esv_api_usage_occurred_at_idx
  on public.esv_api_usage (occurred_at);

-- ─── Row Level Security ──────────────────────────────────────────────────────
--
-- Unlike telemetry_events (0004), nothing here is ever client-written: the
-- proxy edge function writes using the service-role key (Deno.env
-- SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS entirely. So there is no
-- insert policy to write for anon/authenticated — only revoke, matching
-- 0004's belt-and-braces of not relying on RLS alone.

alter table public.esv_api_usage enable row level security;
revoke all on public.esv_api_usage from anon, authenticated;
-- Deliberately no insert/select/update/delete policy for anon/authenticated:
-- this table is unreachable by any public role. Only service_role (which
-- bypasses RLS) may touch it.

-- ─── Retention: ~48 hours, reusing 0007's pg_cron prune pattern ──────────────
--
-- The scalars below only ever need a 24h/1h window, so nothing is lost by
-- ageing rows out well before that — 48h gives headroom for the sweep to lag
-- without ever affecting either scalar. Volume is tiny (one row per real
-- upstream call, capped hard by Crossway's own 5,000/day) so this is a
-- correctness/hygiene measure, not a capacity one, same as 0007.

create or replace function public.prune_esv_api_usage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.esv_api_usage
  where occurred_at < now() - interval '48 hours';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.prune_esv_api_usage() from public, anon, authenticated;

-- Wrapped defensively exactly like 0007: pg_cron is a platform feature, not
-- something this schema controls, and a hard failure here would block every
-- later migration on an environment without it. Degrading to "no automatic
-- sweep" is strictly no worse than before this migration existed.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';

    -- cron.schedule upserts by job name, so re-running this migration
    -- reschedules rather than stacking duplicate jobs. Hourly (rather than
    -- 0007's daily) because the retention window here is 48h, not 7 days —
    -- an off-the-hour minute distinct from 0007's :17 to avoid the two prune
    -- jobs colliding.
    perform cron.schedule(
      'prune-esv-api-usage',
      '41 * * * *',
      $cron$ select public.prune_esv_api_usage(); $cron$
    );

    raise notice 'pg_cron: scheduled prune-esv-api-usage hourly at :41.';
  else
    raise warning 'pg_cron unavailable — esv_api_usage has no automatic sweep. See supabase/migrations/0008_esv_usage.sql.';
  end if;
end
$$;

-- ─── Scalars: esv_api_queries_24h / esv_api_queries_1h ───────────────────────
--
-- Adds the two new scalars to public.hq_telemetry_scalars() via create-or-
-- replace, per 0005's own instructions ("do not edit 0005" once applied).
-- The full function body is repeated here with the two CTEs and result
-- entries added — see D:/Projects/hq/TELEMETRY.md, "Choosing scalars": scalars
-- are project-defined, so two new project-specific ones need no contract
-- renegotiation.
--
-- DECISION each moves: is the app approaching the shared 5,000/day or
-- 1,000/hour ESV cap? That's the concrete question this whole task exists to
-- answer before making ESV the default — a rising number close to either
-- ceiling says "not yet", a flat low one says "there's headroom".

create or replace function public.hq_telemetry_scalars()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with
-- 1. Weekly active writers.
--    DECISION: is anyone actually using this? The denominator of every other
--    question. A flat line here means nothing else on the dashboard matters.
weekly_active as (
  select count(distinct created_by)::numeric as v
  from public.notes
  where created_at > now() - interval '7 days'
    and created_by is not null
),

-- 2. Week-2 retention.
--    DECISION: does the app survive first contact? Someone who writes notes in
--    their second week has fitted it into a real routine rather than trying it
--    once. Only cohorts old enough to have completed their day-7..14 window are
--    counted; including younger ones would drag the number down for no reason
--    other than that time has not passed yet.
cohorts as (
  select id as user_id, created_at as signup_at
  from public.profiles
  where created_at < now() - interval '14 days'
),
week2 as (
  select
    count(*)::numeric as cohort_size,
    count(*) filter (
      where exists (
        select 1 from public.notes n
        where n.created_by = c.user_id
          and n.created_at >= c.signup_at + interval '7 days'
          and n.created_at <  c.signup_at + interval '14 days'
      )
    )::numeric as retained
  from cohorts c
),

-- 3. Returned studies. THE THESIS METRIC.
--    DECISION: whether the core premise holds at all. Lantern's claim is that
--    notes anchored to a passage are worth returning to. If people write once
--    and never come back to the same passage, that claim is false and no amount
--    of polish fixes it — the product would need rethinking, not refining.
--    "Returned" = notes on the same passage on two or more distinct days.
--    Distinct DAYS, not distinct notes: five notes in one sitting is one visit,
--    and counting it as a return would flatter the number into uselessness.
studies as (
  select
    s.passage_id,
    count(distinct date_trunc('day', n.created_at)) as active_days
  from public.notes n
  join public.sessions s on s.id = n.session_id
  where n.created_at > now() - interval '30 days'
  group by s.passage_id
),
returned as (
  select
    count(*)::numeric as total,
    count(*) filter (where active_days >= 2)::numeric as came_back
  from studies
),

-- 4. Median notes per active writer.
--    DECISION: is a session a real study or a drive-by? Median rather than mean
--    on purpose — one power user with 400 notes would drag a mean somewhere no
--    actual person lives.
per_writer as (
  select created_by, count(*)::numeric as n
  from public.notes
  where created_at > now() - interval '30 days'
    and created_by is not null
  group by created_by
),
median_notes as (
  select coalesce(percentile_cont(0.5) within group (order by n), 0)::numeric as v
  from per_writer
),

-- 5. Signups.
--    DECISION: it is the denominator. Retention and activity percentages are
--    unreadable without knowing whether the cohort is 3 people or 300.
signups as (
  select count(*)::numeric as v
  from public.profiles
  where created_at > now() - interval '30 days'
),

-- 6 & 7. The two client-side counters.
--     These are NOT Postgres-computable from app data — they are occurrences in
--     the browser that leave no trace in any table — so they ride the events
--     channel as non-error kinds and are aggregated here.
--     sum(sample_weight), never count(*): if the guard trigger sampled during a
--     burst, each surviving row stands for several real occurrences, and
--     counting rows would silently under-report exactly when volume was high
--     enough to matter.
--
--     6. DECISION: is helloao reliable enough to keep as primary? A number that
--        stays near zero says the self-hosted fallback is insurance nobody is
--        claiming on; a rising one says the primary source is the problem.
--     7. DECISION: is draft persistence earning its keep, and does the full
--        offline write outbox (still deferred, see docs/BACKLOG.md) need
--        building? Zero recoveries over weeks says the narrow fix was enough.
fallback_serves as (
  select coalesce(sum(sample_weight), 0)::numeric as v
  from public.telemetry_events
  where kind = 'scripture_fallback_serve'
    and occurred_at > now() - interval '24 hours'
),
draft_recoveries as (
  select coalesce(sum(sample_weight), 0)::numeric as v
  from public.telemetry_events
  where kind = 'draft_recovery'
    and occurred_at > now() - interval '24 hours'
),

-- 8 & 9. Real ESV upstream queries — added by this migration.
--     DECISION: how much of the shared 5,000/day + 1,000/hour + 60/minute
--     Crossway quota is actually being consumed, so making ESV the default
--     can be decided on data instead of guesswork. Counts every real proxy→
--     Crossway call (ok, quota, or error alike — each one was still metered by
--     Crossway), never a client cache hit.
esv_24h as (
  select count(*)::numeric as v
  from public.esv_api_usage
  where occurred_at > now() - interval '24 hours'
),
esv_1h as (
  select count(*)::numeric as v
  from public.esv_api_usage
  where occurred_at > now() - interval '1 hour'
)

select jsonb_build_array(
  jsonb_build_object(
    'key', 'weekly_active_writers',
    'value', (select v from weekly_active),
    'unit', 'count', 'window', '7d'),
  jsonb_build_object(
    'key', 'week2_retention_pct',
    -- greatest(...,1) guards the empty-cohort divide-by-zero. An empty cohort
    -- reports 0%, which reads correctly as "no evidence yet".
    'value', round((select retained from week2) / greatest((select cohort_size from week2), 1) * 100, 1),
    'unit', 'percent', 'window', 'cohort'),
  jsonb_build_object(
    'key', 'returned_studies_pct',
    'value', round((select came_back from returned) / greatest((select total from returned), 1) * 100, 1),
    'unit', 'percent', 'window', '30d'),
  jsonb_build_object(
    'key', 'median_notes_per_writer',
    'value', round((select v from median_notes), 1),
    'unit', 'count', 'window', '30d'),
  jsonb_build_object(
    'key', 'signups',
    'value', (select v from signups),
    'unit', 'count', 'window', '30d'),
  jsonb_build_object(
    'key', 'scripture_fallback_serves',
    'value', (select v from fallback_serves),
    'unit', 'count', 'window', '24h'),
  jsonb_build_object(
    'key', 'draft_recoveries',
    'value', (select v from draft_recoveries),
    'unit', 'count', 'window', '24h'),
  jsonb_build_object(
    'key', 'esv_api_queries_24h',
    'value', (select v from esv_24h),
    'unit', 'count', 'window', '24h'),
  jsonb_build_object(
    'key', 'esv_api_queries_1h',
    'value', (select v from esv_1h),
    'unit', 'count', 'window', '1h')
);
$$;

-- Only the edge function's service_role may call this. It aggregates across all
-- users, so a signed-in caller must never reach it. Repeated (harmlessly
-- idempotent) because create-or-replace does not preserve grants/revokes.
revoke all on function public.hq_telemetry_scalars() from public, anon, authenticated;
