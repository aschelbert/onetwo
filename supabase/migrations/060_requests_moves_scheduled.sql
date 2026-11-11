-- ============================================================================
-- ONE two HOA - Resident requests and moves run on a schedule
-- ============================================================================
-- Two event-driven runbooks start themselves, in the app (src/ux2/boardroom/
-- residentRequest.ts, moves.ts) and here every morning. The app opens them
-- the moment the event lands when a board member is in the app; this job
-- catches what landed overnight or from an owner's phone.
--
--  run_resident_request(tenant, today): an open request (issues, status
--    SUBMITTED or IN_PROGRESS) with no case gets one, linked the way the
--    Inbox's Assign links it (source 'issue', source_id the request's id),
--    due 14 days after it was submitted. The job ticks the acknowledgement
--    step once the request is in progress and the reply step once it is
--    resolved or closed.
--
--  run_move(tenant, today): a move on the calendar (move_events) inside the
--    last 30 days or ahead gets its case on the case wizard's move situation
--    (source 'runbook', source_id 'move:<event id>'), and the move's case_id
--    points back at it. The app fills in the playbook and ticks it from the
--    move record when it loads the case.
--
-- Amenity bookings live only in the app (no table), so that runbook has no
-- twin here. The step texts match the app's modules; change both together.
-- run_runbooks_all() now runs all fourteen that have a twin.
-- ============================================================================

-- ── Resident request ────────────────────────────────────────────────────────
create or replace function run_resident_request(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  i record;
  c record;
  v_who text;
  v_due date;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'resident-request' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  -- 1. A case for every open request that has none.
  for i in select id, title, description, reporter_name, unit_number, submitted_date, priority, category, status from issues
            where tenant_id = p_tenant and status in ('SUBMITTED', 'IN_PROGRESS') order by submitted_date loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'issue' and x.source_id = i.id::text) then continue; end if;
    v_who := coalesce(nullif(i.reporter_name, ''), 'the owner');
    v_due := i.submitted_date + 14;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       due_date, source, source_id)
    values (p_tenant, 'request-' || i.id::text, 'governance', 'runbook-resident-request', i.title, coalesce(i.unit_number, ''), coalesce(i.reporter_name, ''), 'pre', 'open',
            case when i.priority = 'URGENT' then 'urgent' when i.priority = 'HIGH' then 'high' else 'medium' end, p_today,
            concat_ws(E'\n\n',
              format('Opened by the Resident request runbook on %s: %s%s asked on %s%s. The reply is due %s.',
                     p_today::text, coalesce(nullif(i.reporter_name, ''), 'an owner'),
                     case when coalesce(i.unit_number, '') <> '' then ' (Unit ' || i.unit_number || ')' else '' end,
                     i.submitted_date::text, case when coalesce(i.category, '') <> '' then ', ' || i.category else '' end, v_due::text),
              nullif(i.description, '')),
            v_due, 'issue', i.id::text)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Acknowledge %s''s request within 2 days', v_who),
       format('A reply on the request under Community › Requests, or moving it to In progress, counts. Due %s. This step ticks itself when the request is in progress or answered.', (i.submitted_date + 2)::text), 0),
      (p_tenant, v_case_id, 's1', 'Decide who handles it and what it needs', null, 1),
      (p_tenant, v_case_id, 's2', 'Do the work, or decide why not', null, 2),
      (p_tenant, v_case_id, 's3', format('Reply to %s by %s and resolve the request', v_who, v_due::text),
       'The 14-day clock runs on the Inbox. This step ticks itself when the request is resolved or closed.', 3);
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open request case of the runbook's: acknowledged, resolved.
  for c in select x.id, iss.status, (select count(*) from issue_comments ic where ic.issue_id = iss.id) as comments
             from cases x join issues iss on iss.id::text = x.source_id and iss.tenant_id = x.tenant_id
            where x.tenant_id = p_tenant and x.status <> 'closed' and x.source = 'issue' and x.sit_id = 'runbook-resident-request' loop
    if c.status <> 'SUBMITTED' or c.comments > 0 then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
    if c.status in ('RESOLVED', 'CLOSED') then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Move in or out ──────────────────────────────────────────────────────────
create or replace function run_move(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_managed boolean;
  e record;
  v_kind text;
  v_case_id uuid;
  v_opened int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'move' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  select coalesce(nullif(company, ''), '') <> '' into v_managed from management_info where tenant_id = p_tenant limit 1;
  v_managed := coalesce(v_managed, false);

  for e in select id, unit_number, move_type, scheduled_date, time_window, deposit_amount, resident_name, mover_name, notes from move_events
            where tenant_id = p_tenant and scheduled_date is not null and scheduled_date >= p_today - 30 order by scheduled_date loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'runbook' and x.source_id = 'move:' || e.id::text) then continue; end if;
    v_kind := case when e.move_type = 'in' then 'Move in' else 'Move out' end;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'move-' || e.id::text, 'admin', 'scheduled-move', v_kind || ' · Unit ' || e.unit_number || ' · ' || e.scheduled_date::text, e.unit_number, coalesce(e.resident_name, ''), 'pre', 'open', 'medium', p_today,
            concat_ws(E'\n\n',
              format('Opened by the Move in or out runbook on %s: %s for Unit %s on %s%s%s.%s The move record under Funds › Units carries the elevator slot, deposit, insurance, access and inspection; each step here ticks as it is filled in.',
                     p_today::text,
                     case when coalesce(e.resident_name, '') <> '' then e.resident_name || ' moves ' || e.move_type else 'a move ' || e.move_type end,
                     e.unit_number, e.scheduled_date::text,
                     case when coalesce(e.time_window, '') <> '' then ', ' || e.time_window else '' end,
                     case when coalesce(e.mover_name, '') <> '' then ', with ' || e.mover_name else '' end,
                     case when coalesce(e.deposit_amount, 0) > 0 then ' Deposit ' || e.deposit_amount::text || '.' else '' end),
              nullif(e.notes, '')),
            case when v_managed then 'Property Manager' else 'Vice President' end, e.scheduled_date, 'runbook', 'move:' || e.id::text)
    returning id into v_case_id;
    update move_events set case_id = v_case_id::text where id = e.id and coalesce(case_id, '') = '';
    v_opened := v_opened + 1;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_resident_request_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_resident_request(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_move_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_move(t.tenant_id, p_today);
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
    'move', run_move_all(p_today));
end $$;

revoke all on function run_resident_request(uuid, date) from public;
revoke all on function run_resident_request_all(date) from public;
revoke all on function run_move(uuid, date) from public;
revoke all on function run_move_all(date) from public;
grant execute on function run_resident_request(uuid, date) to service_role;
grant execute on function run_resident_request_all(date) to service_role;
grant execute on function run_move(uuid, date) to service_role;
grant execute on function run_move_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change.
