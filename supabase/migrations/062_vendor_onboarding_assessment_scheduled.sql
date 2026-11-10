-- ============================================================================
-- ONE two HOA - Vendor onboarding and special assessments run on a schedule
-- ============================================================================
-- Two more runbooks start themselves, in the app (src/ux2/boardroom/
-- vendorOnboarding.ts, specialAssessment.ts) and here every morning:
--
--  run_vendor_onboarding(tenant, today): a vendor named on a work order past
--    draft who is not on Building › Contracts (vendors), or is there with no
--    W-9, gets one case by name (source 'runbook', source_id
--    'vendor-onboarding:<name, lower case>'). The job ticks the record step
--    once a vendor row exists, the W-9 step once w9_on_file, and the contract
--    step once a vendor_contracts row names the vendor.
--
--  run_special_assessment(tenant, today): an approved spending request
--    funded by a special assessment gets one case (source_id
--    'special-assessment:<request id>'), unless a special assessment case
--    opened by hand is already open. The job ticks the shares at once, the
--    notice once an announcement or communication about the assessment goes
--    out after the case opened, the levy once every unit has a special
--    assessment invoice dated on or after the case, and the collection once
--    those are all paid.
--
-- The step texts match the app's modules; change both together.
-- run_runbooks_all() now runs all seventeen that have a twin.
-- ============================================================================

-- ── Vendor onboarding ───────────────────────────────────────────────────────
create or replace function run_vendor_onboarding(p_tenant uuid, p_today date default current_date)
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
  for v in select min(trim(w.vendor)) as name, lower(trim(w.vendor)) as key, sum(w.amount) as paid
             from work_orders w where w.tenant_id = p_tenant and w.status <> 'draft' and coalesce(trim(w.vendor), '') <> ''
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

-- ── Special assessment ──────────────────────────────────────────────────────
create or replace function run_special_assessment(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  a record;
  c record;
  v_units int;
  v_per numeric;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
  v_every boolean;
  v_paid boolean;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'special-assessment' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  select count(*) into v_units from units where tenant_id = p_tenant;

  -- 1. A case for every approved request funded by a special assessment.
  for a in select id, title, amount, requested_by, decided_at from spending_approvals
            where tenant_id = p_tenant and status = 'approved' and funding_source = 'special_assessment' order by created_at loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant
                 and ((x.source = 'runbook' and x.source_id = 'special-assessment:' || a.id::text)
                   or (x.status <> 'closed' and x.sit_id = 'special-assessments' and coalesce(x.source, '') <> 'runbook'))) then continue; end if;
    v_per := case when v_units > 0 then round(a.amount / v_units) else 0 end;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, source, source_id)
    values (p_tenant, 'special-assessment-' || a.id::text, 'financial', 'runbook-special-assessment', format('Special assessment · %s · %s', a.title, fin_money(a.amount)), '', coalesce(a.requested_by, ''), 'pre', 'open', 'high', p_today,
            format('Opened by the Special assessment runbook on %s: the board approved %s for %s%s, funded by a special assessment across %s unit%s. Shares by percentage interest, a resolution, the owner vote where the bylaws want one, 30 days'' notice, then the invoices.',
                   p_today::text, fin_money(a.amount), a.title, case when coalesce(a.decided_at, '') <> '' then ' on ' || left(a.decided_at, 10) else '' end, v_units, case when v_units = 1 then '' else 's' end),
            'Treasurer', 'runbook', 'special-assessment:' || a.id::text)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Compute each unit''s share of %s by percentage interest', fin_money(a.amount)),
       format('%s unit%s, about %s each at equal shares; the Declaration''s percentage interests set the real split (Funds › Income › Units has each unit''s). This step ticks itself: the figures are in the ledger.', v_units, case when v_units = 1 then '' else 's' end, fin_money(v_per)), 0),
      (p_tenant, v_case_id, 's1', 'Board resolution: adopt the assessment, the due date, the payment plan', null, 1),
      (p_tenant, v_case_id, 's2', 'Owner vote, if the bylaws require one at this amount', null, 2),
      (p_tenant, v_case_id, 's3', 'Notice to every owner at least 30 days before the due date',
       'Post it as a financial notice under Community and mail it where the bylaws require. This step ticks itself when a notice about the assessment goes out after this case opened.', 3),
      (p_tenant, v_case_id, 's4', 'Levy it: a special assessment invoice on every unit',
       'Funds › Income › Units › Charge, type Special assessment, one per unit at its share, into the reserve fund. This step ticks itself when every unit has one.', 4),
      (p_tenant, v_case_id, 's5', 'Collect it and keep the money in its fund',
       'Payments apply through the unit ledgers; Collections runs on any unit 30 days late. This step ticks itself when every invoice is paid.', 5);
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open assessment case: the shares, the notice, the levy, the collection.
  for c in select x.id, x.created_date from cases x where x.tenant_id = p_tenant and x.status <> 'closed' and x.source = 'runbook' and x.source_id like 'special-assessment:%' loop
    update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done; if found then v_ticked := v_ticked + 1; end if;
    if exists (select 1 from announcements an where an.tenant_id = p_tenant and an.title ~* 'assessment' and an.posted_date >= c.created_date)
       or exists (select 1 from communications cm where cm.tenant_id = p_tenant and cm.subject ~* 'assessment' and cm.status = 'sent' and cm.date >= c.created_date) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done; if found then v_ticked := v_ticked + 1; end if;
    end if;
    select v_units > 0 and not exists (
             select 1 from units u where u.tenant_id = p_tenant and (coalesce(u.monthly_fee, 0) > 0 or coalesce(u.voting_pct, 0) > 0)
                and not exists (select 1 from unit_invoices i where i.tenant_id = p_tenant and i.unit_number = u.number and i.type = 'special_assessment' and i.status <> 'void' and i.created_date >= c.created_date))
      into v_every;
    if coalesce(v_every, false) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's4' and not done; if found then v_ticked := v_ticked + 1; end if;
      select not exists (select 1 from unit_invoices i where i.tenant_id = p_tenant and i.type = 'special_assessment' and i.status not in ('void', 'paid') and i.created_date >= c.created_date) into v_paid;
      if coalesce(v_paid, false) then
        update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's5' and not done; if found then v_ticked := v_ticked + 1; end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_vendor_onboarding_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_vendor_onboarding(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_special_assessment_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_special_assessment(t.tenant_id, p_today);
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
    'spendingRequest', run_spending_request_all(p_today),
    'vendorOnboarding', run_vendor_onboarding_all(p_today),
    'specialAssessment', run_special_assessment_all(p_today));
end $$;

revoke all on function run_vendor_onboarding(uuid, date) from public;
revoke all on function run_vendor_onboarding_all(date) from public;
revoke all on function run_special_assessment(uuid, date) from public;
revoke all on function run_special_assessment_all(date) from public;
grant execute on function run_vendor_onboarding(uuid, date) to service_role;
grant execute on function run_vendor_onboarding_all(date) to service_role;
grant execute on function run_special_assessment(uuid, date) to service_role;
grant execute on function run_special_assessment_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change.
