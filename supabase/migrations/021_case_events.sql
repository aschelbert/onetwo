-- 021_case_events.sql
-- Add `kind` column to case_communications for timeline event types
-- (notes, uploads, calls, status changes, etc.)

ALTER TABLE case_communications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note'
  CHECK (kind IN ('note', 'upload', 'call', 'status_change', 'email', 'letter', 'meeting_ref'));
