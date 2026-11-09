-- ============================================================================
-- 047: every building gets a chart of accounts
--
-- The default chart used to live only in the browser. A building with no rows
-- in chart_of_accounts showed an empty chart, ledger entries with no account
-- names, an empty "Where things post" mapping and a red tie check, although
-- its postings were fine. seed_chart_of_accounts writes the default chart for
-- one building (rows it already has are left alone), the backfill below runs
-- it for every building that has no accounts, and a trigger runs it for each
-- building created from now on. The app does the same on load (loadFromDb)
-- for a browser that reaches a building before this migration has.
-- ============================================================================

create or replace function seed_chart_of_accounts(p_tenant_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into chart_of_accounts (tenant_id, num, name, type, sub, parent, fund)
  select p_tenant_id, d.num, d.name, d.type, d.sub, d.parent,
         case when d.num in ('1020', '1120', '3020', '4020', '4040') or d.num like '6%' then 'reserve' end
    from (values
    ('1000', 'Assets', 'asset', 'header', null),
    ('1010', 'Operating Checking', 'asset', 'bank', '1000'),
    ('1020', 'Reserve Savings', 'asset', 'bank', '1000'),
    ('1030', 'Petty Cash', 'asset', 'bank', '1000'),
    ('1100', 'Accounts Receivable', 'asset', 'receivable', '1000'),
    ('1110', 'Assessments Receivable', 'asset', 'receivable', '1100'),
    ('1120', 'Special Assessments Receivable', 'asset', 'receivable', '1100'),
    ('1130', 'Late Fees Receivable', 'asset', 'receivable', '1100'),
    ('1140', 'Insurance Claims Receivable', 'asset', 'receivable', '1100'),
    ('1200', 'Prepaid Expenses', 'asset', 'prepaid', '1000'),
    ('2000', 'Liabilities', 'liability', 'header', null),
    ('2010', 'Accounts Payable', 'liability', 'payable', '2000'),
    ('2020', 'Prepaid Assessments', 'liability', 'deferred', '2000'),
    ('2030', 'Security Deposits Held', 'liability', 'deposit', '2000'),
    ('2040', 'Accrued Expenses', 'liability', 'accrued', '2000'),
    ('3000', 'Equity', 'equity', 'header', null),
    ('3010', 'Operating Fund Balance', 'equity', 'fund', '3000'),
    ('3020', 'Reserve Fund Balance', 'equity', 'fund', '3000'),
    ('3030', 'Retained Surplus / (Deficit)', 'equity', 'retained', '3000'),
    ('4000', 'Income', 'income', 'header', null),
    ('4010', 'Regular Assessments', 'income', 'assessment', '4000'),
    ('4020', 'Special Assessments', 'income', 'assessment', '4000'),
    ('4030', 'Late Fees', 'income', 'fee', '4000'),
    ('4040', 'Interest Income', 'income', 'interest', '4000'),
    ('4050', 'Move-In/Move-Out Fees', 'income', 'fee', '4000'),
    ('4060', 'Amenity Rental Income', 'income', 'fee', '4000'),
    ('4070', 'Fines & Penalties', 'income', 'fee', '4000'),
    ('4080', 'Insurance Proceeds', 'income', 'other', '4000'),
    ('4090', 'Other Income', 'income', 'other', '4000'),
    ('5000', 'Operating Expenses', 'expense', 'header', null),
    ('5010', 'Maintenance & Repairs', 'expense', 'operating', '5000'),
    ('5020', 'Utilities', 'expense', 'operating', '5000'),
    ('5030', 'Landscaping', 'expense', 'operating', '5000'),
    ('5040', 'Insurance', 'expense', 'operating', '5000'),
    ('5050', 'Management Fees', 'expense', 'operating', '5000'),
    ('5060', 'Legal & Professional', 'expense', 'operating', '5000'),
    ('5070', 'Administrative', 'expense', 'operating', '5000'),
    ('5080', 'Security', 'expense', 'operating', '5000'),
    ('5090', 'Cleaning & Janitorial', 'expense', 'operating', '5000'),
    ('5100', 'Pest Control', 'expense', 'operating', '5000'),
    ('5200', 'Wages & Salaries', 'expense', 'operating', '5000'),
    ('5210', 'Contract Labor', 'expense', 'operating', '5000'),
    ('6000', 'Reserve Expenses', 'expense', 'header', null),
    ('6010', 'Roof Replacement', 'expense', 'reserve', '6000'),
    ('6020', 'HVAC System', 'expense', 'reserve', '6000'),
    ('6030', 'Elevator Modernization', 'expense', 'reserve', '6000'),
    ('6040', 'Parking Lot Resurfacing', 'expense', 'reserve', '6000'),
    ('6050', 'Contingency', 'expense', 'reserve', '6000')
  ) as d(num, name, type, sub, parent)
  on conflict (tenant_id, num) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function seed_chart_of_accounts(uuid) from public;
grant execute on function seed_chart_of_accounts(uuid) to service_role;

-- Each new building starts with the chart.
create or replace function seed_chart_of_accounts_for_new_tenant()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_chart_of_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_chart_of_accounts on tenants;
create trigger trg_seed_chart_of_accounts
  after insert on tenants
  for each row execute function seed_chart_of_accounts_for_new_tenant();

-- Buildings that exist with no accounts get the chart now. A section a board
-- added by hand is kept; a building that already has accounts is left alone.
do $$
declare
  t record;
begin
  for t in
    select id from tenants tn
     where not exists (select 1 from chart_of_accounts c where c.tenant_id = tn.id and c.parent is not null)
  loop
    perform seed_chart_of_accounts(t.id);
  end loop;
end;
$$;
