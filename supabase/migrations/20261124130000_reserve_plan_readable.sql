-- ============================================================================
-- ONE two HOA - Owners can read the reserve plan's assumptions
-- ============================================================================
-- Percent funded on Building › Goals and Funds › Planning is worked out from
-- the reserve items and the plan's assumptions (inflation, interest, growth),
-- which are kept as one standing record of kind 'reserve-plan'. Members could
-- already read the kinds 'utilities' and 'objectives'; this adds the plan, so
-- an owner sees the same figure the board does. Reviews themselves
-- ('reserve-review') stay with the board and the manager.
-- ============================================================================
drop policy if exists "Members read the building's own figures" on public.action_records;
create policy "Members read the building's own figures" on public.action_records for select to authenticated
  using (
    kind in ('utilities', 'objectives', 'reserve-plan')
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id)
  );
