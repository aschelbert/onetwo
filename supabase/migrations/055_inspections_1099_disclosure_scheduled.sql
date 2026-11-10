-- ============================================================================
-- ONE two HOA - Inspections, the 1099s and the owner disclosure run on a schedule
-- ============================================================================
-- Four more runbooks start themselves, in the app (src/ux2/boardroom/
-- inspections.ts, form1099.ts, ownerDisclosure.ts) and here every morning:
--
--  run_inspection(tenant, today, runbook): 'elevator-inspection' watches the
--    maintenance calendar entries about the elevator, 'boiler-fire' the
--    boiler, fire alarm, sprinklers, standpipes, extinguishers and emergency
--    lighting. An entry due inside 60 days, or overdue, gets one case per due
--    date on the case wizard's inspection situation (source 'runbook',
--    source_id '<runbook>:<entry id>:<due date>'); the app fills in the
--    playbook and ticks its steps when it loads the case. An open case for
--    the entry, or the Home obligation's (m2 elevator, m1 fire), counts.
--
--  run_form_1099(tenant, today): January 1 through March 31, one case for
--    the year just ended when a vendor was paid $600 or more (paid work
--    orders), due January 31. Ticks the list step at once and the W-9 step
--    once every vendor on the list has w9_on_file. Nothing to file, no case.
--
--  run_owner_disclosure(tenant, today): January 1 through June 30, one case
--    to send owners the annual disclosure by March 31. Ticks the figures
--    step once the books are closed through last December 31 and the send
--    step once a notice about the disclosure goes out after the case opened.
--    The Home obligation's open case (r3) counts.
--
-- The step texts match the app's modules; change both together.
-- run_runbooks_all() now runs all twelve.
-- ============================================================================

-- ── Inspections ─────────────────────────────────────────────────────────────
create or replace function run_inspection(p_tenant uuid, p_today date, p_runbook text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_re text;
  v_label text;
  v_obligation text;
  m record;
  v_late boolean;
  v_opened int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if p_runbook = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  if p_runbook = 'elevator-inspection' then v_re := 'elevator|lift'; v_label := 'Elevator inspection'; v_obligation := 'm2';
  else v_re := 'boiler|fire|sprinkler|standpipe|extinguisher|smoke|emergency light'; v_label := 'Boiler and fire systems'; v_obligation := 'm1'; end if;

  for m in select id, task, category, frequency, vendor, last_completed, next_due, notes, status from maintenance_schedules
            where tenant_id = p_tenant and next_due is not null and coalesce(status, '') <> 'completed'
              and (coalesce(task, '') || ' ' || coalesce(category, '')) ~* v_re and next_due <= p_today + 60 order by next_due loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant
                 and ((x.source = 'runbook' and (x.source_id = p_runbook || ':' || m.id::text || ':' || m.next_due::text
                                                or (x.status <> 'closed' and x.source_id like p_runbook || ':' || m.id::text || ':%')))
                   or (x.status <> 'closed' and x.source = 'obligation' and x.source_id = v_obligation))) then continue; end if;
    v_late := m.next_due < p_today;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, p_runbook || '-' || m.id::text || '-' || m.next_due::text, 'maintenance', 'inspection-scheduling',
            m.task || ' · due ' || m.next_due::text, '', 'Vice President', 'pre', 'open', case when v_late then 'urgent' else 'high' end, p_today,
            format('Opened by the %s runbook on %s: %s (%s%s) is %sdue %s%s%s.%s Mark the calendar entry done under Building › Overview when the certificate is in hand.',
                   v_label, p_today::text, m.task, coalesce(m.category, ''), case when coalesce(m.frequency, '') <> '' then ', ' || m.frequency else '' end,
                   case when v_late then 'overdue, it was ' else '' end, m.next_due::text,
                   case when coalesce(m.vendor, '') <> '' then ', with ' || m.vendor else '' end,
                   case when m.last_completed is not null then '; last done ' || m.last_completed::text else '' end,
                   case when coalesce(m.notes, '') <> '' then ' ' || m.notes else '' end),
            'Vice President', m.next_due, 'runbook', p_runbook || ':' || m.id::text || ':' || m.next_due::text);
    v_opened := v_opened + 1;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'runbook', p_runbook, 'opened', v_opened);
