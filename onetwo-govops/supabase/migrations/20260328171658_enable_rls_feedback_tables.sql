-- feedback_items
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_feedback_items" ON public.feedback_items FOR SELECT USING (true);
CREATE POLICY "admin_write_feedback_items" ON public.feedback_items FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- feedback_assocs
ALTER TABLE public.feedback_assocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_feedback_assocs" ON public.feedback_assocs FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_feedback_assocs" ON public.feedback_assocs FOR SELECT USING (tenancy_id IN (SELECT user_tenancy_ids()));

-- feedback_source_threads
ALTER TABLE public.feedback_source_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_feedback_source_threads" ON public.feedback_source_threads FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_feedback_source_threads" ON public.feedback_source_threads FOR SELECT USING (thread_id IN (SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT user_tenancy_ids())));

-- captured_items
ALTER TABLE public.captured_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_captured_items" ON public.captured_items FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_captured_items" ON public.captured_items FOR SELECT USING (thread_id IN (SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT user_tenancy_ids())));
