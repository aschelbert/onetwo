-- ============================================================================
-- ONE two HOA - Filings and the meeting cycle run on a schedule
-- ============================================================================
-- Three more runbooks start themselves, in the app (src/ux2/boardroom/
-- filings.ts and meetings.ts) and here every morning. All three use the case
-- wizard's own situations, so the database opens the case and the app fills
-- in the playbook steps when it loads it, and ticks the steps it can see
-- (the meeting set, the notice sent, the meeting held, the minutes written)
-- when a board member opens the app.
--
--  run_filings(tenant, today): a pending filing on the calendar gets its case
--    45 days before it is due, or at once when late. The case is the same
--    one Home's Start button opens (source 'filing', source_id the filing's
--    id), so the obligation card says Continue and closing it as Resolved
--    marks the filing filed. One case per filing per cycle: a case opened for
--    the filing inside the last year counts, open or closed.
--
--  run_annual_meeting(tenant, today): the next annual meeting is due 13
--    months after the last one on the calendar (DC Code § 29-1108); its case
--    opens 90 days before, keyed by the deadline, or at once keyed 'first'
--    for a building with no annual meeting yet. One open case at a time; a
--    planning case from the Home obligation (g4) or the wizard counts.
--
--  run_board_meeting(tenant, today): board_meeting_every_days on the building
--    profile is the bylaws' cadence (every two months when unset). A board
--    meeting on the calendar gets its case 30 days out, keyed by the meeting;
--    when none is scheduled and the cadence lapses within 30 days, a case
--    opens to schedule one, keyed by the deadline. One open case at a time.
--
-- run_runbooks_all() now runs all eight.
-- ============================================================================

alter table building_profiles
  add column if not exists board_meeting_every_days smallint not null default 61
    check (board_meeting_every_days between 7 and 366);

-- ── Filings ─────────────────────────────────────────────────────────────────
create or replace function run_filings(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  f record;
  v_late boolean;
  v_opened int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'filings' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  for f in select id, name, due_date, responsible, notes, legal_ref from regulatory_filings
            where tenant_id = p_tenant and status = 'pending' and due_date <= p_today + 45 order by due_date loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'filing' and x.source_id = f.id::text
                 and (x.status <> 'closed' or x.created_date >= f.due_date - 366)) then continue; end if;
    v_late := f.due_date < p_today;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'filing-' || f.id::text, 'admin', 'compliance-filing', f.name, '', coalesce(nullif(f.responsible, ''), 'Board'), 'pre', 'open',
            case when v_late then 'urgent' else 'high' end, p_today,
            concat_ws(E'\n\n',
              format('Opened by the Filings runbook on %s: %s is %sdue %s%s. Closing this case as Resolved marks it filed.',
                     p_today::text, f.name, case when v_late then 'late, it was ' else '' end, f.due_date::text,
                     case when coalesce(f.legal_ref, '') <> '' then ' (' || f.legal_ref || ')' else '' end),
              nullif(f.notes, '')),
            nullif(f.responsible, ''), f.due_date, 'filing', f.id::text);
    v_opened := v_opened + 1;
  end loop;
  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened);
end $$;

-- ── Annual meeting ──────────────────────────────────────────────────────────
create or replace function run_annual_meeting(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_last date;
  v_deadline date;
  v_key text;
  v_case_id uuid;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'annual-meeting' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  select max(date) into v_last from meetings where tenant_id = p_tenant and type = 'ANNUAL' and status <> 'CANCELLED';
  v_deadline := case when v_last is null then p_today + 120 else (v_last + interval '13 months')::date end;
  v_key := case when v_last is null then 'first' else v_deadline::text end;

  if exists (select 1 from cases x where x.tenant_id = p_tenant
               and ((x.source = 'runbook' and (x.source_id = 'annual-meeting:' || v_key or (x.status <> 'closed' and x.source_id like 'annual-meeting:%')))
                 or (x.status <> 'closed' and ((x.source = 'obligation' and x.source_id = 'g4') or (x.sit_id = 'annual-meeting-planning' and coalesce(x.source, '') <> 'runbook'))))) then
    return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'opened', false);
  end if;
  if v_last is not null and p_today < v_deadline - 90 then return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'skipped', 'not yet'); end if;

  insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                     assigned_role, due_date, source, source_id)
  values (p_tenant, 'annual-meeting-' || v_key, 'governance', 'annual-meeting-planning', 'Annual meeting · by ' || v_deadline::text, '', 'President', 'pre', 'open', 'high', p_today,
          format('Opened by the Annual meeting runbook on %s: %s (DC Code § 29-1108, within 13 months of the last). Notice goes to every owner at least 10 days before.',
                 p_today::text,
                 case when v_last is null then 'no annual meeting is on the calendar, so one should be held by ' || v_deadline::text
                      else 'the last annual meeting was ' || v_last::text || ', so the next must be held by ' || v_deadline::text end),
          'President', v_deadline, 'runbook', 'annual-meeting:' || v_key)
  returning id into v_case_id;
  return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'caseId', v_case_id, 'opened', true);
