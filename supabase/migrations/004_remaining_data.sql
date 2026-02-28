-- ============================================================================
-- ONE two HOA — Remaining Data Tables
-- Run: supabase db push   or   supabase migration up
-- ============================================================================
-- Adds persistence for: building (board, management, legal, insurance, vendors),
-- financial (units, budget, reserves, CoA, GL, work orders, invoices, settings),
-- compliance (filings, completions, item attachments),
-- platform admin (support tickets, email templates, platform announcements),
-- and archives.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- BUILDING TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- Board Members
create table board_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  role        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  term        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_board_members_tenant on board_members(tenant_id);

-- Management Info (one-to-one per tenant)
create table management_info (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  company     text not null default '',
  contact     text not null default '',
  title       text not null default '',
  email       text not null default '',
  phone       text not null default '',
  emergency   text not null default '',
  address     text not null default '',
  hours       text not null default '',
  after_hours text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Legal Counsel
create table legal_counsel (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  firm        text not null,
  attorney    text not null default '',
  email       text not null default '',
  phone       text not null default '',
  specialty   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_legal_counsel_tenant on legal_counsel(tenant_id);

-- Legal Documents
create table legal_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  version     text not null default '',
  size        text not null default '',
  status      text not null default 'current',
  -- current | review-due
  attachments jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_legal_documents_tenant on legal_documents(tenant_id);

-- Insurance Policies
create table insurance_policies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null,
  carrier     text not null default '',
  coverage    text not null default '',
  premium     text not null default '',
  expires     text not null default '',
  policy_num  text not null default '',
  attachments jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_insurance_policies_tenant on insurance_policies(tenant_id);

-- Vendors
create table vendors (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  service     text not null default '',
  contact     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  contract    text not null default '',
  status      text not null default 'active',
  -- active | inactive
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vendors_tenant on vendors(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- FINANCIAL TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- Units (composite PK: tenant_id + number)
create table units (
  tenant_id            uuid not null references tenants(id) on delete cascade,
  number               text not null,
  owner                text not null default '',
  email                text not null default '',
  phone                text not null default '',
  monthly_fee          numeric not null default 0,
  voting_pct           numeric not null default 0,
  status               text not null default 'OCCUPIED',
  -- OCCUPIED | VACANT
  balance              numeric not null default 0,
  move_in              date,
  sqft                 int not null default 0,
  bedrooms             int not null default 0,
  parking              text,
  payments             jsonb not null default '[]',
  late_fees            jsonb not null default '[]',
  special_assessments  jsonb not null default '[]',
  stripe_customer_id   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (tenant_id, number)
);

-- Budget Categories
create table budget_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  budgeted    numeric not null default 0,
  expenses    jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_budget_categories_tenant on budget_categories(tenant_id);

-- Reserve Items
create table reserve_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  estimated_cost   numeric not null default 0,
  current_funding  numeric not null default 0,
  useful_life      numeric not null default 0,
  last_replaced    text not null default '',
  years_remaining  numeric not null default 0,
  is_contingency   boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_reserve_items_tenant on reserve_items(tenant_id);

-- Chart of Accounts (composite PK: tenant_id + num)
create table chart_of_accounts (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  num          text not null,
  name         text not null,
  type         text not null,
  -- asset | liability | equity | income | expense
  sub          text not null default '',
  parent       text,
  budget_cat   text,
  reserve_item text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, num)
);

-- General Ledger
create table general_ledger (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  local_id     text not null,
  date         date not null,
  memo         text not null default '',
  debit_acct   text not null,
  credit_acct  text not null,
  amount       numeric not null default 0,
  source       text not null default 'manual',
  -- manual | assessment | payment | expense | case | transfer | fee
  source_id    text,
  posted       timestamptz not null default now(),
  status       text not null default 'posted',
  -- posted | void
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_general_ledger_tenant on general_ledger(tenant_id);
create index idx_general_ledger_date on general_ledger(tenant_id, date);
create index idx_general_ledger_debit on general_ledger(tenant_id, debit_acct);
create index idx_general_ledger_credit on general_ledger(tenant_id, credit_acct);

-- Work Orders
create table work_orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  local_id       text not null,
  title          text not null,
  vendor         text not null default '',
  description    text not null default '',
  acct_num       text not null default '',
  amount         numeric not null default 0,
  status         text not null default 'draft',
  -- draft | approved | invoiced | paid
  case_id        text,
  created_date   date not null default current_date,
  approved_date  date,
  invoice_num    text,
  invoice_date   date,
  paid_date      date,
  gl_entry_id    text,
  attachments    jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_work_orders_tenant on work_orders(tenant_id);
create index idx_work_orders_status on work_orders(tenant_id, status);

-- Unit Invoices
create table unit_invoices (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  unit_number         text not null,
  type                text not null default 'fee',
  -- fee | special_assessment | monthly
  description         text not null default '',
  amount              numeric not null default 0,
  status              text not null default 'sent',
  -- sent | paid | overdue | void
  created_date        date not null default current_date,
  due_date            date not null default current_date,
  paid_date           date,
  paid_amount         numeric,
  payment_method      text,
  stripe_payment_link text,
  gl_entry_id         text,
  payment_gl_entry_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_unit_invoices_tenant on unit_invoices(tenant_id);
create index idx_unit_invoices_unit on unit_invoices(tenant_id, unit_number);

-- Financial Settings (one-to-one per tenant)
create table financial_settings (
  tenant_id                  uuid primary key references tenants(id) on delete cascade,
  hoa_due_day                int not null default 15,
  annual_reserve_contribution numeric not null default 12000,
  stripe_connect_id          text,
  stripe_onboarding_complete boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- COMPLIANCE TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- Regulatory Filings
create table regulatory_filings (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  category         text not null default '',
  due_date         date not null,
  status           text not null default 'pending',
  -- pending | filed
  filed_date       date,
  confirmation_num text not null default '',
  notes            text not null default '',
  responsible      text not null default '',
  recurrence       text not null default '',
  legal_ref        text not null default '',
  attachments      jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_regulatory_filings_tenant on regulatory_filings(tenant_id);

-- Compliance Completions (composite PK: tenant_id + item_id)
create table compliance_completions (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     text not null,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, item_id)
);

-- Compliance Item Attachments
create table compliance_item_attachments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     text not null,
  name        text not null,
  size        text not null default '',
  uploaded_at text not null default '',
  created_at  timestamptz not null default now()
);

create index idx_compliance_item_attachments_tenant on compliance_item_attachments(tenant_id);
create index idx_compliance_item_attachments_item on compliance_item_attachments(tenant_id, item_id);

-- ────────────────────────────────────────────────────────────────────────────
-- PLATFORM ADMIN TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- Support Tickets (building_id references tenants, not tenant_id pattern)
create table support_tickets (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references tenants(id) on delete cascade,
  building_name text not null default '',
  subject       text not null,
  description   text not null default '',
  status        text not null default 'open',
  -- open | in_progress | waiting | resolved | closed
  priority      text not null default 'medium',
  -- low | medium | high | urgent
  assigned_to   text,
  created_by    text not null default '',
  notes         jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_support_tickets_building on support_tickets(building_id);
create index idx_support_tickets_status on support_tickets(status);

-- Email Templates (platform-level, no tenant_id)
create table email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null default '',
  body        text not null default '',
  trigger     text not null default 'custom',
  -- onboarding_welcome | trial_ending | past_due | feature_update | monthly_report | custom
  last_edited date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Platform Announcements (platform-level, no tenant_id)
create table platform_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  message     text not null default '',
  audience    text not null default 'all',
  -- all | essentials | compliance_pro | advanced_governance
  status      text not null default 'draft',
  -- draft | sent
  created_by  text not null default '',
  sent_at     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- ARCHIVES
-- ────────────────────────────────────────────────────────────────────────────

create table archives (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  label        text not null,
  period_start date not null,
  period_end   date not null,
  created_by   text not null default '',
  snapshot     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_archives_tenant on archives(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

-- ── Building tables (tenant-scoped, three-tier) ──

alter table board_members enable row level security;
create policy "Users see own tenant board members" on board_members for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages board members" on board_members for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage board members" on board_members for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table management_info enable row level security;
create policy "Users see own tenant management" on management_info for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages management" on management_info for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage management" on management_info for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table legal_counsel enable row level security;
create policy "Users see own tenant legal counsel" on legal_counsel for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages legal counsel" on legal_counsel for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage legal counsel" on legal_counsel for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table legal_documents enable row level security;
create policy "Users see own tenant legal docs" on legal_documents for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages legal docs" on legal_documents for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage legal docs" on legal_documents for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table insurance_policies enable row level security;
create policy "Users see own tenant insurance" on insurance_policies for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages insurance" on insurance_policies for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage insurance" on insurance_policies for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table vendors enable row level security;
create policy "Users see own tenant vendors" on vendors for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages vendors" on vendors for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage vendors" on vendors for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Financial tables (tenant-scoped, three-tier) ──

alter table units enable row level security;
create policy "Users see own tenant units" on units for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages units" on units for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage units" on units for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table budget_categories enable row level security;
create policy "Users see own tenant budget" on budget_categories for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages budget" on budget_categories for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage budget" on budget_categories for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table reserve_items enable row level security;
create policy "Users see own tenant reserves" on reserve_items for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages reserves" on reserve_items for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage reserves" on reserve_items for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table chart_of_accounts enable row level security;
create policy "Users see own tenant CoA" on chart_of_accounts for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages CoA" on chart_of_accounts for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage CoA" on chart_of_accounts for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table general_ledger enable row level security;
create policy "Users see own tenant GL" on general_ledger for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages GL" on general_ledger for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage GL" on general_ledger for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table work_orders enable row level security;
create policy "Users see own tenant work orders" on work_orders for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages work orders" on work_orders for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage work orders" on work_orders for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table unit_invoices enable row level security;
create policy "Users see own tenant unit invoices" on unit_invoices for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages unit invoices" on unit_invoices for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage unit invoices" on unit_invoices for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table financial_settings enable row level security;
create policy "Users see own tenant financial settings" on financial_settings for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages financial settings" on financial_settings for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage financial settings" on financial_settings for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Compliance tables (tenant-scoped, three-tier) ──

alter table regulatory_filings enable row level security;
create policy "Users see own tenant filings" on regulatory_filings for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages filings" on regulatory_filings for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage filings" on regulatory_filings for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table compliance_completions enable row level security;
create policy "Users see own tenant completions" on compliance_completions for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages completions" on compliance_completions for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage completions" on compliance_completions for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

alter table compliance_item_attachments enable row level security;
create policy "Users see own tenant item attachments" on compliance_item_attachments for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages item attachments" on compliance_item_attachments for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage item attachments" on compliance_item_attachments for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Platform Admin tables ──

-- Support tickets: board sees own building, admins manage all
alter table support_tickets enable row level security;
create policy "Board sees own building tickets" on support_tickets for select
  using (building_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Board inserts tickets" on support_tickets for insert
  with check (building_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage tickets" on support_tickets for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Email templates: platform admins only
alter table email_templates enable row level security;
create policy "Admins manage templates" on email_templates for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Platform announcements: platform admins only
alter table platform_announcements enable row level security;
create policy "Admins manage platform announcements" on platform_announcements for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Archives (tenant-scoped, three-tier) ──

alter table archives enable row level security;
create policy "Users see own tenant archives" on archives for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages archives" on archives for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage archives" on archives for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at auto-refresh
-- (reuses the update_updated_at() function from 001_tenancy.sql)
-- ────────────────────────────────────────────────────────────────────────────

create trigger trg_board_members_updated before update on board_members
  for each row execute function update_updated_at();
create trigger trg_management_info_updated before update on management_info
  for each row execute function update_updated_at();
create trigger trg_legal_counsel_updated before update on legal_counsel
  for each row execute function update_updated_at();
create trigger trg_legal_documents_updated before update on legal_documents
  for each row execute function update_updated_at();
create trigger trg_insurance_policies_updated before update on insurance_policies
  for each row execute function update_updated_at();
create trigger trg_vendors_updated before update on vendors
  for each row execute function update_updated_at();
create trigger trg_units_updated before update on units
  for each row execute function update_updated_at();
create trigger trg_budget_categories_updated before update on budget_categories
  for each row execute function update_updated_at();
create trigger trg_reserve_items_updated before update on reserve_items
  for each row execute function update_updated_at();
create trigger trg_chart_of_accounts_updated before update on chart_of_accounts
  for each row execute function update_updated_at();
create trigger trg_general_ledger_updated before update on general_ledger
  for each row execute function update_updated_at();
create trigger trg_work_orders_updated before update on work_orders
  for each row execute function update_updated_at();
create trigger trg_unit_invoices_updated before update on unit_invoices
  for each row execute function update_updated_at();
create trigger trg_financial_settings_updated before update on financial_settings
  for each row execute function update_updated_at();
create trigger trg_regulatory_filings_updated before update on regulatory_filings
  for each row execute function update_updated_at();
create trigger trg_compliance_completions_updated before update on compliance_completions
  for each row execute function update_updated_at();
create trigger trg_support_tickets_updated before update on support_tickets
  for each row execute function update_updated_at();
create trigger trg_email_templates_updated before update on email_templates
  for each row execute function update_updated_at();
create trigger trg_platform_announcements_updated before update on platform_announcements
  for each row execute function update_updated_at();
create trigger trg_archives_updated before update on archives
  for each row execute function update_updated_at();
