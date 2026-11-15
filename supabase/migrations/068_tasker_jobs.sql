-- ============================================================================
-- ONE two HOA - Tasker jobs booked from actions (TaskRabbit)
-- ============================================================================
-- One row per Tasker job: the small jobs the board books through TaskRabbit
-- from a checklist item of an action (src/features/tasker). The job belongs
-- to its action and goes when the action is deleted. The work order it opens
-- once a Tasker accepts is kept in work_orders as usual; this row names it by
-- the app's work order id (work_orders.local_id, e.g. WO-006).
--
-- The whole job (Tasker, window, access, estimate, final bill, rating and its
-- activity) is kept in `data` as the app writes it; status, the action, the
-- checklist item and the work order are columns too, so a webhook from
-- TaskRabbit or a report can find a job without reading the JSON.
--
-- The board, the property manager and the account owner read and write the
-- building's jobs. Owners never see them: they hear about a booking on their
-- request, and the access details in a job are not theirs to read.
-- ============================================================================

create table if not exists public.tasker_jobs (
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  id                   text not null,                 -- the app's job id, e.g. TJ-M3K9Q2
  case_id              uuid not null references public.cases(id) on delete cascade,
  step_idx             int  not null default 0,
  check_id             text not null,
  status               text not null check (status in (
                         'requested', 'no-reply', 'scheduled', 'on-the-way', 'working', 'scope-request',
                         'done', 'problem', 'paid', 'tasker-cancelled', 'cancelled')),
  tasker_id            text not null,                 -- TaskRabbit's Tasker id
  work_order_local_id  text,                          -- work_orders.local_id once a Tasker accepts
  data                 jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid default auth.uid(),
  primary key (tenant_id, id)
);

create index if not exists idx_tasker_jobs_case on public.tasker_jobs(tenant_id, case_id);
-- Open jobs, for the webhook and the building's list of jobs in progress.
create index if not exists idx_tasker_jobs_open on public.tasker_jobs(tenant_id, status)
  where status not in ('paid', 'cancelled');

alter table public.tasker_jobs enable row level security;

drop policy if exists "Board and manager manage tasker jobs" on public.tasker_jobs;
create policy "Board and manager manage tasker jobs" on public.tasker_jobs for all to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = tasker_jobs.tenant_id
                 and (tu.role in ('board_member', 'property_manager') or tu.is_account_owner)))
  with check (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = tasker_jobs.tenant_id
                 and (tu.role in ('board_member', 'property_manager') or tu.is_account_owner)));

drop policy if exists "Admins manage tasker jobs" on public.tasker_jobs;
create policy "Admins manage tasker jobs" on public.tasker_jobs for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
