-- ─────────────────────────────────────────────────────────────────────────────
-- 032: the Property log is for everyone; the Intercom gets realtime and a
-- place for its attachments.
--
-- Additive. Owners can log what they observe (insert only; the board, the
-- manager and staff keep edit and delete). team_messages joins the realtime
-- publication so a sent message appears for the others without a refresh,
-- and the team-attachments bucket the Intercom already uploads to exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── property_logs: who wrote it, and everyone in the building may write ───────
alter table property_logs add column if not exists created_by uuid default auth.uid();

drop policy if exists "Members can create property_logs" on property_logs;
create policy "Members can create property_logs" on property_logs for insert
  with check (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

-- ── team_messages: realtime ──────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_messages') then
    alter publication supabase_realtime add table public.team_messages;
  end if;
end $$;

-- ── team-attachments bucket ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('team-attachments', 'team-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Team can upload intercom attachments" on storage.objects;
create policy "Team can upload intercom attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-attachments'
    and exists (
      select 1 from tenant_users tu
      where tu.user_id = auth.uid() and tu.role <> 'resident' and tu.status = 'active'
        and (storage.foldername(name))[1] = tu.tenant_id::text
    )
  );

drop policy if exists "Team can read intercom attachments" on storage.objects;
create policy "Team can read intercom attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-attachments'
    and exists (
      select 1 from tenant_users tu
      where tu.user_id = auth.uid() and tu.role <> 'resident' and tu.status = 'active'
        and (storage.foldername(name))[1] = tu.tenant_id::text
    )
  );
