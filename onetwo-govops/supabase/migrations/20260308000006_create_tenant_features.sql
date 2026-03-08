-- Migration 6: Create tenant_features table

CREATE TABLE IF NOT EXISTS public.tenant_features (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  payment_processing boolean DEFAULT false,
  document_management boolean DEFAULT true,
  maintenance_requests boolean DEFAULT true,
  violation_tracking boolean DEFAULT true,
  meeting_management boolean DEFAULT true,
  financial_reporting boolean DEFAULT true,
  resident_portal boolean DEFAULT true,
  communication_hub boolean DEFAULT true,
  voting_elections boolean DEFAULT false,
  amenity_booking boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenancy_id)
);

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to tenant_features"
  ON public.tenant_features FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can view tenant_features"
  ON public.tenant_features FOR SELECT TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

CREATE POLICY "Tenant users can manage tenant_features"
  ON public.tenant_features FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));
