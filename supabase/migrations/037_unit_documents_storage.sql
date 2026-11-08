-- ─────────────────────────────────────────────────────────────────────────────
-- 037: unit documents (an owner's HO-6 certificate, lease, pet registration).
--
-- Two things stopped them working:
--   1. The unit-documents bucket the app uploads to was never created.
--   2. The unit_documents policies matched request.jwt.claims ->> 'tenant_id',
--      a claim no sign-in token carries (there is no access-token hook), so no
--      one could read, add or delete a row.
--
-- Access now follows membership (tenant_users):
--   - Board members and property managers of the building: every unit's
--     documents (read, add, change, delete).
--   - An owner or resident (tenant_users.unit): their own unit's documents
--     the board shared with them (visible_to_owner) and the ones they added;
--     they add to their own unit and delete what they added.
--   - Platform admins: everything.
-- Files live at <tenant_id>/<unit>/<time>-<name>. A file is readable by
-- whoever can read its unit_documents row; uploading follows the folder.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('unit-documents', 'unit-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- ── unit_documents rows ──────────────────────────────────────────────────────

drop policy if exists unit_documents_board_all on public.unit_documents;
drop policy if exists unit_documents_resident_select on public.unit_documents;

drop policy if exists "Team manages unit documents" on public.unit_documents;
create policy "Team manages unit documents" on public.unit_documents for all to authenticated
  using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = unit_documents.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = unit_documents.tenant_id and tu.role in ('board_member', 'property_manager'))
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists "Owners read their unit's documents" on public.unit_documents;
create policy "Owners read their unit's documents" on public.unit_documents for select to authenticated
  using (
    (visible_to_owner or uploaded_by = auth.uid())
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = unit_documents.tenant_id
        and lower(trim(tu.unit)) = lower(trim(unit_documents.unit_number))
    )
  );

drop policy if exists "Owners add to their unit" on public.unit_documents;
create policy "Owners add to their unit" on public.unit_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = unit_documents.tenant_id
        and lower(trim(tu.unit)) = lower(trim(unit_documents.unit_number))
    )
  );

drop policy if exists "Owners delete what they added" on public.unit_documents;
create policy "Owners delete what they added" on public.unit_documents for delete to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = unit_documents.tenant_id
        and lower(trim(tu.unit)) = lower(trim(unit_documents.unit_number))
    )
  );

-- ── unit-documents files ─────────────────────────────────────────────────────

drop policy if exists "Read unit document files" on storage.objects;
create policy "Read unit document files" on storage.objects for select to authenticated
  using (
    bucket_id = 'unit-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role in ('board_member', 'property_manager')
          and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
      -- everyone else: the file of a unit_documents row they can read (that table's policies decide)
      or exists (select 1 from public.unit_documents ud where ud.storage_path = objects.name)
    )
  );

drop policy if exists "Upload unit document files" on storage.objects;
create policy "Upload unit document files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'unit-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id::text = (storage.foldername(objects.name))[1]
          and (tu.role in ('board_member', 'property_manager') or lower(trim(tu.unit)) = lower(trim((storage.foldername(objects.name))[2])))
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Delete unit document files" on storage.objects;
create policy "Delete unit document files" on storage.objects for delete to authenticated
  using (
    bucket_id = 'unit-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role in ('board_member', 'property_manager')
          and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
      -- an owner: a file they added to their own unit (or one whose row was never saved)
      or exists (select 1 from public.unit_documents ud where ud.storage_path = objects.name and ud.uploaded_by = auth.uid())
      or (
        objects.owner_id = auth.uid()::text
        and not exists (select 1 from public.unit_documents ud where ud.storage_path = objects.name)
      )
    )
  );
