-- ============================================================================
-- ONE two HOA - Accommodation requests: private to the board
-- ============================================================================
-- A request for an accommodation because of a disability is the most private
-- thing the app holds. Three kinds of action record are involved:
--
--   accommodation           The board's record. No unit number on the row, so
--                           the "Owners read records about their unit" rule
--                           never shows it to anyone.
--   accommodation-ask       What the resident wrote, and where it stands. It
--                           carries their unit, so they can read it; they may
--                           also create it.
--   accommodation-settings  The board's target for deciding, and whether the
--                           manager may see these.
--
-- Until now the board and the property manager could do everything on every
-- action record. This adds a restrictive rule for these kinds: board members
-- always; the property manager only while the board's setting says so; the
-- people in the unit, for their own ask.
-- ============================================================================

-- Whether the manager may see accommodation requests in a building. Runs as
-- the owner so the rule below can read the setting without looping back
-- through the same table's rules.
create or replace function public.accommodation_manager_allowed(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (data ->> 'managerSees')::boolean
    from public.action_records
    where tenant_id = p_tenant and kind = 'accommodation-settings'
    limit 1
  ), false);
$$;
revoke all on function public.accommodation_manager_allowed(uuid) from public;
grant execute on function public.accommodation_manager_allowed(uuid) to authenticated;

drop policy if exists "Accommodation requests are private to the board" on public.action_records;
create policy "Accommodation requests are private to the board" on public.action_records as restrictive for all to authenticated
  using (
    kind not in ('accommodation', 'accommodation-ask', 'accommodation-settings')
    or exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role = 'board_member')
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    or (
      kind in ('accommodation', 'accommodation-ask')
      and public.accommodation_manager_allowed(action_records.tenant_id)
      and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role = 'property_manager')
    )
    or (
      kind = 'accommodation-ask'
      and exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id
          and nullif(trim(tu.unit), '') is not null
          and lower(trim(tu.unit)) = lower(trim(action_records.unit_number))
      )
    )
  )
  with check (
    kind not in ('accommodation', 'accommodation-ask', 'accommodation-settings')
    or exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role = 'board_member')
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    or (
      kind in ('accommodation', 'accommodation-ask')
      and public.accommodation_manager_allowed(action_records.tenant_id)
      and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id and tu.role = 'property_manager')
    )
    or (
      kind = 'accommodation-ask'
      and exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id
          and nullif(trim(tu.unit), '') is not null
          and lower(trim(tu.unit)) = lower(trim(action_records.unit_number))
      )
    )
  );

-- A resident may make a request for their own unit. Reading it back is
-- already covered by "Owners read records about their unit".
drop policy if exists "Residents ask for an accommodation" on public.action_records;
create policy "Residents ask for an accommodation" on public.action_records for insert to authenticated
  with check (
    kind = 'accommodation-ask'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = action_records.tenant_id
        and nullif(trim(tu.unit), '') is not null
        and lower(trim(tu.unit)) = lower(trim(action_records.unit_number))
    )
  );
