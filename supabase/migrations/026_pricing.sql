-- 026_pricing.sql
-- Migrates from 3-tier (essentials/board/estate) to 2-plan (self_managed/facilities)
-- with modular add-ons (On Call, PM seat, Setup). Billing moves to Chargebee.
-- Stripe stays for owner payments, payroll, and postage.

-- ════════════════════════════════════════════════════════════════════
-- 0. Snapshot reserve_study_tools BEFORE anything else touches data
-- ════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _snapshot_rst AS
SELECT tenant_id, reserve_study_tools
FROM tenant_features;

-- ════════════════════════════════════════════════════════════════════
-- 1. Schema changes
-- ════════════════════════════════════════════════════════════════════

-- 1a. Expand tier CHECK to include new plan ids
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_tier_check CHECK (
    tier IN ('self_managed', 'facilities',
             'essentials', 'board', 'estate', 'pm_addon',
             'compliance_pro', 'community_plus', 'management_suite')
  );

-- 1b. Add new columns to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS addon_on_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_amount int,
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS chargebee_subscription_id text,
  ADD COLUMN IF NOT EXISTS chargebee_plan_price_id text,
  ADD COLUMN IF NOT EXISTS chargebee_status text;

-- 1c. Rename invoices.stripe_invoice_id → provider_invoice_id (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'stripe_invoice_id'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN stripe_invoice_id TO provider_invoice_id;
  END IF;
END $$;

-- 1d. Add chargebee_customer_id to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS chargebee_customer_id text;

-- 1e. Add facilities and on_call columns to tenant_features
ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS facilities boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_call boolean NOT NULL DEFAULT false;

-- 1f. Create chargebee_webhook_events table
CREATE TABLE IF NOT EXISTS chargebee_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'success', 'failed')),
  tenant_id uuid REFERENCES tenants(id),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE chargebee_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read chargebee events"
  ON chargebee_webhook_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid() AND status = 'active')
  );

-- ════════════════════════════════════════════════════════════════════
-- 2. Guard monthly_rate (ensure cents, not dollars)
-- ════════════════════════════════════════════════════════════════════

UPDATE subscriptions
SET monthly_rate = monthly_rate * 100
WHERE monthly_rate < 1000;

-- ════════════════════════════════════════════════════════════════════
-- 3. Core flags: set all 10 existing feature flags to true
-- ════════════════════════════════════════════════════════════════════

UPDATE tenant_features
SET fiscal_lens = true,
    case_ops = true,
    compliance_runbook = true,
    ai_advisor = true,
    document_vault = true,
    payment_processing = true,
    votes_resolutions = true,
    community_portal = true,
    vendor_management = true,
    reserve_study_tools = true;

-- Alter defaults so new rows also get true
ALTER TABLE tenant_features
  ALTER COLUMN fiscal_lens SET DEFAULT true,
  ALTER COLUMN case_ops SET DEFAULT true,
  ALTER COLUMN compliance_runbook SET DEFAULT true,
  ALTER COLUMN ai_advisor SET DEFAULT true,
  ALTER COLUMN document_vault SET DEFAULT true,
  ALTER COLUMN payment_processing SET DEFAULT true,
  ALTER COLUMN votes_resolutions SET DEFAULT true,
  ALTER COLUMN community_portal SET DEFAULT true,
  ALTER COLUMN vendor_management SET DEFAULT true,
  ALTER COLUMN reserve_study_tools SET DEFAULT true;

-- ════════════════════════════════════════════════════════════════════
-- 4. Tier remap using CTE with role checks + snapshot
-- ════════════════════════════════════════════════════════════════════

WITH remap AS (
  SELECT
    s.tenant_id,
    CASE
      WHEN s.tier IN ('estate', 'management_suite') THEN 'facilities'
      WHEN s.tier = 'board' AND (
        EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.tenant_id = s.tenant_id AND tu.role = 'staff')
        OR COALESCE((SELECT rst.reserve_study_tools FROM _snapshot_rst rst WHERE rst.tenant_id = s.tenant_id), false)
      ) THEN 'facilities'
      ELSE 'self_managed'
    END AS new_plan,
    CASE
      WHEN s.pm_addon THEN true
      WHEN EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.tenant_id = s.tenant_id AND tu.role = 'property_manager') THEN true
      ELSE false
    END AS new_pm_addon
  FROM subscriptions s
)
UPDATE subscriptions s
SET tier = r.new_plan,
    pm_addon = r.new_pm_addon
FROM remap r
WHERE s.tenant_id = r.tenant_id;

-- ════════════════════════════════════════════════════════════════════
-- 5. Recalculate monthly_rate
-- ════════════════════════════════════════════════════════════════════

UPDATE subscriptions
SET monthly_rate = CASE tier
    WHEN 'self_managed' THEN 17900
    WHEN 'facilities' THEN 27800
    ELSE 17900
  END
  + CASE WHEN pm_addon THEN 7900 ELSE 0 END;

-- ════════════════════════════════════════════════════════════════════
-- 6. Set tenant_features.facilities from remapped tier
-- ════════════════════════════════════════════════════════════════════

UPDATE tenant_features tf
SET facilities = (s.tier = 'facilities')
FROM subscriptions s
WHERE s.tenant_id = tf.tenant_id;

