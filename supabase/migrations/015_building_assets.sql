-- Building Assets & Capital Planning
-- Tracks all building assets/amenities with lifecycle data, maintenance costs,
-- condition history, warranties, and replacement projections.

create table building_assets (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,

  -- Core
  name                    text not null,
  category                text not null default 'Common Area',
  location                text not null default '',
  condition               text not null default 'Good',

  -- Lifecycle
  installed_date          text not null default '',
  original_cost           numeric not null default 0,
  useful_life_years       integer not null default 20,
  remaining_life_years    integer not null default 20,
  replacement_cost_today  numeric not null default 0,
  inflation_rate          numeric not null default 3,
  criticality             text not null default 'Medium',

  -- Annual costs
  annual_maintenance_cost numeric not null default 0,
  annual_operating_cost   numeric not null default 0,

  -- Hierarchy
  parent_asset_id         uuid references building_assets(id) on delete set null,

  -- Cross-module soft FKs (string IDs)
  reserve_item_id         text not null default '',
  amenity_config_id       text not null default '',
  gl_account_num          text not null default '',
  budget_category_id      text not null default '',

  -- JSONB arrays for many-to-many soft links
  maintenance_schedule_ids jsonb not null default '[]'::jsonb,
  work_order_ids           jsonb not null default '[]'::jsonb,
  vendor_ids               jsonb not null default '[]'::jsonb,
  insurance_policy_ids     jsonb not null default '[]'::jsonb,
  spending_approval_ids    jsonb not null default '[]'::jsonb,
  condition_history        jsonb not null default '[]'::jsonb,
  warranties               jsonb not null default '[]'::jsonb,

  -- Metadata
  notes                   text not null default '',
  insured_value           numeric not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Indexes
create index idx_building_assets_tenant on building_assets(tenant_id);
create index idx_building_assets_parent on building_assets(parent_asset_id);
create index idx_building_assets_tenant_category on building_assets(tenant_id, category);

-- RLS (three-tier pattern matching existing tables)
alter table building_assets enable row level security;

create policy "Users see own tenant assets" on building_assets for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "Board manages assets" on building_assets for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));

create policy "Admins manage assets" on building_assets for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));
