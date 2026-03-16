-- Migration: Demo lead capture for "Try the Demo" flow
-- Creates demo_leads table, submit_demo_lead() RPC, and RLS policies

-- ═══════════════════════════════════════════════════════════════
-- 1. Demo leads table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  condo_name text NOT NULL,
  unit_count int,
  member_type text NOT NULL CHECK (member_type IN ('resident', 'board_member', 'property_manager', 'other')),
  subscription_interest text NOT NULL CHECK (subscription_interest IN ('compliance_pro', 'community_plus', 'management_suite')),
  created_at timestamptz DEFAULT now()
);

-- Unique on email so repeat visits upsert rather than duplicate
CREATE UNIQUE INDEX idx_demo_leads_email ON demo_leads(email);

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS — table enabled, no anon policies (access via security-definer fn)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE demo_leads ENABLE ROW LEVEL SECURITY;

-- Admin read policy for platform_admins
CREATE POLICY "platform_admins_read_demo_leads"
  ON demo_leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. submit_demo_lead() — security definer RPC
--    Upserts on email so repeat demo visits update the record.
--    Called by anon users via rpc().
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_demo_lead(
  p_name text,
  p_email text,
  p_condo_name text,
  p_unit_count int,
  p_member_type text,
  p_subscription_interest text
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
  IF p_subscription_interest NOT IN ('compliance_pro', 'community_plus', 'management_suite') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid subscription interest');
  END IF;

  -- Upsert on email
  INSERT INTO demo_leads (name, email, condo_name, unit_count, member_type, subscription_interest)
  VALUES (
    trim(p_name),
    lower(trim(p_email)),
    trim(p_condo_name),
    p_unit_count,
    p_member_type,
    p_subscription_interest
  )
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    condo_name = EXCLUDED.condo_name,
    unit_count = EXCLUDED.unit_count,
    member_type = EXCLUDED.member_type,
    subscription_interest = EXCLUDED.subscription_interest
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id
  );
END;
$$;

-- Grant anon execute so unauthenticated users can call it
GRANT EXECUTE ON FUNCTION submit_demo_lead(text, text, text, int, text, text) TO anon;
