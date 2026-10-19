-- Migration: Demo leads v2 — relax constraints, add source tracking, lead linking
-- Depends on: 014_demo_leads.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. Relax constraints for minimal lead capture
-- ═══════════════════════════════════════════════════════════════

-- Widen subscription_interest to include new tiers
ALTER TABLE demo_leads DROP CONSTRAINT demo_leads_subscription_interest_check;
ALTER TABLE demo_leads ADD CONSTRAINT demo_leads_subscription_interest_check
  CHECK (subscription_interest IN ('self_managed','facilities','compliance_pro','community_plus','management_suite'));

-- Allow empty name and condo_name (minimal lead capture)
ALTER TABLE demo_leads ALTER COLUMN name DROP NOT NULL;
ALTER TABLE demo_leads ALTER COLUMN condo_name DROP NOT NULL;

-- Add source tracking and signed-up user linking
ALTER TABLE demo_leads
  ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('bar','subscription','upsell','marketing')),
  ADD COLUMN IF NOT EXISTS signed_up_user_id uuid REFERENCES auth.users(id);

-- ═══════════════════════════════════════════════════════════════
-- 2. Update submit_demo_lead to accept p_source and allow nulls
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_demo_lead(
  p_name text,
  p_email text,
  p_condo_name text,
  p_unit_count int,
  p_member_type text,
  p_subscription_interest text,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validate member_type
  IF p_member_type NOT IN ('resident', 'board_member', 'property_manager', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid member type');
  END IF;

  -- Validate subscription_interest
  IF p_subscription_interest NOT IN ('self_managed', 'facilities', 'compliance_pro', 'community_plus', 'management_suite') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid subscription interest');
  END IF;

  -- Validate source if provided
  IF p_source IS NOT NULL AND p_source NOT IN ('bar', 'subscription', 'upsell', 'marketing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  -- Upsert on email
  INSERT INTO demo_leads (name, email, condo_name, unit_count, member_type, subscription_interest, source)
  VALUES (
    NULLIF(trim(p_name), ''),
    lower(trim(p_email)),
    NULLIF(trim(p_condo_name), ''),
    p_unit_count,
    p_member_type,
    p_subscription_interest,
    p_source
  )
  ON CONFLICT (email) DO UPDATE SET
    name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), demo_leads.name),
    condo_name = COALESCE(NULLIF(trim(EXCLUDED.condo_name), ''), demo_leads.condo_name),
    unit_count = COALESCE(EXCLUDED.unit_count, demo_leads.unit_count),
    member_type = EXCLUDED.member_type,
    subscription_interest = EXCLUDED.subscription_interest,
    source = COALESCE(EXCLUDED.source, demo_leads.source)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- Re-grant for anon (function signature changed)
GRANT EXECUTE ON FUNCTION submit_demo_lead(text, text, text, int, text, text, text) TO anon;

-- ═══════════════════════════════════════════════════════════════
-- 3. link_demo_lead — called after signup to link lead → user
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION link_demo_lead(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE demo_leads
  SET signed_up_user_id = auth.uid()
  WHERE email = lower(trim(p_email))
    AND signed_up_user_id IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION link_demo_lead(text) TO authenticated;
