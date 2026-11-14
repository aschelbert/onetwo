-- Lock down the scheduled runbook functions (run_* / run_*_all).
--
-- Migrations 046 and 055–063 ran `revoke all ... from public`, but Supabase's
-- default privileges grant EXECUTE on new public-schema functions directly to
-- anon and authenticated, so that revoke never removed them. Because these
-- functions are SECURITY DEFINER (bypassing RLS) and take a p_tenant uuid,
-- anyone with the anon key could POST /rest/v1/rpc/run_annual_meeting (etc.)
-- for any tenant and insert rows into cases and other tenant tables.
--
-- Callers, checked 2026-11-14:
--   * pg_cron jobs onetwo-billing-cycle and onetwo-runbooks, running as
--     postgres (the owner, which needs no grant).
--   * run_runbooks_all calls the other run_*_all functions; it runs as the
--     definer (postgres), so the nested calls need no grant either.
--   * No client (src/) or edge-function code calls any run_* via rpc.
-- service_role keeps EXECUTE so they can still be triggered by hand with the
-- service key.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^run_'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Fail the migration if any run_* function is still reachable by a client role.
do $$
declare
  leaked text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname ~ '^run_'
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'));
  if leaked is not null then
    raise exception 'run_* functions still executable by anon/authenticated: %', leaked;
  end if;
end $$;
