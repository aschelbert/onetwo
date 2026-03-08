-- Migration 1: Create onboarding_checklists table
CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  account_created boolean NOT NULL DEFAULT false,
  building_profile_complete boolean NOT NULL DEFAULT false,
  governance_configured boolean NOT NULL DEFAULT false,
  bylaws_uploaded boolean NOT NULL DEFAULT false,
  units_configured boolean NOT NULL DEFAULT false,
  financial_setup_done boolean NOT NULL DEFAULT false,
  payment_processing_configured boolean NOT NULL DEFAULT false,
  first_user_invited boolean NOT NULL DEFAULT false,
  go_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenancy_id)
);

ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY "Platform admins have full access to onboarding_checklists"
  ON public.onboarding_checklists
  FOR ALL
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Tenant users: select, insert, update
CREATE POLICY "Tenant users can view onboarding_checklists"
  ON public.onboarding_checklists
  FOR SELECT
  TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

CREATE POLICY "Tenant users can insert onboarding_checklists"
  ON public.onboarding_checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

CREATE POLICY "Tenant users can update onboarding_checklists"
  ON public.onboarding_checklists
  FOR UPDATE
  TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));
