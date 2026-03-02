-- Migration: Admin Console v2.0
-- Adds RBAC permissions, Stripe integration tracking, and Platform Finance tables

-- ═══════════════════════════════════════════════════════════════
-- 1a. Alter subscriptions table — add Stripe product fields
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_product_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_monthly_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_yearly_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_sync_status text DEFAULT 'unlinked';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_last_sync timestamptz;

-- ═══════════════════════════════════════════════════════════════
-- 1b. Permissions table (platform-level RBAC config)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id text NOT NULL,
  feature_id text NOT NULL,
  actions text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  UNIQUE(role_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_permissions_role_id ON permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_feature_id ON permissions(feature_id);

-- ═══════════════════════════════════════════════════════════════
-- 1c. Stripe tracking tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'processing',
  tenant_id uuid REFERENCES tenants(id),
  tenant_name text,
  amount numeric,
  payload jsonb,
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON stripe_webhook_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status ON stripe_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at ON stripe_webhook_events(created_at);

CREATE TABLE IF NOT EXISTS stripe_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  tenant_name text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_invoice_id text,
  payment_method text,
  last4 text,
  failure_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_tenant_id ON stripe_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_status ON stripe_payments(status);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_created_at ON stripe_payments(created_at);

CREATE TABLE IF NOT EXISTS stripe_config (
  id text PRIMARY KEY DEFAULT 'default',
  mode text DEFAULT 'test',
  publishable_key text,
  webhook_url text,
  connected_at timestamptz,
  last_webhook_received timestamptz
);

-- ═══════════════════════════════════════════════════════════════
-- 1d. Platform Finance tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_accounts (
  num text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  sub_type text,
  parent_num text REFERENCES platform_accounts(num),
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_type ON platform_accounts(type);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_parent_num ON platform_accounts(parent_num);

CREATE TABLE IF NOT EXISTS platform_gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  memo text NOT NULL,
  debit_acct text NOT NULL REFERENCES platform_accounts(num),
  credit_acct text NOT NULL REFERENCES platform_accounts(num),
  amount numeric NOT NULL CHECK (amount > 0),
  source text NOT NULL,
  ref text,
  posted_at timestamptz DEFAULT now(),
  posted_by text
);

CREATE INDEX IF NOT EXISTS idx_platform_gl_entries_date ON platform_gl_entries(date);
CREATE INDEX IF NOT EXISTS idx_platform_gl_entries_debit_acct ON platform_gl_entries(debit_acct);
CREATE INDEX IF NOT EXISTS idx_platform_gl_entries_credit_acct ON platform_gl_entries(credit_acct);
CREATE INDEX IF NOT EXISTS idx_platform_gl_entries_source ON platform_gl_entries(source);

CREATE TABLE IF NOT EXISTS platform_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acct_num text NOT NULL REFERENCES platform_accounts(num),
  name text NOT NULL,
  budgeted numeric NOT NULL,
  period text DEFAULT 'MONTHLY',
  fiscal_year int DEFAULT 2026,
  is_active boolean DEFAULT true,
  UNIQUE(acct_num, fiscal_year)
);

-- ═══════════════════════════════════════════════════════════════
-- 1e. Seed data
-- ═══════════════════════════════════════════════════════════════

-- Default permissions for 3 roles x 10 features
INSERT INTO permissions (role_id, feature_id, actions) VALUES
  -- Board Member: full access to all features
  ('board_member', 'fiscalLens', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'caseOps', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'complianceRunbook', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'aiAdvisor', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'documentVault', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'paymentProcessing', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'votesResolutions', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'communityPortal', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'vendorManagement', ARRAY['view','create','edit','delete','approve']),
  ('board_member', 'reserveStudyTools', ARRAY['view','create','edit','delete','approve']),
  -- Resident: view-heavy with limited create
  ('resident', 'fiscalLens', ARRAY['view']),
  ('resident', 'caseOps', ARRAY['view','create']),
  ('resident', 'complianceRunbook', ARRAY['view']),
  ('resident', 'aiAdvisor', ARRAY['view']),
  ('resident', 'documentVault', ARRAY['view']),
  ('resident', 'paymentProcessing', ARRAY['view']),
  ('resident', 'votesResolutions', ARRAY['view','create']),
  ('resident', 'communityPortal', ARRAY['view','create','edit']),
  ('resident', 'vendorManagement', ARRAY['view']),
  ('resident', 'reserveStudyTools', ARRAY['view']),
  -- Property Manager: operational access
  ('property_manager', 'fiscalLens', ARRAY['view','create','edit']),
  ('property_manager', 'caseOps', ARRAY['view','create','edit']),
  ('property_manager', 'complianceRunbook', ARRAY['view','create','edit']),
  ('property_manager', 'aiAdvisor', ARRAY['view','create','edit']),
  ('property_manager', 'documentVault', ARRAY['view','create','edit']),
  ('property_manager', 'paymentProcessing', ARRAY['view','create','edit','approve']),
  ('property_manager', 'votesResolutions', ARRAY['view','create','edit']),
  ('property_manager', 'communityPortal', ARRAY['view','create','edit']),
  ('property_manager', 'vendorManagement', ARRAY['view','create','edit','delete']),
  ('property_manager', 'reserveStudyTools', ARRAY['view','create','edit','delete'])
