-- ─────────────────────────────────────────────────────────────────────────────
-- 035: functions that could not find their own tables.
--
-- An earlier hardening pass (fix_function_search_paths) set these functions'
-- search_path to '' but left their table names unqualified ("tenant_users",
-- not "public.tenant_users"), so every call failed with
--   relation "tenant_users" does not exist
-- That broke:
--   can_setup                 → the RLS check for a board member updating their building
--                               (going live set the checklist but never the building's status)
--   accept_invitation         → redeeming an invitation code
--   get_my_membership
--   transfer_ownership, accept_ownership_transfer, settle_ownership
--   mark_trial_expired
--
-- Fix: a fixed search_path of public (as the other functions here use),
-- which still satisfies the "mutable search_path" advisory. Bodies unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.can_setup(p_tenant_id uuid) set search_path = public;
alter function public.accept_invitation(p_code text, p_user_id uuid, p_name text) set search_path = public;
alter function public.get_my_membership() set search_path = public;
alter function public.transfer_ownership(p_tenant_id uuid, p_to_user_id uuid) set search_path = public;
alter function public.accept_ownership_transfer(p_transfer_id uuid) set search_path = public;
alter function public.settle_ownership(p_tenant_id uuid) set search_path = public;
alter function public.mark_trial_expired(p_subscription_id text) set search_path = public;
