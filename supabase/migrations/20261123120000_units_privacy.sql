-- Owners no longer read each other's contact details and balances.
--
-- "Users see own tenant units" let any member of a building select every unit
-- row: every owner's email, phone, balance, payment history and late fees.
-- "Users see own tenant unit invoices" did the same for invoices.
--
-- Access now follows the member's role (tenant_users):
--   - Board members, property managers and platform admins: every unit and
--     every unit invoice, as before.
--   - Any other member (owner, resident, staff): their own unit's row and
--     their own unit's invoices (tenant_users.unit).
--
-- The building's roster is still shared: units_for_member() returns every
-- unit, with the private fields blanked on the units that are not the
-- caller's. Staff keep each unit's phone and email, which they need to reach
-- a resident about a repair, and lose the money fields like everyone else.

create or replace function public.is_building_team(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = p_tenant_id
        and tu.role in ('board_member', 'property_manager')
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
$$;
revoke all on function public.is_building_team(uuid) from public, anon;
grant execute on function public.is_building_team(uuid) to authenticated;

-- ── units ────────────────────────────────────────────────────────────────────
drop policy if exists "Users see own tenant units" on public.units;

drop policy if exists "Team sees every unit" on public.units;
create policy "Team sees every unit" on public.units for select to authenticated
  using (public.is_building_team(tenant_id));

drop policy if exists "Members see their own unit" on public.units;
create policy "Members see their own unit" on public.units for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = units.tenant_id
        and nullif(trim(tu.unit), '') is not null
        and lower(trim(tu.unit)) = lower(trim(units.number))
    )
  );

-- ── unit invoices ────────────────────────────────────────────────────────────
drop policy if exists "Users see own tenant unit invoices" on public.unit_invoices;

drop policy if exists "Team sees every unit invoice" on public.unit_invoices;
create policy "Team sees every unit invoice" on public.unit_invoices for select to authenticated
  using (public.is_building_team(tenant_id));

drop policy if exists "Members see their own unit's invoices" on public.unit_invoices;
create policy "Members see their own unit's invoices" on public.unit_invoices for select to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = unit_invoices.tenant_id
        and nullif(trim(tu.unit), '') is not null
        and lower(trim(tu.unit)) = lower(trim(unit_invoices.unit_number))
    )
  );

-- ── the roster every member may read ─────────────────────────────────────────
create or replace function public.units_for_member(p_tenant_id uuid)
returns setof public.units
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_unit text;
begin
  if public.is_building_team(p_tenant_id) then
    return query select u.* from public.units u where u.tenant_id = p_tenant_id order by u.number;
    return;
  end if;

  select tu.role::text, nullif(lower(trim(tu.unit)), '') into v_role, v_unit
  from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.tenant_id = p_tenant_id
  limit 1;
  if not found then
    return;  -- not a member of this building: nothing
  end if;

  return query
    select (case
      when lower(trim(u.number)) = v_unit then u
      else jsonb_populate_record(u,
        jsonb_build_object(
          'balance', 0, 'payments', '[]'::jsonb, 'late_fees', '[]'::jsonb,
          'special_assessments', '[]'::jsonb, 'stripe_customer_id', null, 'move_in', null)
        || case when v_role = 'staff' then '{}'::jsonb else jsonb_build_object('email', '', 'phone', '') end)
    end).*
    from public.units u
    where u.tenant_id = p_tenant_id
    order by u.number;
end;
$$;
revoke all on function public.units_for_member(uuid) from public, anon;
grant execute on function public.units_for_member(uuid) to authenticated;
