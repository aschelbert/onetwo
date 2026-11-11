-- ============================================================================
-- ONE two HOA - Collections and insurance renewal run on a schedule
-- ============================================================================
-- Two more runbooks start themselves, in the app (src/ux2/boardroom/
-- collections.ts and insuranceRenewal.ts) and here every morning:
--
--  run_collections(tenant, today): a unit whose oldest unpaid dues or
--    special assessment is 30 days past due gets one case (source 'runbook',
--    source_id 'collections:<unit>:<invoice id>'), unless the unit already
--    has an open collections case, the runbook's own or one the board opened
--    on the delinquent-accounts situation. The job then ticks, on every open
--    collections case, the late fee step once the fee invoice exists and the
--    outcome step once the unit has nothing past due.
--
--  run_insurance_renewal(tenant, today): a policy inside 60 days of its
--    expiry, or past it, gets one case per expiry (source_id
--    'insurance-renewal:<policy id>:<expiry>'). The job then ticks the bind
--    step once the policy on file carries a later expiry, and the certificate
--    step once an attachment uploaded after the case opened is on it.
--
-- The step texts match the app's modules so a case from either side reads
-- the same; change both together.
--
-- runbooks_off holds the ids the building switched off on the Runbooks tab,
-- for every runbook that runs here (month close reads it too now, alongside
-- month_close_enabled). run_runbooks_all() runs all three; the cron job that
-- ran the month close alone is replaced by one that runs it.
-- ============================================================================

alter table financial_settings
  add column if not exists runbooks_off text[] not null default '{}';

-- '$' || n.toLocaleString(), as the app prints money: $900, $1,350.5, $1,350.25.
create or replace function fin_money(n numeric)
returns text
language sql immutable as $$
  select '$' || case when n = trunc(n) then to_char(n, 'FM999,999,999,990') else rtrim(to_char(n, 'FM999,999,999,990.00'), '0') end;
$$;

-- ── Month close honors the shared switch list too ───────────────────────────
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
  if not coalesce(fs.month_close_enabled, true) or 'month-close' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  v_start_day := least(greatest(coalesce(fs.month_close_start_day, 1), 1), 28);
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

