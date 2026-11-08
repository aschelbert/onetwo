-- ============================================================================
-- ONE two HOA - Funds accounting
-- ============================================================================
-- Fund accounting (ASC 972): every account belongs to the operating fund or
-- the reserve fund; the books can be closed through a date; a work order
-- remembers the accrual entry posted when its invoice arrived.
-- ============================================================================

alter table chart_of_accounts
  add column if not exists fund text
    check (fund in ('operating', 'reserve'));

alter table financial_settings
  add column if not exists closed_through date,
  add column if not exists auto_reserve_transfer boolean not null default true;

alter table work_orders
  add column if not exists accrual_gl_entry_id text;

-- A special assessment names its fund; a late fee names the dues invoice it
-- was charged for, so the billing run charges it once.
alter table unit_invoices
  add column if not exists fund text check (fund in ('operating', 'reserve')),
  add column if not exists for_invoice_id text;

-- The reserve bank account, special assessments, interest and the 6000s are
-- the reserve fund's unless a building says otherwise.
update chart_of_accounts
   set fund = 'reserve'
 where fund is null
   and (num in ('1020', '1120', '3020', '4020', '4040') or num like '6%');
