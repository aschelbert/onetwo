-- Migration 006: Unify Board Ops into Case System
-- Adds task-like fields to cases table and drops the now-unused board_tasks table.

alter table cases add column if not exists assigned_to text;
alter table cases add column if not exists assigned_role text;
alter table cases add column if not exists due_date date;
alter table cases add column if not exists source text;
alter table cases add column if not exists source_id text;
alter table cases add column if not exists completed_at timestamptz;

-- Drop the standalone board_tasks table (functionality merged into cases)
drop table if exists board_tasks cascade;
