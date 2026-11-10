-- ============================================================================
-- ONE two HOA - Year-end close and annual budget run on a schedule
-- ============================================================================
-- Two more runbooks start themselves, in the app (src/ux2/boardroom/
-- yearEndClose.ts and annualBudget.ts, sharing fiscal.ts) and here every
-- morning, from the building's fiscal year end (building_profiles,
-- 'MM-DD', the 31st of December by default):
--
--  run_year_end_close(tenant, today): the day after the fiscal year ends, a
--    building with entries in that year gets one case to close it (source
--    'runbook', source_id 'year-end:<year end>'), unless the books are
--    already closed through it. The job then ticks the reserve step once the
--    year's reserve transfers reach the adopted contribution, and the close
--    step once the books are closed through the year end.
--
--  run_annual_budget(tenant, today): 90 days before the fiscal year starts,
--    one case to draft, adopt and announce the budget (source_id
--    'annual-budget:<year start>'), unless the board already has an open
--    budget case, from the Home obligation (source 'obligation', 'f1') or
--    the wizard (sit_id 'annual-budgeting'). The draft step ticks at once
--    (Funds › Planning rolls it forward itself); the notice step ticks once
--    a notice about the budget or dues is posted after the case opened.
--
-- The step texts match the app's modules so a case from either side reads
-- the same; change both together. run_runbooks_all() now runs all five.
-- ============================================================================

-- The day the fiscal year containing p_date started, for a 'MM-DD' year end (invalid → 12-31).
create or replace function fin_fiscal_year_start(p_date date, p_fye text)
returns date
language plpgsql immutable as $$
declare
  v_fye text := case when p_fye ~ '^\d{2}-\d{2}$' then p_fye else '12-31' end;
  em int := split_part(v_fye, '-', 1)::int;
  ed int := split_part(v_fye, '-', 2)::int;
  v_end date;
  v_candidate date;
begin
  if em < 1 or em > 12 then em := 12; end if;
  if ed < 1 then ed := 31; end if;
  -- Day ed of month em, rolling over like the app does for a day past the month's end.
  v_end := (make_date(extract(year from p_date)::int, em, 1) + (ed - 1))::date;
  v_candidate := v_end + 1;
  if v_candidate <= p_date then return v_candidate; end if;
  return (make_date(extract(year from p_date)::int - 1, em, 1) + (ed - 1))::date + 1;
end $$;

-- '2026' for a calendar year, '2026–27' for one that straddles two.
create or replace function fin_fiscal_label(p_start date, p_end date)
returns text
language sql immutable as $$
  select case when extract(year from p_start) = extract(year from p_end) then to_char(p_start, 'YYYY') else to_char(p_start, 'YYYY') || '–' || to_char(p_end, 'YY') end;
$$;

