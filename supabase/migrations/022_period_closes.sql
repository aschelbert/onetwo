-- ============================================================================
-- ONE two HOA - Overhaul 11: Period Closes (Month Close)
-- Branch: overhaul/11-fiscal-tabs-close
-- ============================================================================
-- Adds: period_closes table for tracking monthly book closings.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PERIOD CLOSES
-- ────────────────────────────────────────────────────────────────────────────

create table period_closes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  period        text not null,                              -- 'YYYY-MM'
  closed_at     timestamptz,
  closed_by     text,
  statement_doc jsonb,                                      -- { html, text, archiveId }
  locked        boolean not null default false,
  checklist     jsonb not null default '{}',                -- { assessmentsPosted, paymentsRecorded, billsPaid, statementSent }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, period)
);

create index idx_period_closes_tenant on period_closes(tenant_id);
create index idx_period_closes_period on period_closes(tenant_id, period desc);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

alter table period_closes enable row level security;

create policy "Users see own tenant period closes" on period_closes for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages period closes" on period_closes for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage period closes" on period_closes for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGER: updated_at auto-refresh
-- (reuses the update_updated_at() function from 001_tenancy.sql)
-- ────────────────────────────────────────────────────────────────────────────

create trigger trg_period_closes_updated before update on period_closes
  for each row execute function update_updated_at();
