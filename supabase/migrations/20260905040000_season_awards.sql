-- Season rewards. When a quarter ends, the top three in rating (at least
-- three rated matches) get the laurel wreath hat and the top three in shot
-- of the day season points get the confetti shell. Awards are permanent,
-- show as badges in the profile and unlock the items.
create table if not exists public.snails_season_awards (
  season     text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('rank', 'daily')),
  place      int not null check (place between 1 and 3),
  item       text not null,
  value      int not null, -- the rating or the points that earned it
  created_at timestamptz not null default now(),
  primary key (season, user_id, kind)
);
alter table public.snails_season_awards enable row level security;

-- close one season (the previous quarter by default); idempotent
create or replace function public.snails_close_season(p_season text default public.snails_season_key(current_date - 1))
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; s_start date; s_end date; r record; y int; q int;
begin
  if p_season = public.snails_season_key() then raise exception 'season % is still running', p_season; end if;
  if exists (select 1 from public.snails_season_awards where season = p_season) then return 0; end if;
  y := split_part(p_season, '-Q', 1)::int; q := split_part(p_season, '-Q', 2)::int;
  s_start := make_date(y, (q - 1) * 3 + 1, 1); s_end := s_start + interval '3 months';
  for r in select user_id, rating, row_number() over (order by rating desc, updated_at) as place
             from public.snails_ratings where season = p_season and games >= 3 order by rating desc, updated_at limit 3 loop
    insert into public.snails_season_awards (season, user_id, kind, place, item, value) values (p_season, r.user_id, 'rank', r.place, 'laurel', r.rating);
    n := n + 1;
  end loop;
  for r in select user_id, pts, row_number() over (order by pts desc, last) as place
             from (select user_id, sum(score) as pts, max(updated_at) as last from public.snails_daily where day >= s_start and day < s_end group by user_id) x
            order by pts desc, last limit 3 loop
    insert into public.snails_season_awards (season, user_id, kind, place, item, value) values (p_season, r.user_id, 'daily', r.place, 'confetti', r.pts);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.snails_close_season(text) from anon, authenticated, public;

-- ten minutes into every quarter (UTC): close the season that just ended
select cron.unschedule(jobid) from cron.job where jobname = 'snails_close_season';
select cron.schedule('snails_close_season', '10 0 1 1,4,7,10 *', $$select public.snails_close_season()$$);

-- unlocked = free + earned + bought + awarded
create or replace function public.snails_unlocked(p_user uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare st jsonb := public.snails_stats(p_user); u text[] := array['spiral', 'stripes', 'dots', 'none', 'cap', 'party'];
begin
  if (st->>'dailyBest')::int >= 250 then u := u || 'stars'; end if;
  if (st->>'wins')::int >= 5 then u := u || 'flame'; end if;
  if (st->>'wins')::int >= 10 then u := u || 'crown'; end if;
  if (st->>'dailyBest')::int >= 350 then u := u || 'viking'; end if;
  u := u || coalesce((select array_agg(distinct item) from public.snails_purchases where user_id = p_user), '{}');
  u := u || coalesce((select array_agg(distinct item) from public.snails_season_awards where user_id = p_user), '{}');
  return u;
end $$;

-- profile: the badges
create or replace function public.snails_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.snails_profiles; r public.snails_ratings; em text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.snails_profiles where user_id = auth.uid();
  select * into r from public.snails_ratings x where x.season = public.snails_season_key() and x.user_id = auth.uid();
  select email into em from auth.users where id = auth.uid();
  return jsonb_build_object('name', coalesce(p.name, ''), 'look', coalesce(p.look, '{}'::jsonb),
    'stats', public.snails_stats(auth.uid()) || jsonb_build_object('rating', coalesce(r.rating, 1000), 'seasonGames', coalesce(r.games, 0), 'season', public.snails_season_key()),
    'unlocked', to_jsonb(public.snails_unlocked(auth.uid())),
    'canBuy', em is not null and em <> '',
    'purchases', (select coalesce(jsonb_agg(item), '[]'::jsonb) from public.snails_purchases where user_id = auth.uid()),
    'awards', (select coalesce(jsonb_agg(jsonb_build_object('season', season, 'kind', kind, 'place', place, 'item', item, 'value', value) order by season desc, kind), '[]'::jsonb)
               from public.snails_season_awards where user_id = auth.uid()));
end $$;

-- season: last season's winners
create or replace function public.snails_season()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_season text := public.snails_season_key(); s_start date := date_trunc('quarter', current_date)::date; s_end date := public.snails_season_end();
        me_r public.snails_ratings; me_pts int; me_days int; prev text := public.snails_season_key((date_trunc('quarter', current_date) - interval '1 day')::date);
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
              'rank', (select count(*) + 1 from (select d.user_id, sum(d.score) as pts from public.snails_daily d where d.day >= s_start and d.day < s_end group by d.user_id) o where o.pts > me_pts)) end),
    'last', jsonb_build_object('season', prev,
      'awards', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'place', a.place, 'name', coalesce(p.name, 'Snäcka'), 'value', a.value, 'me', a.user_id = auth.uid()) order by a.kind, a.place), '[]'::jsonb)
                 from public.snails_season_awards a left join public.snails_profiles p on p.user_id = a.user_id where a.season = prev))
  );
end $$;
