-- Snäckmageddon usage counter.
-- One row per client event. Everything is prefixed snails_ because the table
-- lives in a shared project. Anonymous clients may only INSERT; reading is done
-- from the Supabase dashboard (service role) through the views below.

create table if not exists public.snails_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  created_at  timestamptz,
  client_id   uuid not null,
  session_id  uuid not null,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  app_version text,
  lang        text,
  constraint snails_events_event_known check (event in (
    'app_open', 'match_start', 'match_end', 'match_abandon', 'tutorial_done', 'tutorial_skip'
  )),
  constraint snails_events_props_small check (pg_column_size(props) < 2000),
  constraint snails_events_version_short check (app_version is null or length(app_version) <= 20),
  constraint snails_events_lang_short check (lang is null or length(lang) <= 8)
);

create index if not exists snails_events_event_time on public.snails_events (event, received_at);
create index if not exists snails_events_client_time on public.snails_events (client_id, received_at);

alter table public.snails_events enable row level security;

-- Anonymous clients may append rows. Nobody may read, update or delete through the API.
drop policy if exists snails_events_anon_insert on public.snails_events;
create policy snails_events_anon_insert on public.snails_events
  for insert to anon
  with check (true);

revoke all on public.snails_events from anon, authenticated;
grant insert on public.snails_events to anon;

-- ---------- reporting views (dashboard only, not exposed to anon) ----------

create or replace view public.snails_daily_metrics with (security_invoker = true) as
select
  date_trunc('day', received_at)::date                                       as day,
  count(*) filter (where event = 'app_open')                                 as app_opens,
  count(distinct client_id) filter (where event = 'app_open')                as unique_clients,
  count(*) filter (where event = 'match_start')                              as matches_started,
  count(*) filter (where event = 'match_end')                                as matches_finished,
  count(*) filter (where event = 'match_abandon')                            as matches_abandoned,
  round(avg((props->>'turns')::numeric) filter (where event = 'match_end'), 1) as avg_turns,
  round(avg((props->>'durationSec')::numeric) filter (where event = 'match_end') / 60, 1) as avg_minutes,
  count(*) filter (where event = 'tutorial_done')                            as tutorials_done,
  count(*) filter (where event = 'tutorial_skip')                            as tutorials_skipped
from public.snails_events
group by 1
order by 1 desc;

-- Cohorts by the day a client was first seen: how many came back the next day (d1)
-- and a week later (d7).
create or replace view public.snails_retention with (security_invoker = true) as
with first_seen as (
  select client_id, min(received_at)::date as cohort_day from public.snails_events group by 1
),
activity as (
  select distinct client_id, received_at::date as day from public.snails_events
)
select
  f.cohort_day,
  count(distinct f.client_id)                                                        as clients,
  count(distinct a1.client_id)                                                       as d1,
  round(100.0 * count(distinct a1.client_id) / nullif(count(distinct f.client_id), 0), 1) as d1_pct,
  count(distinct a7.client_id)                                                       as d7,
  round(100.0 * count(distinct a7.client_id) / nullif(count(distinct f.client_id), 0), 1) as d7_pct
from first_seen f
left join activity a1 on a1.client_id = f.client_id and a1.day = f.cohort_day + 1
left join activity a7 on a7.client_id = f.client_id and a7.day = f.cohort_day + 7
group by 1
order by 1 desc;

create or replace view public.snails_weapon_usage with (security_invoker = true) as
select
  w.key                       as weapon,
  sum((w.value)::int)         as shots,
  count(*)                    as matches
from public.snails_events e, jsonb_each_text(e.props->'weapons') w
where e.event = 'match_end'
group by 1
order by 2 desc;

revoke all on public.snails_daily_metrics, public.snails_retention, public.snails_weapon_usage from anon, authenticated;
