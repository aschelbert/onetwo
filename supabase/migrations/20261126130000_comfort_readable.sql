-- ============================================================================
-- ONE two HOA - Owners can read the heat and hot water readings
-- ============================================================================
-- The rules the board set for heat and hot water, and every reading taken,
-- are kept in one standing record of kind 'comfort'. Building › Upkeep shows
-- it. Members could already read 'utilities', 'objectives', 'reserve-plan',
-- 'budget-year' and 'upkeep'; this adds 'comfort', so an owner sees the same
-- readings the board does. Writing stays with the board and the manager.
-- ============================================================================
drop policy if exists "Members read the building's own figures" on public.action_records;
create policy "Members read the building's own figures" on public.action_records for select to authenticated
  using (
    kind in ('utilities', 'objectives', 'reserve-plan', 'budget-year', 'upkeep', 'comfort')
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id)
  );
