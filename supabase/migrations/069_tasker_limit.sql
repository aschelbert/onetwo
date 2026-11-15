-- ============================================================================
-- ONE two HOA - The building's limit for Tasker jobs
-- ============================================================================
-- The most one Tasker job (Book a Tasker on an action, see 068_tasker_jobs)
-- may cost before the board votes on it. A board member or the manager books
-- anything up to it; above it, the board records a vote on the action first.
-- It sits with the building's other money rules in financial_settings, so the
-- whole board works to the same limit; the app changes it under Funds ›
-- Settings › Billing rules and from the Tasker panel on an action. The app
-- keeps it at or below the bylaws spending limit (above which owners vote).
--
-- Additive: existing buildings get the $300 default. financial_settings'
-- existing policies cover the new column.
-- ============================================================================

alter table public.financial_settings
  add column if not exists tasker_limit numeric(10,2) not null default 300;

alter table public.financial_settings
  drop constraint if exists financial_settings_tasker_limit_check;
alter table public.financial_settings
  add constraint financial_settings_tasker_limit_check check (tasker_limit >= 0);
