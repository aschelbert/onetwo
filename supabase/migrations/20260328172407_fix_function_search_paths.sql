-- Trigger functions (no table refs) - use empty search_path
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.update_case_step_responses_updated_at() SET search_path = '';
ALTER FUNCTION public.notify_push_on_support_message() SET search_path = '';
ALTER FUNCTION public.tier_feature_defaults(subscription_tier) SET search_path = '';

-- Functions with unqualified table references - use 'public'
ALTER FUNCTION public.get_my_tenant_ids() SET search_path = 'public';
ALTER FUNCTION public.get_trial_days() SET search_path = 'public';
ALTER FUNCTION public.generate_subdomain(text) SET search_path = 'public';
ALTER FUNCTION public.is_platform_admin() SET search_path = 'public';
ALTER FUNCTION public.get_pm_accessible_tenant_ids(uuid) SET search_path = 'public';
ALTER FUNCTION public.get_pm_company_id(uuid) SET search_path = 'public';
ALTER FUNCTION public.mark_channel_messages_read(uuid, uuid) SET search_path = 'public';
ALTER FUNCTION public.reconcile_unit_payment(text, text) SET search_path = 'public';
ALTER FUNCTION public.generate_monthly_invoices() SET search_path = 'public';
ALTER FUNCTION public.process_late_fees() SET search_path = 'public';
ALTER FUNCTION public.validate_invite_code(text) SET search_path = 'public';
ALTER FUNCTION public.accept_invitation(text, uuid, text) SET search_path = 'public';

-- provision_tenant has two overloads - fix both
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure as sig
    FROM pg_proc
    WHERE proname = 'provision_tenant' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'ALTER FUNCTION ' || r.sig || $q$ SET search_path = 'public'$q$;
  END LOOP;
END $$;
