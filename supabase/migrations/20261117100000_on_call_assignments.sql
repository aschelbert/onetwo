-- On Call advisor assignments.
--
-- A building that has the On Call add-on gets a named advisor: one of the
-- ONE two Admin Console users. This table holds one row per building with
-- the add-on. The row is created as a request the moment the add-on is
-- switched on (at signup or later) and filled in when an advisor is assigned
-- from the Admin Console. The building's members can read their own row, so
-- the Directory can show the advisor.

create table if not exists public.on_call_assignments (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  status           text not null default 'requested' check (status in ('requested', 'assigned')),
  requested_at     timestamptz not null default now(),
  advisor_name     text,
  advisor_email    text,
  -- The advisor's user id in the Admin Console project (platform_users.id).
  advisor_console_user_id uuid,
  assigned_at      timestamptz,
  assigned_by      text,
  -- The Admin Console support thread opened for this request.
  support_thread_id uuid,
  updated_at       timestamptz not null default now(),
  check (status <> 'assigned' or (advisor_name is not null and advisor_email is not null))
);

alter table public.on_call_assignments enable row level security;

-- Members read their own building's row. Writes come from the Admin Console
-- with the service role, or from a platform admin.
create policy "members_read_own_on_call_assignment" on public.on_call_assignments
  for select using (tenant_id in (select public.get_my_tenant_ids()));

create policy "admins_manage_on_call_assignments" on public.on_call_assignments
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

revoke all on public.on_call_assignments from anon;
grant select on public.on_call_assignments to authenticated;

-- Keep the table in step with the add-on, whichever path changes it
-- (provisioning, the Chargebee webhook, or the Subscription page).
create or replace function public.sync_on_call_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.addon_on_call is true and (tg_op = 'INSERT' or old.addon_on_call is distinct from true) then
    insert into public.on_call_assignments (tenant_id) values (new.tenant_id)
    on conflict (tenant_id) do nothing;
  elsif new.addon_on_call is not true and tg_op = 'UPDATE' and old.addon_on_call is true then
    delete from public.on_call_assignments where tenant_id = new.tenant_id;
  end if;
  return new;
exception when others then
  -- Never let this bookkeeping block a subscription write.
  raise warning 'sync_on_call_assignment failed for tenant %: %', new.tenant_id, sqlerrm;
  return new;
end;
$$;

revoke execute on function public.sync_on_call_assignment() from public, anon, authenticated;

drop trigger if exists trg_sync_on_call_assignment on public.subscriptions;
create trigger trg_sync_on_call_assignment
  after insert or update of addon_on_call on public.subscriptions
  for each row execute function public.sync_on_call_assignment();

-- Buildings that already have the add-on.
insert into public.on_call_assignments (tenant_id)
select s.tenant_id from public.subscriptions s where s.addon_on_call is true
on conflict (tenant_id) do nothing;
