-- 027_pricing_refinements.sql
-- Refinements: "Plus Facilities" at $279, 21-day trial, everything on during trial,
-- trial_expired_at column, updated functions with trial awareness.

-- ════════════════════════════════════════════════════════════════════
-- 1. Set trial_days to 21
-- ════════════════════════════════════════════════════════════════════

INSERT INTO platform_settings (key, value)
VALUES ('trial_days', '21')
ON CONFLICT (key) DO UPDATE SET value = '21';

-- ════════════════════════════════════════════════════════════════════
-- 2. Add trial_expired_at column to subscriptions
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_expired_at timestamptz;

-- ════════════════════════════════════════════════════════════════════
-- 3. Recalculate facilities rates (27800 → 27900 base)
-- ════════════════════════════════════════════════════════════════════

UPDATE subscriptions
SET monthly_rate = 27900
  + CASE WHEN addon_on_call THEN 49900 ELSE 0 END
  + CASE WHEN pm_addon THEN 7900 ELSE 0 END
WHERE tier = 'facilities';

-- ════════════════════════════════════════════════════════════════════
-- 4. Replace plan_feature_defaults with trial-aware signature
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS plan_feature_defaults(text, boolean);

CREATE OR REPLACE FUNCTION plan_feature_defaults(
  p_plan text,
  p_on_call boolean DEFAULT false,
  p_trial boolean DEFAULT false
)
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
    'facilities', (p_plan = 'facilities' OR p_trial),
    'on_call', p_on_call
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- 5. Replace provision_tenant — trial=true, rate 27900
-- ════════════════════════════════════════════════════════════════════

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
    21
  ) INTO v_trial_days;

  -- Calculate rate: base plan + on_call + pm_seat
  v_monthly_rate := CASE p_plan
    WHEN 'self_managed' THEN 17900
    WHEN 'facilities' THEN 27900
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

  -- Feature defaults — trial=true so all features are unlocked during trial
  v_features := plan_feature_defaults(p_plan, p_on_call, true);

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

  -- 3. Create feature flags from plan defaults (all on during trial)
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
-- 6. Replace link_chargebee_subscription — trial-aware facilities
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
    WHEN 'facilities' THEN 27900
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

  -- Update tenant_features — keep facilities on during trial
  UPDATE tenant_features
  SET facilities = CASE
        WHEN p_status = 'in_trial' THEN true
        ELSE (p_plan = 'facilities')
      END,
      on_call = p_on_call
  WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
