-- Migration 4: Create units table

CREATE TABLE IF NOT EXISTS public.units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  number text NOT NULL,
  owner_name text,
  email text,
  phone text,
  monthly_fee numeric(10,2) DEFAULT 0,
  voting_pct numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'occupied',
  balance numeric(10,2) DEFAULT 0,
  move_in_date date,
  sqft integer,
  bedrooms integer,
  parking text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenancy_id, number)
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to units"
  ON public.units FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage units"
  ON public.units FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));
