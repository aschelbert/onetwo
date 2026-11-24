-- ============================================================================
-- ONE two HOA - Who posted an entry, and who handled a bill
-- ============================================================================
-- general_ledger.posted_by: the name of the person who posted the entry, or
--   the automatic job that did ('Billing run'). Null on entries from before.
-- work_orders.people: { raisedBy, approvedBy, paidBy }, for the rule that a
--   bill needs two people (Funds › Accounts and ledger › Who can do what).
--
-- The app writes both and carries on without them on a database that has not
-- had this migration yet.
-- ============================================================================
alter table public.general_ledger add column if not exists posted_by text;
alter table public.work_orders add column if not exists people jsonb;
