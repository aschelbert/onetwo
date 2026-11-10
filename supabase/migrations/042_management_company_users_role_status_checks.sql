-- 042: Restrict management_company_users.role and .status to the values the app uses
-- (PMRole / PMUserStatus in src/types/portfolio.ts).
--
-- The HOA (production) project already has these constraints under the same names;
-- they were added to onetwo-staging on 2026-11-08. Guarded so re-running is a no-op.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.management_company_users'::regclass
      and conname = 'management_company_users_role_check'
  ) then
    alter table public.management_company_users
      add constraint management_company_users_role_check
      check (role = any (array['senior_pm'::text, 'pm_staff'::text, 'readonly'::text]));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.management_company_users'::regclass
      and conname = 'management_company_users_status_check'
  ) then
    alter table public.management_company_users
      add constraint management_company_users_status_check
      check (status = any (array['active'::text, 'invited'::text, 'suspended'::text, 'removed'::text]));
  end if;
end $$;
