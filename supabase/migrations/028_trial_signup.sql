-- ============================================================================
-- 028_trial_signup.sql
-- Trial-first signup: account-owner model, address verification, Setup Season,
-- invitations with board seats, sample data markers, trial lifecycle.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════
-- 1. Schema changes
-- ════════════════════════════════════════════════════════════════════

-- 1a. tenant_users: account owner + joined_at
ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS is_account_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_one_owner
  ON tenant_users (tenant_id) WHERE is_account_owner;

-- 1b. invitations: board seat key
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS role_key text
    CHECK (role_key IS NULL OR role_key IN (
      'president','vice_president','treasurer','secretary','member_at_large'
    ));

-- 1c. tenants: address verification + sample data marker
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mar_address_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS ssl text,
  ADD COLUMN IF NOT EXISTS ward text,
  ADD COLUMN IF NOT EXISTS address_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_flag text
    CHECK (address_flag IS NULL OR address_flag IN (
      'verified','not_condo','not_found','override','skip'
    )),
  ADD COLUMN IF NOT EXISTS sample_data_loaded_at timestamptz;

-- 1d. subscriptions: trial reminder tracking
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz;

-- 1e. is_sample marker on data tables
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE board_members
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE general_ledger
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE compliance_completions
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE legal_documents
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE insurance_policies
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE building_assets
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

-- 1f. ownership_transfers table
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id),
  to_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own tenant transfers" ON ownership_transfers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Owner manages transfers" ON ownership_transfers FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid() AND is_account_owner
  ));

CREATE POLICY "Transfer target can update" ON ownership_transfers FOR UPDATE
  USING (to_user_id = auth.uid());

CREATE POLICY "Admins manage transfers" ON ownership_transfers FOR ALL
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()));

-- 1g. address_lookups table (rate limiting for verify-address)
CREATE TABLE IF NOT EXISTS address_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE address_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for address_lookups" ON address_lookups FOR ALL
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- 2. Backfills
-- ════════════════════════════════════════════════════════════════════

-- 2a. joined_at: backfill from created_at
UPDATE tenant_users SET joined_at = created_at
WHERE joined_at = now() AND created_at < now() - interval '1 minute';

-- 2b. Account owner: set on earliest board_member per tenant, else earliest row
WITH ranked AS (
  SELECT id, tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY (role = 'board_member') DESC, created_at ASC
    ) AS rn
  FROM tenant_users
)
UPDATE tenant_users tu
SET is_account_owner = true
FROM ranked r
WHERE tu.id = r.id AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users t2
    WHERE t2.tenant_id = tu.tenant_id AND t2.is_account_owner
  );

