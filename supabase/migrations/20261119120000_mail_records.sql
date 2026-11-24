-- ============================================================================
-- Printed mail: the building's letter history, tracking and balance
-- ============================================================================
-- Until now a sent letter was only remembered by the browser that sent it.
-- mail_records is the building's record: one row per letter pushed into its
-- mail vendor account (DocuPost or LetterStream), written by the send-mail
-- function as the letter goes out, so every board member sees the same
-- history on any device.
--
-- The whole letter record (recipient, sender, estimate, status history) is
-- kept in `data` as the app reads it; the status, the vendor, the vendor's
-- job id and the USPS tracking number are columns too.
--
-- Tracking: LetterStream answers a status call, and check-mail-status writes
-- what it says here. DocuPost has no status API and no webhooks, so for its
-- letters the board records the USPS tracking number and the outcome from the
-- letter's page in DocuPost; that is the update policy below.
--
-- Only send-mail (service role) adds rows, and nothing deletes them: a letter
-- that was mailed stays on the record. The board, the property manager and
-- the account owner read the building's letters and may update tracking.
-- Owners and residents never see them.
-- ============================================================================

create table if not exists public.mail_records (
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  id               text not null,                 -- the app's record id, e.g. mr_M3K9Q2
  case_id          text,                          -- the action or meeting the letter belongs to
  provider         text not null check (provider in ('docupost', 'letterstream')),
  delivery_method  text not null,
  status           text not null,
  job_id           text,                          -- the vendor's id for the letter, when it gives one
  tracking_number  text,                          -- USPS tracking number, once known
  data             jsonb not null default '{}'::jsonb,
  sent_by          uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, id)
);

create index if not exists idx_mail_records_recent on public.mail_records(tenant_id, created_at desc);
create index if not exists idx_mail_records_case on public.mail_records(tenant_id, case_id);

alter table public.mail_records enable row level security;

drop trigger if exists trg_mail_records_updated on public.mail_records;
create trigger trg_mail_records_updated before update on public.mail_records
  for each row execute function update_updated_at();

drop policy if exists "Board and manager read mail records" on public.mail_records;
create policy "Board and manager read mail records" on public.mail_records for select to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = mail_records.tenant_id
                 and (tu.role in ('board_member', 'property_manager') or tu.is_account_owner)));

drop policy if exists "Board and manager update mail tracking" on public.mail_records;
create policy "Board and manager update mail tracking" on public.mail_records for update to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = mail_records.tenant_id
                 and (tu.role in ('board_member', 'property_manager') or tu.is_account_owner)))
  with check (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = mail_records.tenant_id
                 and (tu.role in ('board_member', 'property_manager') or tu.is_account_owner)));

drop policy if exists "Admins read mail records" on public.mail_records;
create policy "Admins read mail records" on public.mail_records for select to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

-- Rows are added by the service role only, and never deleted from the app.
revoke insert, delete, truncate on public.mail_records from anon, authenticated;
revoke all on public.mail_records from anon;

-- ── The vendor balance ──────────────────────────────────────────────────────
-- Neither vendor's API reports the account balance. Two things stand in:
--   funds_low_at         when the vendor last refused a letter for lack of
--                        funds; cleared by the next letter it accepts.
--   balance_cents        the balance a board member read off the vendor's
--   balance_recorded_at  Funds page and recorded here. The app subtracts the
--                        estimated postage of letters sent since, to show
--                        about what is left.
alter table public.mail_provider_accounts add column if not exists funds_low_at timestamptz;
alter table public.mail_provider_accounts add column if not exists balance_cents integer check (balance_cents is null or balance_cents >= 0);
alter table public.mail_provider_accounts add column if not exists balance_recorded_at timestamptz;

-- One building per request, like every other table with a tenant column.
select public.apply_tenant_scope();