ON CONFLICT (role_id, feature_id) DO NOTHING;

-- Stripe config singleton
INSERT INTO stripe_config (id, mode, publishable_key, webhook_url, connected_at, last_webhook_received)
VALUES ('default', 'test', 'pk_test_51Pq...xxxxx', 'https://api.getonetwo.com/webhooks/stripe', '2026-01-15T10:00:00Z', '2026-03-02T08:45:12Z')
ON CONFLICT (id) DO NOTHING;

-- Platform Chart of Accounts (37 accounts)
INSERT INTO platform_accounts (num, name, type, sub_type, parent_num, sort_order) VALUES
  -- Assets
  ('1000', 'Assets', 'asset', 'header', NULL, 100),
  ('1010', 'Operating Account (Chase)', 'asset', 'bank', '1000', 110),
  ('1020', 'Stripe Balance', 'asset', 'bank', '1000', 120),
  ('1030', 'Savings Reserve', 'asset', 'bank', '1000', 130),
  ('1100', 'Accounts Receivable', 'asset', 'receivable', '1000', 140),
  ('1110', 'Subscription AR', 'asset', 'receivable', '1100', 141),
  ('1120', 'Trial Conversions Pending', 'asset', 'receivable', '1100', 142),
  ('1200', 'Prepaid Expenses', 'asset', 'prepaid', '1000', 150),
  -- Liabilities
  ('2000', 'Liabilities', 'liability', 'header', NULL, 200),
  ('2010', 'Accounts Payable', 'liability', 'payable', '2000', 210),
  ('2020', 'Accrued Expenses', 'liability', 'payable', '2000', 220),
  ('2030', 'Deferred Revenue', 'liability', 'deferred', '2000', 230),
  ('2040', 'Credit Card Payable', 'liability', 'payable', '2000', 240),
  -- Equity
  ('3000', 'Equity', 'equity', 'header', NULL, 300),
  ('3010', 'Founder Equity', 'equity', 'equity', '3000', 310),
  ('3020', 'Retained Earnings', 'equity', 'equity', '3000', 320),
  -- Revenue
  ('4000', 'Revenue', 'revenue', 'header', NULL, 400),
  ('4010', 'Subscription Revenue - Monthly', 'revenue', 'subscription', '4000', 410),
  ('4020', 'Subscription Revenue - Annual', 'revenue', 'subscription', '4000', 420),
  ('4030', 'Setup Fees', 'revenue', 'fees', '4000', 430),
  ('4040', 'Add-on Services', 'revenue', 'services', '4000', 440),
  ('4090', 'Refunds & Credits', 'revenue', 'contra', '4000', 490),
  -- COGS
  ('5000', 'Cost of Goods Sold', 'expense', 'header', NULL, 500),
  ('5010', 'Cloud Hosting (AWS/GCP)', 'expense', 'cogs', '5000', 510),
  ('5020', 'Stripe Processing Fees', 'expense', 'cogs', '5000', 520),
  ('5030', 'Third-party APIs & Services', 'expense', 'cogs', '5000', 530),
  ('5040', 'Customer Support Tools', 'expense', 'cogs', '5000', 540),
  -- Operating Expenses
  ('6000', 'Operating Expenses', 'expense', 'header', NULL, 600),
  ('6010', 'Payroll & Benefits', 'expense', 'opex', '6000', 610),
  ('6020', 'Contractors & Freelancers', 'expense', 'opex', '6000', 620),
  ('6030', 'Software & SaaS Tools', 'expense', 'opex', '6000', 630),
  ('6040', 'Legal & Professional', 'expense', 'opex', '6000', 640),
  ('6050', 'Marketing & Advertising', 'expense', 'opex', '6000', 650),
  ('6060', 'Office & Facilities', 'expense', 'opex', '6000', 660),
  ('6070', 'Insurance', 'expense', 'opex', '6000', 670),
  ('6080', 'Travel & Conferences', 'expense', 'opex', '6000', 680),
  ('6090', 'Bank Fees & Interest', 'expense', 'opex', '6000', 690),
  ('6100', 'Miscellaneous', 'expense', 'opex', '6000', 700)