-- ════════════════════════════════════════════════════════════════════
-- 3. Helper: board role label lookup
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION board_role_label(p_role_key text)
RETURNS text AS $$
BEGIN
  RETURN CASE p_role_key
    WHEN 'president' THEN 'President'
    WHEN 'vice_president' THEN 'Vice President'
    WHEN 'treasurer' THEN 'Treasurer'
    WHEN 'secretary' THEN 'Secretary'
    WHEN 'member_at_large' THEN 'Member at Large'
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 4. can_setup helper
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_setup(p_tenant_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND (is_account_owner OR role = 'board_member')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 5. settle_ownership
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION settle_ownership(p_tenant_id uuid)
RETURNS void AS $$
DECLARE
  v_current_owner record;
  v_new_owner_id uuid;
  v_reason text;
BEGIN
  -- Find current owner
  SELECT id, user_id, role, role_key
  INTO v_current_owner
  FROM tenant_users
  WHERE tenant_id = p_tenant_id AND is_account_owner
  LIMIT 1;

  -- Case 1: Current owner exists and is a board member — nothing to do
  IF v_current_owner IS NOT NULL AND v_current_owner.role = 'board_member' THEN
    RETURN;
  END IF;

  -- Case 2: Current owner is NOT a board member — find a president to hand off to
  IF v_current_owner IS NOT NULL AND v_current_owner.role != 'board_member' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 6. transfer_ownership
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transfer_ownership(p_tenant_id uuid, p_to_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_from record;
  v_to record;
  v_transfer_id uuid;
BEGIN
  -- Caller must be current owner
  SELECT id, user_id INTO v_from
  FROM tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND is_account_owner;

  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership';
  END IF;

  -- Target must be a board member
  SELECT id, user_id, role INTO v_to
  FROM tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_to_user_id AND role = 'board_member';

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Transfer target must be a board member of this building';
  END IF;

  -- Expire any pending transfers for this tenant
  UPDATE ownership_transfers
  SET status = 'expired', decided_at = now()
  WHERE tenant_id = p_tenant_id AND status = 'pending';

  -- Create transfer
  INSERT INTO ownership_transfers (tenant_id, from_user_id, to_user_id, status)
  VALUES (p_tenant_id, auth.uid(), p_to_user_id, 'pending')
  RETURNING id INTO v_transfer_id;

  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (p_tenant_id, auth.uid(), 'owner', 'board_member', 'ownership.transfer_initiated',
    p_to_user_id::text, format('Transfer ID: %s', v_transfer_id));

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 7. accept_ownership_transfer
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_ownership_transfer(p_transfer_id uuid)
RETURNS void AS $$
DECLARE
  v_xfer record;
BEGIN
  SELECT * INTO v_xfer
  FROM ownership_transfers
  WHERE id = p_transfer_id AND status = 'pending'
  FOR UPDATE;

  IF v_xfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found or no longer pending';
  END IF;

  IF v_xfer.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the transfer recipient can accept';
  END IF;

  -- Flip ownership
  UPDATE tenant_users SET is_account_owner = false
  WHERE tenant_id = v_xfer.tenant_id AND is_account_owner;

  UPDATE tenant_users SET is_account_owner = true
  WHERE tenant_id = v_xfer.tenant_id AND user_id = v_xfer.to_user_id;

  -- Mark transfer accepted
  UPDATE ownership_transfers
  SET status = 'accepted', decided_at = now()
  WHERE id = p_transfer_id;

  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (v_xfer.tenant_id, auth.uid(), 'new_owner', 'board_member', 'ownership.transfer_accepted',
    p_transfer_id::text,
    format('From %s to %s', v_xfer.from_user_id, v_xfer.to_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 8. mark_trial_expired
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mark_trial_expired(p_subscription_id text)
RETURNS void AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM subscriptions
  WHERE chargebee_subscription_id = p_subscription_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found: %', p_subscription_id;
  END IF;

  UPDATE subscriptions
  SET trial_expired_at = now(),
      status = 'canceled',
      chargebee_status = 'cancelled'
  WHERE chargebee_subscription_id = p_subscription_id;

  -- NOTE: Does NOT touch tenants.status — tenant remains accessible
  -- but gated by paywall on the client side.

  INSERT INTO audit_log (tenant_id, actor_name, actor_role, action, target, details)
  VALUES (v_tenant_id, 'system', 'system', 'subscription.trial_expired',
    p_subscription_id, 'Trial ended without payment method');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 9. get_my_membership
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_membership()
RETURNS TABLE (
  tenant_id uuid,
  role text,
  role_key text,
  is_account_owner boolean,
  unit text
) AS $$
BEGIN
  RETURN QUERY
  SELECT tu.tenant_id, tu.role::text, tu.role_key, tu.is_account_owner, tu.unit
  FROM tenant_users tu
  WHERE tu.user_id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 10. Replace provision_tenant — add new params, keep compatibility
-- ════════════════════════════════════════════════════════════════════

-- Drop existing overload
DROP FUNCTION IF EXISTS provision_tenant(text, jsonb, int, text, text, text, text, text, uuid, boolean, boolean, text, text, text, text, text);

CREATE OR REPLACE FUNCTION provision_tenant(
  p_name text,
  p_address jsonb,
  p_total_units int,
  p_year_built text,
  p_plan text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_user_id uuid,
  p_on_call boolean DEFAULT false,
  p_pm_seat boolean DEFAULT false,
  p_billing_interval text DEFAULT 'monthly',
  p_chargebee_customer_id text DEFAULT NULL,
  p_chargebee_subscription_id text DEFAULT NULL,
  p_board_title text DEFAULT 'President',
  p_subdomain text DEFAULT NULL,
  -- New HO-18 params
  p_role text DEFAULT 'board_member',
  p_role_key text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_mar_address_id text DEFAULT NULL,
  p_ssl text DEFAULT NULL,
  p_ward text DEFAULT NULL,
  p_address_flag text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_monthly_rate int;
  v_features jsonb;
  v_trial_end timestamptz;
  v_trial_days int;
  v_on_call_price int;
  v_board_title text;
  v_final_role text;
BEGIN
  -- Use user-chosen subdomain if provided and available, otherwise generate one
  IF p_subdomain IS NOT NULL AND p_subdomain != '' AND NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = p_subdomain) THEN
    v_subdomain := p_subdomain;
  ELSE
    v_subdomain := generate_subdomain(p_name);
  END IF;

  -- Get trial days from platform settings
  SELECT COALESCE(
    (SELECT (value::int) FROM platform_settings WHERE key = 'trial_days'),
    21
  ) INTO v_trial_days;

  -- Calculate rate: base plan + on_call + pm_seat
  v_monthly_rate := CASE p_plan
    WHEN 'self_managed' THEN 17900
    WHEN 'facilities' THEN 27900
    ELSE 17900
  END;

  IF p_on_call THEN
    v_on_call_price := CASE p_plan
      WHEN 'facilities' THEN 49900
      ELSE 24900
    END;
    v_monthly_rate := v_monthly_rate + v_on_call_price;
  END IF;

  IF p_pm_seat THEN
    v_monthly_rate := v_monthly_rate + 7900;
  END IF;

  v_trial_end := now() + (v_trial_days || ' days')::interval;

  v_features := plan_feature_defaults(p_plan, p_on_call, true);

  -- Derive board_title from role_key when available, else use p_board_title
  v_board_title := COALESCE(board_role_label(p_role_key), p_board_title, 'President');

  -- Determine actual role (validated)
  v_final_role := CASE
    WHEN p_role IN ('board_member','resident','property_manager') THEN p_role
    ELSE 'board_member'
  END;

  -- 1. Create tenant (with address verification fields)
  INSERT INTO tenants (name, subdomain, address, total_units, year_built, status,
    primary_contact_name, primary_contact_email, primary_contact_phone,
    chargebee_customer_id,
    mar_address_id, ssl, ward,
    address_verified_at, address_flag)
  VALUES (p_name, v_subdomain, p_address, p_total_units, p_year_built, 'onboarding',
    p_contact_name, p_contact_email, p_contact_phone,
    p_chargebee_customer_id,
    NULLIF(p_mar_address_id, ''), NULLIF(p_ssl, ''), NULLIF(p_ward, ''),
    CASE WHEN p_mar_address_id IS NOT NULL AND p_mar_address_id != '' THEN now() ELSE NULL END,
    NULLIF(p_address_flag, ''))
  RETURNING id INTO v_tenant_id;

  -- 2. Create subscription
  INSERT INTO subscriptions (tenant_id, tier, status, monthly_rate, trial_ends_at,
    current_period_start, current_period_end,
    chargebee_subscription_id, billing_interval,
    addon_on_call, pm_addon)
  VALUES (v_tenant_id, p_plan, 'trialing', v_monthly_rate, v_trial_end,
    now(), v_trial_end,
    p_chargebee_subscription_id, p_billing_interval,
    p_on_call, p_pm_seat);

  -- 3. Create feature flags
  INSERT INTO tenant_features (tenant_id,
    fiscal_lens, case_ops, compliance_runbook, ai_advisor, document_vault,
    payment_processing, votes_resolutions, community_portal, vendor_management, reserve_study_tools,
    facilities, on_call)
  VALUES (v_tenant_id,
    true, true, true, true, true, true, true, true, true, true,
    (v_features->>'facilities')::boolean,
    (v_features->>'on_call')::boolean);

  -- 4. Create onboarding checklist
  INSERT INTO onboarding_checklists (tenant_id, account_created, building_profile_complete)
  VALUES (v_tenant_id, true, (p_address->>'street') IS NOT NULL AND (p_address->>'street') != '');

  -- 5. Link signing-up user with ownership and role_key
  INSERT INTO tenant_users (tenant_id, user_id, role, board_title, role_key,
    is_account_owner, joined_at, status)
  VALUES (v_tenant_id, p_user_id, v_final_role::tenant_role, v_board_title, p_role_key,
    true, now(), 'active');

  -- 5b. If board_member, also insert board_members row
  IF v_final_role = 'board_member' THEN
    INSERT INTO board_members (tenant_id, name, role, email, role_key)
    VALUES (v_tenant_id,
      COALESCE(NULLIF(TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), ''), p_contact_name),
      v_board_title,
      p_contact_email,
      p_role_key);
  END IF;

  -- 6. Audit log
  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (v_tenant_id, p_user_id, p_contact_name, 'system', 'tenant.provisioned',
    p_name, format('Subdomain: %s.getonetwo.com | Plan: %s | Role: %s/%s | Trial ends: %s',
      v_subdomain, p_plan, v_final_role, COALESCE(p_role_key, 'none'), v_trial_end::date));

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'subdomain', v_subdomain,
    'plan', p_plan,
    'trial_ends_at', v_trial_end,
    'monthly_rate', v_monthly_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 11. Replace accept_invitation — with role_key and board_members
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_invitation(p_code text, p_user_id uuid, p_name text DEFAULT '')
RETURNS jsonb AS $$
DECLARE
  v_inv record;
  v_role_key text;
  v_board_title text;
  v_has_president boolean;
BEGIN
  SELECT * INTO v_inv FROM invitations
  WHERE code = upper(p_code) AND status = 'pending' AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Check if user already belongs to this tenant
  IF EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = v_inv.tenant_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already belong to this building');
  END IF;

  -- Determine role_key
  v_role_key := v_inv.role_key;

  -- If board member with no role_key and no president exists, assign president
  IF v_inv.role = 'board_member' AND v_role_key IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tenant_users
      WHERE tenant_id = v_inv.tenant_id AND role = 'board_member' AND role_key = 'president'
    ) INTO v_has_president;
    IF NOT v_has_president THEN
      v_role_key := 'president';
    END IF;
  END IF;

  -- Derive board_title from role_key
  v_board_title := board_role_label(v_role_key);

  -- Link user to tenant
  INSERT INTO tenant_users (tenant_id, user_id, role, unit, role_key, board_title, joined_at, status)
  VALUES (v_inv.tenant_id, p_user_id, v_inv.role, v_inv.unit, v_role_key, v_board_title, now(), 'active');

  -- Insert/update board_members row if board member
  IF v_inv.role = 'board_member' THEN
    INSERT INTO board_members (tenant_id, name, role, email, role_key)
    VALUES (v_inv.tenant_id,
      COALESCE(NULLIF(p_name, ''), v_inv.email),
      COALESCE(v_board_title, ''),
      v_inv.email,
      v_role_key);
  END IF;

  -- Mark invitation as accepted
  UPDATE invitations SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  -- Settle ownership (might transfer if a president just joined)
  PERFORM settle_ownership(v_inv.tenant_id);

  -- Audit log
  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (v_inv.tenant_id, p_user_id, COALESCE(NULLIF(p_name, ''), v_inv.email),
    v_inv.role::text, 'invitation.accepted', v_inv.email,
    format('Joined via invite code %s as %s (seat: %s)', v_inv.code, v_inv.role, COALESCE(v_role_key, 'none')));

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'role_key', v_role_key,
    'unit', v_inv.unit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ════════════════════════════════════════════════════════════════════
-- 12. RLS updates — can_setup alternative for invitations, tenants, etc.
-- ════════════════════════════════════════════════════════════════════

-- Invitations: allow can_setup users to manage (not just board_member role check)
DROP POLICY IF EXISTS "Board members manage invitations" ON invitations;
CREATE POLICY "Setup users manage invitations" ON invitations FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'board_member'
    )
    OR can_setup(tenant_id)
  );

-- Tenants: allow can_setup users to update
CREATE POLICY "Setup users update tenant" ON tenants FOR UPDATE
  USING (can_setup(id))
  WITH CHECK (can_setup(id));

-- Onboarding: allow can_setup to update
DROP POLICY IF EXISTS "Board updates onboarding" ON onboarding_checklists;
CREATE POLICY "Setup users update onboarding" ON onboarding_checklists FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'board_member'
    )
    OR can_setup(tenant_id)
  );

-- Units: allow can_setup for insert/update
CREATE POLICY "Setup users manage units" ON units FOR ALL
  USING (can_setup(tenant_id))
  WITH CHECK (can_setup(tenant_id));

-- Board members: allow can_setup for insert/update
CREATE POLICY "Setup users manage board_members" ON board_members FOR ALL
  USING (can_setup(tenant_id))
  WITH CHECK (can_setup(tenant_id));

-- Vendors: allow can_setup for insert/update
CREATE POLICY "Setup users manage vendors" ON vendors FOR ALL
  USING (can_setup(tenant_id))
  WITH CHECK (can_setup(tenant_id));
