-- ============================================================================
-- Addresses our email provider has stopped sending to
-- ============================================================================
-- Brevo adds its own Unsubscribe to every email, including notices, invoices
-- and password resets. One click puts the address on Brevo's blocked list,
-- and from then on Brevo accepts our emails for that address and quietly
-- drops them. The same list holds addresses that bounced for good or marked
-- us as spam.
--
-- email_suppressions is our copy of that list, kept current by the
-- brevo-webhook function, so the app can tell the truth: an email to one of
-- these addresses is not sent and not counted as sent, the board sees who is
-- not being reached, and the person can turn email back on from their
-- account.
--
-- Rows are written and removed by the service role only (brevo-webhook and
-- email-suppression). People read them through the two functions below:
-- their own address, or the members of a building they run.
-- ============================================================================

create table if not exists public.email_suppressions (
  email          text primary key check (email = lower(email)),
  -- unsubscribed: they pressed Unsubscribe; hard_bounce / invalid: the address
  -- does not accept mail; spam: they reported us; blocked: Brevo refused a
  -- send and we did not see why.
  reason         text not null check (reason in ('unsubscribed', 'hard_bounce', 'invalid', 'spam', 'blocked')),
  suppressed_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;

drop trigger if exists trg_email_suppressions_updated on public.email_suppressions;
create trigger trg_email_suppressions_updated before update on public.email_suppressions
  for each row execute function update_updated_at();

-- The signed-in person's own address: null when email reaches them.
create or replace function public.my_email_suppression()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('reason', s.reason, 'since', s.suppressed_at)
  from auth.users u
  join public.email_suppressions s on s.email = lower(u.email)
  where u.id = auth.uid();
$$;
revoke execute on function public.my_email_suppression() from public, anon;
grant execute on function public.my_email_suppression() to authenticated;

-- The members of one building who are not being reached, for the people who
-- run it (board, property manager, account owner). Anyone else gets nothing.
create or replace function public.building_email_suppressions(p_tenant_id uuid)
returns table (email text, reason text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.email, s.reason, s.suppressed_at
  from public.tenant_users tu
  left join auth.users u on u.id = tu.user_id
  join public.email_suppressions s on s.email = lower(coalesce(u.email, tu.email))
  where tu.tenant_id = p_tenant_id
    and exists (
      select 1 from public.tenant_users me
      where me.user_id = auth.uid() and me.tenant_id = p_tenant_id and me.status = 'active'
        and (me.role in ('board_member', 'property_manager') or me.is_account_owner)
    );
$$;
revoke execute on function public.building_email_suppressions(uuid) from public, anon;
grant execute on function public.building_email_suppressions(uuid) to authenticated;
