-- Consent records.
--
-- Mailjet's sending policy requires that anyone we email has given clear,
-- explicit and provable consent, through a checkbox that is unticked by
-- default and separate from accepting the privacy policy. The signup,
-- invitation and demo forms now show three checkboxes (Terms, Privacy,
-- product communications); this table is the proof of what was ticked.
--
-- One row per form submission, never updated: the latest row for an email is
-- its current answer, earlier rows are the history. Written only through
-- record_consent(), which stamps the caller, time, IP and browser itself so
-- the client cannot supply them.

create table if not exists public.consent_records (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  email              text not null,
  source             text not null check (source in ('signup', 'add_building', 'invitation', 'demo')),
  terms_accepted     boolean not null,
  privacy_accepted   boolean not null,
  marketing_opt_in   boolean not null,
  policy_version     text not null,
  ip_address         text,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_consent_records_email on public.consent_records (lower(email), created_at desc);
create index if not exists idx_consent_records_user on public.consent_records (user_id, created_at desc);

alter table public.consent_records enable row level security;

-- Readable by the person it is about and by platform admins; written only by record_consent()
drop policy if exists "Users read own consent" on public.consent_records;
create policy "Users read own consent" on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Admins read consent" on public.consent_records;
create policy "Admins read consent" on public.consent_records
  for select to authenticated using ((select public.is_platform_admin()));

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

  insert into consent_records (user_id, email, source, terms_accepted, privacy_accepted,
    marketing_opt_in, policy_version, ip_address, user_agent)
  values (v_uid, v_email, p_source, coalesce(p_terms, false), coalesce(p_privacy, false),
    coalesce(p_marketing, false), left(coalesce(p_policy_version, ''), 40),
    left(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 64),
    left(coalesce(v_headers ->> 'user-agent', ''), 400))
  returning id into v_id;

  return v_id;
end;
$$;

-- The demo form is filled in before anyone has an account, so anon may call it too
revoke execute on function public.record_consent(text, text, boolean, boolean, boolean, text) from public;
grant execute on function public.record_consent(text, text, boolean, boolean, boolean, text) to anon, authenticated, service_role;

-- Current marketing answer per email: the newest record wins
create or replace view public.marketing_consent
with (security_invoker = true) as
  select distinct on (lower(email))
    lower(email) as email, user_id, marketing_opt_in, source, policy_version, created_at as answered_at
  from public.consent_records
  order by lower(email), created_at desc;
