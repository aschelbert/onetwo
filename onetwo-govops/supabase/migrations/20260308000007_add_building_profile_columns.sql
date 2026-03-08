-- Migration 7: Add building profile columns to tenancies

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS year_built text,
  ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'incorporated',
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS state text DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip text DEFAULT '';