-- ── Collections ─────────────────────────────────────────────────────────────
create or replace function run_collections(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  u record;
  c record;
  inv record;
  v_owed numeric;
  v_days int;
  v_demand date;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
  v_unit text;
  v_invoice text;
  v_clear boolean;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'collections' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  -- 1. A case for every unit newly 30 days past due on dues or an assessment.
  for u in select number, owner from units where tenant_id = p_tenant order by number loop
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.status <> 'closed' and x.unit = u.number
                 and ((x.source = 'runbook' and x.source_id like 'collections:' || u.number || ':%') or x.sit_id = 'delinquent-accounts')) then
      continue;
    end if;
    select i.id, i.description, i.due_date into inv
      from unit_invoices i
     where i.tenant_id = p_tenant and i.unit_number = u.number
       and i.type in ('monthly', 'special_assessment') and i.status in ('sent', 'overdue')
       and i.amount - coalesce(i.paid_amount, 0) > 0.005
       and i.due_date + 30 <= p_today
     order by i.due_date limit 1;
    if not found then continue; end if;
    select coalesce(sum(i.amount - coalesce(i.paid_amount, 0)), 0) into v_owed
      from unit_invoices i
     where i.tenant_id = p_tenant and i.unit_number = u.number
       and i.type in ('monthly', 'special_assessment') and i.status in ('sent', 'overdue')
       and i.amount - coalesce(i.paid_amount, 0) > 0.005;
    v_days := p_today - inv.due_date;
    v_demand := inv.due_date + 60;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'collections-' || u.number || '-' || to_char(inv.due_date, 'YYYY-MM-DD'), 'financial', 'runbook-collections',
            format('Collections · Unit %s · %s past due', u.number, fin_money(v_owed)), u.number, coalesce(u.owner, ''), 'pre', 'open',
            case when v_days >= 90 then 'high' else 'medium' end, p_today,
            format('Opened by the Collections runbook on %s: %s was due %s, %s days ago, and %s is owed in all. The demand letter is due %s; a lien may follow 30 days after it. Payment plans are offered on the same terms to every owner.',
                   p_today::text, inv.description, inv.due_date::text, v_days, fin_money(v_owed), v_demand::text),
            'Treasurer', v_demand, 'runbook', 'collections:' || u.number || ':' || inv.id::text)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Charge the late fee on Unit %s''s overdue dues', u.number),
       'Billing charges it after the grace period when the late fee is on (Funds › Settings › Billing rules); otherwise charge it from the unit ledger. This step ticks itself once the fee invoice exists.', 0),
      (p_tenant, v_case_id, 's1', format('Send Unit %s the second notice by certified mail, with the statement of account', u.number), null, 1),
      (p_tenant, v_case_id, 's2', format('Send the formal demand letter by %s: total due, lien rights under DC Code § 42-1903.13(a), 30-day cure period', v_demand::text), null, 2),
      (p_tenant, v_case_id, 's3', 'Offer a written payment plan', null, 3),
      (p_tenant, v_case_id, 's4', format('Record the outcome for Unit %s: paid in full, on a plan, or referred for a lien', u.number),
       format('%s was owed when this opened. This step ticks itself when the unit has nothing past due.', fin_money(v_owed)), 4);
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open collections case: the late fee charged, the balance cleared.
  for c in select id, source_id from cases where tenant_id = p_tenant and status <> 'closed' and source = 'runbook' and source_id like 'collections:%' loop
    v_unit := split_part(c.source_id, ':', 2);
    v_invoice := split_part(c.source_id, ':', 3);
    if exists (select 1 from unit_invoices f where f.tenant_id = p_tenant and f.type = 'fee' and f.status <> 'void' and f.for_invoice_id = v_invoice) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's0' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
    select coalesce(x.balance, 0) <= 0.005 and not exists (
             select 1 from unit_invoices i where i.tenant_id = p_tenant and i.unit_number = v_unit
                and i.type in ('monthly', 'special_assessment') and i.status in ('sent', 'overdue') and i.amount - coalesce(i.paid_amount, 0) > 0.005)
      into v_clear from units x where x.tenant_id = p_tenant and x.number = v_unit;
    if coalesce(v_clear, false) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's4' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Insurance renewal ───────────────────────────────────────────────────────
