-- 019_meeting_items.sql
-- Add meeting-day recording columns to agenda items and meetings.

alter table meeting_agenda_items
  add column motion_text text,
  add column moved_by text,
  add column seconded_by text,
  add column tally jsonb not null default '{}',
  add column outcome text check (outcome in ('passed','failed','tabled','noted','discussed')),
  add column notes text not null default '',
  add column conflicts_declared jsonb not null default '[]',
  add column completed_at timestamptz;

alter table meetings
  add column called_to_order_at timestamptz,
  add column adjourned_at timestamptz,
  add column quorum_met boolean,
  add column minutes_generated_at timestamptz,
  add column minutes_approved_at timestamptz,
  add column minutes_doc jsonb;
