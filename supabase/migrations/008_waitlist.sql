-- Migration: Waitlist for pre-launch signups
-- Creates waitlist table, join_waitlist() RPC, and RLS policies

-- ═══════════════════════════════════════════════════════════════
-- 1. Waitlist table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  community_name text NOT NULL,
  unit_count int NOT NULL,
  board_role text NOT NULL CHECK (board_role IN ('president', 'treasurer', 'secretary', 'member')),
  spot_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_spot ON waitlist(spot_number);

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS — table enabled, no anon policies (access via security-definer fn)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Admin read policy for platform_admins
CREATE POLICY "platform_admins_read_waitlist"
  ON waitlist FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. join_waitlist() — security definer RPC
--    Atomically assigns next spot number, enforces 20-community cap,
--    checks duplicate emails. Called by anon users via rpc().
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION join_waitlist(
  p_name text,
  p_email text,
  p_community_name text,
  p_unit_count int,
  p_board_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spot int;
  v_id uuid;
BEGIN
  -- Validate board_role
  IF p_board_role NOT IN ('president', 'treasurer', 'secretary', 'member') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid board role');
  END IF;

  -- Advisory lock to serialize spot assignment
  PERFORM pg_advisory_xact_lock(hashtext('waitlist_spot'));

  -- Check duplicate email
  IF EXISTS (SELECT 1 FROM waitlist WHERE email = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This email is already on the waitlist');
  END IF;

  -- Get next spot number
  SELECT COALESCE(MAX(spot_number), 0) + 1 INTO v_spot FROM waitlist;

  -- Enforce 20-community cap
  IF v_spot > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'The waitlist is full — all 20 early-adopter spots have been claimed');
  END IF;

  -- Insert
  INSERT INTO waitlist (name, email, community_name, unit_count, board_role, spot_number)
  VALUES (trim(p_name), lower(trim(p_email)), trim(p_community_name), p_unit_count, p_board_role, v_spot)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'spot_number', v_spot,
    'id', v_id,
    'name', trim(p_name),
    'email', lower(trim(p_email))
  );
END;
$$;

-- Grant anon execute so unauthenticated users can call it
GRANT EXECUTE ON FUNCTION join_waitlist(text, text, text, int, text) TO anon;
