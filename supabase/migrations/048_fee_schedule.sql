-- ============================================================================
-- 048: the fee schedule lives in the database
--
-- Until now the fee schedule (deposits, fines, certificate fees, interest,
-- special assessments) existed only in each browser's local storage: every
-- board member saw their own copy, one building's edits showed up on the next
-- building opened in the same browser, and the server never saw any of it.
-- One row per fee per building, with the app's own ids as the keys so the
-- store writes straight through. seed_fee_schedule gives a building the
-- defaults (rows it has are left alone); the backfill runs it for every
-- building with no rows; a trigger runs it for each building created from
-- now on; the app does the same on first load as a fallback.
--
-- The late fee is deliberately not a row: Billing rules (financial_settings)
-- are its only home.
-- ============================================================================

create table if not exists fee_schedule (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  id           text not null,
  name         text not null,
  category     text not null check (category in ('assessment', 'administrative', 'violation', 'move', 'amenity', 'legal')),
  amount       numeric(12,2) not null default 0,
  amount_type  text not null default 'flat' check (amount_type in ('flat', 'percentage')),
  frequency    text not null default 'per-occurrence' check (frequency in ('one-time', 'monthly', 'per-occurrence', 'daily', 'weekly')),
  description  text not null default '',
  authority    text not null default '',
  gl_account   text not null default '',
  enabled      boolean not null default true,
  is_default   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, id)
);

drop trigger if exists trg_fee_schedule_updated on fee_schedule;
create trigger trg_fee_schedule_updated before update on fee_schedule
  for each row execute function update_updated_at();

alter table fee_schedule enable row level security;

drop policy if exists "Members read fee schedule" on fee_schedule;
create policy "Members read fee schedule" on fee_schedule for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

drop policy if exists "Board manages fee schedule" on fee_schedule;
create policy "Board manages fee schedule" on fee_schedule for all
  using (tenant_id in (
    select tenant_id from tenant_users
    where user_id = auth.uid() and (role in ('board_member', 'property_manager') or is_account_owner)
  ))
  with check (tenant_id in (
    select tenant_id from tenant_users
    where user_id = auth.uid() and (role in ('board_member', 'property_manager') or is_account_owner)
  ));

drop policy if exists "Admins manage fee schedule" on fee_schedule;
create policy "Admins manage fee schedule" on fee_schedule for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- The defaults, in the order the schedule shows them.
create or replace function seed_fee_schedule(p_tenant_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into fee_schedule (tenant_id, id, name, category, amount, amount_type, frequency, description, authority, gl_account, enabled, is_default, sort_order)
  select p_tenant_id, d.id, d.name, d.category, d.amount, d.amount_type, d.frequency, d.description, d.authority, d.gl_account, true, true, d.sort_order
    from (values
    ('fee-move-in', 'Move-In Deposit', 'move', 250, 'flat', 'one-time', 'Refundable deposit required prior to move-in to cover potential damage to common areas.', 'House Rules Section 4', '4050', 0),
    ('fee-move-out', 'Move-Out Deposit', 'move', 250, 'flat', 'one-time', 'Refundable deposit required prior to move-out to cover potential damage to common areas.', 'House Rules Section 4', '4050', 1),
    ('fee-amenity', 'Amenity Rental Fee', 'amenity', 0, 'flat', 'per-occurrence', 'Fee for reserving common area amenities (party room, rooftop, etc.). Amount varies by amenity.', 'House Rules Section 6', '4060', 2),
    ('fee-violation-1st', 'Violation Fine - 1st Offense', 'violation', 50, 'flat', 'per-occurrence', 'Fine for first documented violation of association rules or covenants.', 'DC Code 29-910.01', '4070', 3),
    ('fee-violation-2nd', 'Violation Fine - 2nd Offense', 'violation', 100, 'flat', 'per-occurrence', 'Fine for second documented violation of the same rule within 12 months.', 'DC Code 29-910.01', '4070', 4),
    ('fee-violation-3rd', 'Violation Fine - 3rd+ Offense', 'violation', 200, 'flat', 'per-occurrence', 'Fine for third or subsequent violations of the same rule within 12 months.', 'DC Code 29-910.01', '4070', 5),
    ('fee-violation-recurring', 'Recurring Violation Fine', 'violation', 50, 'flat', 'daily', 'Ongoing fine for unresolved violations after hearing, assessed daily or weekly as determined by the board.', 'DC Code 29-910.01', '4070', 6),
    ('fee-resale-cert', 'Resale/Estoppel Certificate Fee', 'administrative', 100, 'flat', 'per-occurrence', 'Processing fee for issuing a resale certificate or estoppel letter for unit sale or refinance.', 'DC Condominium Act', '4050', 7),
    ('fee-arch-review', 'Architectural Review Deposit', 'administrative', 500, 'flat', 'per-occurrence', 'Refundable deposit for architectural modification requests, applied toward review and inspection costs.', 'Bylaws Section 9', '4050', 8),
    ('fee-lien-recording', 'Lien Recording Fee', 'legal', 35, 'flat', 'per-occurrence', 'County recorder fee for filing a lien against a delinquent unit, passed through to the unit owner.', 'DC Code 42-1903.13', '4050', 9),
    ('fee-lien-release', 'Lien Release Recording Fee', 'legal', 35, 'flat', 'per-occurrence', 'County recorder fee for releasing a previously filed lien after balance is paid.', 'DC Code 42-1903.13', '4050', 10),
    ('fee-nsf', 'Returned Check / NSF Fee', 'assessment', 35, 'flat', 'per-occurrence', 'Fee for payments returned due to insufficient funds or closed account.', 'Bylaws Section 7', '4030', 11),
    ('fee-interest', 'Interest on Unpaid Balance', 'assessment', 1.5, 'percentage', 'monthly', 'Monthly interest charged on unpaid assessment balances after the grace period.', 'DC Code 42-1903.13(a)', '4040', 12),
    ('fee-special-assessment', 'Special Assessment', 'assessment', 0, 'flat', 'one-time', 'One-time assessment levied by the board for capital improvements or emergency expenses. Amount set per resolution.', 'Bylaws Section 5', '4020', 13)
  ) as d(id, name, category, amount, amount_type, frequency, description, authority, gl_account, sort_order)
  on conflict (tenant_id, id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function seed_fee_schedule(uuid) from public;
grant execute on function seed_fee_schedule(uuid) to service_role;

-- Each new building starts with the schedule.
create or replace function seed_fee_schedule_for_new_tenant()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_fee_schedule(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_fee_schedule on tenants;
create trigger trg_seed_fee_schedule
  after insert on tenants
  for each row execute function seed_fee_schedule_for_new_tenant();

-- Buildings that exist with no schedule get the defaults now.
do $$
declare
  t record;
begin
  for t in
    select id from tenants tn
     where not exists (select 1 from fee_schedule f where f.tenant_id = tn.id)
  loop
    perform seed_fee_schedule(t.id);
  end loop;
end;
$$;
