-- ─────────────────────────────────────────────────────────────────────────────
-- 040: link members to their units.
--
-- A member's unit (tenant_users.unit) decides what they reach as an owner:
-- their unit's documents and moves (037, 038), My Unit. It was set only when
-- an invitation named the unit, and nothing could change it afterwards (board
-- members can't update tenant_users). Now:
--
-- 1. set_member_unit(member, unit): a board member of the building (or a
--    platform admin) links a member to one of the building's units, or
--    clears it. The unit must exist; it's stored as the unit record spells it.
-- 2. Automatic linking by email: a member with no unit is linked to the unit
--    whose owner email is their sign-in email, when exactly one unit in the
--    building has it (an owner of several units is left for the board to
--    pick). It happens when they join (however they joined), when a unit's
--    owner email is saved or changed, and once now for existing members.
-- ─────────────────────────────────────────────────────────────────────────────

-- The one unit in a building whose owner email is this email, if there is exactly one.
create or replace function public.unit_for_email(p_tenant_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select min(u.number)
  from public.units u
  where u.tenant_id = p_tenant_id
    and nullif(trim(p_email), '') is not null
    and lower(trim(u.email)) = lower(trim(p_email))
  having count(*) = 1
$$;
revoke all on function public.unit_for_email(uuid, text) from public, anon, authenticated;

-- 1 · The board links a member to a unit (or clears it).
create or replace function public.set_member_unit(p_member_id uuid, p_unit text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_unit text;
begin
  select * into v_member from public.tenant_users where id = p_member_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Member not found');
  end if;

  if not (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id and tu.role = 'board_member' and tu.status = 'active')
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then
    return jsonb_build_object('success', false, 'error', 'Only the board can link members to units');
  end if;

  if nullif(trim(p_unit), '') is not null then
    select u.number into v_unit from public.units u
    where u.tenant_id = v_member.tenant_id and lower(trim(u.number)) = lower(trim(p_unit));
    if v_unit is null then
      return jsonb_build_object('success', false, 'error', format('Unit %s isn''t in this building', p_unit));
    end if;
  end if;

  update public.tenant_users set unit = v_unit where id = p_member_id;

  insert into public.audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_member.tenant_id, auth.uid(),
    coalesce((select nullif(tu.name, '') from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'Board'),
    coalesce((select tu.role::text from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'platform_admin'),
    'member.unit_linked', p_member_id::text,
    case when v_unit is null then 'Unit cleared' else format('Linked to unit %s', v_unit) end);

  return jsonb_build_object('success', true, 'unit', v_unit);
end;
$$;
revoke all on function public.set_member_unit(uuid, text) from public, anon;
grant execute on function public.set_member_unit(uuid, text) to authenticated;

-- 2a · A member who joins with no unit is linked by their sign-in email.
create or replace function public.link_new_member_to_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unit is null or trim(new.unit) = '' then
    new.unit := public.unit_for_email(new.tenant_id, (select u.email from auth.users u where u.id = new.user_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_new_member_to_unit on public.tenant_users;
create trigger trg_link_new_member_to_unit
  before insert on public.tenant_users
  for each row execute function public.link_new_member_to_unit();

-- 2b · Saving a unit's owner email links the member with that email, if they have no unit yet.
create or replace function public.link_unit_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
begin
  if nullif(trim(new.email), '') is null then
    return new;
  end if;
  v_unit := public.unit_for_email(new.tenant_id, new.email);
  if v_unit is null then
    return new; -- the email owns several units here: the board picks
  end if;
  update public.tenant_users tu set unit = v_unit
  from auth.users au
  where tu.tenant_id = new.tenant_id
    and au.id = tu.user_id
    and (tu.unit is null or trim(tu.unit) = '')
    and lower(trim(au.email)) = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_link_unit_owner_member on public.units;
create trigger trg_link_unit_owner_member
  after insert or update of email on public.units
  for each row execute function public.link_unit_owner_member();

-- 2c · Once now: existing members with no unit.
update public.tenant_users tu
set unit = public.unit_for_email(tu.tenant_id, au.email)
from auth.users au
where au.id = tu.user_id
  and (tu.unit is null or trim(tu.unit) = '')
  and public.unit_for_email(tu.tenant_id, au.email) is not null;
