-- ============================================================================
-- ONE two HOA - Owners can read each year's adopted budget
-- ============================================================================
-- A fiscal year's budget is kept as one standing record of kind 'budget-year':
-- the lines as adopted, any amendment with its reason, and what was spent once
-- the year is over. Members could already read 'utilities', 'objectives' and
-- 'reserve-plan'; this adds the budget years, so an owner can read this year's
-- adopted budget and the years before it. Writing stays with the board and
-- the manager.
-- ============================================================================
drop policy if exists "Members read the building's own figures" on public.action_records;
create policy "Members read the building's own figures" on public.action_records for select to authenticated
  using (
    kind in ('utilities', 'objectives', 'reserve-plan', 'budget-year')
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id)
  );
