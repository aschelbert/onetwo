-- PM lookup helpers answer only for the caller.
--
-- is_senior_pm, get_pm_company_id and get_pm_accessible_tenant_ids are
-- SECURITY DEFINER and take a user id. They stay executable by anon and
-- authenticated because RLS policies call them (policies on tenants, cases,
-- meetings, management_company_* and others, all "to public"), and a policy
-- that calls a function the querying role cannot execute errors instead of
-- filtering. But they trusted p_user_id, so anyone with the publishable key
-- could POST /rest/v1/rpc/get_pm_accessible_tenant_ids with someone else's
-- user id and learn which buildings that property manager reaches, or their
-- management company id.
--
-- Every policy passes auth.uid() (checked 2026-11-14), so restricting the
-- answer to the caller's own id changes nothing for RLS. Server contexts with
-- no client role (service_role key, postgres from pg_cron or the SQL editor)
-- may still ask about any user.
--
-- can_setup, get_my_membership, get_my_tenant_ids and is_platform_admin
-- already use auth.uid() internally and are not changed.

create or replace function public.pm_lookup_allowed(p_user_id uuid)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(p_user_id = auth.uid(), false)
      or coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) not in ('anon', 'authenticated');
$function$;

create or replace function public.is_senior_pm(p_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.pm_lookup_allowed(p_user_id) and exists (
    select 1
    from public.management_company_users
    where user_id = p_user_id
      and role = 'senior_pm'
      and status = 'active'
  );
$function$;

create or replace function public.get_pm_company_id(p_user_id uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select management_company_id
  from public.management_company_users
  where user_id = p_user_id and status = 'active'
    and public.pm_lookup_allowed(p_user_id)
  limit 1;
$function$;

create or replace function public.get_pm_accessible_tenant_ids(p_user_id uuid)
 returns table(tenant_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select mct.tenant_id
  from public.management_company_tenants mct
  join public.management_company_users mcu
    on mcu.management_company_id = mct.management_company_id
  where mcu.user_id = p_user_id
    and mcu.status = 'active'
    and mcu.role = 'senior_pm'
    and public.pm_lookup_allowed(p_user_id)

  union

  select mca.tenant_id
  from public.management_company_assignments mca
  join public.management_company_users mcu
    on mcu.id = mca.management_company_user_id
  where mcu.user_id = p_user_id
    and mcu.status = 'active'
    and mcu.role in ('pm_staff', 'readonly')
    and public.pm_lookup_allowed(p_user_id);
$function$;

-- The helper is SECURITY INVOKER and only reads auth.uid() and the request
-- claims, but it is called from inside RLS policies via the functions above,
-- which run as postgres, so clients need no grant on it.
revoke execute on function public.pm_lookup_allowed(uuid) from public, anon, authenticated;
grant execute on function public.pm_lookup_allowed(uuid) to service_role;
