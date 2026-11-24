-- The association's register: violations, architectural requests, resale
-- certificate requests and liens (Board Room › Register).
--
-- These existed only as guidance text on an action. Each is now a record
-- with its own dates, so the clocks can be watched: the cure date and the
-- hearing on a violation, the board's deadline on an architectural request,
-- the 10 days for a resale certificate (DC Code § 42-1904.11), and a lien
-- that is recorded and later released (§ 42-1903.13).
--
-- One table, one row per matter. `kind` says which; the fields particular
-- to a kind are in `data` (the shapes are in src/lib/register.ts). The app
-- assigns the id, so the action opened for a matter can name it at once.
--
-- The board and the property manager read and write everything. An owner
-- reads the entries about their own unit (tenant_users.unit), never
-- another unit's.

create table if not exists public.association_register (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  kind         text not null check (kind in ('violation', 'architectural', 'resale', 'lien')),
  unit_number  text not null default '',
  owner        text not null default '',
  title        text not null default '',
  opened_on    date not null default current_date,
  closed_on    date,
  data         jsonb not null default '{}'::jsonb,
  notes        text not null default '',
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_association_register_kind on public.association_register(tenant_id, kind, opened_on desc);
create index if not exists idx_association_register_unit on public.association_register(tenant_id, unit_number);

alter table public.association_register enable row level security;

drop trigger if exists trg_association_register_updated on public.association_register;
create trigger trg_association_register_updated before update on public.association_register
  for each row execute function update_updated_at();

drop policy if exists "Team manages the register" on public.association_register;
create policy "Team manages the register" on public.association_register for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = association_register.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = association_register.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Owners read their unit's register entries" on public.association_register;
create policy "Owners read their unit's register entries" on public.association_register for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = association_register.tenant_id
        and nullif(trim(tu.unit), '') is not null
        and lower(trim(tu.unit)) = lower(trim(association_register.unit_number))
    )
  );

-- Pin the new table to one building per request, like every other tenant table.
select public.apply_tenant_scope();
