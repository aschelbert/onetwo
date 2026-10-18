-- 025_tiers.sql
-- Adds new tiers (essentials, board, estate), pm_addon, limit columns on tenant_features,
-- maps legacy tiers to new ones, and ensures no existing tenant loses features.

-- ════════════════════════════════════════════════════════════════════
-- 1. Convert subscriptions.tier from enum to text + CHECK
-- ════════════════════════════════════════════════════════════════════

-- Drop the default first so we can alter the column type
ALTER TABLE subscriptions ALTER COLUMN tier DROP DEFAULT;

-- Convert enum column to text
ALTER TABLE subscriptions
  ALTER COLUMN tier TYPE text USING tier::text;

-- Add CHECK constraint allowing both new and legacy tier ids
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_tier_check CHECK (
    tier IN ('essentials', 'board', 'estate', 'pm_addon',
             'compliance_pro', 'community_plus', 'management_suite')
  );

-- Set new default
ALTER TABLE subscriptions ALTER COLUMN tier SET DEFAULT 'essentials';

-- Also update provision_tenant function parameter type: drop and recreate
-- (handled below after all schema changes)

-- ════════════════════════════════════════════════════════════════════
-- 2. Add pm_addon and notes columns to subscriptions
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pm_addon boolean NOT NULL DEFAULT false;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS notes text;

-- ════════════════════════════════════════════════════════════════════
-- 3. Add limit columns to tenant_features
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS max_units int,
  ADD COLUMN IF NOT EXISTS max_asset_classes int,
  ADD COLUMN IF NOT EXISTS postal_mode text CHECK (postal_mode IN ('per_letter', 'included')),
  ADD COLUMN IF NOT EXISTS postal_allowance int;

-- ════════════════════════════════════════════════════════════════════
-- 4. Map legacy tiers to new tiers
--    compliance_pro with <=10 units -> essentials
--    compliance_pro with >10 units  -> board
--    community_plus                 -> board
--    management_suite               -> estate
-- ════════════════════════════════════════════════════════════════════

-- First, identify tenants whose current features would be reduced under new tier.
-- We grant them the higher tier for 90 days with a note.
-- compliance_pro tenants that have vendor_management=true would lose it under essentials.
-- community_plus tenants that have reserve_study_tools=true would lose it under board.

-- Tag tenants that would lose features (vendor_management on compliance_pro -> essentials)
UPDATE subscriptions s
SET tier = 'board',
    notes = 'Grandfathered: was compliance_pro with vendor_management enabled. Board tier granted for 90 days from migration.'
FROM tenants t
JOIN tenant_features tf ON tf.tenant_id = t.id
WHERE t.id = s.tenant_id
  AND s.tier = 'compliance_pro'
  AND t.total_units <= 10
  AND tf.vendor_management = true;

-- Tag tenants that would lose features (reserve_study_tools on community_plus -> board)
UPDATE subscriptions s
SET tier = 'estate',
    notes = 'Grandfathered: was community_plus with reserve_study_tools enabled. Estate tier granted for 90 days from migration.'
FROM tenants t
JOIN tenant_features tf ON tf.tenant_id = t.id
WHERE t.id = s.tenant_id
  AND s.tier = 'community_plus'
  AND tf.reserve_study_tools = true;

-- Now map the remaining un-noted legacy tiers
UPDATE subscriptions s
SET tier = CASE
  WHEN s.tier = 'compliance_pro' AND t.total_units <= 10 THEN 'essentials'
  WHEN s.tier = 'compliance_pro' THEN 'board'
  WHEN s.tier = 'community_plus' THEN 'board'
  WHEN s.tier = 'management_suite' THEN 'estate'
  ELSE s.tier
END
FROM tenants t
WHERE t.id = s.tenant_id
  AND s.tier IN ('compliance_pro', 'community_plus', 'management_suite')
  AND s.notes IS NULL;

-- Mark pm_addon for former management_suite tenants
UPDATE subscriptions
SET pm_addon = true
WHERE tier = 'estate';

-- ════════════════════════════════════════════════════════════════════
-- 5. Set tenant_features limits based on new tier
-- ════════════════════════════════════════════════════════════════════