end $$;

-- ── 1099 filing ─────────────────────────────────────────────────────────────
create or replace function run_form_1099(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_year int := extract(year from p_today)::int;
  v_tax int;
  v_source_id text;
  v_case_id uuid;
  v_opened boolean := false;
  v_ticked int := 0;
  v_vendors jsonb;
  v_n int;
  v_total numeric;
  v_list text;
  v_missing int;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if '1099' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  v_tax := v_year - 1;
  v_source_id := '1099:' || v_tax::text;

  -- Vendors paid $600 or more in the tax year, from the paid work orders, with their W-9s.
  select coalesce(jsonb_agg(jsonb_build_object('vendor', q.vendor, 'amount', q.amount, 'w9', q.w9) order by q.amount desc), '[]'::jsonb) into v_vendors
    from (select w.vendor, sum(w.amount) as amount, bool_or(coalesce(v.w9_on_file, false)) as w9
            from work_orders w left join vendors v on v.tenant_id = w.tenant_id and v.name = w.vendor
           where w.tenant_id = p_tenant and w.status = 'paid' and w.paid_date is not null
             and extract(year from w.paid_date)::int = v_tax and coalesce(w.vendor, '') <> ''
           group by w.vendor having sum(w.amount) >= 600) q;
  select count(*), coalesce(sum((e->>'amount')::numeric), 0), count(*) filter (where not (e->>'w9')::boolean)
    into v_n, v_total, v_missing from jsonb_array_elements(v_vendors) e;

  select id into v_case_id from cases where tenant_id = p_tenant and source = 'runbook' and source_id = v_source_id limit 1;
  if v_case_id is null then
    if p_today > make_date(v_year, 3, 31) then return jsonb_build_object('tenant', p_tenant, 'taxYear', v_tax, 'skipped', 'past the window'); end if;
    if v_n = 0 then return jsonb_build_object('tenant', p_tenant, 'taxYear', v_tax, 'skipped', 'nothing to file'); end if;
    select string_agg(e->>'vendor' || ' ' || fin_money((e->>'amount')::numeric), ' · ' order by (e->>'amount')::numeric desc) into v_list from jsonb_array_elements(v_vendors) e;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, '1099-' || v_tax::text, 'financial', 'runbook-1099', '1099 filing · ' || v_tax::text, '', 'Treasurer', 'pre', 'open', 'high', p_today,
            format('Opened by the 1099 filing runbook on %s: %s vendor%s paid %s or more in %s. Form 1099-NEC goes to each vendor and the IRS by %s-01-31; %s W-9%s still missing.',
                   p_today::text, v_n, case when v_n = 1 then ' was' else 's were' end, fin_money(600), v_tax, v_year, v_missing, case when v_missing = 1 then ' is' else 's are' end),
            'Treasurer', make_date(v_year, 1, 31), 'runbook', v_source_id)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Confirm the vendors paid %s or more in %s: %s vendor%s, %s', fin_money(600), v_tax, v_n, case when v_n = 1 then '' else 's' end, fin_money(v_total)),
       format('From the paid work orders: %s. Corporations and payments by card are exempt; strike those. This step ticks itself when the case opens.', v_list), 0),
      (p_tenant, v_case_id, 's1', 'Collect the W-9 from every vendor on the list',
       'Building › Contracts shows who has one on file; Mark received as they arrive. This step ticks itself when every vendor on the list has a W-9.', 1),
      (p_tenant, v_case_id, 's2', format('File Form 1099-NEC with the IRS and send each vendor its copy by %s-01-31', v_year), null, 2),
      (p_tenant, v_case_id, 's3', format('Keep the filed forms and the W-9s with the %s records', v_tax), null, 3);
    v_opened := true;
  end if;

  if exists (select 1 from cases where id = v_case_id and status <> 'closed') then
    update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's0' and not done;
    if found then v_ticked := v_ticked + 1; end if;
    if v_n > 0 and v_missing = 0 then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's1' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end if;
  return jsonb_build_object('tenant', p_tenant, 'taxYear', v_tax, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Owner disclosure statement ──────────────────────────────────────────────
create or replace function run_owner_disclosure(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_year int := extract(year from p_today)::int;
  v_source_id text;
  v_due date;
  v_case_id uuid;
  v_created date;
  v_opened boolean := false;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'owner-disclosure' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  v_source_id := 'owner-disclosure:' || v_year::text;
  v_due := make_date(v_year, 3, 31);

  select id, created_date into v_case_id, v_created from cases
   where tenant_id = p_tenant and ((source = 'runbook' and source_id = v_source_id) or (status <> 'closed' and source = 'obligation' and source_id = 'r3'))
   order by case when source = 'runbook' then 0 else 1 end limit 1;
  if v_case_id is null then
    if p_today > make_date(v_year, 6, 30) then return jsonb_build_object('tenant', p_tenant, 'year', v_year, 'skipped', 'past the window'); end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'owner-disclosure-' || v_year::text, 'governance', 'runbook-owner-disclosure', 'Owner disclosure statement · ' || v_year::text, '', 'Secretary', 'pre', 'open', 'medium', p_today,
            format('Opened by the Owner disclosure statement runbook on %s: owners get the annual disclosure by %s: %s actuals against budget, the reserve balance, the insurance summary, pending litigation, the board and officers.', p_today::text, v_due::text, v_year - 1),
            'Secretary', v_due, 'runbook', v_source_id)
    returning id into v_case_id;
    v_created := p_today;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Compile the %s disclosure: %s actuals against budget, the reserve balance, the insurance summary, pending litigation, the board and officers', v_year, v_year - 1),
       format('Funds › Statements has the year-end packet and the reserve position; Building › Overview the policies and the board. This step ticks itself once the %s books are closed.', v_year - 1), 0),
      (p_tenant, v_case_id, 's1', 'Board approves the statement', null, 1),
      (p_tenant, v_case_id, 's2', format('Send it to every owner by %s and keep proof of delivery', v_due::text),
       'Post it as a financial notice under Community and mail it where the bylaws require. This step ticks itself when a notice about the disclosure goes out after this case opened.', 2);
    v_opened := true;
  end if;

  if exists (select 1 from cases where id = v_case_id and status <> 'closed' and source = 'runbook' and source_id = v_source_id) then
    if fs.closed_through is not null and fs.closed_through >= make_date(v_year - 1, 12, 31) then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's0' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
    if exists (select 1 from announcements a where a.tenant_id = p_tenant and a.title ~* 'disclosure' and a.posted_date >= v_created)
       or exists (select 1 from communications c where c.tenant_id = p_tenant and c.subject ~* 'disclosure' and c.status = 'sent' and c.date >= v_created) then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's2' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end if;
  return jsonb_build_object('tenant', p_tenant, 'year', v_year, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_inspections_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_inspection(t.tenant_id, p_today, 'elevator-inspection') || run_inspection(t.tenant_id, p_today, 'boiler-fire');
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_form_1099_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_form_1099(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_owner_disclosure_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_owner_disclosure(t.tenant_id, p_today);
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
    'ownerDisclosure', run_owner_disclosure_all(p_today));
end $$;

revoke all on function run_inspection(uuid, date, text) from public;
revoke all on function run_inspections_all(date) from public;
revoke all on function run_form_1099(uuid, date) from public;
revoke all on function run_form_1099_all(date) from public;
revoke all on function run_owner_disclosure(uuid, date) from public;
revoke all on function run_owner_disclosure_all(date) from public;
grant execute on function run_inspection(uuid, date, text) to service_role;
grant execute on function run_inspections_all(date) to service_role;
grant execute on function run_form_1099(uuid, date) to service_role;
grant execute on function run_form_1099_all(date) to service_role;
grant execute on function run_owner_disclosure(uuid, date) to service_role;
grant execute on function run_owner_disclosure_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change.