ON CONFLICT (num) DO NOTHING;

-- Platform Budgets (10 categories)
INSERT INTO platform_budgets (acct_num, name, budgeted, period, fiscal_year) VALUES
  ('5010', 'Cloud Hosting', 2400, 'MONTHLY', 2026),
  ('5020', 'Stripe Fees', 180, 'MONTHLY', 2026),
  ('5030', 'Third-party APIs', 350, 'MONTHLY', 2026),
  ('5040', 'Support Tools', 200, 'MONTHLY', 2026),
  ('6010', 'Payroll & Benefits', 18000, 'MONTHLY', 2026),
  ('6020', 'Contractors', 5000, 'MONTHLY', 2026),
  ('6030', 'Software Tools', 800, 'MONTHLY', 2026),
  ('6040', 'Legal & Professional', 1500, 'MONTHLY', 2026),
  ('6050', 'Marketing', 3000, 'MONTHLY', 2026),
  ('6070', 'Insurance', 600, 'MONTHLY', 2026)
ON CONFLICT (acct_num, fiscal_year) DO NOTHING;

-- Platform GL Seed Entries
INSERT INTO platform_gl_entries (date, memo, debit_acct, credit_acct, amount, source, ref) VALUES
  -- Equity / Initial Cash
  ('2025-06-01', 'Founder initial investment', '1010', '3010', 150000.00, 'equity', NULL),
  ('2025-12-31', 'Retained earnings carry-forward', '1010', '3020', 28000.00, 'equity', NULL),
  -- January Revenue
  ('2026-01-01', 'Subscription - 1302 R Street NW (Jan)', '1020', '4010', 179.00, 'stripe', 'tn-001'),
  ('2026-01-01', 'Subscription - Capitol Hill Terraces (Annual)', '1020', '4020', 2508.00, 'stripe', 'tn-002'),
  ('2026-01-01', 'Subscription - Dupont Circle Lofts (Jan)', '1020', '4010', 399.00, 'stripe', 'tn-003'),
  ('2026-01-01', 'Subscription - Georgetown Mews (Jan)', '1020', '4010', 179.00, 'stripe', 'tn-005'),
  -- February Revenue
  ('2026-02-01', 'Subscription - 1302 R Street NW (Feb)', '1020', '4010', 179.00, 'stripe', 'tn-001'),
  ('2026-02-15', 'Subscription - Dupont Circle Lofts (Feb)', '1020', '4010', 399.00, 'stripe', 'tn-003'),
  -- March Revenue
  ('2026-03-01', 'Subscription - 1302 R Street NW (Mar)', '1020', '4010', 179.00, 'stripe', 'tn-001'),
  ('2026-02-28', 'Subscription - Dupont Circle Lofts (Mar)', '1020', '4010', 399.00, 'stripe', 'tn-003'),
  -- Stripe Payouts
  ('2026-01-15', 'Stripe payout to Chase', '1010', '1020', 3200.00, 'payout', NULL),
  ('2026-02-15', 'Stripe payout to Chase', '1010', '1020', 900.00, 'payout', NULL),
  ('2026-03-01', 'Stripe payout to Chase', '1010', '1020', 550.00, 'payout', NULL),
  -- Stripe Processing Fees
  ('2026-01-31', 'Stripe fees - January', '5020', '1020', 52.27, 'stripe_fee', NULL),
  ('2026-02-28', 'Stripe fees - February', '5020', '1020', 17.48, 'stripe_fee', NULL),
  -- COGS
  ('2026-01-31', 'AWS hosting - January', '5010', '1010', 2180.00, 'expense', 'aws-jan'),
  ('2026-02-28', 'AWS hosting - February', '5010', '1010', 2350.00, 'expense', 'aws-feb'),
  ('2026-01-31', 'Twilio + SendGrid - January', '5030', '1010', 285.00, 'expense', 'api-jan'),
  ('2026-02-28', 'Twilio + SendGrid - February', '5030', '1010', 310.00, 'expense', 'api-feb'),
  ('2026-01-31', 'Intercom - January', '5040', '1010', 189.00, 'expense', 'support-jan'),
  ('2026-02-28', 'Intercom - February', '5040', '1010', 189.00, 'expense', 'support-feb'),
  -- Operating Expenses
  ('2026-01-31', 'Payroll - January', '6010', '1010', 17500.00, 'payroll', 'jan'),
  ('2026-02-28', 'Payroll - February', '6010', '1010', 17500.00, 'payroll', 'feb'),
  ('2026-01-31', '1099 Contractors - January', '6020', '1010', 4200.00, 'payroll', 'jan-1099'),
  ('2026-02-28', '1099 Contractors - February', '6020', '1010', 4800.00, 'payroll', 'feb-1099'),
  ('2026-01-31', 'SaaS tools (GitHub, Figma, Linear, etc.)', '6030', '2040', 780.00, 'expense', 'tools-jan'),
  ('2026-02-28', 'SaaS tools (GitHub, Figma, Linear, etc.)', '6030', '2040', 780.00, 'expense', 'tools-feb'),
  ('2026-01-15', 'Legal retainer - Q1', '6040', '1010', 4500.00, 'expense', 'legal-q1'),
  ('2026-02-01', 'Google Ads - February', '6050', '2040', 2800.00, 'expense', 'mktg-feb'),
  ('2026-01-01', 'E&O Insurance - Monthly', '6070', '1010', 580.00, 'expense', 'ins-jan'),
  ('2026-02-01', 'E&O Insurance - Monthly', '6070', '1010', 580.00, 'expense', 'ins-feb');

