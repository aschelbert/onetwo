-- ============================================================================
-- ONE two HOA - Work orders and spending requests run on a schedule
-- ============================================================================
-- Two more runbooks start themselves, in the app (src/ux2/boardroom/
-- workOrders.ts, spendingRequest.ts) and here every morning. The vendor
-- bids runbook (vendorBids.ts) has no twin: a case's bid collection lives
-- only in the app.
--
--  run_work_order(tenant, today): a work order with no case driving it
--    (case_id empty, or pointing at nothing) that is not yet paid gets one
--    case (source 'runbook', source_id 'work-order:<local id>'), and the
--    work order's case_id points back at it. The job ticks the approval,
--    invoice and payment steps from the work order's status.
--
--  run_spending_request(tenant, today): a request waiting for the board
--    (status pending or more_info) with no case driving it gets one case
--    (source_id 'spending-request:<id>'), and the request's case_id points
--    back at it. The job ticks the check at once, the vote once decided, and
--    the release once a work order is attached or the request is denied.
--
-- spending_approvals gains funding_source and case_id: the app has written
-- both for some time, but the table never had them, so those writes failed.
-- The step texts match the app's modules; change both together.
-- ============================================================================

alter table spending_approvals
  add column if not exists funding_source text not null default '',
  add column if not exists case_id text not null default '';

-- ── Work order ──────────────────────────────────────────────────────────────
create or replace function run_work_order(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_managed boolean;
  w record;
  c record;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
  v_rank int;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'work-order' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  select coalesce(nullif(company, ''), '') <> '' into v_managed from management_info where tenant_id = p_tenant limit 1;
  v_managed := coalesce(v_managed, false);

  -- 1. A case for every unpaid work order no case drives.
  for w in select local_id, title, vendor, description, amount, status, case_id, created_date from work_orders
            where tenant_id = p_tenant and status <> 'paid' order by created_date loop
    if coalesce(w.case_id, '') <> '' and exists (select 1 from cases x where x.tenant_id = p_tenant and x.id::text = w.case_id and x.sit_id <> 'runbook-work-order') then continue; end if;
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'runbook' and x.source_id = 'work-order:' || w.local_id) then continue; end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, source, source_id)
    values (p_tenant, 'work-order-' || w.local_id, 'maintenance', 'runbook-work-order', 'Work order · ' || w.title, '', coalesce(w.vendor, ''), 'pre', 'open', 'medium', p_today,
            format('Opened by the Work order runbook on %s: %s%s, %s, raised %s%s. The work order under Funds › Expenses is the record; each step here ticks as it moves.',
                   p_today::text, w.title, case when coalesce(w.vendor, '') <> '' then ' with ' || w.vendor else '' end, fin_money(coalesce(w.amount, 0)), w.created_date::text,
                   case when coalesce(w.description, '') <> '' then '. ' || w.description else '' end),
            case when v_managed then 'Property Manager' else 'Treasurer' end, 'runbook', 'work-order:' || w.local_id)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Approve the work order: %s, %s, %s', w.title, coalesce(nullif(w.vendor, ''), 'vendor to be named'), fin_money(coalesce(w.amount, 0))),
       'Funds › Expenses › Work orders. Over the bylaws limit it needs a spending request first. This step ticks itself when the work order is approved.', 0),
      (p_tenant, v_case_id, 's1', 'The vendor does the work; sign it off and note any deficiencies', null, 1),
      (p_tenant, v_case_id, 's2', 'Enter the invoice',
       'Funds › Expenses › Work orders › Invoice received posts it to accounts payable. This step ticks itself when the invoice is entered.', 2),
      (p_tenant, v_case_id, 's3', 'Pay it', 'Funds › Expenses › Pay. This step ticks itself when the work order is paid.', 3);
    update work_orders set case_id = v_case_id::text where tenant_id = p_tenant and local_id = w.local_id;
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open work order case: approved, invoiced, paid.
  for c in select x.id, wo.status from cases x join work_orders wo on wo.tenant_id = x.tenant_id and 'work-order:' || wo.local_id = x.source_id
            where x.tenant_id = p_tenant and x.status <> 'closed' and x.source = 'runbook' and x.source_id like 'work-order:%' loop
    v_rank := case c.status when 'approved' then 1 when 'invoiced' then 2 when 'paid' then 3 else 0 end;
    if v_rank >= 1 then update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done; if found then v_ticked := v_ticked + 1; end if; end if;
    if v_rank >= 2 then update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's2' and not done; if found then v_ticked := v_ticked + 1; end if; end if;
    if v_rank >= 3 then update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done; if found then v_ticked := v_ticked + 1; end if; end if;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Spending request ────────────────────────────────────────────────────────