-- Essentials limits
UPDATE tenant_features tf
SET max_units = 10,
    max_asset_classes = 1,
    postal_mode = 'per_letter',
    postal_allowance = NULL,
    -- Ensure new feature matrix: essentials gets votes_resolutions, community_portal, etc.
    fiscal_lens = true,
    case_ops = true,
    compliance_runbook = true,
    ai_advisor = true,
    document_vault = true,
    payment_processing = true,
    votes_resolutions = true,
    community_portal = true,
    vendor_management = COALESCE(tf.vendor_management, false),
    reserve_study_tools = false
FROM subscriptions s
WHERE s.tenant_id = tf.tenant_id
  AND s.tier = 'essentials'
  AND s.notes IS NULL;

-- Board limits
UPDATE tenant_features tf
SET max_units = 100,
    max_asset_classes = 5,
    postal_mode = 'included',
    postal_allowance = 100,
    fiscal_lens = true,
    case_ops = true,
    compliance_runbook = true,
    ai_advisor = true,
    document_vault = true,
    payment_processing = true,
    votes_resolutions = true,
    community_portal = true,
    vendor_management = true,
    reserve_study_tools = COALESCE(tf.reserve_study_tools, false)
FROM subscriptions s
WHERE s.tenant_id = tf.tenant_id
  AND s.tier = 'board'
  AND s.notes IS NULL;

-- Estate limits
UPDATE tenant_features tf
SET max_units = NULL,
    max_asset_classes = NULL,
    postal_mode = 'included',
    postal_allowance = NULL,
    fiscal_lens = true,
    case_ops = true,
    compliance_runbook = true,
    ai_advisor = true,
    document_vault = true,
    payment_processing = true,
    votes_resolutions = true,
    community_portal = true,
    vendor_management = true,
    reserve_study_tools = true
FROM subscriptions s
WHERE s.tenant_id = tf.tenant_id
  AND s.tier = 'estate';

-- Grandfathered tenants: keep their existing features, just add limits
UPDATE tenant_features tf
SET max_units = CASE WHEN s.tier = 'board' THEN 100 ELSE NULL END,
    max_asset_classes = CASE WHEN s.tier = 'board' THEN 5 ELSE NULL END,
    postal_mode = CASE WHEN s.tier IN ('board', 'estate') THEN 'included' ELSE 'per_letter' END,
    postal_allowance = CASE WHEN s.tier = 'board' THEN 100 ELSE NULL END
FROM subscriptions s
WHERE s.tenant_id = tf.tenant_id
  AND s.notes IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════
-- 6. Update monthly rates to new pricing
-- ════════════════════════════════════════════════════════════════════

UPDATE subscriptions SET monthly_rate = 7900 WHERE tier = 'essentials' AND notes IS NULL;
UPDATE subscriptions SET monthly_rate = 19900 WHERE tier = 'board' AND notes IS NULL;
UPDATE subscriptions SET monthly_rate = 39900 WHERE tier = 'estate';

-- ════════════════════════════════════════════════════════════════════
-- 7. Update tier_feature_defaults function to handle new tiers
--    Use text parameter instead of enum
-- ════════════════════════════════════════════════════════════════════

-- Drop the old function that uses the enum type
DROP FUNCTION IF EXISTS tier_feature_defaults(subscription_tier);

CREATE OR REPLACE FUNCTION tier_feature_defaults(t text)
RETURNS jsonb AS $$
BEGIN
  CASE t
    WHEN 'essentials' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":true,"community_portal":true,"vendor_management":false,"reserve_study_tools":false,"max_units":10,"max_asset_classes":1,"postal_mode":"per_letter","postal_allowance":null}'::jsonb;
    WHEN 'board' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":true,"community_portal":true,"vendor_management":true,"reserve_study_tools":false,"max_units":100,"max_asset_classes":5,"postal_mode":"included","postal_allowance":100}'::jsonb;
    WHEN 'estate' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":true,"community_portal":true,"vendor_management":true,"reserve_study_tools":true,"max_units":null,"max_asset_classes":null,"postal_mode":"included","postal_allowance":null}'::jsonb;
    -- Legacy tiers map to nearest new tier
    WHEN 'compliance_pro' THEN
      RETURN tier_feature_defaults('essentials');
    WHEN 'community_plus' THEN
      RETURN tier_feature_defaults('board');
    WHEN 'management_suite' THEN
      RETURN tier_feature_defaults('estate');
    ELSE
      RETURN tier_feature_defaults('essentials');
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 8. Update provision_tenant to use text tier parameter
-- ════════════════════════════════════════════════════════════════════

