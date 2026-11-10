-- ============================================================================
-- ONE two HOA - The month close runbook has a start day
-- ============================================================================
-- The month close runbook opens its case for the month just ended on this
-- day of each month (the 1st by default). A building on an off-cycle fiscal
-- calendar, or one whose bank statement lands late, moves it. The in-app
-- trigger reads it (src/ux2/boardroom/monthClose.ts); it is stored with the
-- other billing settings so every board member's browser agrees on the day.
-- ============================================================================

alter table financial_settings
  add column if not exists month_close_start_day smallint not null default 1
    check (month_close_start_day between 1 and 28);
