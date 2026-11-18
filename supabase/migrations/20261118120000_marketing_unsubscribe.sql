-- Unsubscribing from product emails.
--
-- consent_records (20261117120000) stores who opted in to product emails.
-- This adds the way back out, as Mailjet's sending policy and the signup
-- checkbox ("you can unsubscribe at any time") both require:
--
--   * a personal unsubscribe link for every address, usable without signing
--     in (unsubscribe_tokens, set_marketing_by_token);
--   * a setting in the account page (my_marketing_preference,
--     set_my_marketing_preference);
--   * the check every product email must pass before it is sent
--     (marketing_email_allowed), and the link it must carry
--     (unsubscribe_token_for).
--
-- A change of mind is one more row in consent_records, never an edit, so the
-- history of what someone agreed to and when stays intact. The newest row
-- for an address is its current answer.

-- 1. Two more places an answer can come from
alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check
  check (source in ('signup', 'add_building', 'invitation', 'demo', 'unsubscribe', 'preferences'));

-- 2. One unguessable link token per address
create table if not exists public.unsubscribe_tokens (
  token      uuid primary key default gen_random_uuid(),
  email      text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists unsubscribe_tokens_email on public.unsubscribe_tokens (lower(email));
alter table public.unsubscribe_tokens enable row level security;  -- no policies: functions only

-- 3. Record a product-email choice (internal; called by the functions below)
create or replace function public.record_marketing_choice(
  p_email text, p_user_id uuid, p_opt_in boolean, p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_prev record;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'email required';
  end if;
  -- Terms and Privacy are not being re-answered here: carry the last answers forward
  select terms_accepted, privacy_accepted, policy_version into v_prev
  from consent_records where lower(email) = v_email
  order by created_at desc limit 1;

  -- clock_timestamp(), not now(): two choices made in one transaction must
  -- still be ordered, because the newest row is the one that counts.
  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent, created_at)
  values (p_user_id, v_email, p_source,
    coalesce(v_prev.terms_accepted, false), coalesce(v_prev.privacy_accepted, false),
    p_opt_in, coalesce(v_prev.policy_version, ''),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400), clock_timestamp());
end;
$$;
revoke execute on function public.record_marketing_choice(text, uuid, boolean, text) from public, anon, authenticated;

-- Shows whose link this is without printing the whole address: d***@example.com
create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when position('@' in p_email) > 1
    then left(p_email, 1) || '***' || substring(p_email from position('@' in p_email))
    else '***' end;
$$;

-- 4. The unsubscribe link, for whoever is sending a product email (server only)
create or replace function public.unsubscribe_token_for(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token uuid;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'email required';
  end if;
  select token into v_token from unsubscribe_tokens where lower(email) = v_email;
  if v_token is null then
    insert into unsubscribe_tokens (email) values (v_email)
    on conflict (lower(email)) do update set email = excluded.email
    returning token into v_token;
  end if;
  return v_token;
end;
$$;
revoke execute on function public.unsubscribe_token_for(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_token_for(text) to service_role;

-- 5. May this address be sent product email? Only if its newest answer is yes.
--    No record at all means no: people who signed up before the checkbox
--    existed have not opted in.
create or replace function public.marketing_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.marketing_opt_in from consent_records c
    where lower(c.email) = lower(trim(p_email))
    order by c.created_at desc limit 1
  ), false);
$$;
revoke execute on function public.marketing_email_allowed(text) from public, anon, authenticated;
grant execute on function public.marketing_email_allowed(text) to service_role;

-- 6. The unsubscribe page: what the link is for, and acting on it. Open to
--    anyone holding the link; the token is the proof.
create or replace function public.marketing_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email_hint', public.mask_email(t.email),
    'subscribed', public.marketing_email_allowed(t.email))
  from unsubscribe_tokens t where t.token = p_token;
$$;
revoke execute on function public.marketing_by_token(uuid) from public;
grant execute on function public.marketing_by_token(uuid) to anon, authenticated, service_role;

create or replace function public.set_marketing_by_token(p_token uuid, p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user uuid;
begin
  select email into v_email from unsubscribe_tokens where token = p_token;
  if v_email is null then
    return null;
  end if;
  select id into v_user from auth.users where lower(email) = lower(v_email) order by created_at limit 1;
  perform record_marketing_choice(v_email, v_user, coalesce(p_opt_in, false),
    case when coalesce(p_opt_in, false) then 'preferences' else 'unsubscribe' end);
  return jsonb_build_object('email_hint', mask_email(v_email), 'subscribed', coalesce(p_opt_in, false));
end;
$$;
revoke execute on function public.set_marketing_by_token(uuid, boolean) from public;
grant execute on function public.set_marketing_by_token(uuid, boolean) to anon, authenticated, service_role;

-- 7. The account page setting, for the signed-in person's own address
create or replace function public.my_marketing_preference()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.marketing_email_allowed(u.email) from auth.users u where u.id = auth.uid();
$$;
revoke execute on function public.my_marketing_preference() from public, anon;
grant execute on function public.my_marketing_preference() to authenticated;

create or replace function public.set_my_marketing_preference(p_opt_in boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'not signed in';
  end if;
  perform record_marketing_choice(v_email, auth.uid(), coalesce(p_opt_in, false), 'preferences');
  return coalesce(p_opt_in, false);
end;
$$;
revoke execute on function public.set_my_marketing_preference(boolean) from public, anon;
grant execute on function public.set_my_marketing_preference(boolean) to authenticated;
