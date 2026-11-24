-- Double opt-in for product emails.
--
-- Ticking "Email me ONE two product news" (signup, invitation, demo, add a
-- building) or turning it on under Account no longer subscribes the address
-- straight away. Nothing proves the person typing owns the inbox: anyone can
-- type any address on the demo form, and accounts are created without an
-- email check. Instead the answer is stored as pending (consent_records.counts
-- = false) and a confirmation email goes to the address. It only becomes
-- subscribed when someone opens that email and presses Confirm. This is the
-- proof of consent Mailjet's policy asks for.
--
-- Not affected:
--   * opting out, anywhere: takes effect at once;
--   * the Subscribe again button on the unsubscribe page: its token was
--     emailed to that inbox, which is the same proof a confirmation gives;
--   * an address that is already subscribed: ticking the box again changes
--     nothing and sends nothing.
--
-- At most one confirmation email per address per 24 hours, so the forms
-- cannot be used to flood someone's inbox. A link works for 7 days.
--
-- Sending: pg_cron checks every minute and, only when something is waiting,
-- calls the send-marketing-confirmations edge function with a secret from
-- Vault (the same pattern as migration 053's Stripe job).

-- 1. Where a confirmed answer comes from
alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check
  check (source in ('signup', 'add_building', 'invitation', 'demo', 'unsubscribe', 'preferences', 'confirmation'));

comment on column public.consent_records.counts is
  'false: not (yet) part of the address''s answer. Either a product-email opt-in waiting for its confirmation email (see marketing_confirmations), or a signed-out submission for an address that already had an account or a counted answer. Kept as evidence; ignored when deciding the current answer.';

-- 2. Confirmation links
create table if not exists public.marketing_confirmations (
  token        uuid primary key default gen_random_uuid(),
  email        text not null,
  consent_id   uuid references public.consent_records(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  sent_at      timestamptz,
  confirmed_at timestamptz
);
create index if not exists marketing_confirmations_email
  on public.marketing_confirmations (lower(email), created_at desc);
create index if not exists marketing_confirmations_unsent
  on public.marketing_confirmations (created_at) where sent_at is null and confirmed_at is null;
alter table public.marketing_confirmations enable row level security;  -- no policies: functions only

-- 3. Queue a confirmation email for a pending opt-in (internal)
create or replace function public.queue_marketing_confirmation(p_email text, p_consent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_open uuid;
begin
  -- One email per address per day: a newer tick within that time rides on
  -- the link already sent (or about to be)
  select token into v_open from marketing_confirmations
   where lower(email) = v_email and confirmed_at is null
     and expires_at > now() and created_at > now() - interval '24 hours'
   order by created_at desc limit 1;
  if v_open is not null then
    update marketing_confirmations set consent_id = p_consent_id where token = v_open;
    return;
  end if;
  insert into marketing_confirmations (email, consent_id) values (v_email, p_consent_id);
end;
$$;
revoke execute on function public.queue_marketing_confirmation(text, uuid) from public, anon, authenticated;

-- 4. record_consent: an opt-in waits for its confirmation
create or replace function public.record_consent(
  p_source text,
  p_email text,
  p_terms boolean,
  p_privacy boolean,
  p_marketing boolean,
  p_policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_counts boolean := true;
  v_pending boolean;
  v_id uuid;
begin
  if p_source not in ('signup', 'add_building', 'invitation', 'demo') then
    raise exception 'unknown consent source';
  end if;

  -- A signed-in caller is recorded under their own email, whatever was sent
  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;
  v_email := lower(trim(coalesce(v_email, p_email, '')));
  if v_email = '' or length(v_email) > 254 or position('@' in v_email) = 0 then
    raise exception 'email required';
  end if;

  -- Signed out: we cannot tell who is typing, so only a first answer for an
  -- address nobody has answered for (and that has no account) may count
  if v_uid is null then
    v_counts := not exists (select 1 from auth.users u where lower(u.email) = v_email)
            and not exists (select 1 from consent_records c where lower(c.email) = v_email and c.counts);
  end if;

  -- Opting in an address that is not subscribed yet: pending until confirmed
  v_pending := coalesce(p_marketing, false) and not marketing_email_allowed(v_email);
  if v_pending then
    v_counts := false;
  end if;

  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent, counts)
  values (v_uid, v_email, p_source, coalesce(p_terms, false), coalesce(p_privacy, false),
    coalesce(p_marketing, false), left(coalesce(p_policy_version, ''), 40),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400), v_counts)
  returning id into v_id;

  if v_pending then
    perform queue_marketing_confirmation(v_email, v_id);
  end if;
  return v_id;
end;
$$;

-- 4b. Opting out (Account setting or unsubscribe link) also cancels any
--     confirmation link still waiting, so a later click cannot undo it.
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
  select terms_accepted, privacy_accepted, policy_version into v_prev
  from consent_records where lower(email) = v_email and counts
  order by created_at desc limit 1;

  -- clock_timestamp(), not now(): two choices made in one transaction must
  -- still be ordered, because the newest row is the one that counts.
  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent, created_at, counts)
  values (p_user_id, v_email, p_source,
    coalesce(v_prev.terms_accepted, false), coalesce(v_prev.privacy_accepted, false),
    p_opt_in, coalesce(v_prev.policy_version, ''),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400), clock_timestamp(), true);

  if not coalesce(p_opt_in, false) then
    update marketing_confirmations set expires_at = least(expires_at, now())
     where lower(email) = v_email and confirmed_at is null and expires_at > now();
  end if;
