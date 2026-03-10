-- Migration: Fix core permission rows + correct tier_feature_defaults
-- Fixes two issues:
-- 1. Core features (dashboard, boardRoom, building, propertyLog, archives, myUnit, userManagement)
--    were missing from the permissions table, causing RBAC failures for non-admin users.
-- 2. tier_feature_defaults SQL function had wrong values vs the JS TIER_FEATURES config.

-- ═══════════════════════════════════════════════════════════════
-- Fix 3: Seed missing core feature permission rows for all 4 roles
-- ═══════════════════════════════════════════════════════════════

INSERT INTO permissions (role_id, feature_id, actions) VALUES
  -- Board Member: core modules
  ('board_member', 'dashboard', ARRAY['view','create','edit']),
  ('board_member', 'boardRoom', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'building', ARRAY['view','create','edit','delete']),
  ('board_member', 'propertyLog', ARRAY['view','create','edit','delete']),
  ('board_member', 'archives', ARRAY['view','create','edit','delete']),
  ('board_member', 'myUnit', ARRAY[]::text[]),
  ('board_member', 'userManagement', ARRAY['view','create','edit','delete']),
  ('board_member', 'fiscalLens', ARRAY['view','create','edit','delete','approve']),
  -- Resident: core modules
  ('resident', 'dashboard', ARRAY['view']),
  ('resident', 'boardRoom', ARRAY[]::text[]),
  ('resident', 'building', ARRAY['view']),
  ('resident', 'propertyLog', ARRAY[]::text[]),
  ('resident', 'archives', ARRAY['view']),
  ('resident', 'myUnit', ARRAY['view','create']),
  ('resident', 'userManagement', ARRAY[]::text[]),
  ('resident', 'fiscalLens', ARRAY['view']),
  -- Property Manager: core modules
  ('property_manager', 'dashboard', ARRAY['view','create','edit']),
  ('property_manager', 'boardRoom', ARRAY['view','create','edit','delete','approve']),
  ('property_manager', 'building', ARRAY['view','create','edit','delete']),
  ('property_manager', 'propertyLog', ARRAY['view','create','edit','delete']),
  ('property_manager', 'archives', ARRAY['view','create','edit','delete']),
  ('property_manager', 'myUnit', ARRAY[]::text[]),
  ('property_manager', 'userManagement', ARRAY['view','create','edit','delete']),
  ('property_manager', 'fiscalLens', ARRAY['view','create','edit']),
  -- Staff: core modules
  ('staff', 'dashboard', ARRAY['view']),
  ('staff', 'boardRoom', ARRAY[]::text[]),
  ('staff', 'building', ARRAY['view','create','edit']),
  ('staff', 'propertyLog', ARRAY['view','create','edit']),
  ('staff', 'archives', ARRAY['view']),
  ('staff', 'myUnit', ARRAY[]::text[]),
  ('staff', 'userManagement', ARRAY[]::text[]),
  ('staff', 'fiscalLens', ARRAY[]::text[])
ON CONFLICT (role_id, feature_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Fix 4: Correct tier_feature_defaults to match JS TIER_FEATURES
-- ═══════════════════════════════════════════════════════════════
-- compliance_pro: ai_advisor, document_vault, payment_processing, vendor_management → false
-- community_plus: votes_resolutions, vendor_management → false
-- management_suite: unchanged (all true)

CREATE OR REPLACE FUNCTION tier_feature_defaults(t subscription_tier)
RETURNS jsonb AS $$
BEGIN
  CASE t
    WHEN 'compliance_pro' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":false,"document_vault":false,"payment_processing":false,"votes_resolutions":false,"community_portal":false,"vendor_management":false,"reserve_study_tools":false}'::jsonb;
    WHEN 'community_plus' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":false,"community_portal":true,"vendor_management":false,"reserve_study_tools":false}'::jsonb;
    WHEN 'management_suite' THEN
      RETURN '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":true,"community_portal":true,"vendor_management":true,"reserve_study_tools":true}'::jsonb;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
