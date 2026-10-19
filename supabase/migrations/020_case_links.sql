-- 020_case_links.sql
-- Add milestone and runbook linking columns to cases for the step engine.
-- These columns allow a CATS case to be linked back to the runbook milestone
-- or specific runbook item that spawned it.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS linked_runbook_item_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_milestone_id TEXT;

-- Index for quick lookup when buildSeasons checks for linked cases.
CREATE INDEX IF NOT EXISTS idx_cases_linked_milestone
  ON cases (linked_milestone_id)
  WHERE linked_milestone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_linked_runbook_item
  ON cases (linked_runbook_item_id)
  WHERE linked_runbook_item_id IS NOT NULL;
