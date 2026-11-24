-- Capital improvements (Building › Projects).
--
-- A project is one job that replaces or betters part of the building, worked
-- step by step in its Board Room action: the need, the options compared, how
-- it is paid for, whether it needs a permit, the scope and bids, the award,
-- the work, the sign-off and the close-out that resets the reserve component.
--
-- One row per project. The whole record is in `data` (its shape is
-- CapitalProject in src/lib/capitalProject.ts); the title and dates are
-- columns too, for lists. The app assigns the id, so the action opened for a
-- project can name it at once.
--
-- Everyone in the building reads projects (what is being done to the
-- building, and what it costs, is the owners' business). The board and the
-- property manager add, change and remove them.

create table if not exists public.capital_projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  title       text not null default '',
  opened_on   date not null default current_date,
  closed_on   date,
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_capital_projects_recent on public.capital_projects(tenant_id, opened_on desc);

alter table public.capital_projects enable row level security;

drop trigger if exists trg_capital_projects_updated on public.capital_projects;
create trigger trg_capital_projects_updated before update on public.capital_projects
  for each row execute function update_updated_at();

drop policy if exists "Members read capital projects" on public.capital_projects;
create policy "Members read capital projects" on public.capital_projects for select to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = capital_projects.tenant_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Team manages capital projects" on public.capital_projects;
create policy "Team manages capital projects" on public.capital_projects for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = capital_projects.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = capital_projects.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Pin the new table to one building per request, like every other tenant table.
select public.apply_tenant_scope();
