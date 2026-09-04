-- Rules versioning for Snigelpost.
-- The client can run every version in its SUPPORTED_RULES (js/game.js). This
-- table mirrors that list on the server: matches can only be created with a
-- supported version, and matches on a retired version are closed as a draw
-- once its sunset date has passed (nightly by snails_cleanup).
create table if not exists public.snails_rules (
  version    int primary key,
  supported  boolean not null default true,
  sunset_at  date,                      -- when set and passed, matches on this version are closed
  note       text
);
alter table public.snails_rules enable row level security;
-- nobody reads or writes it directly; the security definer functions below do
insert into public.snails_rules (version, supported, sunset_at, note) values
  (1, false, '2026-09-04', 'första Snigelpost-reglerna'),
  (2, true, null, 'lådor, slemklot, saltregn, ammunition'),
  (3, true, null, 'skalstöt, snigelhopp')
on conflict (version) do update set supported = excluded.supported, sunset_at = excluded.sunset_at, note = excluded.note;

create or replace function public.snails_rules_ok(p_version int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.snails_rules where version = p_version and supported);
$$;
revoke all on function public.snails_rules_ok(int) from anon, authenticated, public;

-- create: only a supported version
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
  insert into public.snails_matches (rules_version, seed, config, names, host, series_id, match_no)
  values (p_rules_version, p_seed, p_config, s.names, auth.uid(), s.id, 1)
  returning * into m;
  update public.snails_series set current_match = m.id where id = s.id;
  return public.snails_match_json(m);
end $$;

-- the list of versions the server accepts, for the client's own sanity check
create or replace function public.snails_supported_rules()
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(version order by version), '{}') from public.snails_rules where supported;
$$;
grant execute on function public.snails_supported_rules() to authenticated;
revoke execute on function public.snails_supported_rules() from anon, public;

-- cleanup: also close matches whose rules version has been retired
create or replace function public.snails_cleanup()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  delete from public.snails_series where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_series where status = 'finished' and updated_at < now() - interval '90 days';
  delete from public.snails_matches where series_id is null and status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_matches where series_id is null and status = 'finished' and updated_at < now() - interval '90 days';
  -- retired rules: open invitations vanish, matches in progress end as a draw and their series with them
  for r in select version from public.snails_rules where not supported and sunset_at is not null and sunset_at <= current_date loop
    delete from public.snails_series where id in (select series_id from public.snails_matches where rules_version = r.version and status = 'open' and guest is null);
    delete from public.snails_matches where rules_version = r.version and status = 'open' and guest is null;
    update public.snails_series set status = 'finished', winner_user = null, updated_at = now()
      where status <> 'finished' and id in (select series_id from public.snails_matches where rules_version = r.version and status <> 'finished');
    update public.snails_matches set status = 'finished', winner = null, updated_at = now()
      where rules_version = r.version and status <> 'finished';
  end loop;
end $$;

-- rematch: same check
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
