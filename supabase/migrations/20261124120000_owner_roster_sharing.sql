-- ============================================================================
-- ONE two HOA - The board decides what owners see of each other
-- ============================================================================
-- Migration 20261123120000 made other owners' contact details and money
-- private. Some associations want more openness, so this puts the choice with
-- the board, building by building:
--
--   owners_see_balances  every member sees every unit's current balance
--   owners_see_contacts  every member sees every unit's email and phone
--
-- Both start off. Whatever the board chooses, a member never sees another
-- unit's payment history, late fees, special assessments, move-in date or
-- payment-processor id: units_for_member() blanks those as before.
-- The board and the manager see everything, and staff keep contact details.
-- ============================================================================

alter table public.financial_settings add column if not exists owners_see_balances boolean not null default false;
alter table public.financial_settings add column if not exists owners_see_contacts boolean not null default false;

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
  v_balances boolean;
  v_contacts boolean;
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

  select coalesce(fs.owners_see_balances, false), coalesce(fs.owners_see_contacts, false) into v_balances, v_contacts
  from public.financial_settings fs where fs.tenant_id = p_tenant_id;
  v_balances := coalesce(v_balances, false);
  v_contacts := coalesce(v_contacts, false) or v_role = 'staff';

  return query
    select (case
      when lower(trim(u.number)) = v_unit then u
      else jsonb_populate_record(u,
        jsonb_build_object(
          'payments', '[]'::jsonb, 'late_fees', '[]'::jsonb,
          'special_assessments', '[]'::jsonb, 'stripe_customer_id', null, 'move_in', null)
        || case when v_balances then '{}'::jsonb else jsonb_build_object('balance', 0) end
        || case when v_contacts then '{}'::jsonb else jsonb_build_object('email', '', 'phone', '') end)
    end).*
    from public.units u
    where u.tenant_id = p_tenant_id
    order by u.number;
end;
$$;
revoke all on function public.units_for_member(uuid) from public, anon;
grant execute on function public.units_for_member(uuid) to authenticated;
