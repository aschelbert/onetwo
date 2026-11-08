-- ─────────────────────────────────────────────────────────────────────────────
-- 039: Intercom attachments are private.
--
-- The team-attachments bucket was public, and production also had two broad
-- policies (team_attachments_read for everyone, team_attachments_upload for
-- any signed-in user), so any file could be opened by anyone with its link
-- and anyone signed in could upload. Now:
--   - The bucket is private; the app opens a file through a 60-second signed
--     link, and team_messages.attachment_url holds the storage path.
--   - Reading a file: an active team member (not a resident) of the building
--     who can see a message it's attached to (team_messages policies, so a
--     channel restricted to a role stays restricted), or who uploaded it.
--   - Uploading: unchanged (active team members, into their building's folder).
--   - Deleting: the uploader, while no message points to the file (a send
--     that failed after the upload).
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets set public = false, file_size_limit = 26214400 where id = 'team-attachments';

drop policy if exists team_attachments_read on storage.objects;
drop policy if exists team_attachments_upload on storage.objects;

drop policy if exists "Team can read intercom attachments" on storage.objects;
create policy "Team can read intercom attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-attachments'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role <> 'resident' and tu.status = 'active'
        and (storage.foldername(objects.name))[1] = tu.tenant_id::text
    )
    and (
      exists (select 1 from public.team_messages m where m.attachment_url = objects.name)
      or objects.owner_id = auth.uid()::text
    )
  );

drop policy if exists "Uploader removes an unsent intercom attachment" on storage.objects;
create policy "Uploader removes an unsent intercom attachment" on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-attachments'
    and objects.owner_id = auth.uid()::text
    and not exists (select 1 from public.team_messages m where m.attachment_url = objects.name)
  );
