-- ============================================================================
-- ONE two HOA - The billing cycle runs on a schedule, and payments apply in
-- the order the building chose
-- ============================================================================
-- Until now dues billing and late fees ran only when a board member opened
-- the app. run_billing_cycle(tenant, today) does the same work in the
-- database, idempotently (one dues invoice per unit and month, one fee per
-- dues invoice, one reserve transfer per month, nothing dated inside a
-- closed month), and run_billing_cycle_all() does it for every building with
-- billing or late fees on. A pg_cron job calls it every morning where pg_cron
-- is available; the in-app run stays as a fallback and is harmless twice.
--
-- payment_order: how a payment spreads across a unit's open charges.
-- 'dues-first' (default): dues, then special assessments, then fees, oldest
-- due first within each. 'oldest-first': the oldest due charge first.
-- ============================================================================

alter table financial_settings
  add column if not exists payment_order text not null default 'dues-first'
    check (payment_order in ('dues-first', 'oldest-first'));

-- ────────────────────────────────────────────────────────────────────────────
-- Payments honour the building's order
-- ────────────────────────────────────────────────────────────────────────────

create or replace function record_unit_payment(
  p_tenant_id uuid, p_unit_number text, p_amount numeric, p_method text, p_reference text, p_date date default current_date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u units%rowtype;
  m jsonb := fin_mapping(p_tenant_id);
  v_order text := coalesce((select payment_order from financial_settings where tenant_id = p_tenant_id), 'dues-first');
  v_left numeric := round(p_amount, 2);
  v_take numeric;
  v_open numeric := 0;
  v_legacy numeric := 0;
  v_to_balance numeric := 0;
  v_to_credit numeric := 0;
  v_applied jsonb := '[]'::jsonb;
  r record;
begin
  if v_left is null or v_left <= 0 then return jsonb_build_object('error', 'amount must be positive'); end if;
  if p_reference is not null and exists (select 1 from general_ledger where tenant_id = p_tenant_id and source_id = p_reference) then
    return jsonb_build_object('skipped', true, 'reason', 'already recorded', 'reference', p_reference);
  end if;
  select * into u from units where tenant_id = p_tenant_id and number = p_unit_number for update;
  if not found then return jsonb_build_object('error', 'unit not found'); end if;

  select coalesce(sum(amount - coalesce(paid_amount, 0)), 0) into v_open
    from unit_invoices
   where tenant_id = p_tenant_id and unit_number = p_unit_number and status in ('sent', 'overdue');

  for r in
    select id, amount - coalesce(paid_amount, 0) as remaining
      from unit_invoices
     where tenant_id = p_tenant_id and unit_number = p_unit_number and status in ('sent', 'overdue')
       and amount - coalesce(paid_amount, 0) > 0.005
     order by case when v_order = 'oldest-first' then 0 when type = 'monthly' then 0 when type = 'special_assessment' then 1 else 2 end, due_date, created_date
  loop
    exit when v_left <= 0;
    v_take := least(v_left, round(r.remaining, 2));
    perform fin_settle_invoice(r.id, v_take, p_method, p_date, p_reference);
    v_applied := v_applied || jsonb_build_object('invoiceId', r.id, 'amount', v_take);
    v_left := round(v_left - v_take, 2);
  end loop;

  if v_left > 0 then
    v_legacy := greatest(0, round(u.balance - v_open, 2));
    v_to_balance := least(v_left, v_legacy);
    if v_to_balance > 0 then
      perform fin_gl_post(p_tenant_id, p_date, format('Payment received - Unit %s', p_unit_number), m->>'bankAccount', m->>'assessmentsReceivable', v_to_balance, 'payment', p_reference);
      v_left := round(v_left - v_to_balance, 2);
    end if;
  end if;
  if v_left > 0 then
    perform fin_gl_post(p_tenant_id, p_date, format('Paid ahead - Unit %s', p_unit_number), m->>'bankAccount', m->>'prepaidAssessments', v_left, 'payment', p_reference);
    v_to_credit := v_left;
  end if;

  update units
     set balance = round(balance - round(p_amount, 2), 2),
         payments = payments || jsonb_build_object('date', p_date::text, 'amount', round(p_amount, 2), 'method', p_method,
                                                   'note', case when jsonb_array_length(v_applied) > 0 then 'Online payment' || case when v_to_credit > 0 then ' · credit' else '' end
                                                                when v_to_credit > 0 and v_to_balance = 0 then 'Paid ahead' else 'Payment via ' || p_method end)
   where tenant_id = p_tenant_id and number = p_unit_number;

  return jsonb_build_object('applied', v_applied, 'toBalance', v_to_balance, 'toCredit', v_to_credit, 'total', round(p_amount, 2));
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- The billing cycle for one building
-- ────────────────────────────────────────────────────────────────────────────

create or replace function run_billing_cycle(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  m jsonb;
  v_period text := to_char(p_today, 'YYYY-MM');
  v_month_label text := to_char(p_today, 'FMMonth YYYY');
  v_descr text := 'Dues · ' || to_char(p_today, 'FMMonth YYYY');
  v_bill_date date;
  v_due date;
  v_credit numeric;
  v_monthly numeric;
  v_memo text;
  v_fee_descr text;
  v_fee_id uuid;
  v_billed int := 0;
  v_amount numeric := 0;
  v_already int := 0;
  v_no_amount int := 0;
  v_transfer numeric := 0;
  v_fees int := 0;
  v_billing_ran boolean := false;
  u record;
  r record;
begin
  select * into fs from financial_settings where tenant_id = p_tenant for update;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  m := fin_mapping(p_tenant);

  -- 1. This month's dues, once per unit, if billing is on and the month is not billed yet.
  if coalesce(fs.auto_billing_enabled, false) and (fs.last_billing_run is null or to_char(fs.last_billing_run, 'YYYY-MM') < v_period) then
    v_billing_ran := true;
    v_bill_date := date_trunc('month', p_today)::date;
    -- A month whose 1st is already closed posts dated today, named for its month.
    if fs.closed_through is not null and v_bill_date <= fs.closed_through then v_bill_date := p_today; end if;
    v_due := make_date(extract(year from p_today)::int, extract(month from p_today)::int, least(greatest(coalesce(fs.hoa_due_day, 1), 1), 28));
    for u in select number, monthly_fee, balance from units where tenant_id = p_tenant order by number for update loop
      if coalesce(u.monthly_fee, 0) <= 0 then v_no_amount := v_no_amount + 1; continue; end if;
      if exists (select 1 from unit_invoices where tenant_id = p_tenant and unit_number = u.number and type = 'monthly' and status <> 'void' and description = v_descr) then
        v_already := v_already + 1; continue;
      end if;
      perform fin_gl_post(p_tenant, v_bill_date, format('Invoice dues - Unit %s: %s', u.number, v_descr), m->>'assessmentsReceivable', m->>'regularAssessmentRevenue', u.monthly_fee, 'assessment', u.number);
      -- Money the owner paid ahead pays the new charge first.
      v_credit := least(greatest(0, -u.balance), u.monthly_fee);
      if v_credit > 0 then
        perform fin_gl_post(p_tenant, v_bill_date, format('Prepaid credit applied - Unit %s: %s', u.number, v_descr), m->>'prepaidAssessments', m->>'assessmentsReceivable', v_credit, 'payment', u.number);
      end if;
      insert into unit_invoices (tenant_id, unit_number, type, description, amount, status, created_date, due_date, paid_date, paid_amount, payment_method)
      values (p_tenant, u.number, 'monthly', v_descr, u.monthly_fee,
              case when v_credit >= u.monthly_fee - 0.005 then 'paid' else 'sent' end, v_bill_date, v_due,
              case when v_credit >= u.monthly_fee - 0.005 then v_bill_date else null end, nullif(v_credit, 0), case when v_credit > 0 then 'credit' end);
      update units set balance = round(balance + u.monthly_fee, 2) where tenant_id = p_tenant and number = u.number;
      v_billed := v_billed + 1;
      v_amount := round(v_amount + u.monthly_fee, 2);
    end loop;

    -- The monthly reserve transfer, once per month.
    v_monthly := round(coalesce(fs.annual_reserve_contribution, 0) / 12, 2);
    if coalesce(fs.auto_reserve_transfer, true) and v_monthly > 0 then
      v_memo := 'Reserve transfer · ' || v_month_label;
      if not exists (select 1 from general_ledger g where g.tenant_id = p_tenant and g.status <> 'void' and g.source = 'transfer' and g.memo = v_memo) then
        perform fin_gl_post(p_tenant, v_bill_date, v_memo, m->>'reserveBankAccount', m->>'bankAccount', v_monthly, 'transfer', null);
        v_transfer := v_monthly;
      end if;
    end if;
    update financial_settings set last_billing_run = now() where tenant_id = p_tenant;
  end if;

  -- 2. Late fees: one per dues invoice past its due date plus the grace period, never on a paid one.
  if coalesce(fs.late_fee_enabled, false) and coalesce(fs.late_fee_amount, 0) > 0 then
    for r in
      select i.id, i.unit_number, i.description
        from unit_invoices i
       where i.tenant_id = p_tenant and i.type = 'monthly' and i.description like 'Dues · %'
         and i.status in ('sent', 'overdue') and i.amount - coalesce(i.paid_amount, 0) > 0.005
         and p_today > i.due_date + coalesce(fs.late_fee_grace_days, 0)
         and not exists (select 1 from unit_invoices f where f.tenant_id = p_tenant and f.type = 'fee' and f.status <> 'void' and f.for_invoice_id = i.id::text)
       order by i.unit_number, i.due_date
    loop
      v_fee_descr := 'Late fee · ' || substr(r.description, 8);
      perform fin_gl_post(p_tenant, p_today, format('Invoice fee - Unit %s: %s', r.unit_number, v_fee_descr), m->>'lateFeeReceivable', m->>'lateFeeRevenue', fs.late_fee_amount, 'fee', r.unit_number);
      insert into unit_invoices (tenant_id, unit_number, type, description, amount, status, created_date, due_date, for_invoice_id)
      values (p_tenant, r.unit_number, 'fee', v_fee_descr, fs.late_fee_amount, 'sent', p_today, p_today, r.id::text)
      returning id into v_fee_id;
      update units
         set balance = round(balance + fs.late_fee_amount, 2),
             late_fees = late_fees || jsonb_build_object('date', p_today::text, 'amount', fs.late_fee_amount, 'reason', v_fee_descr, 'waived', false, 'invoiceId', v_fee_id::text, 'paid', false)
       where tenant_id = p_tenant and number = r.unit_number;
      v_fees := v_fees + 1;
    end loop;
    if v_fees > 0 then update financial_settings set last_late_fee_run = now() where tenant_id = p_tenant; end if;
  end if;

  return jsonb_build_object('tenant', p_tenant, 'period', v_period, 'billingRan', v_billing_ran, 'billed', v_billed, 'amount', v_amount,
                            'alreadyBilled', v_already, 'noAmount', v_no_amount, 'reserveTransfer', v_transfer, 'lateFees', v_fees);
end $$;

-- Every building with billing or late fees on; one building's error never stops the others.
create or replace function run_billing_cycle_all(p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t record;
  out jsonb := '[]'::jsonb;
begin
  for t in select tenant_id from financial_settings where coalesce(auto_billing_enabled, false) or coalesce(late_fee_enabled, false) order by tenant_id loop
    begin
      out := out || run_billing_cycle(t.tenant_id, p_today);
    exception when others then
      out := out || jsonb_build_object('tenant', t.tenant_id, 'error', sqlerrm);
    end;
  end loop;
  return out;
end $$;

revoke all on function run_billing_cycle(uuid, date) from public;
revoke all on function run_billing_cycle_all(date) from public;
grant execute on function run_billing_cycle(uuid, date) to service_role;
grant execute on function run_billing_cycle_all(date) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Every morning at 06:15 UTC, where pg_cron is available (it is on Supabase;
-- enable it under Database → Extensions if this block only raises a notice).
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'onetwo-billing-cycle') then
    perform cron.unschedule('onetwo-billing-cycle');
  end if;
  perform cron.schedule('onetwo-billing-cycle', '15 6 * * *', 'select public.run_billing_cycle_all()');
exception when others then
  raise notice 'pg_cron is not available here (%). Schedule "select public.run_billing_cycle_all()" daily once it is.', sqlerrm;
end $$;
