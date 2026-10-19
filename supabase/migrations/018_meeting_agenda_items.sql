-- 018_meeting_agenda_items.sql
-- Structured agenda items for meetings + meeting scheduling metadata

create table meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  position int not null,
  title text not null,
  source_type text not null default 'manual' check (source_type in ('manual','standing','runbook','case','approval','vote','season')),
  source_id text,
  requires_vote boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meetings
  add column notice_sent_at timestamptz,
  add column reminder_scheduled_for timestamptz,
  add column packet_ready boolean not null default false,
  add column conflict_check_status jsonb not null default '[]';

-- RLS
alter table meeting_agenda_items enable row level security;

create policy "Tenant members can view agenda items"
  on meeting_agenda_items for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

create policy "Board members can manage agenda items"
  on meeting_agenda_items for all
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()))
  with check (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

-- Updated_at trigger (reuse handle_updated_at if it exists)
create trigger set_updated_at
  before update on meeting_agenda_items
  for each row execute function handle_updated_at();
