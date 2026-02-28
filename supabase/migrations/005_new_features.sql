-- ============================================================================
-- ONE two HOA — New Feature Tables
-- Run: supabase db push   or   supabase migration up
-- ============================================================================
-- Adds persistence for: board ops (task & action management),
-- vendor tracker (bids, reviews, contracts), spending approvals,
-- letter engine (templates, generated letters), property log (inspections),
-- auto-reports (configs, generated reports), and management company scorecard.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BOARD OPS — Task & Action Management
-- ────────────────────────────────────────────────────────────────────────────

create table board_tasks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  status        text not null default 'open',
  -- open | in_progress | done | blocked
  priority      text not null default 'medium',
  -- low | medium | high | urgent
  assigned_to   text not null default '',
  assigned_role text not null default '',
  due_date      text not null default '',
  category      text not null default 'general',
  -- governance | maintenance | financial | legal | compliance | general
  source        text not null default '',
  source_id     text not null default '',
  notes         text not null default '',
  completed_at  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_board_tasks_tenant on board_tasks(tenant_id);
create index idx_board_tasks_status on board_tasks(tenant_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. VENDOR TRACKER — Bids, Reviews, Contracts
-- ────────────────────────────────────────────────────────────────────────────

-- Vendor Bids
create table vendor_bids (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  vendor_id      text not null default '',
  vendor_name    text not null default '',
  project        text not null,
  amount         numeric not null default 0,
  status         text not null default 'pending',
  -- pending | accepted | rejected
  submitted_date text not null default '',
  notes          text not null default '',
  attachments    jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_vendor_bids_tenant on vendor_bids(tenant_id);

-- Vendor Reviews
create table vendor_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  vendor_id   text not null default '',
  vendor_name text not null default '',
  rating      integer not null default 5,
  -- 1-5 stars
  review      text not null default '',
  reviewer    text not null default '',
  date        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vendor_reviews_tenant on vendor_reviews(tenant_id);

-- Vendor Contracts
create table vendor_contracts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  vendor_id   text not null default '',
  vendor_name text not null default '',
  title       text not null default '',
  start_date  text not null default '',
  end_date    text not null default '',
  amount      numeric not null default 0,
  status      text not null default 'active',
  -- active | expired | pending
  auto_renew  boolean not null default false,
  attachments jsonb not null default '[]',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vendor_contracts_tenant on vendor_contracts(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SPENDING APPROVALS
-- ────────────────────────────────────────────────────────────────────────────

create table spending_approvals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  amount        numeric not null default 0,
  category      text not null default 'maintenance',
  -- maintenance | capital | operations | legal | other
  requested_by  text not null default '',
  status        text not null default 'pending',
  -- pending | approved | denied | more_info
  priority      text not null default 'normal',
  -- normal | urgent
  vendor_name   text not null default '',
  work_order_id text not null default '',
  votes         jsonb not null default '[]',
  threshold     numeric not null default 0,
  notes         text not null default '',
  decided_at    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_spending_approvals_tenant on spending_approvals(tenant_id);
create index idx_spending_approvals_status on spending_approvals(tenant_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. LETTER ENGINE — Templates & Generated Letters
-- ────────────────────────────────────────────────────────────────────────────

-- Letter Templates
create table letter_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  category    text not null default 'general',
  -- violation | collection | notice | welcome | maintenance | general
  subject     text not null default '',
  body        text not null default '',
  variables   jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_letter_templates_tenant on letter_templates(tenant_id);

-- Generated Letters
create table generated_letters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  template_id   text not null default '',
  template_name text not null default '',
  recipient     text not null default '',
  unit_number   text not null default '',
  subject       text not null default '',
  body          text not null default '',
  status        text not null default 'draft',
  -- draft | sent | archived
  sent_date     text not null default '',
  sent_via      text not null default '',
  -- email | mail | both
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_generated_letters_tenant on generated_letters(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. PROPERTY LOG — Inspection & Walkthrough
-- ────────────────────────────────────────────────────────────────────────────

create table property_logs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  type         text not null default 'walkthrough',
  -- walkthrough | inspection | incident | maintenance_check
  title        text not null,
  date         text not null default '',
  conducted_by text not null default '',
  location     text not null default '',
  status       text not null default 'open',
  -- open | resolved | monitoring
  findings     jsonb not null default '[]',
  action_items jsonb not null default '[]',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_property_logs_tenant on property_logs(tenant_id);
create index idx_property_logs_date on property_logs(tenant_id, date);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. AUTO-REPORTS — Board Packets (Configs & Generated Reports)
-- ────────────────────────────────────────────────────────────────────────────

-- Report Configs
create table report_configs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  name           text not null,
  type           text not null default 'board_packet',
  -- board_packet | monthly_summary | compliance_report | financial_snapshot
  sections       jsonb not null default '[]',
  schedule       text not null default 'manual',
  -- manual | monthly | quarterly
  last_generated text not null default '',
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_report_configs_tenant on report_configs(tenant_id);

-- Generated Reports
create table generated_reports (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  config_id    text not null default '',
  name         text not null default '',
  type         text not null default 'board_packet',
  generated_at text not null default '',
  generated_by text not null default '',
  snapshot     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_generated_reports_tenant on generated_reports(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. MANAGEMENT COMPANY SCORECARD
-- ────────────────────────────────────────────────────────────────────────────

-- Scorecard Entries
create table pm_scorecard_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  period      text not null default '',
  category    text not null default 'responsiveness',
  -- responsiveness | financial | maintenance | communication | compliance
  score       integer not null default 0,
  -- 1-5
  notes       text not null default '',
  scored_by   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_pm_scorecard_tenant on pm_scorecard_entries(tenant_id);
create index idx_pm_scorecard_period on pm_scorecard_entries(tenant_id, period);

-- Scorecard Reviews
create table pm_scorecard_reviews (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  period         text not null default '',
  overall_rating integer not null default 0,
  summary        text not null default '',
  strengths      jsonb not null default '[]',
  improvements   jsonb not null default '[]',
  reviewed_by    text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_pm_scorecard_reviews_tenant on pm_scorecard_reviews(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Board Tasks ──

alter table board_tasks enable row level security;
create policy "Users can view own tenant board_tasks" on board_tasks for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage board_tasks" on board_tasks for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all board_tasks" on board_tasks for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 2. Vendor Bids ──

alter table vendor_bids enable row level security;
create policy "Users can view own tenant vendor_bids" on vendor_bids for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage vendor_bids" on vendor_bids for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all vendor_bids" on vendor_bids for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 2. Vendor Reviews ──

alter table vendor_reviews enable row level security;
create policy "Users can view own tenant vendor_reviews" on vendor_reviews for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage vendor_reviews" on vendor_reviews for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all vendor_reviews" on vendor_reviews for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 2. Vendor Contracts ──

alter table vendor_contracts enable row level security;
create policy "Users can view own tenant vendor_contracts" on vendor_contracts for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage vendor_contracts" on vendor_contracts for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all vendor_contracts" on vendor_contracts for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 3. Spending Approvals ──

alter table spending_approvals enable row level security;
create policy "Users can view own tenant spending_approvals" on spending_approvals for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage spending_approvals" on spending_approvals for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all spending_approvals" on spending_approvals for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 4. Letter Templates ──

alter table letter_templates enable row level security;
create policy "Users can view own tenant letter_templates" on letter_templates for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage letter_templates" on letter_templates for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all letter_templates" on letter_templates for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 4. Generated Letters ──

alter table generated_letters enable row level security;
create policy "Users can view own tenant generated_letters" on generated_letters for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage generated_letters" on generated_letters for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all generated_letters" on generated_letters for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 5. Property Logs ──

alter table property_logs enable row level security;
create policy "Users can view own tenant property_logs" on property_logs for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage property_logs" on property_logs for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all property_logs" on property_logs for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 6. Report Configs ──

alter table report_configs enable row level security;
create policy "Users can view own tenant report_configs" on report_configs for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage report_configs" on report_configs for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all report_configs" on report_configs for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 6. Generated Reports ──

alter table generated_reports enable row level security;
create policy "Users can view own tenant generated_reports" on generated_reports for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage generated_reports" on generated_reports for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all generated_reports" on generated_reports for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 7. PM Scorecard Entries ──

alter table pm_scorecard_entries enable row level security;
create policy "Users can view own tenant pm_scorecard_entries" on pm_scorecard_entries for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage pm_scorecard_entries" on pm_scorecard_entries for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all pm_scorecard_entries" on pm_scorecard_entries for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── 7. PM Scorecard Reviews ──

alter table pm_scorecard_reviews enable row level security;
create policy "Users can view own tenant pm_scorecard_reviews" on pm_scorecard_reviews for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board can manage pm_scorecard_reviews" on pm_scorecard_reviews for all
  using (tenant_id in (
    select tu.tenant_id from tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'board_member'
  ));
create policy "Platform admins manage all pm_scorecard_reviews" on pm_scorecard_reviews for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at auto-refresh
-- (reuses the update_updated_at() function from 001_tenancy.sql)
-- ────────────────────────────────────────────────────────────────────────────

create trigger trg_board_tasks_updated before update on board_tasks
  for each row execute function update_updated_at();
create trigger trg_vendor_bids_updated before update on vendor_bids
  for each row execute function update_updated_at();
create trigger trg_vendor_reviews_updated before update on vendor_reviews
  for each row execute function update_updated_at();
create trigger trg_vendor_contracts_updated before update on vendor_contracts
  for each row execute function update_updated_at();
create trigger trg_spending_approvals_updated before update on spending_approvals
  for each row execute function update_updated_at();
create trigger trg_letter_templates_updated before update on letter_templates
  for each row execute function update_updated_at();
create trigger trg_generated_letters_updated before update on generated_letters
  for each row execute function update_updated_at();
create trigger trg_property_logs_updated before update on property_logs
  for each row execute function update_updated_at();
create trigger trg_report_configs_updated before update on report_configs
  for each row execute function update_updated_at();
create trigger trg_generated_reports_updated before update on generated_reports
  for each row execute function update_updated_at();
create trigger trg_pm_scorecard_entries_updated before update on pm_scorecard_entries
  for each row execute function update_updated_at();
create trigger trg_pm_scorecard_reviews_updated before update on pm_scorecard_reviews
  for each row execute function update_updated_at();
