-- Admin project (onetwo-admin): close two things anyone with the public anon
-- key could reach.
--
-- 1. tenancies. "anon_read_tenancies" was SELECT TO anon USING (true): every
--    column of every building, including address, Stripe customer and
--    subscription ids, payment status and head counts. Its only caller is the
--    HOA app's support screens (src/features/support/SupportPage.tsx and
--    src/ux2/me/tabs/HelpTab.tsx in the parent repo), which turn the building's
--    subdomain into a tenancy id. tenancy_id_for_slug() does exactly that and
--    nothing else. Signed-in members (tenant_read_own) and platform admins
--    (admin_all_tenancies) are unchanged; the Admin Console's server routes
--    use the service role.
--
-- 2. support-attachments bucket. Anyone, signed in or not, could upload to it
--    and list every file in it. Uploading and listing now need a signed-in
--    user and a path that starts with a support thread they can see
--    (<thread id>/<file>, which is what both upload screens already write).
--    The thread lookup runs under the caller's own row security, so members
--    get their tenancy's threads and platform admins get all of them.
--
--    The bucket stays public: message rows store plain public URLs and both
--    apps show them in <img> tags, so a file is still readable by anyone who
--    has its URL (thread id + random uuid). Making the bucket private means
--    switching both apps to signed URLs first.

-- ── 1. tenancies ────────────────────────────────────────────────────────────
create or replace function public.tenancy_id_for_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.id from public.tenancies t where t.slug = p_slug;
$$;

revoke execute on function public.tenancy_id_for_slug(text) from public;
grant execute on function public.tenancy_id_for_slug(text) to anon, authenticated, service_role;

drop policy if exists anon_read_tenancies on public.tenancies;

-- ── 2. support-attachments ──────────────────────────────────────────────────
drop policy if exists "Allow public upload to support-attachments" on storage.objects;
drop policy if exists "Allow public read of support-attachments" on storage.objects;
drop policy if exists support_attachments_insert on storage.objects;
drop policy if exists support_attachments_select on storage.objects;

create policy support_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] in (select t.id::text from public.support_threads t)
  );

create policy support_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] in (select t.id::text from public.support_threads t)
  );
