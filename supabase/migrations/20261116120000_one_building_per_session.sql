-- One building per session.
--
-- An account can now belong to several buildings (the same person may set up
-- a second association under the same email). Until now every tenant policy
-- said "rows from any building I belong to", which was the same thing as "my
-- building" while accounts had exactly one. With two it lets one building's
-- screens read the other's rows.
--
-- This migration pins each request to a single building, in the database:
--
--   1. current_tenant_id()  the building this request is in. The app sends it
--      in an `x-tenant-id` header; it is honoured only if the caller is a
--      member. With no header, an account with exactly one building gets that
--      building (so nothing changes for them, old clients included) and an
--      account with several gets none: fail closed rather than mix.
--   2. apply_tenant_scope()  puts a RESTRICTIVE policy on every public table
--      with a tenant_id / tenancy_id column. Restrictive policies are ANDed
--      with the existing permissive ones, so none of those need rewriting and
--      a query that forgets to filter still only sees one building.
--   3. my_buildings()  the caller's own buildings, for the login picker and
--      the building switcher.
--   4. provision_tenant takes an optional pre-assigned id, so signup can name
--      the Chargebee customer after the building (cb_tenant_<id>) before the
--      building row exists. Calling it twice with the same id is a no-op.
--
-- Not building-scoped, on purpose: platform admins (they see every building),
-- management-company users for the buildings they manage, rows whose tenant
-- column is null (shared, e.g. built-in templates), and the service role.

-- ── 1. The building this request is in ──────────────────────────────────────
create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_header text;
  v_requested uuid;
  v_mine uuid[];
