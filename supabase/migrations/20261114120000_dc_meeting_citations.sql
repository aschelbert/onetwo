-- Correct the DC Code citations in the meeting runbook case notes.
--
-- Migration 058 wrote 'DC Code § 29-1108' / '§ 29-1109' into the notes these
-- runbooks open cases with. Title 29 Chapter 11 is the Uniform Unincorporated
-- Nonprofit Association Act; owner and board meetings are governed by the
-- Condominium Act, DC Code § 42-1903.03, which requires an annual meeting at
-- least once a year and notice at least 21 days before an annual or regular
-- meeting (7 days before others). The 10-day notice in the old text was wrong.
--
-- Only the note text changes. Both function bodies are otherwise copied
-- verbatim from 058 and must match the client text in
-- src/ux2/boardroom/meetings.ts.

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
          format('Opened by the Annual meeting runbook on %s: %s (DC Code § 42-1903.03(a) requires one at least once a year). Notice goes to every owner at least 21 days before.',
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
    v_notes := format('Opened by the Board meeting cycle runbook on %s: %s is on the calendar for %s%s%s. Notice goes to the board and owners per the bylaws and DC Code § 42-1903.03; minutes within 7 days.',
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
