-- Player profiles: display name and look (cosmetics), plus what a player has
-- earned. Looks are copied onto a match when it is created and joined, so the
-- opponent's device can draw them without another lookup.
create table if not exists public.snails_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default 'Snäcka',
  look       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint snails_profiles_name_short check (length(name) between 1 and 24),
  constraint snails_profiles_look_small check (pg_column_size(look) < 400)
);
alter table public.snails_profiles enable row level security;

alter table public.snails_matches add column if not exists looks jsonb not null default '{}'::jsonb; -- { "0": host look, "1": guest look }

-- stats behind the unlock rules
create or replace function public.snails_stats(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'matches', (select count(*) from public.snails_matches m where m.status = 'finished' and m.guest is not null and (m.host = p_user or m.guest = p_user)),
    'wins', (select count(*) from public.snails_matches m where m.status = 'finished' and m.guest is not null
              and ((m.host = p_user and m.winner = 0) or (m.guest = p_user and m.winner = 1))),
    'losses', (select count(*) from public.snails_matches m where m.status = 'finished' and m.guest is not null
              and ((m.host = p_user and m.winner = 1) or (m.guest = p_user and m.winner = 0))),
    'dailyBest', (select coalesce(max(score), 0) from public.snails_daily d where d.user_id = p_user),
    'dailyPlays', (select coalesce(sum(attempts), 0) from public.snails_daily d where d.user_id = p_user)
  );
$$;
revoke all on function public.snails_stats(uuid) from anon, authenticated, public;

-- the same thresholds as js/cosmetics.js; premium items are not unlockable yet
create or replace function public.snails_unlocked(p_user uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare st jsonb := public.snails_stats(p_user); u text[] := array['spiral', 'stripes', 'dots', 'none', 'cap', 'party'];
begin
  if (st->>'dailyBest')::int >= 250 then u := u || 'stars'; end if;
  if (st->>'wins')::int >= 5 then u := u || 'flame'; end if;
  if (st->>'wins')::int >= 10 then u := u || 'crown'; end if;
  if (st->>'dailyBest')::int >= 350 then u := u || 'viking'; end if;
  return u;
end $$;
revoke all on function public.snails_unlocked(uuid) from anon, authenticated, public;

create or replace function public.snails_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.snails_profiles;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.snails_profiles where user_id = auth.uid();
  return jsonb_build_object('name', coalesce(p.name, ''), 'look', coalesce(p.look, '{}'::jsonb),
    'stats', public.snails_stats(auth.uid()), 'unlocked', to_jsonb(public.snails_unlocked(auth.uid())));
end $$;

-- a look may only use unlocked items; anything else falls back to the default
create or replace function public.snails_clean_look(p_look jsonb, p_unlocked text[])
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'shell', case when coalesce(p_look->>'shell', '') = any (p_unlocked) then p_look->>'shell' else 'spiral' end,
    'hat', case when coalesce(p_look->>'hat', '') = any (p_unlocked) then p_look->>'hat' else 'none' end);
$$;
revoke all on function public.snails_clean_look(jsonb, text[]) from anon, authenticated, public;

create or replace function public.snails_profile_set(p_name text, p_look jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text; lk jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  nm := left(coalesce(nullif(trim(p_name), ''), 'Snäcka'), 24);
  lk := public.snails_clean_look(coalesce(p_look, '{}'::jsonb), public.snails_unlocked(auth.uid()));
  insert into public.snails_profiles (user_id, name, look) values (auth.uid(), nm, lk)
  on conflict (user_id) do update set name = excluded.name, look = excluded.look, updated_at = now();
  -- the look follows into matches that are still being played
  update public.snails_matches set looks = looks || jsonb_build_object('0', lk) where host = auth.uid() and status <> 'finished';
  update public.snails_matches set looks = looks || jsonb_build_object('1', lk) where guest = auth.uid() and status <> 'finished';
  return public.snails_profile();
end $$;
grant execute on function public.snails_profile() to authenticated;
grant execute on function public.snails_profile_set(text, jsonb) to authenticated;
revoke execute on function public.snails_profile() from anon, public;
revoke execute on function public.snails_profile_set(text, jsonb) from anon, public;

-- match json carries the looks
create or replace function public.snails_match_json(m public.snails_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'rules_version', m.rules_version, 'seed', m.seed, 'config', m.config, 'names', m.names, 'looks', m.looks,
    'host', m.host, 'guest', m.guest, 'status', m.status, 'turn_team', m.turn_team,
    'turn_count', m.turn_count, 'tick_count', m.tick_count, 'winner', m.winner,
    'my_team', case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end,
    'match_no', m.match_no,
    'series', (select jsonb_build_object(
        'id', s.id, 'best_of', s.best_of, 'match_no', s.match_no, 'status', s.status,
        'current_match', s.current_match,
        'won_by_me', s.winner_user is not null and s.winner_user = auth.uid(),
        'wins_me', case when s.host = auth.uid() then s.wins_host else s.wins_guest end,
        'wins_them', case when s.host = auth.uid() then s.wins_guest else s.wins_host end)
      from public.snails_series s where s.id = m.series_id)
  );
$$;

-- looks are stamped when a match is created, joined, continued or rematched
create or replace function public.snails_my_look()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select look from public.snails_profiles where user_id = auth.uid()), '{}'::jsonb);
$$;
revoke all on function public.snails_my_look() from anon, authenticated, public;

