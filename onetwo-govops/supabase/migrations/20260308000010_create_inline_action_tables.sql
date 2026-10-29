-- ============================================================================
-- Inline Action Tables for Case Steps
-- Tables: step_attachments, case_events, case_votes, case_vote_tallies,
--         formal_notices + storage bucket
-- ============================================================================

-- ─── step_attachments ───────────────────────────────────────────────────────

create table step_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references cases(id) on delete cascade,
  step_number int not null,
  file_name text not null,
  file_size bigint,
  content_type text,
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table step_attachments enable row level security;

create policy "Admins manage step_attachments" on step_attachments
  for all using (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid()));
create policy "Board manages step_attachments" on step_attachments
  for all using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid() AND tenant_users.role = 'board_member'::tenant_role));
create policy "Users see own tenant step_attachments" on step_attachments
  for select using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()));

-- ─── case_events ────────────────────────────────────────────────────────────

create table case_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references cases(id) on delete cascade,
  step_number int,
  event_type text not null check (event_type in ('meeting', 'deadline', 'reminder')),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table case_events enable row level security;

create policy "Admins manage case_events" on case_events
  for all using (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid()));
create policy "Board manages case_events" on case_events
  for all using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid() AND tenant_users.role = 'board_member'::tenant_role));
create policy "Users see own tenant case_events" on case_events
  for select using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()));

-- ─── case_votes + tallies ───────────────────────────────────────────────────

create table case_votes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references cases(id) on delete cascade,
  step_number int,
  motion text not null,
  vote_type text not null default 'simple_majority'
    check (vote_type in ('simple_majority', 'super_majority', 'unanimous')),
  status text not null default 'open'
    check (status in ('open', 'passed', 'failed', 'tabled')),
  opened_at timestamptz default now(),
  closed_at timestamptz,
  created_by uuid references auth.users(id)
);

create table case_vote_tallies (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references case_votes(id) on delete cascade,
  voter_name text not null,
  voter_role text,
  vote text not null check (vote in ('yea', 'nay', 'abstain')),
  cast_at timestamptz default now()
);

alter table case_votes enable row level security;
alter table case_vote_tallies enable row level security;

create policy "Admins manage case_votes" on case_votes
  for all using (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid()));
create policy "Board manages case_votes" on case_votes
  for all using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid() AND tenant_users.role = 'board_member'::tenant_role));
create policy "Users see own tenant case_votes" on case_votes
  for select using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()));

create policy "vote_tallies_access" on case_vote_tallies
  for all using (vote_id IN (
    SELECT cv.id FROM case_votes cv
    WHERE cv.tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid())
  ));

-- ─── formal_notices ─────────────────────────────────────────────────────────

create table formal_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references cases(id) on delete cascade,
  step_number int,
  notice_type text not null check (notice_type in ('formal_notice', 'certified_mail')),
  recipient_name text not null,
  recipient_address text,
  subject text not null,
  body text not null,
  tracking_number text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'delivered', 'returned')),
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table formal_notices enable row level security;

create policy "Admins manage formal_notices" on formal_notices
  for all using (EXISTS (SELECT 1 FROM platform_admins WHERE platform_admins.user_id = auth.uid()));
create policy "Board manages formal_notices" on formal_notices
  for all using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid() AND tenant_users.role = 'board_member'::tenant_role));
create policy "Users see own tenant formal_notices" on formal_notices
  for select using (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()));

-- ─── Storage bucket for case attachments ────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('case-attachments', 'case-attachments', false);

create policy "case_attachments_upload" on storage.objects for insert
  with check (bucket_id = 'case-attachments');

create policy "case_attachments_read" on storage.objects for select
  using (bucket_id = 'case-attachments');

create policy "case_attachments_delete" on storage.objects for delete
  using (bucket_id = 'case-attachments');
