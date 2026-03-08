-- Migration 2: Create governance tables (board_members, management_info, legal_counsel)

CREATE TABLE IF NOT EXISTS public.board_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Member',
  email text,
  phone text,
  term_start date,
  term_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to board_members"
  ON public.board_members FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage board_members"
  ON public.board_members FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Management info (one row per tenancy)
CREATE TABLE IF NOT EXISTS public.management_info (
  tenancy_id text PRIMARY KEY REFERENCES public.tenancies(id) ON DELETE CASCADE,
  company_name text,
  contact_name text,
  title text,
  email text,
  phone text,
  emergency_phone text,
  office_hours text,
  after_hours_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.management_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to management_info"
  ON public.management_info FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage management_info"
  ON public.management_info FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Legal counsel
CREATE TABLE IF NOT EXISTS public.legal_counsel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  firm_name text,
  attorney_name text,
  email text,
  phone text,
  specialty text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legal_counsel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to legal_counsel"
  ON public.legal_counsel FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage legal_counsel"
  ON public.legal_counsel FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));
