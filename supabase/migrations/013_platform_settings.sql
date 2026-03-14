-- ────────────────────────────────────────────────────────────────────────────
-- 013_platform_settings.sql
-- Centralise trial_days (and future platform knobs) in a singleton table
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists platform_settings (
  id          text primary key default 'default',
  trial_days  int not null default 30
              check (trial_days >= 0 and trial_days <= 365),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Seed the single row
insert into platform_settings (id, trial_days)
values ('default', 30)
on conflict (id) do nothing;

-- RLS — authenticated users can read; writes go through service functions
alter table platform_settings enable row level security;

create policy "Authenticated users can read platform_settings"
  on platform_settings for select
  to authenticated
  using (true);

create policy "Authenticated users can update platform_settings"
  on platform_settings for update
  to authenticated
  using (true)
  with check (true);

-- ────────────────────────────────────────────────────────────────────────────
-- get_trial_days()  —  lightweight RPC callable by anon (for AuthPage)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function get_trial_days()
returns int
language sql
security definer
stable
as $$
  select coalesce(
    (select trial_days from platform_settings where id = 'default'),
    30
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Re-create provision_tenant() — reads trial_days from platform_settings
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
  p_board_title text default 'President',
  p_subdomain text default null
)
returns jsonb as $$
declare
  v_tenant_id uuid;
  v_subdomain text;
  v_monthly_rate int;
  v_features jsonb;
  v_trial_end timestamptz;
  v_trial_days int;
begin
  -- Use user-chosen subdomain if provided and available, otherwise generate one
  if p_subdomain is not null and p_subdomain != '' and not exists (select 1 from tenants where subdomain = p_subdomain) then
    v_subdomain := p_subdomain;
  else
    v_subdomain := generate_subdomain(p_name);
  end if;

  -- Set monthly rate based on tier
  v_monthly_rate := case p_tier
    when 'compliance_pro' then 17900
    when 'community_plus' then 27900
    when 'management_suite' then 39900
  end;

  -- Read trial length from platform_settings (falls back to 30)
  select coalesce(trial_days, 30) into v_trial_days
  from platform_settings where id = 'default';
  if v_trial_days is null then v_trial_days := 30; end if;

  v_trial_end := now() + (v_trial_days || ' days')::interval;

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
