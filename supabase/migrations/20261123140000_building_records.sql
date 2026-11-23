-- Building records: the licences, certificates, tests and notices a building
-- has to hold, renew or post (Building › Obligations › Licences and
-- certificates): certificate of occupancy, business licence, elevator and
-- boiler certificates, the annual heating inspection, fire alarm, extinguisher
-- and smoke detector tests, the fire alarm notice to residents, and the energy
-- benchmarking report.
--
-- One row per entry; renewing adds a row, so the earlier ones stay as history.
-- `kind` is the app's catalogue id (src/lib/buildingRecords.ts) or 'custom'.
--
-- Everyone in the building reads them (a posted certificate is public to the
-- building); board members and property managers add, change and remove.

create table if not exists public.building_records (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null,
  name        text not null default '',
  number      text not null default '',
  done_on     date,
  expires_on  date,
  posted      boolean not null default false,
  notes       text not null default '',
  file        jsonb,                      -- { name, path } in the building-documents bucket
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_building_records_kind on public.building_records(tenant_id, kind);

alter table public.building_records enable row level security;

drop trigger if exists trg_building_records_updated on public.building_records;
create trigger trg_building_records_updated before update on public.building_records
  for each row execute function update_updated_at();

drop policy if exists "Members read building records" on public.building_records;
create policy "Members read building records" on public.building_records for select to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = building_records.tenant_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Team manages building records" on public.building_records;
create policy "Team manages building records" on public.building_records for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = building_records.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = building_records.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Pin the new table to one building per request, like every other tenant table.
select public.apply_tenant_scope();
