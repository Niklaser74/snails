-- Web Push subscriptions for Snigelpost ("your turn" notifications).
create table if not exists public.snails_push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text,
  created_at timestamptz not null default now(),
  constraint snails_push_endpoint_len check (length(endpoint) < 2000),
  constraint snails_push_keys_len check (length(p256dh) < 200 and length(auth) < 100)
);
create index if not exists snails_push_user on public.snails_push_subscriptions (user_id);
alter table public.snails_push_subscriptions enable row level security;
revoke all on public.snails_push_subscriptions from anon, authenticated;

create or replace function public.snails_save_push(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.snails_push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.snails_push_subscriptions where id in (
      select id from public.snails_push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  insert into public.snails_push_subscriptions (user_id, endpoint, p256dh, auth, lang)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_lang, 'sv'), 8))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
end $$;

create or replace function public.snails_remove_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.snails_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- The VAPID private key lives in Supabase Vault; only the service role
-- (the edge function) may read it.
create or replace function public.snails_vapid_private()
returns text language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'snails_vapid_private' limit 1;
$$;

grant execute on function public.snails_save_push(text, text, text, text) to authenticated;
grant execute on function public.snails_remove_push(text) to authenticated;
revoke execute on function public.snails_save_push(text, text, text, text) from anon, public;
revoke execute on function public.snails_remove_push(text) from anon, public;
revoke execute on function public.snails_vapid_private() from public, anon, authenticated;
grant execute on function public.snails_vapid_private() to service_role;
