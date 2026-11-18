-- Board members say which seat they hold; joining never depends on a seat.
--
-- An invitation can name someone as a board member without naming a seat.
-- accept_invitation() then guessed: president if the building had none. The
-- guess was often wrong, and the person had no way to correct it, because
-- only platform admins can update tenant_users. Now:
--
--   accept_invitation(): a board invite with no seat joins with no seat. A
--     seat named on the invite is kept as before.
--   set_my_board_seat(building, seat): a board member sets their own seat
--     from My Account. President, Vice President, Treasurer and Secretary are
--     held by one person each, so a seat someone else holds is refused with
--     that person's name. Member at Large and Director are open to any number.
--     The board directory row (board_members) follows, and ownership is
--     settled again because it can follow the president.
--
-- Director has no role_key (the check constraint lists the five keyed seats);
-- it is recorded as board_title 'Director'. A null board_title on a board
-- member means the seat has not been confirmed yet.

create or replace function public.accept_invitation(p_code text, p_user_id uuid, p_name text default ''::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inv record;
  v_role_key text;
  v_board_title text;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'You can only accept an invitation for yourself');
  end if;

  select * into v_inv from invitations
  where code = upper(p_code) and status = 'pending' and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  end if;

  if exists (select 1 from tenant_users where tenant_id = v_inv.tenant_id and user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'You already belong to this building');
  end if;

  -- The seat is whatever the invite names; with none, the member confirms it
  -- themselves afterwards (set_my_board_seat).
  v_role_key := case when v_inv.role = 'board_member' then v_inv.role_key else null end;
  v_board_title := board_role_label(v_role_key);

  insert into tenant_users (tenant_id, user_id, role, unit, role_key, board_title, joined_at, status)
  values (v_inv.tenant_id, p_user_id, v_inv.role, v_inv.unit, v_role_key, v_board_title, now(), 'active');

  if v_inv.role = 'board_member' then
    insert into board_members (tenant_id, name, role, email, role_key)
    values (v_inv.tenant_id,
      coalesce(nullif(p_name, ''), v_inv.email),
      coalesce(v_board_title, ''),
      v_inv.email,
      v_role_key);
  end if;

  update invitations set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  perform settle_ownership(v_inv.tenant_id);

  insert into audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_inv.tenant_id, p_user_id, coalesce(nullif(p_name, ''), v_inv.email),
    v_inv.role::text, 'invitation.accepted', v_inv.email,
    format('Joined via invite code %s as %s (seat: %s)', v_inv.code, v_inv.role, coalesce(v_role_key, 'none')));

  return jsonb_build_object(
    'success', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'role_key', v_role_key,
    'unit', v_inv.unit
  );
end;
$function$;

create or replace function public.set_my_board_seat(p_tenant_id uuid, p_seat text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.tenant_users;
  v_seat text := lower(trim(coalesce(p_seat, '')));
  v_role_key text;
  v_title text;
  v_holder text;
  v_email text;
  v_name text;
begin
  select * into v_me from public.tenant_users
  where tenant_id = p_tenant_id and user_id = auth.uid()
  for update;
  if not found or v_me.role <> 'board_member' then
    return jsonb_build_object('success', false, 'error', 'Only board members have a board position');
  end if;

  if v_seat = 'director' then
    v_role_key := null;
    v_title := 'Director';
  elsif v_seat in ('president', 'vice_president', 'treasurer', 'secretary', 'member_at_large') then
    v_role_key := v_seat;
    v_title := public.board_role_label(v_seat);
  else
    return jsonb_build_object('success', false, 'error', 'That isn''t a board position');
  end if;

  -- One person per officer seat.
  if v_role_key in ('president', 'vice_president', 'treasurer', 'secretary') then
    select coalesce(nullif(tu.name, ''), u.email, 'Another member') into v_holder
    from public.tenant_users tu
    left join auth.users u on u.id = tu.user_id
    where tu.tenant_id = p_tenant_id and tu.role = 'board_member'
      and tu.role_key = v_role_key and tu.id <> v_me.id
    limit 1;
    if found then
      return jsonb_build_object('success', false, 'error',
        format('%s is the %s. They change their position first, then you can take this one.', v_holder, v_title));
    end if;
  end if;

  update public.tenant_users set role_key = v_role_key, board_title = v_title where id = v_me.id;

  -- The board directory row for this person follows, or is added.
  select u.email, coalesce(nullif(v_me.name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), u.email)
  into v_email, v_name
  from auth.users u where u.id = v_me.user_id;

  update public.board_members set role = v_title, role_key = v_role_key
  where tenant_id = p_tenant_id and lower(email) = lower(v_email);
  if not found then
    insert into public.board_members (tenant_id, name, role, email, role_key)
    values (p_tenant_id, v_name, v_title, v_email, v_role_key);
  end if;

  insert into public.audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (p_tenant_id, auth.uid(), v_name, 'board_member', 'member.board_seat_confirmed', v_me.id::text,
    format('%s → %s', coalesce(v_me.board_title, 'not confirmed'), v_title));

  perform public.settle_ownership(p_tenant_id);

  return jsonb_build_object('success', true, 'role_key', v_role_key, 'board_title', v_title);
end;
$$;
revoke all on function public.set_my_board_seat(uuid, text) from public, anon;
grant execute on function public.set_my_board_seat(uuid, text) to authenticated, service_role;