create or replace function run_insurance_renewal(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  p record;
  c record;
  v_expires date;
  v_lapsed boolean;
  v_carrier text;
  v_case_id uuid;
  v_opened int := 0;
  v_ticked int := 0;
  v_policy uuid;
  v_old date;
  v_created date;
  v_exp text;
  v_att jsonb;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'insurance-renewal' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  -- 1. A case for every policy newly inside 60 days of its expiry, or past it; one per policy and expiry.
  for p in select id, type, carrier, coverage, premium, expires, policy_num from insurance_policies
            where tenant_id = p_tenant and expires ~ '^\d{4}-\d{2}-\d{2}$' order by expires loop
    v_expires := p.expires::date;
    if v_expires > p_today + 60 then continue; end if;
    if exists (select 1 from cases x where x.tenant_id = p_tenant and x.source = 'runbook' and x.source_id = 'insurance-renewal:' || p.id::text || ':' || p.expires) then continue; end if;
    v_lapsed := v_expires < p_today;
    v_carrier := case when coalesce(p.carrier, '') <> '' then ' from ' || p.carrier else '' end;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'insurance-renewal-' || p.expires, 'legal', 'runbook-insurance-renewal',
            format('Insurance renewal · %s · %s %s', p.type, case when v_lapsed then 'lapsed' else 'expires' end, p.expires), '', 'President', 'pre', 'open',
            case when v_lapsed then 'urgent' else 'high' end, p_today,
            format('Opened by the Insurance renewal runbook on %s: the %s policy%s%s %s %s%s%s. The bylaws and DC Code § 42-1903.10 require the association to keep it in force without a gap.',
                   p_today::text, p.type,
                   case when coalesce(p.carrier, '') <> '' then ' with ' || p.carrier else '' end,
                   case when coalesce(p.policy_num, '') <> '' then ' (' || p.policy_num || ')' else '' end,
                   case when v_lapsed then 'lapsed on' else 'expires' end, p.expires,
                   case when coalesce(p.coverage, '') <> '' then ', coverage ' || p.coverage else '' end,
                   case when coalesce(p.premium, '') <> '' then ', premium ' || p.premium else '' end),
            'President', v_expires, 'runbook', 'insurance-renewal:' || p.id::text || ':' || p.expires)
    returning id into v_case_id;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Ask for the %s renewal quote%s', p.type, v_carrier), null, 0),
      (p_tenant, v_case_id, 's1', 'Get at least two competing quotes', null, 1),
      (p_tenant, v_case_id, 's2', 'Board approves the premium', null, 2),
      (p_tenant, v_case_id, 's3', format('Bind the policy and record it on file: carrier, coverage, premium, new expiry (was %s)', p.expires),
       'Building › Overview › Insurance holds the policy list. This step ticks itself when the policy on file carries a later expiry.', 3),
      (p_tenant, v_case_id, 's4', 'Upload the new certificate of insurance to the policy',
       'Owners and lenders ask for it; it lives on the policy under Building › Overview › Insurance. This step ticks itself when a certificate uploaded after this case opened is on the policy.', 4);
    v_opened := v_opened + 1;
  end loop;

  -- 2. On every open renewal case: the expiry moved on, the certificate uploaded.
  for c in select id, source_id, created_date from cases where tenant_id = p_tenant and status <> 'closed' and source = 'runbook' and source_id like 'insurance-renewal:%' loop
    begin
      v_policy := split_part(c.source_id, ':', 2)::uuid;
      v_old := split_part(c.source_id, ':', 3)::date;
    exception when others then continue; end;
    v_created := c.created_date;
    select ip.expires, ip.attachments into v_exp, v_att from insurance_policies ip where ip.id = v_policy and ip.tenant_id = p_tenant;
    if not found or v_exp !~ '^\d{4}-\d{2}-\d{2}$' or v_exp::date <= v_old then continue; end if;
    update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's3' and not done;
    if found then v_ticked := v_ticked + 1; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v_att, '[]'::jsonb)) a where left(coalesce(a->>'uploadedAt', ''), 10) >= v_created::text) then
      update case_steps set done = true, done_date = p_today where case_id = c.id and local_id = 's4' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('tenant', p_tenant, 'opened', v_opened, 'ticked', v_ticked);
end $$;

-- ── Every building, every runbook; one building's error never stops the others ──
create or replace function run_collections_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_collections(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_insurance_renewal_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings order by tenant_id loop
    begin out := out || run_insurance_renewal(t.tenant_id, p_today);
    exception when others then out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;

create or replace function run_runbooks_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object('monthClose', run_month_close_all(p_today), 'collections', run_collections_all(p_today), 'insuranceRenewal', run_insurance_renewal_all(p_today));
end $$;

revoke all on function fin_money(numeric) from public;
revoke all on function run_collections(uuid, date) from public;
revoke all on function run_collections_all(date) from public;
revoke all on function run_insurance_renewal(uuid, date) from public;
revoke all on function run_insurance_renewal_all(date) from public;
revoke all on function run_runbooks_all(date) from public;
grant execute on function run_collections(uuid, date) to service_role;
grant execute on function run_collections_all(date) to service_role;
grant execute on function run_insurance_renewal(uuid, date) to service_role;
grant execute on function run_insurance_renewal_all(date) to service_role;
grant execute on function run_runbooks_all(date) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Every morning at 06:30 UTC, after the billing cycle: the one job for every
-- wired runbook replaces the month-close-only job from migration 055.
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'onetwo-month-close') then
    perform cron.unschedule('onetwo-month-close');
  end if;
  if exists (select 1 from cron.job where jobname = 'onetwo-runbooks') then
    perform cron.unschedule('onetwo-runbooks');
  end if;
  perform cron.schedule('onetwo-runbooks', '30 6 * * *', 'select public.run_runbooks_all()');
exception when others then
  raise notice 'pg_cron is not available here (%). Schedule "select public.run_runbooks_all()" daily once it is.', sqlerrm;
end $$;
