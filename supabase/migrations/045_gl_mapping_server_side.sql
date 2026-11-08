-- ============================================================================
-- ONE two HOA - "Where things post" is saved, and the server honours it
-- ============================================================================
-- The per-building account mapping (which account is the operating bank,
-- dues owed, late fee income, …) lived only in the browser. It is now saved
-- on financial_settings, and the database functions that post online
-- payments and refunds read it, with the app's defaults as the fallback, so
-- a building that remaps an account gets the same accounts from both sides.
-- ============================================================================

alter table financial_settings
  add column if not exists gl_account_mapping jsonb;

-- The defaults the app ships with, merged with what the building saved.
create or replace function fin_mapping(p_tenant uuid)
returns jsonb language sql stable set search_path = public as $$
  select '{"bankAccount":"1010","assessmentsReceivable":"1110","specialAssessmentsReceivable":"1120","lateFeeReceivable":"1130",
           "regularAssessmentRevenue":"4010","specialAssessmentRevenue":"4020","lateFeeRevenue":"4030","amenityRevenue":"4060",
           "prepaidAssessments":"2020","accountsPayable":"2010","reserveBankAccount":"1020",
           "operatingFundBalance":"3010","reserveFundBalance":"3020"}'::jsonb
         || coalesce((select gl_account_mapping from financial_settings where tenant_id = p_tenant), '{}'::jsonb)
$$;

drop function if exists fin_ar_account(text, text);
drop function if exists fin_income_account(text, text);

create or replace function fin_ar_account(p_type text, p_fund text, p_map jsonb)
returns text language sql immutable as $$
  select case
    when p_type in ('fee', 'amenity_fee') then p_map->>'lateFeeReceivable'
    when p_type = 'special_assessment' and p_fund = 'operating' then p_map->>'assessmentsReceivable'
    when p_type = 'special_assessment' then p_map->>'specialAssessmentsReceivable'
    else p_map->>'assessmentsReceivable'
  end
$$;

create or replace function fin_income_account(p_type text, p_fund text, p_map jsonb)
returns text language sql immutable as $$
  select case
    when p_type = 'fee' then p_map->>'lateFeeRevenue'
    when p_type = 'amenity_fee' then p_map->>'amenityRevenue'
    when p_type = 'special_assessment' and p_fund = 'operating' then p_map->>'regularAssessmentRevenue'
    when p_type = 'special_assessment' then p_map->>'specialAssessmentRevenue'
    else p_map->>'regularAssessmentRevenue'
  end
$$;

create or replace function fin_settle_invoice(
  p_invoice_id uuid, p_take numeric, p_method text, p_date date, p_source_id text, p_intent text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv unit_invoices%rowtype;
  m jsonb;
  v_gl text;
  v_paid numeric;
  v_full boolean;
begin
  select * into inv from unit_invoices where id = p_invoice_id for update;
  if not found or p_take is null or p_take <= 0 then return null; end if;
  m := fin_mapping(inv.tenant_id);
  v_gl := fin_gl_post(inv.tenant_id, p_date, format('Payment received - Invoice %s Unit %s', inv.id, inv.unit_number),
                      m->>'bankAccount', fin_ar_account(inv.type, inv.fund, m), p_take, 'payment', coalesce(p_source_id, inv.unit_number));
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

create or replace function record_unit_payment(
  p_tenant_id uuid, p_unit_number text, p_amount numeric, p_method text, p_reference text, p_date date default current_date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u units%rowtype;
  m jsonb := fin_mapping(p_tenant_id);
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

-- reconcile_unit_payment is unchanged in shape; it posts through fin_settle_invoice, which now reads the mapping.

create or replace function refund_unit_invoice(p_invoice_id uuid, p_reason text, p_stripe_refund_id text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv unit_invoices%rowtype;
  m jsonb;
  v_paid numeric;
  v_remaining numeric;
  v_gl text;
  v_rev text;
  v_ar text;
begin
  select * into inv from unit_invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('error', 'invoice not found'); end if;
  if inv.status = 'void' then return jsonb_build_object('already', true, 'invoice_id', inv.id); end if;
  m := fin_mapping(inv.tenant_id);
  v_paid := round(coalesce(inv.paid_amount, case when inv.status = 'paid' then inv.amount else 0 end), 2);
  if v_paid <= 0 then return jsonb_build_object('error', 'nothing paid on this invoice; void it instead'); end if;
  v_rev := fin_income_account(inv.type, inv.fund, m);
  v_ar := fin_ar_account(inv.type, inv.fund, m);
  v_gl := fin_gl_post(inv.tenant_id, current_date, format('Refund - Invoice %s Unit %s: %s', inv.id, inv.unit_number, coalesce(p_reason, 'Refund')),
                      v_rev, m->>'bankAccount', v_paid, 'refund', inv.unit_number);
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

revoke all on function fin_mapping(uuid) from public;
revoke all on function fin_ar_account(text, text, jsonb) from public;
revoke all on function fin_income_account(text, text, jsonb) from public;
grant execute on function fin_mapping(uuid) to service_role;
grant execute on function fin_ar_account(text, text, jsonb) to service_role;
grant execute on function fin_income_account(text, text, jsonb) to service_role;
