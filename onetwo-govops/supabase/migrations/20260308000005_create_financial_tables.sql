-- Migration 5: Create financial tables

CREATE TABLE IF NOT EXISTS public.financial_settings (
  tenancy_id text PRIMARY KEY REFERENCES public.tenancies(id) ON DELETE CASCADE,
  fiscal_year_end_month integer DEFAULT 12,
  hoa_due_day integer DEFAULT 1,
  annual_reserve_contribution numeric(12,2) DEFAULT 0,
  stripe_connect_id text,
  stripe_onboarding_complete boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to financial_settings"
  ON public.financial_settings FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage financial_settings"
  ON public.financial_settings FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Chart of accounts
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'expense',
  sub_type text,
  parent_id uuid REFERENCES public.chart_of_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to chart_of_accounts"
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage chart_of_accounts"
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Budget categories
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  name text NOT NULL,
  budgeted_amount numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to budget_categories"
  ON public.budget_categories FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage budget_categories"
  ON public.budget_categories FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Reserve items
CREATE TABLE IF NOT EXISTS public.reserve_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  name text NOT NULL,
  estimated_cost numeric(12,2) DEFAULT 0,
  current_funding numeric(12,2) DEFAULT 0,
  useful_life integer,
  years_remaining integer,
  is_contingency boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reserve_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to reserve_items"
  ON public.reserve_items FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage reserve_items"
  ON public.reserve_items FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));
