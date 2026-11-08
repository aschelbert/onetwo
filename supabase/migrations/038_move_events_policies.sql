-- ─────────────────────────────────────────────────────────────────────────────
-- 038: move events (move-ins and move-outs) that anyone can actually use.
--
-- The move_events policies matched request.jwt.claims ->> 'tenant_id', a claim
-- no sign-in token carries (there is no access-token hook), so no one could
-- read, schedule or update a move. Same fix as unit_documents in 037.
--
-- Access now follows membership (tenant_users):
--   - Board members and property managers of the building: every move
--     (schedule, update deposit, access, inspection and insurance, delete).
--   - An owner or resident (tenant_users.unit): reads their unit's moves and
--     reports a move for their unit. What the board settles (deposit,
--     access, inspection, insurance) starts pending and stays the board's.
--   - Platform admins: everything.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists move_events_board_all on public.move_events;
drop policy if exists move_events_resident_select on public.move_events;

drop policy if exists "Team manages moves" on public.move_events;
create policy "Team manages moves" on public.move_events for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = move_events.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = move_events.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Owners see their unit's moves" on public.move_events;
create policy "Owners see their unit's moves" on public.move_events for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = move_events.tenant_id
        and lower(trim(tu.unit)) = lower(trim(move_events.unit_number))
    )
  );

drop policy if exists "Owners report a move for their unit" on public.move_events;
create policy "Owners report a move for their unit" on public.move_events for insert to authenticated
  with check (
    coalesce(deposit_status, 'pending') = 'pending'
    and coalesce(access_status, 'pending') = 'pending'
    and coalesce(inspection_status, 'pending') = 'pending'
    and not coalesce(insurance_confirmed, false)
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = move_events.tenant_id
        and lower(trim(tu.unit)) = lower(trim(move_events.unit_number))
    )
  );
