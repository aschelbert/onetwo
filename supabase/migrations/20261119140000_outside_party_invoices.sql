-- ============================================================================
-- Invoices to vendors and outside parties
-- ============================================================================
-- An invoice was always a charge to a unit. A building also bills people who
-- are not units: a vendor for damage, an insurer, a contractor. Such an
-- invoice has type 'other', an empty unit_number, and names who it bills in
-- payer_name / payer_email. It is owed under Other Receivables (1150) and is
-- Other Income (4090), never part of a unit's balance. The functions that post
-- an online payment or a refund already work without a unit (their unit
-- updates match no row); they only need to know the two accounts.
-- ============================================================================

alter table unit_invoices
  add column if not exists payer_name text,
  add column if not exists payer_email text;

comment on column unit_invoices.unit_number is 'The unit charged; empty on an invoice to a vendor or outside party (type other), which names payer_name instead.';

-- Every building that has a chart of accounts gets the account these post to.
insert into chart_of_accounts (tenant_id, num, name, type, sub, parent)
select distinct c.tenant_id, '1150', 'Other Receivables', 'asset', 'receivable', '1100'
  from chart_of_accounts c
on conflict (tenant_id, num) do nothing;

-- The app's defaults, now with the two accounts for outside invoices.
create or replace function fin_mapping(p_tenant uuid)
returns jsonb language sql stable set search_path = public as $$
  select '{"bankAccount":"1010","assessmentsReceivable":"1110","specialAssessmentsReceivable":"1120","lateFeeReceivable":"1130",
           "regularAssessmentRevenue":"4010","specialAssessmentRevenue":"4020","lateFeeRevenue":"4030","amenityRevenue":"4060",
           "otherReceivable":"1150","otherRevenue":"4090",
           "prepaidAssessments":"2020","accountsPayable":"2010","reserveBankAccount":"1020",
           "operatingFundBalance":"3010","reserveFundBalance":"3020"}'::jsonb
         || coalesce((select gl_account_mapping from financial_settings where tenant_id = p_tenant), '{}'::jsonb)
$$;

create or replace function fin_ar_account(p_type text, p_fund text, p_map jsonb)
returns text language sql immutable as $$
  select case
    when p_type = 'other' then coalesce(p_map->>'otherReceivable', '1150')
    when p_type in ('fee', 'amenity_fee') then p_map->>'lateFeeReceivable'
    when p_type = 'special_assessment' and p_fund = 'operating' then p_map->>'assessmentsReceivable'
    when p_type = 'special_assessment' then p_map->>'specialAssessmentsReceivable'
    else p_map->>'assessmentsReceivable'
  end
$$;

create or replace function fin_income_account(p_type text, p_fund text, p_map jsonb)
returns text language sql immutable as $$
  select case
    when p_type = 'other' then coalesce(p_map->>'otherRevenue', '4090')
    when p_type = 'fee' then p_map->>'lateFeeRevenue'
    when p_type = 'amenity_fee' then p_map->>'amenityRevenue'
    when p_type = 'special_assessment' and p_fund = 'operating' then p_map->>'regularAssessmentRevenue'
    when p_type = 'special_assessment' then p_map->>'specialAssessmentRevenue'
    else p_map->>'regularAssessmentRevenue'
  end
$$;
