-- ─────────────────────────────────────────────────────────────────────────────
-- 034: governing clauses — what the bylaws and rules say about the board, each
-- officer, unit owners, and residents, accepted during building setup.
--
-- Additive. Everyone in the building can read them (owners see their
-- obligations and the rules); the board, the manager and the account owner
-- add, change and remove them. Shown under Building › Obligations › Duties
-- and roles.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists governing_clauses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  topic       text not null check (topic in ('board', 'officer', 'owners', 'rules')),
  role        text,                          -- the office, for officer clauses
  ref         text not null default '',      -- e.g. "Art. IV §4.3"
  heading     text not null,
  body        text not null default '',
  source      text not null default '',      -- document and page, e.g. "Bylaws p.2"
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_governing_clauses_tenant on governing_clauses(tenant_id);
-- One clause per topic, office and heading in a building: accepting it again updates it.
create unique index if not exists uq_governing_clauses_key on governing_clauses(tenant_id, topic, coalesce(role, ''), lower(heading));

alter table governing_clauses enable row level security;

drop policy if exists "Members read governing clauses" on governing_clauses;
create policy "Members read governing clauses" on governing_clauses for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

drop policy if exists "Board manages governing clauses" on governing_clauses;
create policy "Board manages governing clauses" on governing_clauses for all
  using (tenant_id in (
    select tenant_id from tenant_users
    where user_id = auth.uid() and (role in ('board_member', 'property_manager') or is_account_owner)
  ))
  with check (tenant_id in (
    select tenant_id from tenant_users
    where user_id = auth.uid() and (role in ('board_member', 'property_manager') or is_account_owner)
  ));

drop policy if exists "Admins manage governing clauses" on governing_clauses;
create policy "Admins manage governing clauses" on governing_clauses for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));
