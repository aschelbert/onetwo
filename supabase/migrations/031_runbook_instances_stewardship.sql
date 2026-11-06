-- ─────────────────────────────────────────────────────────────────────────────
-- 031: UX2 phase 1 — runbook instances and stewardship scores
--
-- Additive. Nothing in production reads these tables; the redesigned Home
-- (behind the ux2.home flag) mirrors per-person card state here and keeps a
-- monthly snapshot of stewardship scores so history survives data changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── runbook_instances ────────────────────────────────────────────────────────
-- One row per (tenant, user, card): the card was hidden, snoozed or marked
-- done on Home. card_id is the engine's stable id, e.g. 'filing:f1'.

create table if not exists runbook_instances (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  user_id        text not null,
  card_id        text not null,
  state          text not null check (state in ('hidden', 'snoozed', 'done')),
  snoozed_until  date,
  completed_at   timestamptz,
  meta           jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, user_id, card_id)
);

create index if not exists idx_runbook_instances_tenant_user on runbook_instances(tenant_id, user_id);

alter table runbook_instances enable row level security;

create policy "Users see own tenant runbook instances" on runbook_instances for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users manage own tenant runbook instances" on runbook_instances for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Admins manage runbook instances" on runbook_instances for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

create trigger trg_runbook_instances_updated before update on runbook_instances
  for each row execute function update_updated_at();

-- ── stewardship_scores ───────────────────────────────────────────────────────
-- Monthly snapshot per subject. subject_type 'user' scores a board member,
-- 'unit' an owner's unit, 'building' the average. dimensions holds the five
-- percentages ({"Timeliness": 94, ...}); events the receipts behind them.

create table if not exists stewardship_scores (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  subject_type   text not null check (subject_type in ('user', 'unit', 'building')),
  subject_id     text not null,
  period         text not null,                              -- 'YYYY-MM'
  total          integer not null check (total between 0 and 100),
  dimensions     jsonb not null default '{}',
  events         jsonb not null default '[]',
  computed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, subject_type, subject_id, period)
);

create index if not exists idx_stewardship_scores_tenant_period on stewardship_scores(tenant_id, period desc);

alter table stewardship_scores enable row level security;

create policy "Users see own tenant stewardship scores" on stewardship_scores for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages stewardship scores" on stewardship_scores for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'))
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage stewardship scores" on stewardship_scores for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

create trigger trg_stewardship_scores_updated before update on stewardship_scores
  for each row execute function update_updated_at();
