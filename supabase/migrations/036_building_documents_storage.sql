-- ─────────────────────────────────────────────────────────────────────────────
-- 036: storage for Building › Documents, and the Intercom attachment policies.
--
-- 1. A private bucket, building-documents, for the files on legal documents
--    (bylaws, rules, budgets, minutes, contracts). Each file lives at
--      <tenant_id>/<file_id>/<file name>
--    One file filed under several documents (bylaws that hold the rules) is
--    one object. Downloads are short-lived signed URLs.
--    Same access as the legal_documents table: everyone in the building
--    reads, board members add, replace and delete; platform admins do both.
--
-- 2. The team-attachments policies (032) compared the folder with
--    tenant_users.name, not the object's name: inside the subquery the bare
--    "name" resolved to tu.name, so no upload or read ever matched. They are
--    recreated with objects.name.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('building-documents', 'building-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Members read building documents" on storage.objects;
create policy "Members read building documents" on storage.objects for select to authenticated
  using (
    bucket_id = 'building-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Board adds building documents" on storage.objects;
create policy "Board adds building documents" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'building-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role = 'board_member' and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Board replaces building documents" on storage.objects;
create policy "Board replaces building documents" on storage.objects for update to authenticated
  using (
    bucket_id = 'building-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role = 'board_member' and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'building-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role = 'board_member' and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Board deletes building documents" on storage.objects;
create policy "Board deletes building documents" on storage.objects for delete to authenticated
  using (
    bucket_id = 'building-documents'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role = 'board_member' and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

-- ── 2. team-attachments: compare the folder with the object's name ─────────

drop policy if exists "Team can upload intercom attachments" on storage.objects;
create policy "Team can upload intercom attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-attachments'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role <> 'resident' and tu.status = 'active'
        and (storage.foldername(objects.name))[1] = tu.tenant_id::text
    )
  );

drop policy if exists "Team can read intercom attachments" on storage.objects;
create policy "Team can read intercom attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-attachments'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role <> 'resident' and tu.status = 'active'
        and (storage.foldername(objects.name))[1] = tu.tenant_id::text
    )
  );