end;
$$;

-- 5. The Account setting: turning it on asks for confirmation; off is at once.
--    Returns whether the address is subscribed now (false while pending).
create or replace function public.set_my_marketing_preference(p_opt_in boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_prev record;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_id uuid;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'not signed in';
  end if;

  if not coalesce(p_opt_in, false) then
    perform record_marketing_choice(v_email, auth.uid(), false, 'preferences');
    return false;
  end if;
  if marketing_email_allowed(v_email) then
    return true;
  end if;

  select terms_accepted, privacy_accepted, policy_version into v_prev
  from consent_records where lower(email) = v_email and counts
  order by created_at desc limit 1;
  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent, created_at, counts)
  values (auth.uid(), v_email, 'preferences',
    coalesce(v_prev.terms_accepted, false), coalesce(v_prev.privacy_accepted, false),
    true, coalesce(v_prev.policy_version, ''),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400), clock_timestamp(), false)
  returning id into v_id;
  perform queue_marketing_confirmation(v_email, v_id);
  return false;
end;
$$;

-- Whether the signed-in person has a confirmation email waiting
create or replace function public.my_marketing_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from marketing_confirmations c join auth.users u on lower(u.email) = lower(c.email)
    where u.id = auth.uid() and c.confirmed_at is null and c.expires_at > now()
  ) and not coalesce((select public.marketing_email_allowed(u.email) from auth.users u where u.id = auth.uid()), false);
$$;
revoke execute on function public.my_marketing_pending() from public, anon;
grant execute on function public.my_marketing_pending() to authenticated;

-- 6. The confirmation page. Open to anyone holding the link; the token is
--    the proof. Looking changes nothing (mail scanners open links); the
--    Confirm button does.
create or replace function public.marketing_confirmation_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email_hint', public.mask_email(c.email),
    'subscribed', public.marketing_email_allowed(c.email),
    'state', case when c.confirmed_at is not null then 'used'
                  when c.expires_at <= now() then 'expired'
                  else 'pending' end)
  from marketing_confirmations c where c.token = p_token;
$$;
revoke execute on function public.marketing_confirmation_by_token(uuid) from public;
grant execute on function public.marketing_confirmation_by_token(uuid) to anon, authenticated, service_role;

create or replace function public.confirm_marketing_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c marketing_confirmations%rowtype;
  v_prev record;
  v_user uuid;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
