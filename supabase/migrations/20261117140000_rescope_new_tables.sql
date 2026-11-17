-- Tables added since the one-building-per-session migration
-- (20261116120000) were created without its tenant_scope policy, e.g.
-- on_call_assignments. Re-running the helper adds the policy to every table
-- with a tenant column that lacks it; it is safe to run any number of times.
select public.apply_tenant_scope();