-- ════════════════════════════════════════════════════════════════════
-- 7. Drop tier_feature_defaults, create plan_feature_defaults
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS tier_feature_defaults(text);

CREATE OR REPLACE FUNCTION plan_feature_defaults(p_plan text, p_on_call boolean DEFAULT false)
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'fiscal_lens', true,
    'case_ops', true,
    'compliance_runbook', true,
    'ai_advisor', true,
    'document_vault', true,
    'payment_processing', true,
    'votes_resolutions', true,
    'community_portal', true,
    'vendor_management', true,
    'reserve_study_tools', true,
    'facilities', (p_plan = 'facilities'),
    'on_call', p_on_call
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 8. Replace provision_tenant with new signature
-- ════════════════════════════════════════════════════════════════════

-- Drop all existing overloads
DROP FUNCTION IF EXISTS provision_tenant(text, jsonb, int, text, text, text, text, text, uuid, text, text, text, text);

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
  p_subdomain text DEFAULT NULL
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
    30
  ) INTO v_trial_days;

  -- Calculate rate: base plan + on_call + pm_seat
  v_monthly_rate := CASE p_plan
    WHEN 'self_managed' THEN 17900
    WHEN 'facilities' THEN 27800
    ELSE 17900
  END;

  -- On Call pricing depends on plan
  IF p_on_call THEN
    v_on_call_price := CASE p_plan
      WHEN 'facilities' THEN 49900
      ELSE 24900
    END;
    v_monthly_rate := v_monthly_rate + v_on_call_price;
  END IF;

  -- PM seat
  IF p_pm_seat THEN
    v_monthly_rate := v_monthly_rate + 7900;
  END IF;

  -- Trial end
  v_trial_end := now() + (v_trial_days || ' days')::interval;

  -- Feature defaults
  v_features := plan_feature_defaults(p_plan, p_on_call);

  -- 1. Create tenant
  INSERT INTO tenants (name, subdomain, address, total_units, year_built, status,
    primary_contact_name, primary_contact_email, primary_contact_phone,
    chargebee_customer_id)
  VALUES (p_name, v_subdomain, p_address, p_total_units, p_year_built, 'onboarding',
    p_contact_name, p_contact_email, p_contact_phone,
    p_chargebee_customer_id)
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

  -- 3. Create feature flags from plan defaults
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

  -- 5. Link signing-up user as board member
  INSERT INTO tenant_users (tenant_id, user_id, role, board_title, status)
  VALUES (v_tenant_id, p_user_id, 'board_member', p_board_title, 'active');

  -- 6. Audit log
  INSERT INTO audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  VALUES (v_tenant_id, p_user_id, p_contact_name, 'system', 'tenant.provisioned',
    p_name, format('Subdomain: %s.getonetwo.com | Plan: %s | On Call: %s | PM: %s | Trial ends: %s',
      v_subdomain, p_plan, p_on_call, p_pm_seat, v_trial_end::date));

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'subdomain', v_subdomain,
    'plan', p_plan,
    'trial_ends_at', v_trial_end,
    'monthly_rate', v_monthly_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 9. Create link_chargebee_subscription
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION link_chargebee_subscription(
  p_tenant_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_plan text,
  p_on_call boolean,
  p_pm_seat boolean,
  p_interval text,
  p_status text,
  p_trial_ends_at timestamptz DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_monthly_rate int;
BEGIN
  -- Calculate rate
  v_monthly_rate := CASE p_plan
    WHEN 'self_managed' THEN 17900
    WHEN 'facilities' THEN 27800
    ELSE 17900
  END;

  IF p_on_call THEN
    v_monthly_rate := v_monthly_rate + CASE p_plan
      WHEN 'facilities' THEN 49900
      ELSE 24900
    END;
  END IF;

  IF p_pm_seat THEN
    v_monthly_rate := v_monthly_rate + 7900;
  END IF;

  -- Update tenant
  UPDATE tenants
  SET chargebee_customer_id = p_customer_id
  WHERE id = p_tenant_id;

  -- Update subscription
  UPDATE subscriptions
  SET tier = p_plan,
      chargebee_subscription_id = p_subscription_id,
      chargebee_status = p_status,
      billing_interval = p_interval,
      addon_on_call = p_on_call,
      pm_addon = p_pm_seat,
      monthly_rate = v_monthly_rate,
      status = CASE
        WHEN p_status = 'in_trial' THEN 'trialing'
        WHEN p_status = 'active' THEN 'active'
        WHEN p_status = 'cancelled' THEN 'canceled'
        ELSE p_status
      END,
      trial_ends_at = COALESCE(p_trial_ends_at, trial_ends_at),
      current_period_start = COALESCE(p_period_start, current_period_start),
      current_period_end = COALESCE(p_period_end, current_period_end)
  WHERE tenant_id = p_tenant_id;

  -- Update tenant_features
  UPDATE tenant_features
  SET facilities = (p_plan = 'facilities'),
      on_call = p_on_call
  WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 10. Add platform_settings keys for On Call
-- ════════════════════════════════════════════════════════════════════

INSERT INTO platform_settings (key, value)
VALUES
  ('on_call_advisor_name', ''),
  ('on_call_advisor_photo_url', ''),
  ('on_call_booking_url', '')
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 11. Drop temp table
-- ════════════════════════════════════════════════════════════════════

DROP TABLE _snapshot_rst;
