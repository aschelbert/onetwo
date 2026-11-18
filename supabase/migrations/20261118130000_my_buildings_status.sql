-- my_buildings() also says whether each building is still open.
--
-- The Account Inactive notice offers the person's other buildings; one that
-- has itself ended (tenants.status = 'churned') only leads to the same
-- notice, so the app needs the building's status to leave it out.
-- A changed return type needs a drop first; both run in one transaction.

drop function if exists public.my_buildings();

create function public.my_buildings()
returns table(
  tenant_id uuid, role text, board_title text, unit text, created_at timestamptz,
  name text, subdomain text, address jsonb,
  subscription_status text, trial_ends_at timestamptz,
  tenant_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select tu.tenant_id, tu.role::text, tu.board_title, tu.unit, tu.created_at,
         t.name, t.subdomain, t.address,
         s.status::text, s.trial_ends_at,
         t.status::text
  from tenant_users tu
  join tenants t on t.id = tu.tenant_id
  left join subscriptions s on s.tenant_id = tu.tenant_id
  where tu.user_id = auth.uid()
  order by tu.created_at desc;
$$;

revoke execute on function public.my_buildings() from public, anon;
grant execute on function public.my_buildings() to authenticated;
