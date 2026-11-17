-- Support tables: stop every signed-in user reading every building's rows.
--
-- Before this migration (identical on production and staging, 2026-11-16):
--   support_threads   "Authenticated users can view support threads"   SELECT USING (true)
--   support_messages  "Authenticated users can view support messages"  SELECT USING (true)
--   support_tickets   "Authenticated users can manage support tickets" ALL USING (auth.role() = 'authenticated')
--
-- After:
--   * a member reads the threads of their own building(s), the messages of
--     those threads (through the parent thread; support_messages has no
--     tenant column), and their own building's tickets;
--   * a member can still open a thread, reply to it and touch its updated_at
--     (tenant_insert_support_threads, tenant_update_support_threads and
--     tenant_insert_support_messages from 20260328172451 are left in place);
--   * platform admins keep full access to all three tables. The platform
--     admin console in src/ reads support_tickets with the signed-in admin's
--     own session (no service key), so it depends on these admin policies;
--   * tickets are written by platform admins only, which is the only writer
--     in the app (usePlatformAdminStore). Members get read access, no write.
--
-- One building per session (20261116120000_one_building_per_session.sql):
--   * support_threads gets the restrictive tenant_scope policy from
--     apply_tenant_scope() like every table with a uuid tenancy_id.
--   * support_messages needs nothing extra: its policies look threads up
--     through support_threads, and that lookup runs under the caller's own
--     row security, so a thread hidden by tenant_scope hides its messages.
--   * support_tickets has a text building_id, which apply_tenant_scope()
--     skips. Section 4 adds the equivalent restrictive policy when
--     current_tenant_id() exists. If this migration is applied BEFORE
--     20261116120000, re-run section 4 after it.

-- ── 1. support_threads ──────────────────────────────────────────────────────
drop policy if exists "Authenticated users can view support threads" on public.support_threads;
drop policy if exists tenant_read_support_threads on public.support_threads;
drop policy if exists admin_all_support_threads on public.support_threads;

create policy tenant_read_support_threads on public.support_threads
  for select to authenticated
  using (tenancy_id in (select public.get_my_tenant_ids()));

create policy admin_all_support_threads on public.support_threads
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- ── 2. support_messages (scoped through the parent thread) ──────────────────
drop policy if exists "Authenticated users can view support messages" on public.support_messages;
drop policy if exists tenant_read_support_messages on public.support_messages;
drop policy if exists admin_all_support_messages on public.support_messages;

create policy tenant_read_support_messages on public.support_messages
  for select to authenticated
  using (thread_id in (
    select t.id from public.support_threads t
    where t.tenancy_id in (select public.get_my_tenant_ids())
  ));

create policy admin_all_support_messages on public.support_messages
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- ── 3. support_tickets (building_id is text) ────────────────────────────────
drop policy if exists "Authenticated users can manage support tickets" on public.support_tickets;
drop policy if exists tenant_read_support_tickets on public.support_tickets;
drop policy if exists admin_all_support_tickets on public.support_tickets;

create policy tenant_read_support_tickets on public.support_tickets
  for select to authenticated
  using (building_id in (select public.get_my_tenant_ids()::text));

create policy admin_all_support_tickets on public.support_tickets
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- ── 4. support_tickets: one building per session ────────────────────────────
-- Same rule apply_tenant_scope() gives uuid tenant columns, written for text.
do $scope$
begin
  if to_regprocedure('public.current_tenant_id()') is null then
    raise notice 'current_tenant_id() not installed: support_tickets tenant_scope skipped';
    return;
  end if;

  drop policy if exists tenant_scope on public.support_tickets;
  create policy tenant_scope on public.support_tickets
    as restrictive for all to authenticated
    using (
      building_id is null
      or building_id = (select public.current_tenant_id())::text
      or (select public.is_platform_admin())
      or building_id in (
        select p.tenant_id::text
        from public.get_pm_accessible_tenant_ids((select auth.uid())) p
      )
    );
end;
$scope$;
