-- support_threads
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_support_threads" ON public.support_threads FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_support_threads" ON public.support_threads FOR SELECT USING (tenancy_id IN (SELECT user_tenancy_ids()));
CREATE POLICY "tenant_insert_support_threads" ON public.support_threads FOR INSERT WITH CHECK (tenancy_id IN (SELECT user_tenancy_ids()));
CREATE POLICY "tenant_update_support_threads" ON public.support_threads FOR UPDATE USING (tenancy_id IN (SELECT user_tenancy_ids()));

-- support_messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_support_messages" ON public.support_messages FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_support_messages" ON public.support_messages FOR SELECT USING (thread_id IN (SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT user_tenancy_ids())));
CREATE POLICY "tenant_insert_support_messages" ON public.support_messages FOR INSERT WITH CHECK (thread_id IN (SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT user_tenancy_ids())));
