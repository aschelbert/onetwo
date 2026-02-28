-- ============================================================================
-- ONE two HOA — Operational Data Tables
-- Run: supabase db push   or   supabase migration up
-- ============================================================================
-- Adds persistence for: announcements, meetings, issues, cases, elections,
-- and communications. Each table is tenant-scoped with RLS.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- ANNOUNCEMENTS
-- ────────────────────────────────────────────────────────────────────────────

create table announcements (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  body        text not null,
  category    text not null default 'general',
  -- general | maintenance | financial | safety | rules | meeting
  posted_by   text not null,
  posted_date date not null default current_date,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_announcements_tenant on announcements(tenant_id);
create index idx_announcements_posted on announcements(tenant_id, posted_date desc);

-- ────────────────────────────────────────────────────────────────────────────
-- MEETINGS
-- ────────────────────────────────────────────────────────────────────────────

create table meetings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  title           text not null,
  type            text not null default 'BOARD',
  -- BOARD | QUARTERLY | ANNUAL | SPECIAL | COMMITTEE
  status          text not null default 'SCHEDULED',
  -- SCHEDULED | RESCHEDULED | COMPLETED | CANCELLED
  date            date not null,
  time            text not null default '19:00',
  location        text not null default '',
  virtual_link    text not null default '',
  agenda          jsonb not null default '[]',         -- text[]
  notes           text not null default '',
  attendees       jsonb not null default '{"board":[],"owners":[],"guests":[]}',
  minutes         text not null default '',
  votes           jsonb not null default '[]',         -- MeetingVote[]
  linked_case_ids jsonb not null default '[]',         -- string[]
  linked_vote_ids jsonb not null default '[]',         -- string[]
  documents       jsonb not null default '[]',         -- MeetingDocument[]
  minutes_approvals jsonb not null default '[]',       -- MinutesApproval[]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_meetings_tenant on meetings(tenant_id);
create index idx_meetings_date on meetings(tenant_id, date desc);
create index idx_meetings_status on meetings(tenant_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- ISSUES
-- ────────────────────────────────────────────────────────────────────────────

create table issues (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  local_id        text not null,                       -- e.g. iss-1
  type            text not null default 'BUILDING_PUBLIC',
  -- BUILDING_PUBLIC | UNIT_PRIVATE
  category        text not null default '',
  priority        text not null default 'MEDIUM',
  -- URGENT | HIGH | MEDIUM | LOW
  status          text not null default 'SUBMITTED',
  -- SUBMITTED | IN_PROGRESS | RESOLVED | CLOSED
  title           text not null,
  description     text not null default '',
  reported_by     text not null,
  reporter_name   text not null default '',
  reporter_email  text not null default '',
  unit_number     text,
  submitted_date  date not null default current_date,
  view_count      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_issues_tenant on issues(tenant_id);
create index idx_issues_status on issues(tenant_id, status);
create index idx_issues_submitted on issues(tenant_id, submitted_date desc);

-- ── Issue child tables ──

create table issue_upvotes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  issue_id    uuid not null references issues(id) on delete cascade,
  user_id     text not null,
  user_name   text not null,
  unit_number text not null,
  created_at  timestamptz not null default now(),
  unique(issue_id, user_id)
);

create index idx_issue_upvotes_issue on issue_upvotes(issue_id);

create table issue_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  issue_id    uuid not null references issues(id) on delete cascade,
  local_id    text not null,                           -- e.g. cmt-1
  author      text not null,
  text        text not null,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index idx_issue_comments_issue on issue_comments(issue_id);

create table issue_review_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  issue_id    uuid not null references issues(id) on delete cascade,
  local_id    text not null,
  author      text not null,
  text        text not null,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index idx_issue_review_notes_issue on issue_review_notes(issue_id);

-- ────────────────────────────────────────────────────────────────────────────
-- CASES (Case Tracker / Case Ops)
-- ────────────────────────────────────────────────────────────────────────────

create table cases (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  local_id        text not null,                       -- e.g. c1
  cat_id          text not null,
  sit_id          text not null,
  title           text not null,
  unit            text not null default '',
  owner           text not null default '',
  approach        text not null default 'pre',
  -- pre | self | legal
  status          text not null default 'open',
  -- open | closed
  priority        text not null default 'medium',
  -- urgent | high | medium | low
  created_date    date not null default current_date,
  notes           text not null default '',
  board_votes     jsonb,                               -- BoardVote | null
  linked_wos      jsonb not null default '[]',         -- string[]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_cases_tenant on cases(tenant_id);
create index idx_cases_status on cases(tenant_id, status);

-- ── Case child tables ──

create table case_steps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  case_id     uuid not null references cases(id) on delete cascade,
  local_id    text not null,                           -- e.g. s0
  step_text   text not null,                           -- the 's' field
  timing      text,                                    -- the 't' field
  doc_ref     text,                                    -- the 'd' field
  detail      text,
  warning     text,                                    -- the 'w' field
  done        boolean not null default false,
  done_date   date,
  user_notes  text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_case_steps_case on case_steps(case_id);

create table case_communications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  case_id     uuid not null references cases(id) on delete cascade,
  local_id    text not null,                           -- e.g. cm1
  type        text not null default '',
  subject     text not null,
  date        date not null default current_date,
  method      text not null default '',
  recipient   text not null default '',
  sent_by     text not null default '',
  notes       text not null default '',
  status      text not null default 'sent',
  created_at  timestamptz not null default now()
);

create index idx_case_comms_case on case_communications(case_id);

-- ────────────────────────────────────────────────────────────────────────────
-- ELECTIONS
-- ────────────────────────────────────────────────────────────────────────────

create table elections (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  title               text not null,
  type                text not null default 'board_election',
  -- board_election | budget_approval | special_assessment | bylaw_amendment | rule_change | meeting_motion | other
  status              text not null default 'draft',
  -- draft | open | closed | certified
  description         text not null default '',
  created_by          text not null,
  opened_at           timestamptz,
  closed_at           timestamptz,
  certified_at        timestamptz,
  certified_by        text,
  scheduled_close_date date,
  notice_date         date,
  quorum_required     numeric not null default 50,
  legal_ref           text not null default '',
  notes               text not null default '',
  resolution          jsonb,                           -- Resolution | null
  linked_case_id      text,
  linked_meeting_id   text,
  compliance_checks   jsonb not null default '[]',     -- ComplianceCheck[]
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_elections_tenant on elections(tenant_id);
create index idx_elections_status on elections(tenant_id, status);

-- ── Election child tables ──

create table election_ballot_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  election_id         uuid not null references elections(id) on delete cascade,
  local_id            text not null,
  title               text not null,
  description         text not null default '',
  rationale           text not null default '',
  type                text not null default 'yes_no',
  -- yes_no | multi_candidate | multi_select
  candidates          jsonb not null default '[]',     -- Candidate[]
  max_selections      int,
  required_threshold  numeric not null default 50.1,
  legal_ref           text not null default '',
  attachments         jsonb not null default '[]',     -- BallotAttachment[]
  financial_impact    text,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index idx_election_ballot_items on election_ballot_items(election_id);

create table election_ballots (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  election_id         uuid not null references elections(id) on delete cascade,
  local_id            text not null,
  unit_number         text not null,
  owner               text not null,
  voting_pct          numeric not null,
  method              text not null default 'paper',
  -- paper | oral | virtual
  recorded_by         text not null,
  recorded_at         timestamptz not null default now(),
  is_proxy            boolean not null default false,
  proxy_voter_name    text,
  proxy_authorized_by text,
  votes               jsonb not null default '{}',     -- Record<string, VoteChoice | string[]>
  comment             text,
  created_at          timestamptz not null default now(),
  unique(election_id, unit_number)
);

create index idx_election_ballots on election_ballots(election_id);

create table election_timeline_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  election_id uuid not null references elections(id) on delete cascade,
  local_id    text not null,
  type        text not null,
  -- created | opened | ballot_recorded | closed | certified | comment | compliance_updated | document_added | case_created
  description text not null,
  date        timestamptz not null default now(),
  actor       text not null,
  created_at  timestamptz not null default now()
);

create index idx_election_timeline on election_timeline_events(election_id);

create table election_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  election_id uuid not null references elections(id) on delete cascade,
  local_id    text not null,
  unit_number text not null,
  owner       text not null,
  text        text not null,
  created_at  timestamptz not null default now()
);

create index idx_election_comments on election_comments(election_id);

-- ────────────────────────────────────────────────────────────────────────────
-- COMMUNICATIONS (Owner Communications)
-- ────────────────────────────────────────────────────────────────────────────

create table communications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null default '',
  -- notice | minutes | financial | response | resale
  subject     text not null,
  date        date not null default current_date,
  method      text not null default '',
  recipients  text not null default '',
  responded_by text,
  status      text not null default 'pending',
  -- sent | pending | draft
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_communications_tenant on communications(tenant_id);
create index idx_communications_date on communications(tenant_id, date desc);

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

-- Helper: check if user belongs to tenant
-- (reuses the existing tenant_users table from 001_tenancy.sql)

alter table announcements enable row level security;
alter table meetings enable row level security;
alter table issues enable row level security;
alter table issue_upvotes enable row level security;
alter table issue_comments enable row level security;
alter table issue_review_notes enable row level security;
alter table cases enable row level security;
alter table case_steps enable row level security;
alter table case_communications enable row level security;
alter table elections enable row level security;
alter table election_ballot_items enable row level security;
alter table election_ballots enable row level security;
alter table election_timeline_events enable row level security;
alter table election_comments enable row level security;
alter table communications enable row level security;

-- ── Announcements ──
create policy "Users see own tenant announcements" on announcements for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages announcements" on announcements for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage announcements" on announcements for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Meetings ──
create policy "Users see own tenant meetings" on meetings for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages meetings" on meetings for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage meetings" on meetings for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Issues ──
-- Residents can INSERT issues (submit requests) and SELECT
create policy "Users see own tenant issues" on issues for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users insert issues" on issues for insert
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages issues" on issues for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage issues" on issues for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Issue Upvotes ──
create policy "Users see own tenant upvotes" on issue_upvotes for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users insert upvotes" on issue_upvotes for insert
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users delete own upvotes" on issue_upvotes for delete
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()) and user_id = auth.uid()::text);
create policy "Board manages upvotes" on issue_upvotes for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage upvotes" on issue_upvotes for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Issue Comments ──
create policy "Users see own tenant comments" on issue_comments for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users insert comments" on issue_comments for insert
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages comments" on issue_comments for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage comments" on issue_comments for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Issue Review Notes ──
create policy "Users see own tenant review notes" on issue_review_notes for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages review notes" on issue_review_notes for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage review notes" on issue_review_notes for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Cases ──
create policy "Users see own tenant cases" on cases for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages cases" on cases for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage cases" on cases for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Case Steps ──
create policy "Users see own tenant case steps" on case_steps for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages case steps" on case_steps for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage case steps" on case_steps for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Case Communications ──
create policy "Users see own tenant case comms" on case_communications for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages case comms" on case_communications for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage case comms" on case_communications for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Elections ──
create policy "Users see own tenant elections" on elections for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages elections" on elections for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage elections" on elections for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Election Ballot Items ──
create policy "Users see own tenant ballot items" on election_ballot_items for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages ballot items" on election_ballot_items for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage ballot items" on election_ballot_items for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Election Ballots ──
create policy "Users see own tenant ballots" on election_ballots for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages ballots" on election_ballots for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage ballots" on election_ballots for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Election Timeline Events ──
create policy "Users see own tenant timeline" on election_timeline_events for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages timeline" on election_timeline_events for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage timeline" on election_timeline_events for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Election Comments ──
-- Residents can INSERT comments on elections
create policy "Users see own tenant election comments" on election_comments for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Users insert election comments" on election_comments for insert
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages election comments" on election_comments for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage election comments" on election_comments for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Communications ──
create policy "Users see own tenant communications" on communications for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));
create policy "Board manages communications" on communications for all
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid() and role = 'board_member'));
create policy "Admins manage communications" on communications for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: updated_at auto-refresh
-- (reuses the update_updated_at() function from 001_tenancy.sql)
-- ────────────────────────────────────────────────────────────────────────────

create trigger trg_announcements_updated before update on announcements
  for each row execute function update_updated_at();
create trigger trg_meetings_updated before update on meetings
  for each row execute function update_updated_at();
create trigger trg_issues_updated before update on issues
  for each row execute function update_updated_at();
create trigger trg_cases_updated before update on cases
  for each row execute function update_updated_at();
create trigger trg_elections_updated before update on elections
  for each row execute function update_updated_at();
create trigger trg_communications_updated before update on communications
  for each row execute function update_updated_at();
