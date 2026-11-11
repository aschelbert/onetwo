-- ============================================================================
-- ONE two HOA - A step's checklist is kept with the step
-- ============================================================================
-- Every step of an action has a checklist to work through: the one written
-- for it, or one made from the step's own words (src/features/issues/
-- stepGuide.ts). Until now the ticks lived only in the browser, so they were
-- gone on the next visit or for the next board member. case_steps.checks
-- holds the list as an array of
--   { id, label, checked, checkedDate, note?, attachment? }
-- (the note is what someone wrote for an item: "List the open seats"). A step
-- with no saved list (older steps, and the ones the scheduled runbooks open)
-- gets its list when it is loaded, and it is saved on the first tick or note.
-- Access is the table's own: the policies on case_steps already cover it.
-- ============================================================================

alter table public.case_steps add column if not exists checks jsonb;