begin
  if v_uid is null then
    return null;
  end if;

  v_header := nullif(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-tenant-id', '');

  if v_header is not null then
    begin
      v_requested := v_header::uuid;
    exception when others then
      return null;  -- malformed header: no building
    end;
    -- Honoured only for a building the caller belongs to
    return (
      select tu.tenant_id from tenant_users tu
      where tu.user_id = v_uid and tu.tenant_id = v_requested
      limit 1
    );
  end if;

  -- No header (older client, realtime, storage): unambiguous only with one building
  select array_agg(t.tenant_id) into v_mine
  from (select tu.tenant_id from tenant_users tu where tu.user_id = v_uid limit 2) t;

  if coalesce(array_length(v_mine, 1), 0) = 1 then
    return v_mine[1];
  end if;
  return null;
end;
$$;

revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated, service_role;

-- ── 2. Restrictive policy on every building-owned table ─────────────────────
-- Re-run `select public.apply_tenant_scope();` in any later migration that
-- adds a table with a tenant_id column.
create or replace function public.apply_tenant_scope()
returns int
language plpgsql
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as tbl, c.relname, a.attname as col
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where ns.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and a.attname in ('tenant_id', 'tenancy_id')
      and a.atttypid = 'uuid'::regtype
      and not a.attisdropped
      and c.relname <> 'tenant_users'   -- handled below
  loop
    execute format('drop policy if exists tenant_scope on %s', r.tbl);
    execute format($f$
      create policy tenant_scope on %s
        as restrictive for all to authenticated
        using (
          %2$I is null
          or %2$I = (select public.current_tenant_id())
          or (select public.is_platform_admin())
          or %2$I in (select public.get_pm_accessible_tenant_ids((select auth.uid())))
        )
    $f$, r.tbl, r.col);
    n := n + 1;
  end loop;

  -- tenant_users: your own memberships stay visible in every building (the
  -- existing policies and storage rules look them up); other people's rows
  -- only in the building this request is in.
  drop policy if exists tenant_scope on public.tenant_users;
  create policy tenant_scope on public.tenant_users
    as restrictive for all to authenticated
    using (
      user_id = (select auth.uid())
      or tenant_id = (select public.current_tenant_id())
      or (select public.is_platform_admin())
      or tenant_id in (select public.get_pm_accessible_tenant_ids((select auth.uid())))
    );

  return n + 1;
end;
$$;

revoke execute on function public.apply_tenant_scope() from public, anon, authenticated;

select public.apply_tenant_scope();

-- get_my_membership() returned an arbitrary row (LIMIT 1): prefer this request's building.
create or replace function public.get_my_membership()
returns table(tenant_id uuid, role text, role_key text, is_account_owner boolean, unit text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select tu.tenant_id, tu.role::text, tu.role_key, tu.is_account_owner, tu.unit
  from tenant_users tu
  where tu.user_id = auth.uid()
  order by (tu.tenant_id = public.current_tenant_id()) desc nulls last, tu.created_at desc
  limit 1;
end;
$function$;

-- ── 3. The caller's buildings (picker and switcher) ─────────────────────────
create or replace function public.my_buildings()
returns table(
  tenant_id uuid, role text, board_title text, unit text, created_at timestamptz,
  name text, subdomain text, address jsonb,
  subscription_status text, trial_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select tu.tenant_id, tu.role::text, tu.board_title, tu.unit, tu.created_at,
         t.name, t.subdomain, t.address,
         s.status::text, s.trial_ends_at
  from tenant_users tu
  join tenants t on t.id = tu.tenant_id
  left join subscriptions s on s.tenant_id = tu.tenant_id
  where tu.user_id = auth.uid()
  order by tu.created_at desc;
$$;

revoke execute on function public.my_buildings() from public, anon;
grant execute on function public.my_buildings() to authenticated;

-- ── 4. provision_tenant with a pre-assigned building id ─────────────────────
drop function if exists public.provision_tenant(
  text, jsonb, integer, text, text, text, text, text, uuid, boolean, boolean, text,
  text, text, text, text, text, text, text, text, text, text, text, text);

create function public.provision_tenant(
  p_name text,
  p_address jsonb,
  p_total_units integer,
  p_year_built text,
  p_plan text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_user_id uuid,
  p_on_call boolean default false,
  p_pm_seat boolean default false,
  p_billing_interval text default 'monthly',
  p_chargebee_customer_id text default null,
  p_chargebee_subscription_id text default null,
  p_board_title text default 'President',
  p_subdomain text default null,
  p_role text default 'board_member',
  p_role_key text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_mar_address_id text default null,
  p_ssl text default null,
  p_ward text default null,
  p_address_flag text default null,
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, gen_random_uuid());
  v_subdomain text;
  v_monthly_rate int;
  v_features jsonb;
  v_trial_end timestamptz;
  v_trial_days int;
  v_on_call_price int;
  v_board_title text;
  v_final_role text;
  v_existing record;
begin
  -- A repeat call for a building that already exists (webhook retry) changes nothing
  if p_tenant_id is not null then
    select t.id, t.subdomain, s.tier, s.trial_ends_at, s.monthly_rate
      into v_existing
    from tenants t
    left join subscriptions s on s.tenant_id = t.id
    where t.id = p_tenant_id;
    if found then
      return jsonb_build_object(
        'tenant_id', v_existing.id,
        'subdomain', v_existing.subdomain,
        'plan', v_existing.tier,
        'trial_ends_at', v_existing.trial_ends_at,
        'monthly_rate', v_existing.monthly_rate,
        'already_provisioned', true
      );
    end if;
  end if;

  if p_subdomain is not null and p_subdomain != '' and not exists (select 1 from tenants where subdomain = p_subdomain) then
    v_subdomain := p_subdomain;
  else
    v_subdomain := generate_subdomain(p_name);
  end if;

  select coalesce(
    (select trial_days from platform_settings where id = 'default'),
    21
  ) into v_trial_days;

  v_monthly_rate := case p_plan
    when 'self_managed' then 17900
    when 'facilities' then 27900
    else 17900
  end;

  if p_on_call then
    v_on_call_price := case p_plan
      when 'facilities' then 49900
      else 24900
    end;
    v_monthly_rate := v_monthly_rate + v_on_call_price;
  end if;

  if p_pm_seat then
    v_monthly_rate := v_monthly_rate + 7900;
  end if;

  v_trial_end := now() + (v_trial_days || ' days')::interval;
  v_features := plan_feature_defaults(p_plan, p_on_call, true);

  v_board_title := coalesce(board_role_label(p_role_key), p_board_title, 'President');

  v_final_role := case
    when p_role in ('board_member','resident','property_manager') then p_role
    else 'board_member'
  end;

  insert into tenants (id, name, subdomain, address, total_units, year_built, status,
    primary_contact_name, primary_contact_email, primary_contact_phone,
    chargebee_customer_id,
    mar_address_id, ssl, ward,
    address_verified_at, address_flag)
  values (v_tenant_id, p_name, v_subdomain, p_address, p_total_units, p_year_built, 'onboarding',
    p_contact_name, p_contact_email, p_contact_phone,
    p_chargebee_customer_id,
    nullif(p_mar_address_id, ''), nullif(p_ssl, ''), nullif(p_ward, ''),
    case when p_mar_address_id is not null and p_mar_address_id != '' then now() else null end,
    nullif(p_address_flag, ''));

  insert into subscriptions (tenant_id, tier, status, monthly_rate, trial_ends_at,
    current_period_start, current_period_end,
    chargebee_subscription_id, billing_interval,
    addon_on_call, pm_addon)
  values (v_tenant_id, p_plan, 'trialing', v_monthly_rate, v_trial_end,
    now(), v_trial_end,
    p_chargebee_subscription_id, p_billing_interval,
    p_on_call, p_pm_seat);

  insert into tenant_features (tenant_id,
    fiscal_lens, case_ops, compliance_runbook, ai_advisor, document_vault,
    payment_processing, votes_resolutions, community_portal, vendor_management, reserve_study_tools,
    facilities, on_call)
  values (v_tenant_id,
    true, true, true, true, true, true, true, true, true, true,
    (v_features->>'facilities')::boolean,
    (v_features->>'on_call')::boolean);

  insert into onboarding_checklists (tenant_id, account_created, building_profile_complete)
  values (v_tenant_id, true, (p_address->>'street') is not null and (p_address->>'street') != '');

  insert into tenant_users (tenant_id, user_id, role, board_title, role_key,
    is_account_owner, joined_at, status)
  values (v_tenant_id, p_user_id, v_final_role::tenant_role, v_board_title, p_role_key,
    true, now(), 'active');

  if v_final_role = 'board_member' then
    insert into board_members (tenant_id, name, role, email, role_key)
    values (v_tenant_id,
      coalesce(nullif(trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''), p_contact_name),
      v_board_title,
      p_contact_email,
      p_role_key);
  end if;

  insert into audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_tenant_id, p_user_id, p_contact_name, 'system', 'tenant.provisioned',
    p_name, format('Subdomain: %s.getonetwo.com | Plan: %s | Role: %s/%s | Trial ends: %s',
      v_subdomain, p_plan, v_final_role, coalesce(p_role_key, 'none'), v_trial_end::date));

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'subdomain', v_subdomain,
    'plan', p_plan,
    'trial_ends_at', v_trial_end,
    'monthly_rate', v_monthly_rate
  );
end;
$function$;

-- Server-only, as before (20261114140000)
revoke execute on function public.provision_tenant(
  text, jsonb, integer, text, text, text, text, text, uuid, boolean, boolean, text,
  text, text, text, text, text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.provision_tenant(
  text, jsonb, integer, text, text, text, text, text, uuid, boolean, boolean, text,
  text, text, text, text, text, text, text, text, text, text, text, text, uuid)
  to service_role;
