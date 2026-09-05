-- Premium cosmetics bought through Stripe Checkout. The webhook edge function
-- (supabase/functions/stripe-webhook) records a paid session here with the
-- service role; snails_unlocked then includes the item.
create table if not exists public.snails_purchases (
  id             bigserial primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  item           text not null check (item in ('gold', 'tophat')),
  stripe_session text not null unique,
  amount         int,
  currency       text,
  created_at     timestamptz not null default now()
);
create index if not exists snails_purchases_user on public.snails_purchases (user_id);
alter table public.snails_purchases enable row level security;

-- called by the webhook with the service role; idempotent on the session id
create or replace function public.snails_grant_purchase(p_user uuid, p_item text, p_session text, p_amount int, p_currency text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- security definer runs as the owner, so current_user says nothing: only the JWT role counts
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role only'; end if;
  insert into public.snails_purchases (user_id, item, stripe_session, amount, currency)
  values (p_user, p_item, p_session, p_amount, p_currency)
  on conflict (stripe_session) do nothing;
  return found;
end $$;
revoke all on function public.snails_grant_purchase(uuid, text, text, int, text) from anon, authenticated, public;
grant execute on function public.snails_grant_purchase(uuid, text, text, int, text) to service_role;

-- unlocked = free + earned + bought
create or replace function public.snails_unlocked(p_user uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare st jsonb := public.snails_stats(p_user); u text[] := array['spiral', 'stripes', 'dots', 'none', 'cap', 'party'];
begin
  if (st->>'dailyBest')::int >= 250 then u := u || 'stars'; end if;
  if (st->>'wins')::int >= 5 then u := u || 'flame'; end if;
  if (st->>'wins')::int >= 10 then u := u || 'crown'; end if;
  if (st->>'dailyBest')::int >= 350 then u := u || 'viking'; end if;
  u := u || coalesce((select array_agg(distinct item) from public.snails_purchases where user_id = p_user), '{}');
  return u;
end $$;

-- the profile tells the client whether buying is possible: a linked e-mail is required
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
    'purchases', (select coalesce(jsonb_agg(item), '[]'::jsonb) from public.snails_purchases where user_id = auth.uid()));
end $$;

-- the usage counter may record purchases
alter table public.snails_events drop constraint if exists snails_events_event_known;
alter table public.snails_events add constraint snails_events_event_known check (event in (
  'app_open', 'match_start', 'match_end', 'match_abandon', 'tutorial_done', 'tutorial_skip', 'push_on', 'error', 'account', 'daily', 'buy'
));