create or replace function run_spending_request(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  a record;
  c record;
  v_fund text;
  v_over boolean;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'spending-request' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  -- 1. A case for every request waiting for the board that no case drives.
  for a in select id, title, description, amount, requested_by, status, priority, vendor_name, threshold, funding_source, case_id from spending_approvals
            where tenant_id = p_tenant and status in ('pending', 'more_info') order by created_at loop
    if coalesce(a.case_id, '') <> '' and exists (select 1 from cases x where x.tenant_id = p_tenant and x.id::text = a.case_id and x.sit_id <> 'runbook-spending-request') then continue; end if;
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'runbook' and x.source_id = 'spending-request:' || a.id::text) then continue; end if;
    v_fund := case a.funding_source when 'operating' then 'the operating budget' when 'reserves' then 'the reserve fund' when 'special_assessment' then 'a special assessment'
                                     when 'insurance' then 'the insurance claim' when 'loan' then 'a loan' else 'a funding source still to be named' end;
    v_over := coalesce(a.threshold, 0) > 0 and a.amount > a.threshold;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, source, source_id)
    values (p_tenant, 'spending-request-' || a.id::text, 'strategic', 'runbook-spending-request', format('Spending request · %s · %s', a.title, fin_money(a.amount)), '', coalesce(a.requested_by, ''), 'pre', 'open',
            case when a.priority = 'urgent' then 'urgent' when v_over then 'high' else 'medium' end, p_today,
            concat_ws(E'\n\n',
              format('Opened by the Spending request runbook on %s: %s asked for %s for %s%s, from %s%s.',
                     p_today::text, coalesce(nullif(a.requested_by, ''), 'the board'), fin_money(a.amount), a.title,
                     case when coalesce(a.vendor_name, '') <> '' then ' (' || a.vendor_name || ')' else '' end, v_fund,
                     case when coalesce(a.threshold, 0) > 0 then '; the bylaws limit is ' || fin_money(a.threshold) || case when v_over then ', so this is over it' else '' end else '' end),
              nullif(a.description, '')),
            'Treasurer', 'runbook', 'spending-request:' || a.id::text)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Check %s against %s%s', fin_money(a.amount), v_fund, case when coalesce(a.threshold, 0) > 0 then ' and the ' || fin_money(a.threshold) || ' bylaws limit' else '' end),
       format('%s This step ticks itself: the request names its funding source and the limit.', case when v_over then 'Over the limit: the board must vote, and owners hear of it.' else 'Within the limit the board can approve without an owner vote.' end), 0),
      (p_tenant, v_case_id, 's1', 'Board votes: approve or deny', 'Funds › Expenses › Approvals carries the vote. This step ticks itself when the request is approved or denied.', 1),
      (p_tenant, v_case_id, 's2', 'Record the decision in the minutes' || case when v_over then ' and tell owners' else '' end, null, 2),
      (p_tenant, v_case_id, 's3', 'Release the money: a work order or the payment', 'This step ticks itself when a work order is attached to an approved request, or the request is denied.', 3);
    update spending_approvals set case_id = v_case_id::text where id = a.id;
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open spending case: the check, the vote, the release.
  for c in select x.id, sa.status, sa.work_order_id from cases x join spending_approvals sa on sa.tenant_id = x.tenant_id and 'spending-request:' || sa.id::text = x.source_id
            where x.tenant_id = p_tenant and x.status <> 'closed' and x.source = 'runbook' and x.source_id like 'spending-request:%' loop
    update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done; if found then v_ticked := v_ticked + 1; end if;
    if c.status in ('approved', 'denied') then update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's1' and not done; if found then v_ticked := v_ticked + 1; end if; end if;
    if c.status = 'denied' or (c.status = 'approved' and coalesce(c.work_order_id, '') <> '') then update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done; if found then v_ticked := v_ticked + 1; end if; end if;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_work_order_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_work_order(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_spending_request_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_spending_request(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_runbooks_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'monthClose', run_month_close_all(p_today),
    'collections', run_collections_all(p_today),
    'insuranceRenewal', run_insurance_renewal_all(p_today),
    'yearEndClose', run_year_end_close_all(p_today),
    'annualBudget', run_annual_budget_all(p_today),
    'filings', run_filings_all(p_today),
    'annualMeeting', run_annual_meeting_all(p_today),
    'boardMeeting', run_board_meeting_all(p_today),
    'inspections', run_inspections_all(p_today),
    'form1099', run_form_1099_all(p_today),
    'ownerDisclosure', run_owner_disclosure_all(p_today),
    'residentRequest', run_resident_request_all(p_today),
    'move', run_move_all(p_today),
    'workOrder', run_work_order_all(p_today),
    'spendingRequest', run_spending_request_all(p_today));
end $$;

revoke all on function run_work_order(uuid, date) from public;
revoke all on function run_work_order_all(date) from public;
revoke all on function run_spending_request(uuid, date) from public;
revoke all on function run_spending_request_all(date) from public;
grant execute on function run_work_order(uuid, date) to service_role;
grant execute on function run_work_order_all(date) to service_role;
grant execute on function run_spending_request(uuid, date) to service_role;
grant execute on function run_spending_request_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change.
