-- ============================================================================
-- ONE two HOA - The reserve study update runs on a schedule
-- ============================================================================
-- The reserve study runbook starts itself, in the app (src/ux2/boardroom/
-- reserveStudy.ts) and here every morning. A professional study lasts
-- reserve_study_every_years (three by default); the next is due that long
-- after reserve_study_date, or, when that is unset, after the newest upload
-- on a legal document named for the reserve study. The case opens 90 days
-- before, on the case wizard's reserve situation (source 'runbook',
-- source_id 'reserve-study:<due date>'), or at once keyed 'first' when no
-- study is on record. One open case at a time; a reserve case from the Home
-- obligation (f2) or the wizard counts. The app fills in the playbook and
-- ticks its steps when it loads the case.
-- ============================================================================

alter table financial_settings
  add column if not exists reserve_study_date date,
  add column if not exists reserve_study_every_years smallint not null default 3
    check (reserve_study_every_years between 1 and 10);

create or replace function run_reserve_study(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_years int;
  v_last date;
  v_due date;
  v_key text;
  v_case_id uuid;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'reserve-study' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  v_years := least(greatest(coalesce(fs.reserve_study_every_years, 3), 1), 10);

  v_last := fs.reserve_study_date;
  if v_last is null then
    select max(left(a->>'uploadedAt', 10))::date into v_last
      from legal_documents d, jsonb_array_elements(coalesce(d.attachments, '[]'::jsonb)) a
     where d.tenant_id = p_tenant and d.name ~* 'reserve study' and left(a->>'uploadedAt', 10) ~ '^\d{4}-\d{2}-\d{2}$';
  end if;
  v_due := case when v_last is null then p_today + 90 else (v_last + make_interval(years => v_years))::date end;
  v_key := case when v_last is null then 'first' else v_due::text end;

  if exists (select 1 from cases x where x.tenant_id = p_tenant
               and ((x.source = 'runbook' and (x.source_id = 'reserve-study:' || v_key or (x.status <> 'closed' and x.source_id like 'reserve-study:%')))
                 or (x.status <> 'closed' and ((x.source = 'obligation' and x.source_id = 'f2') or (x.sit_id = 'reserve-management' and coalesce(x.source, '') <> 'runbook'))))) then
    return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'opened', false);
  end if;
  if v_last is not null and p_today < v_due - 90 then return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'skipped', 'not yet'); end if;

  insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                     assigned_role, due_date, source, source_id)
  values (p_tenant, 'reserve-study-' || v_key, 'financial', 'reserve-management', 'Reserve study update · due ' || v_due::text, '', 'Treasurer', 'pre', 'open', 'high', p_today,
          format('Opened by the Reserve study update runbook on %s: %s. Record the new study''s date under Funds › Planning › Reserves when it arrives; the funding plan and next year''s reserve line follow from it.',
                 p_today::text,
                 case when v_last is null then 'no reserve study is on record, so one should be commissioned by ' || v_due::text
                      else format('the last study was %s, and one lasts %s year%s here, so the next is due %s', v_last::text, v_years, case when v_years = 1 then '' else 's' end, v_due::text) end),
          'Treasurer', v_due, 'runbook', 'reserve-study:' || v_key)
  returning id into v_case_id;
  return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'caseId', v_case_id, 'opened', true);
end $$;

create or replace function run_reserve_study_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_reserve_study(t.tenant_id, p_today);
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
    'specialAssessment', run_special_assessment_all(p_today),
    'reserveStudy', run_reserve_study_all(p_today));
end $$;

revoke all on function run_reserve_study(uuid, date) from public;
revoke all on function run_reserve_study_all(date) from public;
grant execute on function run_reserve_study(uuid, date) to service_role;
grant execute on function run_reserve_study_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks this up with no change.
