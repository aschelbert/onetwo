-- ============================================================================
-- ONE two HOA - Guided actions that open on a schedule
-- ============================================================================
-- Three of the record-backed actions start themselves. The app opens them
-- when a board member is signed in (src/ux2/boardroom/recordActions.ts,
-- runActionTriggers); these jobs open them every morning, so they are waiting
-- in the Board Room whether or not anyone was.
--
--  run_payroll_filing(tenant, today): in the 60 days after a quarter in
--    which employees were paid, one payroll filing for that quarter.
--  run_energy_benchmarking(tenant, today): from January 1 to April 1, for a
--    District building over 50,000 square feet, one report for last year,
--    until a report is on record.
--  run_records_request(tenant, today): an owner's open request in the
--    category "See the association records" gets one records request.
--
-- Each writes the action's record (action_records) and its Board Room case,
-- linked the way the app links them: source 'runbook', source_id
-- '<runbook id>:<record id>'. The app finds that case and does not open a
-- second. A utility spike has no job: it opens the moment a bill is entered.
--
-- The step texts, titles and blank records match src/lib/actions/*.ts; change
-- both together. run_runbooks_all() now runs these too.
-- ============================================================================

-- ── The case for a record, with the kind's steps ────────────────────────────
create or replace function open_action_case(
  p_tenant uuid, p_record uuid, p_runbook text, p_name text, p_cat text, p_role text,
  p_title text, p_unit text, p_due date, p_today date, p_steps text[], p_how text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_case uuid;
  i int;
begin
  insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                     assigned_role, due_date, source, source_id)
  values (p_tenant, p_runbook || '-' || p_record::text, p_cat, 'runbook-' || p_runbook, p_name || ' · ' || p_title, coalesce(p_unit, ''), '', 'pre', 'open', 'medium', p_today,
          format('Opened by the %s runbook on %s.', p_name, p_today::text), p_role, p_due, 'runbook', p_runbook || ':' || p_record::text)
  returning id into v_case;
  for i in 1 .. array_length(p_steps, 1) loop
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order)
    values (p_tenant, v_case, 's' || (i - 1)::text, p_steps[i], p_how[i] || '.', i - 1);
  end loop;
  return v_case;
end $$;

-- ── Payroll filing ──────────────────────────────────────────────────────────
create or replace function run_payroll_filing(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_start date;
  v_end date;
  v_period text;
  v_q int;
  v_next_month_end date;
  v_wages numeric;
  v_skip jsonb;
  v_returns jsonb;
  v_due date;
  v_title text;
  v_record uuid;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'payroll-filing' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  -- The last quarter that has ended.
  v_end := (date_trunc('quarter', p_today) - interval '1 day')::date;
  v_start := date_trunc('quarter', v_end)::date;
  if p_today - v_end > 60 then return jsonb_build_object('tenant', p_tenant, 'skipped', 'more than 60 days after the quarter'); end if;
  v_q := extract(quarter from v_end)::int;
  v_period := extract(year from v_end)::int::text || '-Q' || v_q::text;

  if exists (select 1 from action_records r where r.tenant_id = p_tenant and r.kind = 'payroll-filing' and r.data->>'period' = v_period) then
    return jsonb_build_object('tenant', p_tenant, 'skipped', 'already open');
  end if;

  select coalesce(sum(p.gross_pay), 0) into v_wages
    from payroll_pay_runs p join payroll_staff s on s.id = p.staff_id
   where p.tenant_id = p_tenant and p.status = 'paid' and s.type = 'employee'
     and p.period_end >= v_start::text and p.period_end <= v_end::text;
  if v_wages <= 0 then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no employee wages in the quarter'); end if;

  -- Which returns the building does not file, remembered from earlier quarters.
  select coalesce(r.data->'notApplicable', '[]'::jsonb) into v_skip
    from action_records r where r.tenant_id = p_tenant and r.kind = 'payroll-returns' limit 1;
  v_skip := coalesce(v_skip, '[]'::jsonb);
  v_next_month_end := (date_trunc('month', v_end + 1) + interval '1 month' - interval '1 day')::date;

  select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'to', x.sent_to, 'dueOn', x.due::text,
                                      'applies', not (v_skip ? x.id), 'filedOn', '', 'confirmation', '') order by x.ord)
    into v_returns
    from (values
      (1, 'dc-withholding', 'District income tax withheld', 'Office of Tax and Revenue', (v_end + 20)::date),
      (2, 'federal-941', 'Federal payroll tax return (Form 941)', 'IRS', v_next_month_end),
      (3, 'dc-unemployment', 'Unemployment wage report', 'Department of Employment Services', v_next_month_end),
      (4, 'dc-pfl', 'Paid family leave contribution', 'Department of Employment Services', v_next_month_end),
      (5, 'w2-1099', 'W-2s to employees and 1099s to contractors', 'Them, and the IRS', v_next_month_end),
      (6, 'federal-940', 'Federal unemployment return (Form 940)', 'IRS', v_next_month_end)
    ) as x(ord, id, name, sent_to, due)
   where x.ord <= 4 or v_q = 4;

  select min((e->>'dueOn')::date) into v_due from jsonb_array_elements(v_returns) e where (e->>'applies')::boolean;
  v_title := extract(year from v_end)::int::text || ', quarter ' || v_q::text;

  insert into action_records (tenant_id, kind, title, unit_number, opened_on, due_on, data, created_by)
  values (p_tenant, 'payroll-filing', v_title, '', p_today, v_due,
          jsonb_build_object('period', v_period, 'periodStart', v_start::text, 'periodEnd', v_end::text, 'wages', round(v_wages, 2),
                             'wagesCheckedOn', '', 'returns', v_returns, 'paid', 0, 'paidOn', '', 'paidNote', '', 'paidPosted', false, 'proofOn', ''),
          null)
  returning id into v_record;

  perform open_action_case(p_tenant, v_record, 'payroll-filing', 'Payroll filing', 'financial', 'Treasurer', v_title, '', v_due, p_today,
    array['Check the quarter''s wage records', 'File each return', 'Pay what is owed', 'File the proof'],
    array['Ticks itself when someone confirms the quarter''s wages against the pay runs',
          'Ticks itself when every return that applies has a filed date',
          'Ticks itself when the payment, or that nothing was owed, is recorded',
          'Ticks itself when the confirmations are filed with the wage records, which closes it']);
  return jsonb_build_object('tenant', p_tenant, 'opened', 1, 'period', v_period);
end $$;

-- ── Energy benchmarking ─────────────────────────────────────────────────────
create or replace function run_energy_benchmarking(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_year int := extract(year from p_today)::int - 1;
  v_state text;
  v_sqft numeric;
  v_due date;
  v_title text;
  v_record uuid;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'energy-benchmarking' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  if to_char(p_today, 'MM-DD') > '04-01' then return jsonb_build_object('tenant', p_tenant, 'skipped', 'after April 1'); end if;

  select lower(trim(coalesce(t.address->>'state', ''))) into v_state from tenants t where t.id = p_tenant;
  if v_state not in ('dc', 'district of columbia', 'washington dc', 'washington, dc', 'd.c.') then
    return jsonb_build_object('tenant', p_tenant, 'skipped', 'not a District building');
  end if;
  -- "78,500 sq ft" is 78500; the rule covers buildings of 50,000 square feet and over.
  select nullif(regexp_replace(coalesce((regexp_match(coalesce(bp.sqft, ''), '[0-9][0-9,]*'))[1], ''), ',', '', 'g'), '')::numeric into v_sqft
    from building_profiles bp where bp.tenant_id = p_tenant limit 1;
  if coalesce(v_sqft, 0) < 50000 then return jsonb_build_object('tenant', p_tenant, 'skipped', 'under 50,000 square feet, or no floor area on file'); end if;

  if exists (select 1 from building_records b where b.tenant_id = p_tenant and b.kind = 'energy-benchmarking' and b.done_on >= make_date(v_year + 1, 1, 1)) then
    return jsonb_build_object('tenant', p_tenant, 'skipped', 'report on record');
  end if;
  if exists (select 1 from action_records r where r.tenant_id = p_tenant and r.kind = 'benchmarking' and (r.data->>'year')::int = v_year) then
    return jsonb_build_object('tenant', p_tenant, 'skipped', 'already open');
  end if;

  v_due := make_date(v_year + 1, 4, 1);
  v_title := 'Report for ' || v_year::text;
  insert into action_records (tenant_id, kind, title, unit_number, opened_on, due_on, data, created_by)
  values (p_tenant, 'benchmarking', v_title, '', p_today, v_due,
          jsonb_build_object('year', v_year, 'covered', '', 'coveredNote', '', 'meters', 0, 'metersMissing', 0, 'sqft', v_sqft, 'occupants', 0,
                             'hours', 'Residential, all hours', 'detailsOn', '', 'downloadedOn', '', 'submittedOn', '', 'confirmation', ''),
          null)
  returning id into v_record;

  perform open_action_case(p_tenant, v_record, 'energy-benchmarking', 'Energy benchmarking', 'legal', 'Vice President', v_title, '', v_due, p_today,
    array['Confirm the building is covered', 'Twelve months of every meter', 'Building details', 'Download the file and submit it', 'Record the submission'],
    array['Ticks itself when someone confirms whether the building is covered; one that is not closes here',
          'Ticks itself when every meter under Building › Utilities has all twelve months of the year',
          'Ticks itself when floor area, occupants and operating hours are confirmed',
          'Ticks itself when the date it was submitted in Portfolio Manager is entered',
          'Ticks itself when the confirmation is recorded; fills in the record under Building › Obligations']);
  return jsonb_build_object('tenant', p_tenant, 'opened', 1, 'year', v_year);
end $$;

-- ── Records request ─────────────────────────────────────────────────────────
create or replace function run_records_request(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  i record;
  v_title text;
  v_due date;
  v_record uuid;
  v_opened int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'records-request' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  for i in select id, title, description, reporter_name, unit_number, submitted_date from issues
            where tenant_id = p_tenant and category = 'See the association records' and status in ('SUBMITTED', 'IN_PROGRESS') order by submitted_date loop
    if exists (select 1 from action_records r where r.tenant_id = p_tenant and r.kind = 'records-request' and r.data->>'issueId' = i.id::text) then continue; end if;
    v_title := coalesce(nullif(trim(i.title), ''), 'Unit ' || coalesce(i.unit_number, '') || ' asks to see records');
    v_due := i.submitted_date + 10;
    insert into action_records (tenant_id, kind, title, unit_number, opened_on, due_on, data, created_by)
    values (p_tenant, 'records-request', v_title, coalesce(i.unit_number, ''), p_today, v_due,
            jsonb_build_object('requester', coalesce(i.reporter_name, ''), 'askedOn', i.submitted_date::text, 'inWriting', true, 'ownerOfRecord', '',
                               'purpose', coalesce(i.description, ''),
                               'items', case when nullif(trim(i.title), '') is null then '[]'::jsonb
                                             else jsonb_build_array(jsonb_build_object('id', 'i0', 'what', i.title, 'share', '', 'reason', '')) end,
                               'how', '', 'sentOn', '', 'withheldNote', '', 'filedOn', '', 'issueId', i.id::text),
            null)
    returning id into v_record;
    perform open_action_case(p_tenant, v_record, 'records-request', 'Records request', 'governance', 'Secretary', v_title, coalesce(i.unit_number, ''), v_due, p_today,
      array['Log the request and check standing', 'Choose what to share', 'Send it, or offer a time to inspect', 'File what was sent and withheld'],
      array['Ticks itself when who asked, when, and whether they are an owner in good standing are entered',
            'Ticks itself when every item asked for has a decision, with a reason for anything not shared in full',
            'Ticks itself when the date it was sent or offered is entered',
            'Ticks itself when the request is filed, which closes it']);
    v_opened := v_opened + 1;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_guided_actions_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_payroll_filing(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'job', 'payroll-filing', 'error', sqlerrm); end;
    begin out := out || run_energy_benchmarking(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'job', 'energy-benchmarking', 'error', sqlerrm); end;
    begin out := out || run_records_request(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'job', 'records-request', 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change to the schedule.
create or replace function run_runbooks_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    'specialAssessment', run_special_assessment_all(p_today),
    'reserveStudy', run_reserve_study_all(p_today),
    'guidedActions', run_guided_actions_all(p_today));
end $$;

-- Only the scheduler and the service role run these: Supabase grants EXECUTE on new functions to anon and authenticated by default.
do $$
declare f text;
begin
  foreach f in array array[
    'public.open_action_case(uuid, uuid, text, text, text, text, text, text, date, date, text[], text[])',
    'public.run_payroll_filing(uuid, date)', 'public.run_energy_benchmarking(uuid, date)', 'public.run_records_request(uuid, date)',
    'public.run_guided_actions_all(date)', 'public.run_runbooks_all(date)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
