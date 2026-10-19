-- 024_remove_v2_flags.sql
-- Remove v2_* feature flag columns from tenant_features.
-- Precondition: all tenants have been on v2 for at least one week.
-- These flags are no longer read by the application; v2 is the only path.

ALTER TABLE tenant_features
  DROP COLUMN IF EXISTS v2_home,
  DROP COLUMN IF EXISTS v2_drawers,
  DROP COLUMN IF EXISTS v2_board_room,
  DROP COLUMN IF EXISTS v2_fiscal_lens,
  DROP COLUMN IF EXISTS v2_cases,
  DROP COLUMN IF EXISTS v2_building;

-- Mark board_tasks table as deprecated.
-- DO NOT DROP the table in this migration; schedule removal after 30-day grace period.
COMMENT ON TABLE board_tasks IS 'DEPRECATED: migrated to cases. Scheduled for removal after 30-day grace period.';