begin
  select * into c from marketing_confirmations where token = p_token for update;
  if not found then
    return null;
  end if;

  if c.confirmed_at is null then
    if c.expires_at <= now() then
      return jsonb_build_object('email_hint', mask_email(c.email), 'subscribed', marketing_email_allowed(c.email), 'state', 'expired');
    end if;
    -- Terms and Privacy as answered on the form that asked
    select user_id, terms_accepted, privacy_accepted, policy_version into v_prev
    from consent_records where id = c.consent_id;
    select id into v_user from auth.users where lower(email) = lower(c.email) order by created_at limit 1;
    insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
      marketing_opt_in, policy_version, ip_address, user_agent, created_at, counts)
    values (coalesce(v_prev.user_id, v_user), lower(c.email), 'confirmation',
      coalesce(v_prev.terms_accepted, false), coalesce(v_prev.privacy_accepted, false),
      true, coalesce(v_prev.policy_version, ''),
      left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
      left(coalesce(v_headers ->> 'user-agent', ''), 400), clock_timestamp(), true);
    update marketing_confirmations set confirmed_at = now() where token = p_token;
  end if;

  return jsonb_build_object('email_hint', mask_email(c.email), 'subscribed', marketing_email_allowed(c.email), 'state', 'used');
end;
$$;
revoke execute on function public.confirm_marketing_by_token(uuid) from public;
grant execute on function public.confirm_marketing_by_token(uuid) to anon, authenticated, service_role;

-- 7. For the sender (service role only): claim a batch, release on failure
create or replace function public.claim_marketing_confirmations(p_limit int default 50)
returns table (token uuid, email text)
language sql
security definer
set search_path = public
as $$
  update marketing_confirmations m set sent_at = now()
  where m.token in (
    select c.token from marketing_confirmations c
    where c.sent_at is null and c.confirmed_at is null and c.expires_at > now()
    order by c.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked)
  returning m.token, m.email;
$$;
revoke execute on function public.claim_marketing_confirmations(int) from public, anon, authenticated;
grant execute on function public.claim_marketing_confirmations(int) to service_role;

create or replace function public.release_marketing_confirmation(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update marketing_confirmations set sent_at = null where token = p_token and confirmed_at is null;
$$;
revoke execute on function public.release_marketing_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.release_marketing_confirmation(uuid) to service_role;

-- 8. The sender's secret, and the every-minute check
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'marketing_confirm_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'marketing_confirm_cron_secret',
      'Sent by the marketing confirmation job to the send-marketing-confirmations edge function');
  end if;
exception when others then
  raise notice 'Vault is not available here (%). Create the marketing_confirm_cron_secret secret once it is.', sqlerrm;
end $$;

create or replace function public.marketing_confirm_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'marketing_confirm_cron_secret' limit 1;
$$;
revoke all on function public.marketing_confirm_cron_secret() from public, anon, authenticated;
grant execute on function public.marketing_confirm_cron_secret() to service_role;

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if exists (select 1 from cron.job where jobname = 'onetwo-marketing-confirmations') then
    perform cron.unschedule('onetwo-marketing-confirmations');
  end if;
  perform cron.schedule('onetwo-marketing-confirmations', '* * * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-marketing-confirmations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'marketing_confirm_cron_secret')
      ),
      body    := '{"source":"cron"}'::jsonb
    )
    where exists (
      select 1 from public.marketing_confirmations
      where sent_at is null and confirmed_at is null and expires_at > now()
    )
  $job$);
exception when others then
  raise notice 'pg_cron or pg_net is not available here (%). Call the send-marketing-confirmations edge function every minute from outside once it is.', sqlerrm;
end $$;

-- 9. Check the grants
do $$
begin
  if has_function_privilege('anon', 'public.queue_marketing_confirmation(text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.claim_marketing_confirmations(int)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_marketing_confirmations(int)', 'execute')
     or has_function_privilege('anon', 'public.release_marketing_confirmation(uuid)', 'execute')
     or has_function_privilege('anon', 'public.marketing_confirm_cron_secret()', 'execute')
     or has_function_privilege('anon', 'public.my_marketing_pending()', 'execute')
     or not has_function_privilege('anon', 'public.confirm_marketing_by_token(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.marketing_confirmation_by_token(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.record_consent(text, text, boolean, boolean, boolean, text)', 'execute') then
    raise exception 'marketing confirmation grants are not as expected';
  end if;
end $$;
