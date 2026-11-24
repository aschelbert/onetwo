-- ============================================================================
-- ONE two HOA - Owners can read the record of upkeep visits
-- ============================================================================
-- Each time a scheduled maintenance task is done, the visit is kept in one
-- standing record of kind 'upkeep' (what was due, when it was done, by whom,
-- what it cost). Building › Upkeep draws the year from it. Members could
-- already read 'utilities', 'objectives', 'reserve-plan' and 'budget-year';
-- this adds 'upkeep', so an owner sees the same year the board does.
-- Inspections themselves stay with the board and the manager.
-- ============================================================================
drop policy if exists "Members read the building's own figures" on public.action_records;
create policy "Members read the building's own figures" on public.action_records for select to authenticated
  using (
    kind in ('utilities', 'objectives', 'reserve-plan', 'budget-year', 'upkeep')
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id)
  );
