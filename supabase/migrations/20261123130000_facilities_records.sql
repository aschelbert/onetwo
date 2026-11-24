-- Facilities records: photos, vendor insurance certificates, work sign-off.
--
-- 1. building-photos: a private bucket for photos on owner requests and
--    property-log entries, at <tenant_id>/<folder>/<file>. Any member of the
--    building adds and views (an owner photographs a leak; the board and the
--    vendor need to see it). Board members and property managers delete.
-- 2. issues.photos, property_logs.attachments: the photos on a request and on
--    a log entry, as [{ id, name, path, addedAt, by }].
-- 3. vendors.insurance: the vendor's certificates of insurance, as
--    [{ id, coverage, carrier, policyNum, limit, expires, additionalInsured, file, addedAt }].
-- 4. work_orders.signoff: who confirmed the work was done, when, and what is
--    left to put right, as { date, by, notes }. A bill is approved for
--    payment only after it.
--
-- The app saves the rest of each record when a column here is missing, so
-- deploying the app before this migration loses nothing but these fields.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('building-photos', 'building-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read building photos" on storage.objects;
create policy "Members read building photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'building-photos'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Members add building photos" on storage.objects;
create policy "Members add building photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'building-photos'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

drop policy if exists "Team deletes building photos" on storage.objects;
create policy "Team deletes building photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'building-photos'
    and (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.role in ('board_member', 'property_manager')
          and tu.tenant_id::text = (storage.foldername(objects.name))[1]
      )
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
  );

alter table public.issues add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.property_logs add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.vendors add column if not exists insurance jsonb not null default '[]'::jsonb;
alter table public.work_orders add column if not exists signoff jsonb;
