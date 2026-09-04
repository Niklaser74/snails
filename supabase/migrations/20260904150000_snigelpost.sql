-- Snigelpost: asynchronous two-player matches. A match is a seed plus a list of
-- turns; each turn is the (tick, input) pairs one player produced. Because the
-- simulation is deterministic, replaying the turns reproduces the match on any
-- device. All access goes through the RPC functions below (security definer,
-- checked against auth.uid()); anonymous Supabase Auth users are enough.

create table if not exists public.snails_matches (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  rules_version  int not null,
  seed           int not null,
  config         jsonb not null,            -- { snailsPerTeam }
  names          jsonb not null default '{}'::jsonb, -- { "0": host name, "1": guest name }
  host           uuid not null,
  guest          uuid,
  status         text not null default 'open' check (status in ('open', 'playing', 'finished')),
  turn_team      int not null default 0 check (turn_team in (0, 1)),
  turn_count     int not null default 0,
  tick_count     int not null default 0,
  winner         int check (winner in (0, 1)),
  last_hash      text
);
create index if not exists snails_matches_host on public.snails_matches (host, updated_at desc);
create index if not exists snails_matches_guest on public.snails_matches (guest, updated_at desc);

create table if not exists public.snails_turns (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references public.snails_matches (id) on delete cascade,
  turn_no     int not null,
  team        int not null check (team in (0, 1)),
  player      uuid not null,
  start_tick  int not null,
  end_tick    int not null,
  inputs      jsonb not null,
  state_hash  text not null,
  created_at  timestamptz not null default now(),
  unique (match_id, turn_no),
  constraint snails_turns_inputs_small check (pg_column_size(inputs) < 200000)
);

alter table public.snails_matches enable row level security;
alter table public.snails_turns enable row level security;
-- no direct table access for API roles; the functions below are the API
revoke all on public.snails_matches, public.snails_turns from anon, authenticated;

-- ---------- helpers ----------
create or replace function public.snails_match_json(m public.snails_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'rules_version', m.rules_version, 'seed', m.seed, 'config', m.config, 'names', m.names,
    'host', m.host, 'guest', m.guest, 'status', m.status, 'turn_team', m.turn_team,
    'turn_count', m.turn_count, 'tick_count', m.tick_count, 'winner', m.winner,
    'my_team', case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end
  );
$$;

-- ---------- create ----------
create or replace function public.snails_create_match(p_seed int, p_config jsonb, p_name text, p_rules_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  if (select count(*) from public.snails_matches where host = auth.uid() and status <> 'finished') >= 20 then
    raise exception 'too many open matches';
  end if;
  insert into public.snails_matches (rules_version, seed, config, names, host)
  values (p_rules_version, p_seed, p_config, jsonb_build_object('0', coalesce(nullif(p_name, ''), 'Värd')), auth.uid())
  returning * into m;
  return public.snails_match_json(m);
end $$;

-- ---------- join (anyone with the link, once) ----------
create or replace function public.snails_join_match(p_match uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  select * into m from public.snails_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.host = auth.uid() or m.guest = auth.uid() then return public.snails_match_json(m); end if;
  if m.guest is not null then raise exception 'match is full'; end if;
  update public.snails_matches
     set guest = auth.uid(), status = 'playing', updated_at = now(),
         names = names || jsonb_build_object('1', coalesce(nullif(p_name, ''), 'Gäst'))
   where id = p_match returning * into m;
  return public.snails_match_json(m);
end $$;

-- ---------- read one match with all turns ----------
create or replace function public.snails_get_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare m public.snails_matches; turns jsonb;
begin
  select * into m from public.snails_matches where id = p_match;
  if m.id is null then raise exception 'no such match'; end if;
  -- open matches are visible to anyone holding the link (they need the seed to join)
  if m.status <> 'open' and m.host <> auth.uid() and (m.guest is null or m.guest <> auth.uid()) then
    raise exception 'not your match';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'turn_no', t.turn_no, 'team', t.team, 'start_tick', t.start_tick, 'end_tick', t.end_tick,
           'inputs', t.inputs, 'state_hash', t.state_hash, 'created_at', t.created_at) order by t.turn_no), '[]'::jsonb)
    into turns from public.snails_turns t where t.match_id = p_match;
  return public.snails_match_json(m) || jsonb_build_object('turns', turns);
end $$;

-- ---------- my matches ----------
create or replace function public.snails_my_matches()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(public.snails_match_json(m) order by m.updated_at desc), '[]'::jsonb)
  from public.snails_matches m
  where m.host = auth.uid() or m.guest = auth.uid();
$$;

-- ---------- submit a turn ----------
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
  if m.status = 'open' and my_team = 0 and p_turn_no = 1 then null; -- the host may play turn 1 before anyone joins
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
  return public.snails_match_json(m);
end $$;

-- ---------- leave / delete ----------
create or replace function public.snails_delete_match(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.snails_matches where id = p_match and (host = auth.uid() or guest = auth.uid());
end $$;

revoke all on function public.snails_match_json(public.snails_matches) from public, anon;
grant execute on function public.snails_create_match(int, jsonb, text, int) to authenticated;
grant execute on function public.snails_join_match(uuid, text) to authenticated;
grant execute on function public.snails_get_match(uuid) to authenticated;
grant execute on function public.snails_my_matches() to authenticated;
grant execute on function public.snails_submit_turn(uuid, int, int, int, jsonb, text, boolean, int) to authenticated;
grant execute on function public.snails_delete_match(uuid) to authenticated;
revoke execute on function public.snails_create_match(int, jsonb, text, int) from anon, public;
revoke execute on function public.snails_join_match(uuid, text) from anon, public;
revoke execute on function public.snails_get_match(uuid) from anon, public;
revoke execute on function public.snails_my_matches() from anon, public;
revoke execute on function public.snails_submit_turn(uuid, int, int, int, jsonb, text, boolean, int) from anon, public;
revoke execute on function public.snails_delete_match(uuid) from anon, public;