end $$;

-- ── Board meeting cycle ─────────────────────────────────────────────────────
create or replace function run_board_meeting(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_cadence int;
  up record;
  v_last date;
  v_deadline date;
  v_key text;
  v_title text;
  v_notes text;
  v_case_id uuid;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'board-meeting' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;
  if exists (select 1 from cases x where x.tenant_id = p_tenant and x.status <> 'closed'
               and ((x.source = 'runbook' and x.source_id like 'board-meeting:%') or (x.sit_id = 'board-meetings' and coalesce(x.source, '') <> 'runbook'))) then
    return jsonb_build_object('tenant', p_tenant, 'opened', false, 'skipped', 'a case is open');
  end if;

  select least(greatest(coalesce(board_meeting_every_days, 61), 7), 366) into v_cadence from building_profiles where tenant_id = p_tenant limit 1;
  v_cadence := coalesce(v_cadence, 61);

  select id, title, date, time, location into up from meetings
   where tenant_id = p_tenant and type in ('BOARD', 'QUARTERLY') and status = 'SCHEDULED' and date >= p_today order by date limit 1;
  if found then
    if up.date > p_today + 30 then return jsonb_build_object('tenant', p_tenant, 'opened', false, 'skipped', 'next meeting ' || up.date::text); end if;
    v_key := up.id::text; v_deadline := up.date;
    v_title := 'Board meeting · ' || up.date::text || case when coalesce(up.title, '') <> '' then ' · ' || up.title else '' end;
    v_notes := format('Opened by the Board meeting cycle runbook on %s: %s is on the calendar for %s%s%s. Notice goes to the board and owners per the bylaws and DC Code § 29-1109; minutes within 7 days.',
                      p_today::text, coalesce(nullif(up.title, ''), 'a board meeting'), up.date::text,
                      case when coalesce(up.time, '') <> '' then ' at ' || up.time else '' end,
                      case when coalesce(up.location, '') <> '' then ', ' || up.location else '' end);
  else
    select max(date) into v_last from meetings where tenant_id = p_tenant and type in ('BOARD', 'QUARTERLY') and status <> 'CANCELLED' and date < p_today;
    v_deadline := case when v_last is null then p_today else v_last + v_cadence end;
    if p_today < v_deadline - 30 then return jsonb_build_object('tenant', p_tenant, 'opened', false, 'skipped', 'due ' || v_deadline::text); end if;
    v_key := 'due:' || v_deadline::text;
    v_title := 'Board meeting · schedule one by ' || v_deadline::text;
    v_notes := format('Opened by the Board meeting cycle runbook on %s: the bylaws have the board meeting every %s days and nothing is scheduled; the next meeting is due by %s. Put it on Community › Meetings, then the notice, quorum, minutes and approval follow here.',
                      p_today::text, v_cadence, v_deadline::text);
  end if;

  insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                     assigned_role, due_date, source, source_id)
  values (p_tenant, 'board-meeting-' || replace(v_key, ':', '-'), 'governance', 'board-meetings', v_title, '', 'President', 'pre', 'open', 'medium', p_today, v_notes,
          'President', v_deadline, 'runbook', 'board-meeting:' || v_key)
  returning id into v_case_id;
  return jsonb_build_object('tenant', p_tenant, 'key', v_key, 'caseId', v_case_id, 'opened', true);
end $$;

-- ── Every building; one building's error never stops the others ─────────────
create or replace function run_filings_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_filings(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_annual_meeting_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_annual_meeting(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_board_meeting_all(p_today date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_board_meeting(t.tenant_id, p_today);
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
    'boardMeeting', run_board_meeting_all(p_today));
end $$;

revoke all on function run_filings(uuid, date) from public;
revoke all on function run_filings_all(date) from public;
revoke all on function run_annual_meeting(uuid, date) from public;
revoke all on function run_annual_meeting_all(date) from public;
revoke all on function run_board_meeting(uuid, date) from public;
revoke all on function run_board_meeting_all(date) from public;
grant execute on function run_filings(uuid, date) to service_role;
grant execute on function run_filings_all(date) to service_role;
grant execute on function run_annual_meeting(uuid, date) to service_role;
grant execute on function run_annual_meeting_all(date) to service_role;
grant execute on function run_board_meeting(uuid, date) to service_role;
grant execute on function run_board_meeting_all(date) to service_role;
-- The onetwo-runbooks job calls run_runbooks_all(), so it picks these up with no change.
