-- Series: best of 1, 3 or 5 matches between the same two players.
-- Every match belongs to a series (best_of 1 for a single match). When a match
-- ends the series is updated and, if not decided, the next match is created
-- with the roles swapped so the players alternate who starts.

create table if not exists public.snails_series (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  host          uuid not null,
  guest         uuid,
  names         jsonb not null default '{}'::jsonb, -- { "0": host name, "1": guest name } from the series host's view
  best_of       int not null default 3 check (best_of in (1, 3, 5)),
  wins_host     int not null default 0,
  wins_guest    int not null default 0,
  match_no      int not null default 1,
  current_match uuid,
  status        text not null default 'open' check (status in ('open', 'playing', 'finished')),
  winner_user   uuid
);
create index if not exists snails_series_host on public.snails_series (host, updated_at desc);
create index if not exists snails_series_guest on public.snails_series (guest, updated_at desc);
alter table public.snails_series enable row level security;
revoke all on public.snails_series from anon, authenticated;

alter table public.snails_matches add column if not exists series_id uuid references public.snails_series (id) on delete cascade;
alter table public.snails_matches add column if not exists match_no int not null default 1;
create index if not exists snails_matches_series on public.snails_matches (series_id);

-- ---------- json ----------
create or replace function public.snails_match_json(m public.snails_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'rules_version', m.rules_version, 'seed', m.seed, 'config', m.config, 'names', m.names,
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

-- ---------- internal: next match in a series (roles swapped from the previous one) ----------
create or replace function public.snails_series_next_match(p_series uuid, p_prev uuid)
returns public.snails_matches language plpgsql security definer set search_path = public as $$
declare s public.snails_series; prev public.snails_matches; n public.snails_matches;
begin
  select * into s from public.snails_series where id = p_series;
  select * into prev from public.snails_matches where id = p_prev;
  insert into public.snails_matches (rules_version, seed, config, names, host, guest, status, series_id, match_no)
  values (prev.rules_version, floor(random() * 2147483647)::int, prev.config,
          jsonb_build_object('0', prev.names->>'1', '1', prev.names->>'0'),
          prev.guest, prev.host, 'playing', s.id, s.match_no + 1)
  returning * into n;
  update public.snails_series set match_no = n.match_no, current_match = n.id, updated_at = now() where id = s.id;
  return n;
end $$;

-- ---------- internal: a match ended, update the series ----------
create or replace function public.snails_series_after_finish(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series; w uuid; needed int; wh int; wg int;
begin
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

-- ---------- create ----------
drop function if exists public.snails_create_match(int, jsonb, text, int);
create or replace function public.snails_create_match(p_seed int, p_config jsonb, p_name text, p_rules_version int, p_best_of int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  if p_best_of not in (1, 3, 5) then raise exception 'best_of must be 1, 3 or 5'; end if;
  if (select count(*) from public.snails_series where host = auth.uid() and status <> 'finished') >= 20 then
    raise exception 'too many open matches';
  end if;
  insert into public.snails_series (host, names, best_of)
  values (auth.uid(), jsonb_build_object('0', coalesce(nullif(p_name, ''), 'Värd')), p_best_of)
  returning * into s;
  insert into public.snails_matches (rules_version, seed, config, names, host, series_id, match_no)
  values (p_rules_version, p_seed, p_config, s.names, auth.uid(), s.id, 1)
  returning * into m;
  update public.snails_series set current_match = m.id where id = s.id;
  return public.snails_match_json(m);
end $$;

-- ---------- join ----------
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
     set guest = auth.uid(), status = 'playing', updated_at = now(), names = names || jsonb_build_object('1', nm)
   where id = p_match returning * into m;
  update public.snails_series
     set guest = auth.uid(), status = 'playing', updated_at = now(), names = names || jsonb_build_object('1', nm)
   where id = m.series_id and guest is null;
  return public.snails_match_json(m);
end $$;

-- ---------- my matches: one row per series (its current match) ----------
create or replace function public.snails_my_matches()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(public.snails_match_json(m) order by m.updated_at desc), '[]'::jsonb)
  from public.snails_matches m
  where (m.host = auth.uid() or m.guest = auth.uid())
    and (m.series_id is null or m.id = (select s.current_match from public.snails_series s where s.id = m.series_id));
$$;

-- ---------- submit ----------
create or replace function public.snails_submit_turn(
  p_match uuid, p_turn_no int, p_start_tick int, p_end_tick int, p_inputs jsonb, p_state_hash text,
  p_finished boolean, p_winner int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; my_team int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  my_team := case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end;
  if my_team is null then raise exception 'not your match'; end if;
  if m.status = 'finished' then raise exception 'match is finished'; end if;
  if m.status = 'open' and my_team = 0 and p_turn_no = 1 then null;
  elsif m.status = 'open' then raise exception 'waiting for an opponent';
  end if;
  if m.turn_team <> my_team then raise exception 'not your turn'; end if;
  if p_turn_no <> m.turn_count + 1 then raise exception 'turn out of order'; end if;
  if p_start_tick <> m.tick_count then raise exception 'wrong start tick'; end if;
  if p_end_tick <= p_start_tick or p_end_tick - p_start_tick > 60 * 120 then raise exception 'bad tick range'; end if;
  if jsonb_typeof(p_inputs) <> 'array' then raise exception 'inputs must be an array'; end if;
  insert into public.snails_turns (match_id, turn_no, team, player, start_tick, end_tick, inputs, state_hash)
  values (p_match, p_turn_no, my_team, auth.uid(), p_start_tick, p_end_tick, p_inputs, p_state_hash);
  update public.snails_matches
     set turn_count = p_turn_no, tick_count = p_end_tick, turn_team = 1 - my_team, last_hash = p_state_hash,
         status = case when p_finished then 'finished' else status end,
         winner = case when p_finished then p_winner else winner end,
         updated_at = now()
   where id = p_match returning * into m;
  if p_finished then perform public.snails_series_after_finish(p_match); end if;
  return public.snails_match_json(m);
end $$;

-- ---------- resign ----------
create or replace function public.snails_resign(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; my_team int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  my_team := case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end;
  if my_team is null then raise exception 'not your match'; end if;
  if m.status = 'finished' then return public.snails_match_json(m); end if;
  if m.status = 'open' then
    delete from public.snails_series where id = m.series_id;
    delete from public.snails_matches where id = p_match;
    return null;
  end if;
  update public.snails_matches
     set status = 'finished', winner = 1 - my_team, updated_at = now()
   where id = p_match returning * into m;
  perform public.snails_series_after_finish(p_match);
  return public.snails_match_json(m);
end $$;

-- ---------- timeout ----------
create or replace function public.snails_claim_timeout(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; my_team int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  my_team := case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end;
  if my_team is null then raise exception 'not your match'; end if;
  if m.status <> 'playing' then raise exception 'match is not in play'; end if;
  if m.turn_team = my_team then raise exception 'it is your turn'; end if;
  if m.updated_at > now() - interval '14 days' then raise exception 'opponent still has time'; end if;
  update public.snails_matches
     set status = 'finished', winner = my_team, updated_at = now()
   where id = p_match returning * into m;
  perform public.snails_series_after_finish(p_match);
  return public.snails_match_json(m);
end $$;

-- ---------- rematch: a new series against the same opponent ----------
create or replace function public.snails_rematch(p_match uuid, p_rules_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series; ns public.snails_series; n public.snails_matches;
        my_team int; other uuid; my_name text; other_name text; bo int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
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
  -- reuse an unfinished series between the two
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
  insert into public.snails_matches (rules_version, seed, config, names, host, guest, status, series_id, match_no)
  values (p_rules_version, floor(random() * 2147483647)::int, m.config,
          jsonb_build_object('0', my_name, '1', other_name), auth.uid(), other, 'playing', ns.id, 1)
  returning * into n;
  update public.snails_series set current_match = n.id where id = ns.id;
  return public.snails_match_json(n);
end $$;

-- ---------- extend a finished single match into a series ----------
create or replace function public.snails_extend_series(p_match uuid, p_best_of int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; s public.snails_series; n public.snails_matches; needed int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_best_of not in (3, 5) then raise exception 'best_of must be 3 or 5'; end if;
  select * into m from public.snails_matches where id = p_match;
  if m.id is null or m.series_id is null then raise exception 'no such match'; end if;
  if m.host <> auth.uid() and (m.guest is null or m.guest <> auth.uid()) then raise exception 'not your match'; end if;
  select * into s from public.snails_series where id = m.series_id for update;
  if s.status <> 'finished' then raise exception 'series is not finished'; end if;
  if s.best_of >= p_best_of then raise exception 'series is already that long'; end if;
  needed := p_best_of / 2 + 1;
  if s.wins_host >= needed or s.wins_guest >= needed then raise exception 'series would already be decided'; end if;
  update public.snails_series set best_of = p_best_of, status = 'playing', winner_user = null, updated_at = now() where id = s.id;
  select * into n from public.snails_matches where id = s.current_match;
  n := public.snails_series_next_match(s.id, n.id);
  return public.snails_match_json(n);
end $$;

-- ---------- delete / cleanup ----------
create or replace function public.snails_delete_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snails_matches;
begin
  select * into m from public.snails_matches where id = p_match;
  if m.id is null then return; end if;
  if m.host <> auth.uid() and (m.guest is null or m.guest <> auth.uid()) then return; end if;
  if m.series_id is not null then delete from public.snails_series where id = m.series_id;
  else delete from public.snails_matches where id = p_match;
  end if;
end $$;

create or replace function public.snails_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.snails_series where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_series where status = 'finished' and updated_at < now() - interval '90 days';
  delete from public.snails_matches where series_id is null and status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_matches where series_id is null and status = 'finished' and updated_at < now() - interval '90 days';
$$;

grant execute on function public.snails_create_match(int, jsonb, text, int, int) to authenticated;
grant execute on function public.snails_extend_series(uuid, int) to authenticated;
revoke execute on function public.snails_create_match(int, jsonb, text, int, int) from anon, public;
revoke execute on function public.snails_extend_series(uuid, int) from anon, public;
revoke all on function public.snails_series_next_match(uuid, uuid) from anon, authenticated, public;
revoke all on function public.snails_series_after_finish(uuid) from anon, authenticated, public;
