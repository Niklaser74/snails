-- Shot of the day: one score per player and UTC day, best attempt kept.
-- The recording is stored so a score can be verified later by replaying it.
create table if not exists public.snails_daily (
  day           date not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  score         int not null check (score between 0 and 450),
  weapon        text not null,
  rules_version int not null,
  recording     jsonb not null,
  attempts      int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (day, user_id),
  constraint snails_daily_name_short check (length(name) between 1 and 24),
  constraint snails_daily_recording_small check (pg_column_size(recording) < 20000)
);
create index if not exists snails_daily_day_score on public.snails_daily (day, score desc, updated_at);
alter table public.snails_daily enable row level security;

-- best score wins; returns the player's row plus rank for the day
create or replace function public.snails_daily_submit(p_day date, p_score int, p_name text, p_rules_version int, p_weapon text, p_recording jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.snails_daily; rnk int; total int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_day > current_date or p_day < current_date - 1 then raise exception 'not today'; end if;
  if p_score < 0 or p_score > 450 then raise exception 'score out of range'; end if;
  if not public.snails_rules_ok(p_rules_version) then raise exception 'rules version % is not supported', p_rules_version; end if;
  insert into public.snails_daily (day, user_id, name, score, weapon, rules_version, recording)
  values (p_day, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Snäcka'), 24), p_score, p_weapon, p_rules_version, p_recording)
  on conflict (day, user_id) do update
    set attempts = public.snails_daily.attempts + 1,
        name = excluded.name,
        score = greatest(public.snails_daily.score, excluded.score),
        weapon = case when excluded.score > public.snails_daily.score then excluded.weapon else public.snails_daily.weapon end,
        rules_version = case when excluded.score > public.snails_daily.score then excluded.rules_version else public.snails_daily.rules_version end,
        recording = case when excluded.score > public.snails_daily.score then excluded.recording else public.snails_daily.recording end,
        updated_at = case when excluded.score > public.snails_daily.score then now() else public.snails_daily.updated_at end
  returning * into cur;
  select count(*) + 1 into rnk from public.snails_daily d where d.day = p_day and (d.score > cur.score or (d.score = cur.score and d.updated_at < cur.updated_at));
  select count(*) into total from public.snails_daily d where d.day = p_day;
  return jsonb_build_object('score', p_score, 'best', cur.score, 'attempts', cur.attempts, 'rank', rnk, 'total', total, 'improved', cur.score = p_score);
end $$;

-- top ten of the day plus the caller's own row
create or replace function public.snails_daily_board(p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'day', p_day,
    'total', (select count(*) from public.snails_daily d where d.day = p_day),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'score', t.score, 'me', t.user_id = auth.uid()) order by t.score desc, t.updated_at), '[]'::jsonb)
            from (select * from public.snails_daily d where d.day = p_day order by d.score desc, d.updated_at limit 10) t),
    'me', (select jsonb_build_object('score', d.score, 'attempts', d.attempts,
                    'rank', (select count(*) + 1 from public.snails_daily o where o.day = p_day and (o.score > d.score or (o.score = d.score and o.updated_at < d.updated_at))))
           from public.snails_daily d where d.day = p_day and d.user_id = auth.uid())
  );
$$;
grant execute on function public.snails_daily_submit(date, int, text, int, text, jsonb) to authenticated;
grant execute on function public.snails_daily_board(date) to authenticated;
revoke execute on function public.snails_daily_submit(date, int, text, int, text, jsonb) from anon, public;
revoke execute on function public.snails_daily_board(date) from anon, public;

-- the usage counter may record daily plays
alter table public.snails_events drop constraint if exists snails_events_event_known;
alter table public.snails_events add constraint snails_events_event_known check (event in (
  'app_open', 'match_start', 'match_end', 'match_abandon', 'tutorial_done', 'tutorial_skip', 'push_on', 'error', 'account', 'daily'
));

-- cleanup: daily rows older than 60 days
create or replace function public.snails_cleanup()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  delete from public.snails_series where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_series where status = 'finished' and updated_at < now() - interval '90 days';
  delete from public.snails_matches where series_id is null and status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_matches where series_id is null and status = 'finished' and updated_at < now() - interval '90 days';
  delete from public.snails_daily where day < current_date - 60;
  for r in select version from public.snails_rules where not supported and sunset_at is not null and sunset_at <= current_date loop
    delete from public.snails_series where id in (select series_id from public.snails_matches where rules_version = r.version and status = 'open' and guest is null);
    delete from public.snails_matches where rules_version = r.version and status = 'open' and guest is null;
    update public.snails_series set status = 'finished', winner_user = null, updated_at = now()
      where status <> 'finished' and id in (select series_id from public.snails_matches where rules_version = r.version and status <> 'finished');
    update public.snails_matches set status = 'finished', winner = null, updated_at = now()
      where rules_version = r.version and status <> 'finished';
  end loop;
end $$;
