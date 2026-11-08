-- ============================================================================
-- ONE two HOA - Online payments post to the ledger
-- ============================================================================
-- The Stripe webhook calls reconcile_unit_payment(text, text); production had
-- the function by hand and no migration carried it, so a fresh database never
-- posted an online payment. This migration adds it, plus a payment that is
-- not tied to one invoice (the owner's "pay my balance" checkout and autopay),
-- and a refund that posts the same entries the app posts, server side.
--
-- Also adds, if missing, the billing-settings and invoice columns the app has
-- read and written since the billing automation and Stripe work landed.
-- ============================================================================

alter table financial_settings
  add column if not exists auto_billing_enabled boolean not null default false,
  add column if not exists last_billing_run timestamptz,
  add column if not exists late_fee_enabled boolean not null default false,
  add column if not exists late_fee_amount numeric not null default 25,
  add column if not exists late_fee_grace_days int not null default 15,
  add column if not exists last_late_fee_run timestamptz;

alter table unit_invoices
  add column if not exists case_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists refund_amount numeric,
  add column if not exists refund_date date,
  add column if not exists refund_reason text,
  add column if not exists refund_gl_entry_id text,
  add column if not exists stripe_refund_id text;

create index if not exists idx_unit_invoices_stripe_session on unit_invoices(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists idx_unit_invoices_stripe_intent on unit_invoices(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists idx_general_ledger_source_id on general_ledger(tenant_id, source_id) where source_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- Accounts the server posts to. These are the app's defaults (the per-building
-- mapping lives in the browser and is not stored yet).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function fin_ar_account(p_type text, p_fund text)
returns text language sql immutable as $$
  select case
    when p_type in ('fee', 'amenity_fee') then '1130'
    when p_type = 'special_assessment' and p_fund = 'operating' then '1110'
    when p_type = 'special_assessment' then '1120'
    else '1110'
  end
$$;

create or replace function fin_income_account(p_type text, p_fund text)
returns text language sql immutable as $$
  select case
    when p_type = 'fee' then '4030'
    when p_type = 'amenity_fee' then '4060'
    when p_type = 'special_assessment' and p_fund = 'operating' then '4010'
    when p_type = 'special_assessment' then '4020'
    else '4010'
  end
$$;

-- One balanced entry. Returns its local id (the app's "GL…" id).
create or replace function fin_gl_post(
  p_tenant uuid, p_date date, p_memo text, p_debit text, p_credit text, p_amount numeric, p_source text, p_source_id text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := 'GL' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || lpad(floor(random() * 1000)::int::text, 3, '0');
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  insert into general_ledger (tenant_id, local_id, date, memo, debit_acct, credit_acct, amount, source, source_id, posted, status)
  values (p_tenant, v_id, p_date, p_memo, p_debit, p_credit, round(p_amount, 2), p_source, p_source_id, now(), 'posted');
  return v_id;
end $$;

-- Apply part (or all) of a payment to one invoice: posts Dr bank / Cr the
-- charge's own receivable, records the amount paid so far, marks the unit's
-- fee or special assessment line paid when the charge is settled.
create or replace function fin_settle_invoice(
  p_invoice_id uuid, p_take numeric, p_method text, p_date date, p_source_id text, p_intent text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv unit_invoices%rowtype;
  v_gl text;
  v_paid numeric;
  v_full boolean;
begin
  select * into inv from unit_invoices where id = p_invoice_id for update;
  if not found or p_take is null or p_take <= 0 then return null; end if;
  v_gl := fin_gl_post(inv.tenant_id, p_date, format('Payment received - Invoice %s Unit %s', inv.id, inv.unit_number),
                      '1010', fin_ar_account(inv.type, inv.fund), p_take, 'payment', coalesce(p_source_id, inv.unit_number));
  v_paid := round(coalesce(inv.paid_amount, 0) + p_take, 2);
  v_full := v_paid >= inv.amount - 0.005;
  update unit_invoices
     set paid_amount = v_paid,
         status = case when v_full then 'paid' else status end,
         paid_date = case when v_full then p_date else paid_date end,
         payment_method = p_method,
         payment_gl_entry_id = v_gl,
         stripe_payment_intent_id = coalesce(p_intent, stripe_payment_intent_id)
   where id = p_invoice_id;
  if v_full then
    update units u
       set late_fees = coalesce((select jsonb_agg(case when f->>'invoiceId' = inv.id::text then f || '{"paid": true}'::jsonb else f end order by i)
                                   from jsonb_array_elements(u.late_fees) with ordinality as t(f, i)), '[]'::jsonb),
           special_assessments = coalesce((select jsonb_agg(case when a->>'invoiceId' = inv.id::text then a || jsonb_build_object('paid', true, 'paidDate', p_date::text) else a end order by i)
                                   from jsonb_array_elements(u.special_assessments) with ordinality as t(a, i)), '[]'::jsonb)
     where u.tenant_id = inv.tenant_id and u.number = inv.unit_number;
  end if;
  return v_gl;
end $$;

-- A payment from a unit, applied the way the app applies it: dues first, then
-- special assessments, then fees, oldest due first; then any balance with no
-- invoice behind it; the rest is a prepaid credit. Idempotent on p_reference
-- (a Stripe session or invoice id), so a webhook delivered twice posts once.
create or replace function record_unit_payment(
  p_tenant_id uuid, p_unit_number text, p_amount numeric, p_method text, p_reference text, p_date date default current_date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u units%rowtype;
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
     order by case type when 'monthly' then 0 when 'special_assessment' then 1 else 2 end, due_date, created_date
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
      perform fin_gl_post(p_tenant_id, p_date, format('Payment received - Unit %s', p_unit_number), '1010', '1110', v_to_balance, 'payment', p_reference);
      v_left := round(v_left - v_to_balance, 2);
    end if;
  end if;
  if v_left > 0 then
    perform fin_gl_post(p_tenant_id, p_date, format('Paid ahead - Unit %s', p_unit_number), '1010', '2020', v_left, 'payment', p_reference);
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

-- A Stripe Checkout tied to one invoice completed: settle that invoice.
create or replace function reconcile_unit_payment(p_stripe_session_id text, p_stripe_payment_intent_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv unit_invoices%rowtype;
  v_remaining numeric;
  v_gl text;
begin
  select * into inv from unit_invoices where stripe_checkout_session_id = p_stripe_session_id limit 1 for update;
  if not found then return jsonb_build_object('error', 'no invoice for this checkout session', 'session', p_stripe_session_id); end if;
  if inv.status in ('paid', 'void') then return jsonb_build_object('already', true, 'status', inv.status, 'invoice_id', inv.id); end if;
  v_remaining := round(inv.amount - coalesce(inv.paid_amount, 0), 2);
  if v_remaining <= 0 then return jsonb_build_object('already', true, 'invoice_id', inv.id); end if;
  v_gl := fin_settle_invoice(inv.id, v_remaining, 'stripe', current_date, 'stripe:' || p_stripe_session_id, p_stripe_payment_intent_id);
  update units
     set balance = round(balance - v_remaining, 2),
         payments = payments || jsonb_build_object('date', current_date::text, 'amount', v_remaining, 'method', 'stripe', 'note', 'Invoice ' || inv.id::text)
   where tenant_id = inv.tenant_id and number = inv.unit_number;
  return jsonb_build_object('invoice_id', inv.id, 'amount', v_remaining, 'gl_entry_id', v_gl);
end $$;

-- A paid charge was wrong: the money goes back (Dr income / Cr bank), whatever
-- was still open is cancelled, and the owner does not owe it again.
create or replace function refund_unit_invoice(p_invoice_id uuid, p_reason text, p_stripe_refund_id text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv unit_invoices%rowtype;
  v_paid numeric;
  v_remaining numeric;
  v_gl text;
  v_rev text;
  v_ar text;
begin
  select * into inv from unit_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('error', 'invoice not found'); end if;
  if inv.status = 'void' then return jsonb_build_object('already', true, 'invoice_id', inv.id); end if;
  v_paid := round(coalesce(inv.paid_amount, case when inv.status = 'paid' then inv.amount else 0 end), 2);
  if v_paid <= 0 then return jsonb_build_object('error', 'nothing paid on this invoice; void it instead'); end if;
  v_rev := fin_income_account(inv.type, inv.fund);
  v_ar := fin_ar_account(inv.type, inv.fund);
  v_gl := fin_gl_post(inv.tenant_id, current_date, format('Refund - Invoice %s Unit %s: %s', inv.id, inv.unit_number, coalesce(p_reason, 'Refund')),
                      v_rev, '1010', v_paid, 'refund', inv.unit_number);
  v_remaining := round(inv.amount - v_paid, 2);
  if v_remaining > 0 then
    perform fin_gl_post(inv.tenant_id, current_date, format('Void - Invoice %s Unit %s: %s', inv.id, inv.unit_number, coalesce(p_reason, 'Refund')),
                        v_rev, v_ar, v_remaining, case when inv.type in ('fee', 'amenity_fee') then 'fee' else 'assessment' end, inv.unit_number);
  end if;
  update unit_invoices
     set status = 'void', refund_amount = v_paid, refund_date = current_date, refund_reason = coalesce(p_reason, 'Refund'),
         refund_gl_entry_id = v_gl, stripe_refund_id = coalesce(p_stripe_refund_id, stripe_refund_id)
   where id = inv.id;
  update units u
     set balance = round(balance - greatest(0, v_remaining), 2),
         late_fees = coalesce((select jsonb_agg(case when f->>'invoiceId' = inv.id::text then f || '{"waived": true}'::jsonb else f end order by i)
                                 from jsonb_array_elements(u.late_fees) with ordinality as t(f, i)), '[]'::jsonb),
         special_assessments = coalesce((select jsonb_agg(a order by i)
                                 from jsonb_array_elements(u.special_assessments) with ordinality as t(a, i)
                                 where a->>'invoiceId' is distinct from inv.id::text), '[]'::jsonb)
   where u.tenant_id = inv.tenant_id and u.number = inv.unit_number;
  return jsonb_build_object('invoice_id', inv.id, 'refund_amount', v_paid, 'gl_entry_id', v_gl);
end $$;

-- Only the server (the webhook and the refund function, with the service key) calls these.
revoke all on function fin_gl_post(uuid, date, text, text, text, numeric, text, text) from public;
revoke all on function fin_settle_invoice(uuid, numeric, text, date, text, text) from public;
revoke all on function record_unit_payment(uuid, text, numeric, text, text, date) from public;
revoke all on function reconcile_unit_payment(text, text) from public;
revoke all on function refund_unit_invoice(uuid, text, text) from public;
grant execute on function fin_gl_post(uuid, date, text, text, text, numeric, text, text) to service_role;
grant execute on function fin_settle_invoice(uuid, numeric, text, date, text, text) to service_role;
grant execute on function record_unit_payment(uuid, text, numeric, text, text, date) to service_role;
grant execute on function reconcile_unit_payment(text, text) to service_role;
grant execute on function refund_unit_invoice(uuid, text, text) to service_role;