-- Sample Stripe payments
INSERT INTO stripe_payments (tenant_name, amount, status, stripe_payment_intent_id, stripe_invoice_id, payment_method, last4, created_at) VALUES
  ('1302 R Street NW', 179, 'succeeded', 'pi_seed_001', 'in_Rk0001', 'card', '4242', '2026-03-01T10:00:00Z'),
  ('Capitol Hill Terraces', 2508, 'succeeded', 'pi_seed_002', 'in_Rk0002', 'card', '5555', '2026-01-01T00:05:00Z'),
  ('Dupont Circle Lofts', 399, 'succeeded', 'pi_seed_003', 'in_Rk0003', 'ach', '9012', '2026-02-28T14:22:00Z'),
  ('Dupont Circle Lofts', 399, 'succeeded', 'pi_seed_004', 'in_Rk0004', 'ach', '9012', '2026-01-28T12:00:00Z'),
  ('1302 R Street NW', 179, 'succeeded', 'pi_seed_005', 'in_Rk0005', 'card', '4242', '2026-02-01T10:00:00Z'),
  ('Georgetown Mews', 179, 'failed', 'pi_seed_006', 'in_Rk0006', 'card', '0019', '2026-02-15T16:30:00Z'),
  ('1302 R Street NW', 179, 'succeeded', 'pi_seed_007', 'in_Rk0007', 'card', '4242', '2026-01-01T10:00:00Z'),
  ('Capitol Hill Terraces', 249, 'succeeded', 'pi_seed_008', 'in_Rk0008', 'card', '5555', '2025-12-01T10:00:00Z');

-- Sample Stripe webhook events
INSERT INTO stripe_webhook_events (stripe_event_id, type, status, tenant_name, amount, payload, created_at, processed_at) VALUES
  ('evt_1PqAb_seed', 'invoice.paid', 'success', '1302 R Street NW Condominium', 179, '{}', '2026-03-01T10:00:12Z', '2026-03-01T10:00:13Z'),
  ('evt_1PqCd_seed', 'invoice.paid', 'success', 'Dupont Circle Lofts', 399, '{}', '2026-02-28T14:22:45Z', '2026-02-28T14:22:46Z'),
  ('evt_1PqEf_seed', 'customer.subscription.updated', 'success', 'Capitol Hill Terraces HOA', NULL, '{}', '2026-02-27T09:11:30Z', '2026-02-27T09:11:31Z'),
  ('evt_1PqGh_seed', 'invoice.payment_failed', 'failed', 'Georgetown Mews', 179, '{}', '2026-02-15T16:30:00Z', '2026-02-15T16:30:01Z'),
  ('evt_1PqIj_seed', 'customer.subscription.trial_will_end', 'success', 'Adams Morgan Commons', NULL, '{}', '2026-03-02T08:45:12Z', '2026-03-02T08:45:13Z'),
  ('evt_1PqKl_seed', 'invoice.paid', 'success', 'Capitol Hill Terraces HOA', 2508, '{}', '2026-01-01T00:05:00Z', '2026-01-01T00:05:01Z'),
  ('evt_1PqMn_seed', 'checkout.session.completed', 'success', 'Adams Morgan Commons', 0, '{}', '2026-02-01T11:15:00Z', '2026-02-01T11:15:01Z');

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies — platform_admins-only access
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_gl_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_budgets ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users with platform_admin role
CREATE POLICY "Platform admins can manage permissions" ON permissions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage stripe_webhook_events" ON stripe_webhook_events
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage stripe_payments" ON stripe_payments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage stripe_config" ON stripe_config
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage platform_accounts" ON platform_accounts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage platform_gl_entries" ON platform_gl_entries
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Platform admins can manage platform_budgets" ON platform_budgets
  FOR ALL USING (auth.role() = 'authenticated');
