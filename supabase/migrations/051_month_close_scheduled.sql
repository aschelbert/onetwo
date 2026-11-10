-- ============================================================================
-- ONE two HOA - The month close runbook runs on a schedule
-- ============================================================================
-- Until now the month close case opened only when a board member opened the
-- app on or after the building's start day (src/ux2/boardroom/monthClose.ts).
-- run_month_close(tenant, today) does the same work in the database,
-- idempotently: one case per month (source 'runbook', source_id
-- 'month-close:YYYY-MM'), none for a month already closed by hand, and the
-- steps the database can see ticked (dues posted, books closed).
-- run_month_close_all() does it for every building with the runbook on, and
-- a pg_cron job calls it every morning after the billing cycle, so the dues
-- step can tick on the same run. The in-app run stays as a fallback and
-- finds the case this job opened.
--
-- The step texts match monthCloseSteps() in src/ux2/boardroom/monthClose.ts
-- so a case from either side reads the same; change both together.
--
-- month_close_enabled mirrors the Month close switch on the Runbooks tab, so
-- a building that turned the runbook off is skipped here too.
-- ============================================================================

alter table financial_settings
  add column if not exists month_close_enabled boolean not null default true;

create or replace function run_month_close(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_start_day int;
  v_period_start date;
  v_period_end date;
  v_period text;
  v_label text;
  v_source_id text;
  v_trigger date;
  v_due date;
  v_case_id uuid;
  v_opened boolean := false;
  v_dues_descr text;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant for update;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if not coalesce(fs.month_close_enabled, true) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  v_start_day := least(greatest(coalesce(fs.month_close_start_day, 1), 1), 28);
  -- The month whose close is due: the month before this one once the start day has arrived, otherwise the one before that.
  v_period_start := (date_trunc('month', p_today) - case when extract(day from p_today)::int >= v_start_day then interval '1 month' else interval '2 months' end)::date;
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
  v_period := to_char(v_period_start, 'YYYY-MM');
  v_label := to_char(v_period_start, 'FMMonth YYYY');
  v_source_id := 'month-close:' || v_period;
  v_trigger := make_date(extract(year from (v_period_start + interval '1 month'))::int, extract(month from (v_period_start + interval '1 month'))::int, v_start_day);
  v_due := v_trigger + 14;
  v_dues_descr := 'Dues · ' || v_label;

  select id into v_case_id from cases where tenant_id = p_tenant and source = 'runbook' and source_id = v_source_id limit 1;

  if v_case_id is null then
    if fs.closed_through is not null and fs.closed_through >= v_period_end then
      return jsonb_build_object('tenant', p_tenant, 'period', v_period, 'skipped', 'already closed');
    end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'month-close-' || v_period, 'financial', 'runbook-month-close', 'Month close · ' || v_label, '', 'Treasurer', 'pre', 'open', 'medium', p_today,
            format('Opened by the Month close runbook on %s. Post the month, reconcile, review against the budget, close the books, send the packet. Owners expect the packet by %s.', p_today::text, v_due::text),
            'Treasurer', v_due, 'runbook', v_source_id)
    returning id into v_case_id;

    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Post %s dues, late fees and the reserve transfer', v_label),
       'Automatic billing posts these on the 1st (Funds › Settings › Billing rules; Run billing now if any are missing). This step ticks itself once the dues invoices exist.', 0),
      (p_tenant, v_case_id, 's1', format('Record every %s payment and bill, then reconcile the bank', v_label), null, 1),
      (p_tenant, v_case_id, 's2', format('Review %s against the budget', v_label), null, 2),
      (p_tenant, v_case_id, 's3', format('Close the books through %s', v_period_end::text),
       'Funds › Statements › Close through locks every entry on or before that date; a later correction posts as a reversal dated today. This step ticks itself when the books are closed.', 3),
      (p_tenant, v_case_id, 's4', format('Send the %s packet to owners by %s', v_label, v_due::text),
       'The app drafts the packet (balance sheet, income statement, budget variance, ledger) from the closed ledger; Funds › Statements › Send to owners posts it to Community notices. This step ticks itself when it is sent.', 4);
    v_opened := true;
  end if;

  -- Tick the steps the database can see, on an open case only.
  if exists (select 1 from cases where id = v_case_id and status <> 'closed') then
    if exists (select 1 from unit_invoices i where i.tenant_id = p_tenant and i.type = 'monthly' and i.status <> 'void' and i.description = v_dues_descr) then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's0' and not done;
      v_ticked := v_ticked + (select count(*) from case_steps where case_id = v_case_id and local_id = 's0' and done_date = p_today)::int;
    end if;
    if fs.closed_through is not null and fs.closed_through >= v_period_end then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and local_id = 's3' and not done;
      v_ticked := v_ticked + (select count(*) from case_steps where case_id = v_case_id and local_id = 's3' and done_date = p_today)::int;
    end if;
  end if;

  return jsonb_build_object('tenant', p_tenant, 'period', v_period, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- Every building with the runbook on; one building's error never stops the others.
create or replace function run_month_close_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t record;
  out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings where coalesce(month_close_enabled, true) order by tenant_id loop
    begin
      out := out || run_month_close(t.tenant_id, p_today);
    exception when others then
      out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm);
    end;
  end loop;
  return out;
end $$;

revoke all on function run_month_close(uuid, date) from public;
revoke all on function run_month_close_all(date) from public;
grant execute on function run_month_close(uuid, date) to service_role;
grant execute on function run_month_close_all(date) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Every morning at 06:30 UTC, a quarter hour after the billing cycle, where
-- pg_cron is available (it is on Supabase; enable it under Database →
-- Extensions if this block only raises a notice).
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'onetwo-month-close') then
    perform cron.unschedule('onetwo-month-close');
  end if;
  perform cron.schedule('onetwo-month-close', '30 6 * * *', 'select public.run_month_close_all()');
exception when others then
  raise notice 'pg_cron is not available here (%). Schedule "select public.run_month_close_all()" daily once it is.', sqlerrm;
end $$;
