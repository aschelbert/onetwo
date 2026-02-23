-- ============================================================================
-- ONE two HOA — Multi-Tenancy Schema
-- Run: supabase db push   or   supabase migration up
-- ============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────────────────────

create type subscription_tier as enum ('essentials', 'compliance_pro', 'advanced_governance');
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'suspended');
create type tenant_status as enum ('onboarding', 'active', 'suspended', 'archived');
create type tenant_role as enum ('board_member', 'resident', 'property_manager');
create type onboarding_step as enum (
  'account_created', 'building_profile_complete', 'units_configured',
  'first_user_invited', 'bylaws_uploaded', 'financial_setup_done', 'go_live'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TENANTS (buildings/associations)
-- ────────────────────────────────────────────────────────────────────────────

create table tenants (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  subdomain     text not null unique,
  address       jsonb not null default '{}',
  -- { street, city, state, zip }
  total_units   int not null default 0,
  year_built    text,
  status        tenant_status not null default 'onboarding',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Primary contact (the person who signed up)
  primary_contact_name  text,
  primary_contact_email text,
  primary_contact_phone text,

  -- Stripe
  stripe_customer_id    text unique,
  stripe_subscription_id text unique
);

create index idx_tenants_subdomain on tenants(subdomain);
create index idx_tenants_status on tenants(status);

-- ────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ────────────────────────────────────────────────────────────────────────────

create table subscriptions (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  tier              subscription_tier not null default 'essentials',
  status            subscription_status not null default 'trialing',
  monthly_rate      int not null default 4900, -- cents
  trial_ends_at     timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  stripe_subscription_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(tenant_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- FEATURE FLAGS (per-tenant, derived from tier but overridable)
-- ────────────────────────────────────────────────────────────────────────────

create table tenant_features (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  fiscal_lens       boolean not null default true,
  case_ops          boolean not null default true,
  compliance_runbook boolean not null default true,
  ai_advisor        boolean not null default false,
  document_vault    boolean not null default false,
  payment_processing boolean not null default false,
  votes_resolutions boolean not null default false,
  community_portal  boolean not null default false,
  vendor_management boolean not null default false,
  reserve_study_tools boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique(tenant_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- ONBOARDING CHECKLIST
-- ────────────────────────────────────────────────────────────────────────────

create table onboarding_checklists (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  account_created           boolean not null default false,
  building_profile_complete boolean not null default false,
  units_configured          boolean not null default false,
  first_user_invited        boolean not null default false,
  bylaws_uploaded           boolean not null default false,
  financial_setup_done      boolean not null default false,
  go_live                   boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique(tenant_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- TENANT USERS (links Supabase auth users to tenants)
-- ────────────────────────────────────────────────────────────────────────────

create table tenant_users (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        tenant_role not null default 'resident',
  unit        text,
  board_title text,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create index idx_tenant_users_user on tenant_users(user_id);
create index idx_tenant_users_tenant on tenant_users(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- PLATFORM ADMINS (ONE two staff — not tied to tenants)
-- ────────────────────────────────────────────────────────────────────────────

create table platform_admins (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  role        text not null default 'support',
  -- super_admin | support | billing | readonly
  name        text not null,
  email       text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- AUDIT LOG
-- ────────────────────────────────────────────────────────────────────────────

create table audit_log (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid references tenants(id) on delete set null,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_name  text not null,
  actor_role  text not null,
  action      text not null,
  target      text not null,
  details     text,
  created_at  timestamptz not null default now()
);

create index idx_audit_tenant on audit_log(tenant_id);
create index idx_audit_created on audit_log(created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- INVOICES (synced from Stripe via webhooks)
-- ────────────────────────────────────────────────────────────────────────────

create table invoices (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  stripe_invoice_id   text unique,
  amount              int not null, -- cents
  status              text not null default 'pending',
  -- paid | pending | overdue | void
  invoice_date        date not null default current_date,
  due_date            date,
  paid_date           date,
  created_at          timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: Generate subdomain from building name
-- ────────────────────────────────────────────────────────────────────────────

create or replace function generate_subdomain(building_name text)
returns text as $$
declare
  base text;
  candidate text;
  suffix int := 2;
begin
  -- Lowercase, strip non-alpha, remove common words
  base := lower(building_name);
  base := regexp_replace(base, '(condominium|condos|hoa|association|residences|towers|gardens|estates)', '', 'gi');
  base := regexp_replace(base, '[^a-z0-9]', '', 'g');
  base := left(base, 20);
  if base = '' then base := 'building'; end if;

  candidate := base;
  while exists (select 1 from tenants where subdomain = candidate) loop
    candidate := base || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: Get tier feature defaults
-- ────────────────────────────────────────────────────────────────────────────

create or replace function tier_feature_defaults(t subscription_tier)
returns jsonb as $$
begin
  case t
    when 'essentials' then
      return '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":false,"document_vault":false,"payment_processing":false,"votes_resolutions":false,"community_portal":false,"vendor_management":false,"reserve_study_tools":false}'::jsonb;
    when 'compliance_pro' then
      return '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":false,"community_portal":false,"vendor_management":true,"reserve_study_tools":false}'::jsonb;
    when 'advanced_governance' then
      return '{"fiscal_lens":true,"case_ops":true,"compliance_runbook":true,"ai_advisor":true,"document_vault":true,"payment_processing":true,"votes_resolutions":true,"community_portal":true,"vendor_management":true,"reserve_study_tools":true}'::jsonb;
  end case;
end;
$$ language plpgsql immutable;

-- ────────────────────────────────────────────────────────────────────────────
-- MAIN: Provision tenant (called from Edge Function after Stripe checkout)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function provision_tenant(
  p_name text,
  p_address jsonb,
  p_total_units int,
  p_year_built text,
  p_tier subscription_tier,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_user_id uuid,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_board_title text default 'President'
)
returns jsonb as $$
declare
  v_tenant_id uuid;
  v_subdomain text;
  v_monthly_rate int;
  v_features jsonb;
  v_trial_end timestamptz;
begin
  -- Generate unique subdomain
  v_subdomain := generate_subdomain(p_name);

  -- Set monthly rate based on tier
  v_monthly_rate := case p_tier
    when 'essentials' then 4900
    when 'compliance_pro' then 17900
    when 'advanced_governance' then 29900
  end;

  -- Trial ends in 30 days
  v_trial_end := now() + interval '30 days';

  -- Get feature defaults for this tier
  v_features := tier_feature_defaults(p_tier);

  -- 1. Create tenant
  insert into tenants (name, subdomain, address, total_units, year_built, status,
    primary_contact_name, primary_contact_email, primary_contact_phone,
    stripe_customer_id, stripe_subscription_id)
  values (p_name, v_subdomain, p_address, p_total_units, p_year_built, 'onboarding',
    p_contact_name, p_contact_email, p_contact_phone,
    p_stripe_customer_id, p_stripe_subscription_id)
  returning id into v_tenant_id;

  -- 2. Create subscription
  insert into subscriptions (tenant_id, tier, status, monthly_rate, trial_ends_at,
    current_period_start, current_period_end, stripe_subscription_id)
  values (v_tenant_id, p_tier, 'trialing', v_monthly_rate, v_trial_end,
    now(), v_trial_end, p_stripe_subscription_id);

  -- 3. Create feature flags from tier defaults
  insert into tenant_features (tenant_id,
    fiscal_lens, case_ops, compliance_runbook, ai_advisor, document_vault,
    payment_processing, votes_resolutions, community_portal, vendor_management, reserve_study_tools)
  values (v_tenant_id,
    (v_features->>'fiscal_lens')::boolean, (v_features->>'case_ops')::boolean,
    (v_features->>'compliance_runbook')::boolean, (v_features->>'ai_advisor')::boolean,
    (v_features->>'document_vault')::boolean, (v_features->>'payment_processing')::boolean,
    (v_features->>'votes_resolutions')::boolean, (v_features->>'community_portal')::boolean,
    (v_features->>'vendor_management')::boolean, (v_features->>'reserve_study_tools')::boolean);

  -- 4. Create onboarding checklist
  insert into onboarding_checklists (tenant_id, account_created, building_profile_complete)
  values (v_tenant_id, true, (p_address->>'street') is not null and (p_address->>'street') != '');

  -- 5. Link signing-up user as board member
  insert into tenant_users (tenant_id, user_id, role, board_title, status)
  values (v_tenant_id, p_user_id, 'board_member', p_board_title, 'active');

  -- 6. Audit log
  insert into audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_tenant_id, p_user_id, p_contact_name, 'system', 'tenant.provisioned',
    p_name, format('Subdomain: %s.getonetwo.com | Tier: %s | Trial ends: %s',
      v_subdomain, p_tier, v_trial_end::date));

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'subdomain', v_subdomain,
    'tier', p_tier,
    'trial_ends_at', v_trial_end,
    'monthly_rate', v_monthly_rate
  );
end;
$$ language plpgsql security definer;

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

alter table tenants enable row level security;
alter table subscriptions enable row level security;
alter table tenant_features enable row level security;
alter table onboarding_checklists enable row level security;
alter table tenant_users enable row level security;
alter table audit_log enable row level security;
alter table invoices enable row level security;

-- Tenants: users can see their own tenant
create policy "Users see own tenant" on tenants for select
  using (id in (select tenant_id from tenant_users where user_id = auth.uid()));

-- Platform admins see all
create policy "Admins see all tenants" on tenants for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Subscriptions: users see own
create policy "Users see own subscription" on subscriptions for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Admins manage subscriptions" on subscriptions for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Features: users see own
create policy "Users see own features" on tenant_features for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Admins manage features" on tenant_features for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Onboarding: users see own, board can update
create policy "Users see own onboarding" on onboarding_checklists for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board updates onboarding" on onboarding_checklists for update
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage onboarding" on onboarding_checklists for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Tenant users: members see co-members
create policy "Members see tenant users" on tenant_users for select
  using (tenant_id in (select tenant_id from tenant_users tu where tu.user_id = auth.uid()));
create policy "Board manages tenant users" on tenant_users for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage tenant users" on tenant_users for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Audit: users see own tenant audit
create policy "Users see own audit" on audit_log for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Admins see all audit" on audit_log for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Invoices: users see own
create policy "Users see own invoices" on invoices for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Admins manage invoices" on invoices for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at auto-refresh
-- ────────────────────────────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tenants_updated before update on tenants
  for each row execute function update_updated_at();
create trigger trg_subscriptions_updated before update on subscriptions
  for each row execute function update_updated_at();
create trigger trg_tenant_features_updated before update on tenant_features
  for each row execute function update_updated_at();
create trigger trg_onboarding_updated before update on onboarding_checklists
  for each row execute function update_updated_at();