-- ── Year-end close ──────────────────────────────────────────────────────────
create or replace function run_year_end_close(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_fye text;
  v_cur_start date;
  v_start date;
  v_end date;
  v_label text;
  v_source_id text;
  v_due date;
  v_tax date;
  v_case_id uuid;
  v_opened boolean := false;
  v_ticked int := 0;
  v_moved numeric;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'year-end' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  select coalesce(fiscal_year_end, '12-31') into v_fye from building_profiles where tenant_id = p_tenant limit 1;
  v_cur_start := fin_fiscal_year_start(p_today, v_fye);
  v_end := v_cur_start - 1;
  v_start := fin_fiscal_year_start(v_end, v_fye);
  v_label := fin_fiscal_label(v_start, v_end);
  v_source_id := 'year-end:' || v_end::text;
  v_due := v_end + 60;
  v_tax := (date_trunc('month', v_end) + interval '4 months' + interval '14 days')::date;

  select id into v_case_id from cases where tenant_id = p_tenant and source = 'runbook' and source_id = v_source_id limit 1;

  if v_case_id is null then
    if fs.closed_through is not null and fs.closed_through >= v_end then
      return jsonb_build_object('tenant', p_tenant, 'fyEnd', v_end, 'skipped', 'already closed');
    end if;
    if not exists (select 1 from general_ledger g where g.tenant_id = p_tenant and g.status <> 'void' and g.date between v_start and v_end) then
      return jsonb_build_object('tenant', p_tenant, 'fyEnd', v_end, 'skipped', 'no entries in the year');
    end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'year-end-' || v_end::text, 'financial', 'runbook-year-end', 'Year-end close · ' || v_label, '', 'Treasurer', 'pre', 'open', 'high', p_today,
            format('Opened by the Year-end close runbook on %s: the fiscal year %s ended %s. Reconcile, post the adjustments, true up the reserve, close the books, send the annual report, hand the figures to the tax filings. The annual report and the tax hand-off are owed by %s.', p_today::text, v_label, v_end::text, v_due::text),
            'Treasurer', v_due, 'runbook', v_source_id)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Reconcile every account to the %s bank statements', v_end::text), null, 0),
      (p_tenant, v_case_id, 's1', format('Post the %s year-end adjustments: accruals, prepaid dues, bad debt', v_label), null, 1),
      (p_tenant, v_case_id, 's2', format('True up the reserve transfer to the adopted %s', fin_money(coalesce(fs.annual_reserve_contribution, 0))),
       'Billing moves one twelfth each month; a missed or short month is made up here from Funds › Settings › Ledger. This step ticks itself once the year''s transfers reach the adopted contribution.', 2),
      (p_tenant, v_case_id, 's3', format('Close the books through %s', v_end::text),
       'Funds › Statements › Close through locks every entry on or before that date; a later correction posts as a reversal dated today. This step ticks itself when the books are closed.', 3),
      (p_tenant, v_case_id, 's4', format('Send the %s annual report to owners: year-end statements and the reserve position', v_label), null, 4),
      (p_tenant, v_case_id, 's5', format('Hand the %s figures to the tax filings: Form 1120-H and the DC return by %s', v_label, v_tax::text),
       'Funds › Statements › Taxes and filings drafts the 1120-H from the closed ledger; the Filings runbook carries the filing itself.', 5);
    v_opened := true;
  end if;

  if exists (select 1 from cases where id = v_case_id and status <> 'closed') then
    select coalesce(sum(g.amount), 0) into v_moved from general_ledger g
     where g.tenant_id = p_tenant and g.status <> 'void' and g.source = 'transfer' and g.memo like 'Reserve transfer%' and g.date between v_start and v_end;
    if coalesce(fs.annual_reserve_contribution, 0) > 0 and v_moved >= fs.annual_reserve_contribution - 0.5 then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's2' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
    if fs.closed_through is not null and fs.closed_through >= v_end then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's3' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end if;

  return jsonb_build_object('tenant', p_tenant, 'fyEnd', v_end, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Annual budget ───────────────────────────────────────────────────────────
create or replace function run_annual_budget(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_fye text;
  v_cur_start date;
  v_start date;
  v_end date;
  v_label text;
  v_source_id text;
  v_notice date;
  v_case_id uuid;
  v_created date;
  v_opened boolean := false;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'annual-budget' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  select coalesce(fiscal_year_end, '12-31') into v_fye from building_profiles where tenant_id = p_tenant limit 1;
  v_cur_start := fin_fiscal_year_start(p_today, v_fye);
  v_start := (v_cur_start + interval '1 year')::date;
  v_end := (v_start + interval '1 year')::date - 1;
  v_label := fin_fiscal_label(v_start, v_end);
  v_source_id := 'annual-budget:' || v_start::text;
  v_notice := v_start - 30;

  -- The runbook's own case, or one the board already has on next year's budget.
  select id, created_date into v_case_id, v_created from cases
   where tenant_id = p_tenant and ((source = 'runbook' and source_id = v_source_id)
      or (status <> 'closed' and ((source = 'obligation' and source_id = 'f1') or sit_id = 'annual-budgeting')))
   order by case when source = 'runbook' then 0 else 1 end limit 1;

  if v_case_id is null then
    if p_today < v_start - 90 then return jsonb_build_object('tenant', p_tenant, 'fyStart', v_start, 'skipped', 'not yet'); end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'annual-budget-' || v_start::text, 'financial', 'runbook-annual-budget', 'Annual budget · ' || v_label, '', 'Treasurer', 'pre', 'open', 'high', p_today,
            format('Opened by the Annual budget runbook on %s: the fiscal year %s starts %s. The draft is on Funds › Planning; owners must hear the adopted budget and the dues by %s.', p_today::text, v_label, v_start::text, v_notice::text),
            'Treasurer', v_notice, 'runbook', v_source_id)
    returning id into v_case_id;
    v_created := p_today;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Roll the %s draft forward from this year''s actuals', v_label),
       'Funds › Planning › Next year draft does this itself: every line grown from this year, the dues options, the reserve gap. This step ticks itself when the case opens.', 0),
      (p_tenant, v_case_id, 's1', 'Pick the dues option and the reserve line',
       'Funds › Planning › Next year draft. Keeping dues flat, funding the reserve study on time, or the minimum; the choice is recorded here and in the minutes.', 1),
      (p_tenant, v_case_id, 's2', 'Put next year''s contracts and insurance into the lines', null, 2),
      (p_tenant, v_case_id, 's3', 'Board reviews the draft at a meeting', null, 3),
      (p_tenant, v_case_id, 's4', 'Board votes to adopt the budget', null, 4),
      (p_tenant, v_case_id, 's5', format('Set the %s dues on the fee schedule and every unit', v_label),
       'Funds › Settings › Fee schedule holds the tiers; Funds › Income › Units carries each unit''s monthly amount.', 5),
      (p_tenant, v_case_id, 's6', format('Tell owners by %s: the adopted budget and the %s dues', v_notice::text, v_label),
       'Post it as a financial notice under Community (the bylaws want 30 days before the year starts). This step ticks itself when a notice about the budget is posted after this case opened.', 6),
      (p_tenant, v_case_id, 's7', format('Enter the adopted lines as the %s budget', v_label),
       'Funds › Planning › Budget, each category at its adopted amount, so the variance report starts the year right.', 7),
      (p_tenant, v_case_id, 's8', 'File the adopted budget with the minutes under Building › Documents', null, 8);
    v_opened := true;
  end if;

  -- Only the runbook's own case carries these steps.
  if exists (select 1 from cases where id = v_case_id and status <> 'closed' and source = 'runbook' and source_id = v_source_id) then
    update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's0' and not done;
    if found then v_ticked := v_ticked + 1; end if;
    if exists (select 1 from announcements a where a.tenant_id = p_tenant and a.title ~* '(budget|dues)' and a.category in ('financial', 'meeting', 'general') and a.posted_date >= v_created) then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's6' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end if;

  return jsonb_build_object('tenant', p_tenant, 'fyStart', v_start, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_year_end_close_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_year_end_close(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_annual_budget_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_annual_budget(t.tenant_id, p_today);
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
    'annualBudget', run_annual_budget_all(p_today));
end $$;

revoke all on function fin_fiscal_year_start(date, text) from public;
revoke all on function fin_fiscal_label(date, date) from public;
revoke all on function run_year_end_close(uuid, date) from public;
revoke all on function run_year_end_close_all(date) from public;
revoke all on function run_annual_budget(uuid, date) from public;
revoke all on function run_annual_budget_all(date) from public;
grant execute on function run_year_end_close(uuid, date) to service_role;
grant execute on function run_year_end_close_all(date) to service_role;
grant execute on function run_annual_budget(uuid, date) to service_role;
grant execute on function run_annual_budget_all(date) to service_role;
-- The onetwo-runbooks job from migration 056 calls run_runbooks_all(), so it picks these up with no change.
