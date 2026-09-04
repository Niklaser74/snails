-- Snigelpost, second round: resign, rematch, win on timeout, cleanup.

-- Give up: the other player wins. An open match nobody joined is just deleted.
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
    delete from public.snails_matches where id = p_match;
    return null;
  end if;
  update public.snails_matches
     set status = 'finished', winner = 1 - my_team, updated_at = now()
   where id = p_match returning * into m;
  return public.snails_match_json(m);
end $$;

-- The player waiting may claim the win when the other has been silent for 14 days.
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
  return public.snails_match_json(m);
end $$;

-- Rematch: a new match against the same opponent, the caller plays first.
create or replace function public.snails_rematch(p_match uuid, p_rules_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snails_matches; n public.snails_matches; my_team int; other uuid; my_name text; other_name text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snails_matches where id = p_match;
  if m.id is null then raise exception 'no such match'; end if;
  my_team := case when m.host = auth.uid() then 0 when m.guest = auth.uid() then 1 else null end;
  if my_team is null then raise exception 'not your match'; end if;
  if m.status <> 'finished' then raise exception 'match is not finished'; end if;
  other := case when my_team = 0 then m.guest else m.host end;
  if other is null then raise exception 'no opponent'; end if;
  my_name := coalesce(m.names->>my_team::text, 'Värd');
  other_name := coalesce(m.names->>(1 - my_team)::text, 'Gäst');
  -- reuse an existing rematch if one was already created for this pair
  select * into n from public.snails_matches
   where status <> 'finished' and ((host = auth.uid() and guest = other) or (host = other and guest = auth.uid()))
   order by created_at desc limit 1;
  if n.id is not null then return public.snails_match_json(n); end if;
  insert into public.snails_matches (rules_version, seed, config, names, host, guest, status)
  values (p_rules_version, floor(random() * 2147483647)::int, m.config,
          jsonb_build_object('0', my_name, '1', other_name), auth.uid(), other, 'playing')
  returning * into n;
  return public.snails_match_json(n);
end $$;

-- Daily cleanup: invitations nobody accepted, old finished matches.
create or replace function public.snails_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.snails_matches where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snails_matches where status = 'finished' and updated_at < now() - interval '90 days';
$$;

grant execute on function public.snails_resign(uuid) to authenticated;
grant execute on function public.snails_claim_timeout(uuid) to authenticated;
grant execute on function public.snails_rematch(uuid, int) to authenticated;
revoke execute on function public.snails_resign(uuid) from anon, public;
revoke execute on function public.snails_claim_timeout(uuid) from anon, public;
revoke execute on function public.snails_rematch(uuid, int) from anon, public;
revoke all on function public.snails_cleanup() from anon, authenticated, public;

-- client error reports go into the usage counter
alter table public.snails_events drop constraint if exists snails_events_event_known;
alter table public.snails_events add constraint snails_events_event_known check (event in (
  'app_open', 'match_start', 'match_end', 'match_abandon', 'tutorial_done', 'tutorial_skip', 'push_on', 'error'
));

-- nightly at 04:17 UTC
select cron.unschedule(jobid) from cron.job where jobname = 'snails_cleanup';
select cron.schedule('snails_cleanup', '17 4 * * *', $$select public.snails_cleanup()$$);
