-- ============================================================================
-- ONE two HOA - Overhaul 01: Foundation Data
-- Branch: overhaul/01-foundation-data
-- ============================================================================
-- Adds: step completions column, bylaws settings columns, board role_key,
-- v2 feature flags.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Compliance completions: add steps column
-- ────────────────────────────────────────────────────────────────────────────

alter table compliance_completions
  add column if not exists steps jsonb not null default '[]';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Bylaws facts as settings on financial_settings
-- ────────────────────────────────────────────────────────────────────────────

alter table financial_settings
  add column if not exists spending_limit numeric not null default 5000,
  add column if not exists quorum_pct int not null default 25,
  add column if not exists fiscal_year_start_month int not null default 1
    check (fiscal_year_start_month between 1 and 12),
  add column if not exists annual_meeting_month int not null default 4
    check (annual_meeting_month between 1 and 12),
  add column if not exists meeting_cadence text not null default 'monthly'
    check (meeting_cadence in ('monthly','bimonthly','quarterly')),
  add column if not exists meeting_weekday int
    check (meeting_weekday between 0 and 6),
  add column if not exists meeting_week_of_month int
    check (meeting_week_of_month between 1 and 5),
  add column if not exists meeting_time text not null default '19:00',
  add column if not exists board_notice_hours int not null default 48,
  add column if not exists annual_notice_min_days int not null default 10,
  add column if not exists annual_notice_max_days int not null default 60,
  add column if not exists budget_owner_review_days int not null default 30;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Board role enum (text with check constraint, not Postgres enum)
-- ────────────────────────────────────────────────────────────────────────────

alter table board_members
  add column if not exists role_key text
    check (role_key in ('president','vice_president','treasurer','secretary','member_at_large'));

-- Backfill from free-text role column
update board_members set role_key = case
  when lower(role) like '%vice%' and lower(role) like '%pres%' then 'vice_president'
  when lower(role) like '%pres%' then 'president'
  when lower(role) like '%treas%' then 'treasurer'
  when lower(role) like '%sec%' then 'secretary'
  else 'member_at_large'
end
where role_key is null;

-- Same for tenant_users.board_title
alter table tenant_users
  add column if not exists role_key text
    check (role_key in ('president','vice_president','treasurer','secretary','member_at_large'));

update tenant_users set role_key = case
  when lower(board_title) like '%vice%' and lower(board_title) like '%pres%' then 'vice_president'
  when lower(board_title) like '%pres%' then 'president'
  when lower(board_title) like '%treas%' then 'treasurer'
  when lower(board_title) like '%sec%' then 'secretary'
  else 'member_at_large'
end
where role_key is null and board_title is not null and board_title != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. v2 feature flags
-- ────────────────────────────────────────────────────────────────────────────

alter table tenant_features
  add column if not exists v2_home boolean not null default false,
  add column if not exists v2_drawers boolean not null default false,
  add column if not exists v2_board_room boolean not null default false,
  add column if not exists v2_fiscal_lens boolean not null default false,
  add column if not exists v2_cases boolean not null default false,
  add column if not exists v2_building boolean not null default false;

-- ────────────────────────────────────────────────────────────────────────────
-- NOTE: RLS policies already exist on all modified tables from earlier
-- migrations. No new tables are created here, so no new RLS is needed.
-- The updated_at triggers also already exist on these tables.
-- ────────────────────────────────────────────────────────────────────────────
