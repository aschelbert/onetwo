-- ============================================================================
-- ONE two HOA - A policy's deductible, and what was read from an owner's policy
-- ============================================================================
-- insurance_policies.deductible: what the association pays first on a claim,
--   as written on the policy ("$25,000"). Building › Insurance shows and edits it.
-- unit_documents.details: for an insurance document, what was read from the
--   file and confirmed by a person: { carrier, policyNum, expires, confirmedBy,
--   confirmedOn }. The board tracks owners' policies by the expiry kept here.
--   An owner sets it when uploading (the existing insert policy covers that);
--   the board and the manager can correct it (the existing "Team manages unit
--   documents" policy covers that).
--
-- The app writes both and carries on without them on a database that has not
-- had this migration yet.
-- ============================================================================
alter table public.insurance_policies add column if not exists deductible text;
alter table public.unit_documents add column if not exists details jsonb;