create or replace function public.snails_create_match(p_seed int, p_config jsonb, p_name text, p_rules_version int, p_best_of int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  if p_best_of not in (1, 3, 5) then raise exception 'best_of must be 1, 3 or 5'; end if;
  if not public.snails_rules_ok(p_rules_version) then raise exception 'rules version % is not supported', p_rules_version; end if;
  insert into public.snails_series (host, names, best_of)
  values (auth.uid(), jsonb_build_object('0', coalesce(nullif(p_name, ''), 'Värd')), p_best_of)
  returning * into s;
  insert into public.snails_matches (rules_version, seed, config, names, host, series_id, match_no, looks)
  values (p_rules_version, p_seed, p_config, s.names, auth.uid(), s.id, 1, jsonb_build_object('0', public.snails_my_look()))
  returning * into m;
  update public.snails_series set current_match = m.id where id = s.id;
  return public.snails_match_json(m);
end $$;

create or replace function public.snails_join_match(p_match uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; nm text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.host = auth.uid() or m.guest = auth.uid() then return public.snails_match_json(m); end if;
  if m.guest is not null then raise exception 'match is full'; end if;
  nm := coalesce(nullif(p_name, ''), 'Gäst');
  update public.snails_matches
     set guest = auth.uid(), status = 'playing', updated_at = now(), names = names || jsonb_build_object('1', nm),
         looks = looks || jsonb_build_object('1', public.snails_my_look())
   where id = p_match returning * into m;
  update public.snails_series
     set guest = auth.uid(), names = names || jsonb_build_object('1', nm), status = 'playing', updated_at = now()
   where id = m.series_id;
  return public.snails_match_json(m);
end $$;

-- next match in a series and rematch: looks swap with the roles / come from the profiles
create or replace function public.snails_series_next_match(p_series uuid, p_prev uuid)
returns public.snails_matches language plpgsql security definer set search_path = public as $$
declare s public.snails_series; prev public.snails_matches; n public.snails_matches;
begin
  select * into s from public.snails_series where id = p_series;
  select * into prev from public.snails_matches where id = p_prev;
  insert into public.snails_matches (rules_version, seed, config, names, host, guest, status, series_id, match_no, looks)
  values (prev.rules_version, floor(random() * 2147483647)::int, prev.config,
          jsonb_build_object('0', prev.names->>'1', '1', prev.names->>'0'),
          prev.guest, prev.host, 'playing', s.id, s.match_no + 1,
          jsonb_build_object('0', coalesce(prev.looks->'1', '{}'::jsonb), '1', coalesce(prev.looks->'0', '{}'::jsonb)))
  returning * into n;
  update public.snails_series set match_no = n.match_no, current_match = n.id, updated_at = now() where id = s.id;
  return n;
end $$;

create or replace function public.snails_rematch(p_match uuid, p_rules_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series; ns public.snails_series; n public.snails_matches;
        my_team int; other uuid; my_name text; other_name text; bo int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.snails_rules_ok(p_rules_version) then raise exception 'rules version % is not supported', p_rules_version; end if;
  select * into m from public.snails_matches where id = p_match;
  if m.id is null then raise exception 'no such match'; end if;
  my_team := case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end;
  if my_team is null then raise exception 'not your match'; end if;
  if m.series_id is not null then
    select * into s from public.snails_series where id = m.series_id;
    if s.status <> 'finished' then
      select * into n from public.snails_matches where id = s.current_match;
      return public.snails_match_json(n);
    end if;
  elsif m.status <> 'finished' then raise exception 'match is not finished';
  end if;
  other := case when my_team = 0 then m.guest else m.host end;
  if other is null then raise exception 'no opponent'; end if;
  my_name := coalesce(m.names->>my_team::text, 'Värd');
  other_name := coalesce(m.names->>(1 - my_team)::text, 'Gäst');
  bo := coalesce(s.best_of, 1);
  select * into ns from public.snails_series
   where status <> 'finished' and ((host = auth.uid() and guest = other) or (host = other and guest = auth.uid()))
   order by created_at desc limit 1;
  if ns.id is not null then
    select * into n from public.snails_matches where id = ns.current_match;
    return public.snails_match_json(n);
  end if;
  insert into public.snails_series (host, guest, names, best_of, status)
  values (auth.uid(), other, jsonb_build_object('0', my_name, '1', other_name), bo, 'playing')
  returning * into ns;
  insert into public.snails_matches (rules_version, seed, config, names, host, guest, status, series_id, match_no, looks)
  values (p_rules_version, floor(random() * 2147483647)::int, m.config,
          jsonb_build_object('0', my_name, '1', other_name), auth.uid(), other, 'playing', ns.id, 1,
          jsonb_build_object('0', public.snails_my_look(), '1', coalesce((select look from public.snails_profiles where user_id = other), '{}'::jsonb)))
  returning * into n;
  update public.snails_series set current_match = n.id where id = ns.id;
  return public.snails_match_json(n);
end $$;
