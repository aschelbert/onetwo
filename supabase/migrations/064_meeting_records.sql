-- 064: a meeting run as its own record.
--
-- 1. meetings.items: the agenda as items, each with its minutes, its
--    attachments (everyone's) and, when it has one, its vote and the recorded
--    result. meetings.session: the rest of the meeting's progress (the item in
--    hand, how the notice and summary went out, when the record was sealed).
--    Members can read meetings, so nothing board-only goes in either column.
-- 2. meeting_private: board-only attachments (a delinquency report) and
--    attendance by unit. Only the board reads or writes it.
-- 3. meeting_ballots: one owner ballot per unit per agenda item. An owner sees
--    only their own unit's; the board sees all. Ballots are cast through
--    cast_meeting_ballot, which checks the unit is the caller's, the notice has
--    gone out and the vote is open. meeting_ballot_counts tells any member how
--    many units have voted on each item, never how.

alter table public.meetings add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.meetings add column if not exists session jsonb not null default '{}'::jsonb;

-- ── Board-only side of a meeting ─────────────────────────────────────────────
create table if not exists public.meeting_private (
  meeting_id uuid primary key references public.meetings(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  attachments jsonb not null default '[]'::jsonb,
  attendance jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.meeting_private enable row level security;

drop policy if exists "Board manages private meeting data" on public.meeting_private;
create policy "Board manages private meeting data" on public.meeting_private for all to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = meeting_private.tenant_id and tu.role = 'board_member'))
  with check (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = meeting_private.tenant_id and tu.role = 'board_member'));
drop policy if exists "Admins manage private meeting data" on public.meeting_private;
create policy "Admins manage private meeting data" on public.meeting_private for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

-- ── Owner ballots on agenda items ────────────────────────────────────────────
create table if not exists public.meeting_ballots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  item_id text not null,
  unit_number text not null,
  -- "for" | "against" | "abstain", or a list of candidate names
  choice jsonb not null,
  method text not null check (method in ('online', 'paper', 'proxy', 'remote', 'room')),
  proxy_holder text,
  cast_by uuid references auth.users(id) on delete set null,
  cast_at timestamptz not null default now(),
  unique (meeting_id, item_id, unit_number)
);
create index if not exists meeting_ballots_meeting_idx on public.meeting_ballots (meeting_id);
alter table public.meeting_ballots enable row level security;

drop policy if exists "Board manages meeting ballots" on public.meeting_ballots;
create policy "Board manages meeting ballots" on public.meeting_ballots for all to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = meeting_ballots.tenant_id and tu.role = 'board_member'))
  with check (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = meeting_ballots.tenant_id and tu.role = 'board_member'));
drop policy if exists "Owners read their unit's ballots" on public.meeting_ballots;
create policy "Owners read their unit's ballots" on public.meeting_ballots for select to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = meeting_ballots.tenant_id and tu.unit is not null and tu.unit = meeting_ballots.unit_number));
drop policy if exists "Admins manage meeting ballots" on public.meeting_ballots;
create policy "Admins manage meeting ballots" on public.meeting_ballots for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

-- Cast (or change) a unit's ballot on one agenda item.
create or replace function public.cast_meeting_ballot(p_meeting uuid, p_item text, p_unit text, p_choice jsonb, p_method text default 'online', p_proxy_holder text default null)
returns public.meeting_ballots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_items jsonb;
  v_notice timestamptz;
  v_item jsonb;
  v_vote jsonb;
  v_board boolean;
  v_row public.meeting_ballots;
begin
  select tenant_id, items, notice_sent_at into v_tenant, v_items, v_notice from public.meetings where id = p_meeting;
  if v_tenant is null then raise exception 'meeting_not_found'; end if;

  select exists (select 1 from public.tenant_users where user_id = auth.uid() and tenant_id = v_tenant and role = 'board_member' and coalesce(status, 'active') = 'active')
    into v_board;
  if not v_board and not exists (
    select 1 from public.tenant_users where user_id = auth.uid() and tenant_id = v_tenant and unit = p_unit and coalesce(status, 'active') = 'active'
  ) then
    raise exception 'not_your_unit';
  end if;

  select e into v_item from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) e where e->>'id' = p_item limit 1;
  v_vote := v_item->'vote';
  if v_vote is null or v_vote->>'who' <> 'owners' then raise exception 'no_owner_vote_on_item'; end if;
  if v_vote->>'status' <> 'open' then raise exception 'vote_not_open'; end if;

  if not v_board then
    if v_notice is null then raise exception 'notice_not_sent'; end if;
    if p_method not in ('online', 'remote') then raise exception 'method_not_allowed'; end if;
  elsif p_method not in ('online', 'paper', 'proxy', 'remote', 'room') then
    raise exception 'method_not_allowed';
  end if;

  if v_vote->'candidates' is not null and jsonb_typeof(v_vote->'candidates') = 'array' and jsonb_array_length(v_vote->'candidates') > 0 then
    if jsonb_typeof(p_choice) <> 'array'
      or jsonb_array_length(p_choice) > coalesce((v_vote->>'pick')::int, 1)
      or exists (select 1 from jsonb_array_elements_text(p_choice) c where not (v_vote->'candidates') ? c) then
      raise exception 'bad_choice';
    end if;
  elsif jsonb_typeof(p_choice) <> 'string' or (p_choice #>> '{}') not in ('for', 'against', 'abstain') then
    raise exception 'bad_choice';
  end if;

  insert into public.meeting_ballots (tenant_id, meeting_id, item_id, unit_number, choice, method, proxy_holder, cast_by, cast_at)
  values (v_tenant, p_meeting, p_item, p_unit, p_choice, p_method, p_proxy_holder, auth.uid(), now())
  on conflict (meeting_id, item_id, unit_number)
  do update set choice = excluded.choice, method = excluded.method, proxy_holder = excluded.proxy_holder, cast_by = excluded.cast_by, cast_at = excluded.cast_at
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.cast_meeting_ballot(uuid, text, text, jsonb, text, text) from public;
grant execute on function public.cast_meeting_ballot(uuid, text, text, jsonb, text, text) to authenticated;

-- How many units have voted on each item of a meeting: counts only.
create or replace function public.meeting_ballot_counts(p_meeting uuid)
returns table (item_id text, units integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.item_id, count(*)::int
  from public.meeting_ballots b
  join public.meetings m on m.id = b.meeting_id
  where b.meeting_id = p_meeting
    and exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = m.tenant_id)
  group by b.item_id;
$$;
revoke all on function public.meeting_ballot_counts(uuid) from public;
grant execute on function public.meeting_ballot_counts(uuid) to authenticated;
