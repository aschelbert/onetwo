-- The records behind the Board Room's guided actions.
--
-- A guided action (a request for proposals, a maintenance repair, an
-- inspection, a fire alarm notice, an owner's records request, a budget
-- amendment, a utility spike, the benchmarking report, a payroll filing) is a
-- record plus a fixed list of steps. Each step is done when the record shows
-- it: the date a notice went out, the bids that came in. `kind` says which
-- action; everything entered while working it is in `data` (the shapes are in
-- src/lib/actions). The app assigns the id, so the action opened for a record
-- can name it at once.
--
-- The same table holds a few standing documents those actions read, one row
-- per building: the utility meters and bills ('utilities'), the year's
-- objectives ('objectives'), the insurance appraisal ('insurance-check') and
-- the bank reconciliations ('reconciliation', one row per account and month).
--
-- The board and the property manager read and write everything. Every member
-- reads the utilities and objectives documents, which are the building's own
-- figures; an owner also reads a record about their own unit (their records
-- request). Nothing else is visible to owners.

create table if not exists public.action_records (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  kind         text not null,
  title        text not null default '',
  unit_number  text not null default '',
  opened_on    date not null default current_date,
  due_on       date,
  closed_on    date,
  data         jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_action_records_kind on public.action_records(tenant_id, kind, opened_on desc);

alter table public.action_records enable row level security;

drop trigger if exists trg_action_records_updated on public.action_records;
create trigger trg_action_records_updated before update on public.action_records
  for each row execute function update_updated_at();

drop policy if exists "Team manages action records" on public.action_records;
create policy "Team manages action records" on public.action_records for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Members read the building's own figures" on public.action_records;
create policy "Members read the building's own figures" on public.action_records for select to authenticated
  using (
    kind in ('utilities', 'objectives')
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id)
  );

drop policy if exists "Owners read records about their unit" on public.action_records;
create policy "Owners read records about their unit" on public.action_records for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id
        and nullif(trim(tu.unit), '') is not null
        and lower(trim(tu.unit)) = lower(trim(action_records.unit_number))
    )
  );

-- Pin the new table to one building per request, like every other tenant table.
select public.apply_tenant_scope();
