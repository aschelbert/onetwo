-- ============================================================================
-- ONE two HOA - Vendor onboarding leaves Tasker jobs out
-- ============================================================================
-- A Tasker job booked from an action (068_tasker_jobs) opens a work order
-- named for the Tasker ("TaskRabbit · Andre R."). The vendor onboarding
-- runbook opened a case for every such name, asking for a W-9, a certificate
-- of insurance and a contract from each Tasker. TaskRabbit vets and pays its
-- Taskers, so there is nothing to collect: work orders that belong to a Tasker
-- job (tasker_jobs.work_order_local_id) are now left out. The app's own copy
-- of the runbook (src/ux2/boardroom/vendorOnboarding.ts) does the same.
--
-- The function is otherwise unchanged from 062 as it runs today. Execute stays
-- with the server only, as 20261114130000_lock_down_runbook_functions set it.
-- ============================================================================

create or replace function public.run_vendor_onboarding(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_managed boolean;
  v record;
  c record;
  v_has_record boolean;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'vendor-onboarding' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  select coalesce(nullif(company, ''), '') <> '' into v_managed from management_info where tenant_id = p_tenant limit 1;
  v_managed := coalesce(v_managed, false);

  -- 1. A case for every vendor money has moved to who has no record, or no W-9.
  --    Work orders for Tasker jobs don't count: TaskRabbit vets and pays its Taskers.
  for v in select min(trim(w.vendor)) as name, lower(trim(w.vendor)) as key, sum(w.amount) as paid
             from work_orders w where w.tenant_id = p_tenant and w.status <> 'draft' and coalesce(trim(w.vendor), '') <> ''
              and not exists (select 1 from tasker_jobs tj where tj.tenant_id = p_tenant and tj.work_order_local_id = w.local_id)
            group by lower(trim(w.vendor)) order by 2 loop
    select exists (select 1 from vendors x where x.tenant_id = p_tenant and lower(trim(x.name)) = v.key) into v_has_record;
    if v_has_record and exists (select 1 from vendors x where x.tenant_id = p_tenant and lower(trim(x.name)) = v.key and coalesce(x.w9_on_file, false)) then continue; end if;
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'runbook' and x.source_id = 'vendor-onboarding:' || v.key) then continue; end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, source, source_id)
    values (p_tenant, 'vendor-onboarding-' || regexp_replace(v.key, '[^a-z0-9]+', '-', 'g'), 'admin', 'runbook-vendor-onboarding', 'Vendor onboarding · ' || v.name, '', v.name, 'pre', 'open', 'medium', p_today,
            format('Opened by the Vendor onboarding runbook on %s: %s is on work orders for %s and %s. Record, W-9, insurance and licenses, contract.',
                   p_today::text, v.name, fin_money(coalesce(v.paid, 0)), case when v_has_record then 'has no W-9 on file' else 'is not on Building › Contracts yet' end),
            case when v_managed then 'Property Manager' else 'Treasurer' end, 'runbook', 'vendor-onboarding:' || v.key)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Add %s to Building › Contracts: service, contact, terms', v.name), 'This step ticks itself when the vendor has a record there.', 0),
      (p_tenant, v_case_id, 's1', format('Collect %s''s W-9', v.name), 'Needed for the 1099 by January 31 once payments reach $600. Mark received on Building › Contracts; this step ticks itself then.', 1),
      (p_tenant, v_case_id, 's2', 'Certificate of insurance naming the association, and licenses checked', null, 2),
      (p_tenant, v_case_id, 's3', format('Put %s''s contract on file under Building › Contracts, with its end date', v.name), 'The contract renewals then track it. This step ticks itself when a contract for the vendor is on file.', 3);
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open onboarding case: the record, the W-9, the contract.
  for c in select x.id, substr(x.source_id, length('vendor-onboarding:') + 1) as key from cases x
            where x.tenant_id = p_tenant and x.status <> 'closed' and x.source = 'runbook' and x.source_id like 'vendor-onboarding:%' loop
    if exists (select 1 from vendors x where x.tenant_id = p_tenant and lower(trim(x.name)) = c.key) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done; if found then v_ticked := v_ticked + 1; end if;
    end if;
    if exists (select 1 from vendors x where x.tenant_id = p_tenant and lower(trim(x.name)) = c.key and coalesce(x.w9_on_file, false)) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's1' and not done; if found then v_ticked := v_ticked + 1; end if;
    end if;
    if exists (select 1 from vendor_contracts vc where vc.tenant_id = p_tenant
                 and (lower(trim(vc.vendor_name)) = c.key or vc.vendor_id in (select x.id::text from vendors x where x.tenant_id = p_tenant and lower(trim(x.name)) = c.key))) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done; if found then v_ticked := v_ticked + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

revoke execute on function public.run_vendor_onboarding(uuid, date) from public, anon, authenticated;
