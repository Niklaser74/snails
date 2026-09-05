-- Rank and seasons. A season is a calendar quarter ("2026-Q3"). Every finished
-- Snigelpost match between two players moves both players' season rating
-- (Elo, K = 32, start 1000). The shot of the day feeds a season score: the sum
-- of each day's best. Both have a leaderboard for the running season.
create table if not exists public.snails_ratings (
  season     text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     int not null default 1000,
  games      int not null default 0,
  wins       int not null default 0,
  losses     int not null default 0,
  draws      int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, user_id)
);
create index if not exists snails_ratings_season_rating on public.snails_ratings (season, rating desc, updated_at);
alter table public.snails_ratings enable row level security;
alter table public.snails_matches add column if not exists rated boolean not null default false;

create or replace function public.snails_season_key(p_date date default current_date)
returns text language sql immutable as $$
  select to_char(p_date, 'YYYY') || '-Q' || to_char(p_date, 'Q');
$$;
create or replace function public.snails_season_end(p_date date default current_date)
returns date language sql immutable as $$
  select (date_trunc('quarter', p_date) + interval '3 months')::date;
$$;

-- Elo for one finished match; runs once per match (the rated flag)
create or replace function public.snails_rate_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; v_season text; rh int; rg int; eh numeric; sh numeric; dh int; dg int;
begin
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null or m.rated or m.status <> 'finished' or m.guest is null or m.host = m.guest then return; end if;
  v_season := public.snails_season_key(m.updated_at::date);
  insert into public.snails_ratings (season, user_id) values (v_season, m.host) on conflict do nothing;
  insert into public.snails_ratings (season, user_id) values (v_season, m.guest) on conflict do nothing;
  select rating into rh from public.snails_ratings where snails_ratings.season = v_season and user_id = m.host for update;
  select rating into rg from public.snails_ratings where snails_ratings.season = v_season and user_id = m.guest for update;
  eh := 1 / (1 + power(10, (rg - rh) / 400.0));
  sh := case when m.winner = 0 then 1 when m.winner = 1 then 0 else 0.5 end;
  dh := round(32 * (sh - eh));
  dg := -dh;
  update public.snails_ratings set rating = rating + dh, games = games + 1,
         wins = wins + (m.winner = 0)::int, losses = losses + (m.winner = 1)::int, draws = draws + (m.winner is null)::int, updated_at = now()
   where snails_ratings.season = v_season and user_id = m.host;
  update public.snails_ratings set rating = rating + dg, games = games + 1,
         wins = wins + (m.winner = 1)::int, losses = losses + (m.winner = 0)::int, draws = draws + (m.winner is null)::int, updated_at = now()
   where snails_ratings.season = v_season and user_id = m.guest;
  update public.snails_matches set rated = true where id = m.id;
end $$;
revoke all on function public.snails_rate_match(uuid) from anon, authenticated, public;

-- after a match: rate it, then the series bookkeeping as before
create or replace function public.snails_series_after_finish(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series; w uuid; needed int; wh int; wg int;
begin
  perform public.snails_rate_match(p_match);
  select * into m from public.snails_matches where id = p_match;
  if m.series_id is null or m.status <> 'finished' then return; end if;
  select * into s from public.snails_series where id = m.series_id for update;
  if s.status = 'finished' or s.current_match <> m.id then return; end if;
  wh := s.wins_host; wg := s.wins_guest;
  if m.winner is not null then
    w := case when m.winner = 0 then m.host else m.guest end;
    if w = s.host then wh := wh + 1; else wg := wg + 1; end if;
  end if;
  needed := s.best_of / 2 + 1;
  if wh >= needed or wg >= needed or (m.winner is null and s.best_of = 1) then
    update public.snails_series
       set wins_host = wh, wins_guest = wg, status = 'finished', updated_at = now(),
           winner_user = case when wh >= needed then s.host when wg >= needed then s.guest else null end
     where id = s.id;
  else
    update public.snails_series set wins_host = wh, wins_guest = wg, updated_at = now() where id = s.id;
    perform public.snails_series_next_match(s.id, m.id);
  end if;
end $$;

-- the running season: rank board, daily-score board, the caller's own rows
create or replace function public.snails_season()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_season text := public.snails_season_key(); s_start date := date_trunc('quarter', current_date)::date; s_end date := public.snails_season_end();
        me_r public.snails_ratings; me_pts int; me_days int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into me_r from public.snails_ratings r where r.season = v_season and r.user_id = auth.uid();
  select coalesce(sum(score), 0), count(*) into me_pts, me_days from public.snails_daily d where d.user_id = auth.uid() and d.day >= s_start and d.day < s_end;
  return jsonb_build_object(
    'season', v_season, 'ends_at', s_end, 'days_left', s_end - current_date,
    'rank', jsonb_build_object(
      'total', (select count(*) from public.snails_ratings r where r.season = v_season),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(p.name, 'Snäcka'), 'rating', t.rating, 'games', t.games, 'me', t.user_id = auth.uid()) order by t.rating desc, t.updated_at), '[]'::jsonb)
              from (select * from public.snails_ratings r where r.season = v_season order by r.rating desc, r.updated_at limit 10) t
              left join public.snails_profiles p on p.user_id = t.user_id),
      'me', case when me_r.user_id is null then null else jsonb_build_object('rating', me_r.rating, 'games', me_r.games, 'wins', me_r.wins, 'losses', me_r.losses, 'draws', me_r.draws,
              'rank', (select count(*) + 1 from public.snails_ratings o where o.season = v_season and (o.rating > me_r.rating or (o.rating = me_r.rating and o.updated_at < me_r.updated_at)))) end),
    'daily', jsonb_build_object(
      'total', (select count(distinct user_id) from public.snails_daily d where d.day >= s_start and d.day < s_end),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'points', t.pts, 'days', t.days, 'me', t.user_id = auth.uid()) order by t.pts desc, t.last), '[]'::jsonb)
              from (select d.user_id, max(d.name) as name, sum(d.score) as pts, count(*) as days, max(d.updated_at) as last
                    from public.snails_daily d where d.day >= s_start and d.day < s_end group by d.user_id order by pts desc, last limit 10) t),
      'me', case when me_days = 0 then null else jsonb_build_object('points', me_pts, 'days', me_days,
              'rank', (select count(*) + 1 from (select d.user_id, sum(d.score) as pts from public.snails_daily d where d.day >= s_start and d.day < s_end group by d.user_id) o where o.pts > me_pts)) end)
  );
end $$;
grant execute on function public.snails_season() to authenticated;
revoke execute on function public.snails_season() from anon, public;

-- the profile shows the season rating too
create or replace function public.snails_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.snails_profiles; r public.snails_ratings;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.snails_profiles where user_id = auth.uid();
  select * into r from public.snails_ratings x where x.season = public.snails_season_key() and x.user_id = auth.uid();
  return jsonb_build_object('name', coalesce(p.name, ''), 'look', coalesce(p.look, '{}'::jsonb),
    'stats', public.snails_stats(auth.uid()) || jsonb_build_object('rating', coalesce(r.rating, 1000), 'seasonGames', coalesce(r.games, 0), 'season', public.snails_season_key()),
    'unlocked', to_jsonb(public.snails_unlocked(auth.uid())));
end $$;

-- old seasons' ratings are kept (history); nothing to clean
