-- Stop signed-out callers from changing someone else's product-email answer.
--
-- record_consent() is open to anon (the demo form and "sign in later" run
-- before there is a session) and takes the email as given. Because the newest
-- consent_records row for an address is its current answer, anyone holding
-- the publishable key could POST /rest/v1/rpc/record_consent for any address
-- and opt it in to product email (consent we would then have to stand
-- behind) or silently opt a customer out.
--
-- Now every row says whether it counts. A row counts when we know who gave
-- the answer:
--   * a signed-in caller (recorded under their own account email);
--   * the unsubscribe link or the account page (record_marketing_choice);
--   * a signed-out caller giving the first answer for an address that has
--     no account and no counted answer yet (the demo form).
-- A signed-out submission for an address that already has an account or a
-- counted answer is still stored, as evidence of what was submitted, but
-- does not count: it cannot change that person's answer. They can change it
-- themselves from the account page or the link in any product email.
--
-- First answers for new addresses still count straight away; a follow-up
-- migration adds double opt-in (a confirmation email) for those.

-- 1. Which rows decide an address's answer
alter table public.consent_records
  add column if not exists counts boolean not null default true;
comment on column public.consent_records.counts is
  'false: submitted signed-out for an address that already had an account or a counted answer; kept as evidence, ignored when deciding the current answer';

create index if not exists idx_consent_records_email_counted
  on public.consent_records (lower(email), created_at desc) where counts;

-- 2. record_consent: signed-out answers about known addresses do not count
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

  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent, counts)
  values (v_uid, v_email, p_source, coalesce(p_terms, false), coalesce(p_privacy, false),
    coalesce(p_marketing, false), left(coalesce(p_policy_version, ''), 40),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400), v_counts)
  returning id into v_id;

  return v_id;
end;
$$;

-- 3. The sending check reads counted rows only
create or replace function public.marketing_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.marketing_opt_in from consent_records c
    where lower(c.email) = lower(trim(p_email)) and c.counts
    order by c.created_at desc limit 1
  ), false);
$$;

-- 4. Choices from the link and the account page: carry Terms and Privacy
--    forward from the last counted answer, and always count
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
end;
$$;

-- 5. Current answer per email: counted rows only
create or replace view public.marketing_consent
with (security_invoker = true) as
  select distinct on (lower(email))
    lower(email) as email, user_id, marketing_opt_in, source, policy_version, created_at as answered_at
  from public.consent_records
  where counts
  order by lower(email), created_at desc;

-- 6. The grants are unchanged (create or replace keeps them); check them
do $$
begin
  if has_function_privilege('anon', 'public.marketing_email_allowed(text)', 'execute')
     or has_function_privilege('anon', 'public.record_marketing_choice(text, uuid, boolean, text)', 'execute')
     or not has_function_privilege('anon', 'public.record_consent(text, text, boolean, boolean, boolean, text)', 'execute') then
    raise exception 'consent function grants are not as expected';
  end if;
end $$;
