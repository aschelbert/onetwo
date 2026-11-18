-- settle_ownership() gave a building a second owner when the first had no seat.
--
-- It tested "v_current_owner IS NOT NULL" on a row variable, which Postgres
-- answers true only when every field is non-null. An owner whose role_key is
-- null (a board member with no officer seat) therefore read as "no owner", the
-- function fell through to assigning one, and the update hit the unique index
-- tenant_users_one_owner. accept_invitation() calls this, so nobody could
-- accept an invitation to such a building. Ask FOUND instead.

create or replace function public.settle_ownership(p_tenant_id uuid)
RETURNS void AS $$
DECLARE
  v_current_owner record;
  v_new_owner_id uuid;
  v_reason text;
  v_has_owner boolean;
BEGIN
  -- Find current owner
  SELECT id, user_id, role, role_key
  INTO v_current_owner
  FROM tenant_users
  WHERE tenant_id = p_tenant_id AND is_account_owner
  LIMIT 1;
  v_has_owner := FOUND;

  -- Case 1: Current owner exists and is a board member — nothing to do
  IF v_has_owner AND v_current_owner.role = 'board_member' THEN
    RETURN;
  END IF;

  -- Case 2: Current owner is NOT a board member — find a president to hand off to
  IF v_has_owner AND v_current_owner.role != 'board_member' THEN
    SELECT user_id INTO v_new_owner_id
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND role = 'board_member' AND role_key = 'president'
    LIMIT 1;

    IF v_new_owner_id IS NOT NULL THEN
      UPDATE tenant_users SET is_account_owner = false
      WHERE id = v_current_owner.id;
      UPDATE tenant_users SET is_account_owner = true
      WHERE tenant_id = p_tenant_id AND user_id = v_new_owner_id;

      INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
      VALUES (p_tenant_id, v_new_owner_id, 'system', 'system', 'ownership.auto_transfer',
        v_new_owner_id::text, 'Owner was not a board member; transferred to president');
      RETURN;
    END IF;
    -- No president — current owner stays
    RETURN;
  END IF;

  -- Case 3: No owner at all — assign by priority
  -- President
  SELECT user_id INTO v_new_owner_id
  FROM tenant_users
  WHERE tenant_id = p_tenant_id AND role = 'board_member' AND role_key = 'president'
  LIMIT 1;
  v_reason := 'Assigned to president (no previous owner)';

  -- Treasurer
  IF v_new_owner_id IS NULL THEN
    SELECT user_id INTO v_new_owner_id
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND role = 'board_member' AND role_key = 'treasurer'
    LIMIT 1;
    v_reason := 'Assigned to treasurer (no president)';
  END IF;

  -- Earliest board member
  IF v_new_owner_id IS NULL THEN
    SELECT user_id INTO v_new_owner_id
    FROM tenant_users
    WHERE tenant_id = p_tenant_id AND role = 'board_member'
    ORDER BY joined_at ASC
    LIMIT 1;
    v_reason := 'Assigned to earliest board member';
  END IF;

  -- Earliest any role
  IF v_new_owner_id IS NULL THEN
    SELECT user_id INTO v_new_owner_id
    FROM tenant_users
    WHERE tenant_id = p_tenant_id
    ORDER BY joined_at ASC
    LIMIT 1;
    v_reason := 'Assigned to earliest member (no board members)';
  END IF;

  IF v_new_owner_id IS NOT NULL THEN
    UPDATE tenant_users SET is_account_owner = true
    WHERE tenant_id = p_tenant_id AND user_id = v_new_owner_id;

    INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
    VALUES (p_tenant_id, v_new_owner_id, 'system', 'system', 'ownership.auto_assign',
      v_new_owner_id::text, v_reason);
  END IF;
END;
$$ language plpgsql security definer set search_path = public;