-- Drop old function with enum parameter
DROP FUNCTION IF EXISTS provision_tenant(text, jsonb, int, text, subscription_tier, text, text, text, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION provision_tenant(
  p_name text,
  p_address jsonb,
  p_total_units int,
  p_year_built text,
  p_tier text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_user_id uuid,
  p_stripe_customer_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_board_title text DEFAULT 'President',
  p_subdomain text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_monthly_rate int;
  v_features jsonb;
  v_trial_end timestamptz;
BEGIN
  -- Use user-chosen subdomain if provided and available, otherwise generate one
  IF p_subdomain IS NOT NULL AND p_subdomain != '' AND NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = p_subdomain) THEN
    v_subdomain := p_subdomain;
  ELSE
    v_subdomain := generate_subdomain(p_name);
  END IF;

  -- Set monthly rate based on tier (cents)
  v_monthly_rate := CASE p_tier
    WHEN 'essentials' THEN 7900
    WHEN 'board' THEN 19900
    WHEN 'estate' THEN 39900
    WHEN 'compliance_pro' THEN 7900
    WHEN 'community_plus' THEN 19900
    WHEN 'management_suite' THEN 39900
    ELSE 7900
  END;

  -- Trial ends in 30 days
  v_trial_end := now() + interval '30 days';

  -- Get feature defaults for this tier
  v_features := tier_feature_defaults(p_tier);

  -- 1. Create tenant
  INSERT INTO tenants (name, subdomain, address, total_units, year_built, status,
    primary_contact_name, primary_contact_email, primary_contact_phone,
    stripe_customer_id, stripe_subscription_id)
  VALUES (p_name, v_subdomain, p_address, p_total_units, p_year_built, 'onboarding',
    p_contact_name, p_contact_email, p_contact_phone,
    p_stripe_customer_id, p_stripe_subscription_id)
  RETURNING id INTO v_tenant_id;

  -- 2. Create subscription
  INSERT INTO subscriptions (tenant_id, tier, status, monthly_rate, trial_ends_at,
    current_period_start, current_period_end, stripe_subscription_id)
  VALUES (v_tenant_id, p_tier, 'trialing', v_monthly_rate, v_trial_end,
    now(), v_trial_end, p_stripe_subscription_id);

  -- 3. Create feature flags from tier defaults
  INSERT INTO tenant_features (tenant_id,
    fiscal_lens, case_ops, compliance_runbook, ai_advisor, document_vault,
    payment_processing, votes_resolutions, community_portal, vendor_management, reserve_study_tools,
    max_units, max_asset_classes, postal_mode, postal_allowance)
  VALUES (v_tenant_id,
    (v_features->>'fiscal_lens')::boolean, (v_features->>'case_ops')::boolean,
    (v_features->>'compliance_runbook')::boolean, (v_features->>'ai_advisor')::boolean,
    (v_features->>'document_vault')::boolean, (v_features->>'payment_processing')::boolean,
    (v_features->>'votes_resolutions')::boolean, (v_features->>'community_portal')::boolean,
    (v_features->>'vendor_management')::boolean, (v_features->>'reserve_study_tools')::boolean,
    (v_features->>'max_units')::int, (v_features->>'max_asset_classes')::int,
    v_features->>'postal_mode', (v_features->>'postal_allowance')::int);

  -- 4. Create onboarding checklist
  INSERT INTO onboarding_checklists (tenant_id, account_created, building_profile_complete)
  VALUES (v_tenant_id, true, (p_address->>'street') IS NOT NULL AND (p_address->>'street') != '');

  -- 5. Link signing-up user as board member
  INSERT INTO tenant_users (tenant_id, user_id, role, board_title, status)
  VALUES (v_tenant_id, p_user_id, 'board_member', p_board_title, 'active');

  -- 6. Audit log
  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (v_tenant_id, p_user_id, p_contact_name, 'system', 'tenant.provisioned',
    p_name, format('Subdomain: %s.getonetwo.com | Tier: %s | Trial ends: %s',
      v_subdomain, p_tier, v_trial_end::date));

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'subdomain', v_subdomain,
    'tier', p_tier,
    'trial_ends_at', v_trial_end,
    'monthly_rate', v_monthly_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 9. Drop the old subscription_tier enum (no longer used)
-- ════════════════════════════════════════════════════════════════════
-- We can safely drop it since we converted the column to text
DROP TYPE IF EXISTS subscription_tier;
