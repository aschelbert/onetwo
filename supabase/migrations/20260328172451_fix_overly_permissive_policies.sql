-- ========== FEEDBACK/SUPPORT TABLES ==========
-- Replace "Authenticated can manage" ALL(true) policies with admin-only write + tenant-scoped read

-- captured_items: drop permissive, add admin write + tenant read (via thread's tenancy)
DROP POLICY "Authenticated can manage captured items" ON public.captured_items;
DROP POLICY "Authenticated can view captured items" ON public.captured_items;
CREATE POLICY "admin_all_captured_items" ON public.captured_items
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_captured_items" ON public.captured_items
  FOR SELECT USING (thread_id IN (
    SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT get_my_tenant_ids())
  ));

-- feedback_items: drop permissive, add admin write + public read
DROP POLICY "Authenticated users can manage feedback items" ON public.feedback_items;
DROP POLICY "Authenticated users can view feedback items" ON public.feedback_items;
CREATE POLICY "admin_write_feedback_items" ON public.feedback_items
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "read_feedback_items" ON public.feedback_items
  FOR SELECT USING (true);

-- feedback_assocs: drop permissive, add admin write + tenant read
DROP POLICY "Authenticated can manage feedback_assocs" ON public.feedback_assocs;
DROP POLICY "Authenticated can view feedback_assocs" ON public.feedback_assocs;
CREATE POLICY "admin_all_feedback_assocs" ON public.feedback_assocs
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_feedback_assocs" ON public.feedback_assocs
  FOR SELECT USING (tenancy_id IN (SELECT get_my_tenant_ids()));

-- feedback_source_threads: drop permissive, add admin write + tenant read (via thread)
DROP POLICY "Authenticated can manage feedback_source_threads" ON public.feedback_source_threads;
DROP POLICY "Authenticated can view feedback_source_threads" ON public.feedback_source_threads;
CREATE POLICY "admin_all_feedback_source_threads" ON public.feedback_source_threads
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "tenant_read_feedback_source_threads" ON public.feedback_source_threads
  FOR SELECT USING (thread_id IN (
    SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT get_my_tenant_ids())
  ));

-- support_threads: replace permissive insert/update with tenant-scoped
DROP POLICY "Authenticated users can insert support threads" ON public.support_threads;
DROP POLICY "Authenticated users can update support threads" ON public.support_threads;
CREATE POLICY "tenant_insert_support_threads" ON public.support_threads
  FOR INSERT WITH CHECK (tenancy_id IN (SELECT get_my_tenant_ids()));
CREATE POLICY "tenant_update_support_threads" ON public.support_threads
  FOR UPDATE USING (tenancy_id IN (SELECT get_my_tenant_ids()));

-- support_messages: replace permissive insert with tenant-scoped (via thread)
DROP POLICY "Authenticated users can insert support messages" ON public.support_messages;
CREATE POLICY "tenant_insert_support_messages" ON public.support_messages
  FOR INSERT WITH CHECK (thread_id IN (
    SELECT id FROM public.support_threads WHERE tenancy_id IN (SELECT get_my_tenant_ids())
  ));

-- ========== PAYROLL TABLES ==========
-- Replace ALL(true) for {public} with admin + board + tenant-scoped

-- payroll_staff
DROP POLICY "payroll_staff_tenant" ON public.payroll_staff;
CREATE POLICY "admin_all_payroll_staff" ON public.payroll_staff
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "board_manage_payroll_staff" ON public.payroll_staff
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  )) WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  ));
CREATE POLICY "tenant_read_payroll_staff" ON public.payroll_staff
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- payroll_time_entries
DROP POLICY "payroll_time_entries_tenant" ON public.payroll_time_entries;
CREATE POLICY "admin_all_payroll_time_entries" ON public.payroll_time_entries
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "board_manage_payroll_time_entries" ON public.payroll_time_entries
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  )) WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  ));
CREATE POLICY "tenant_read_payroll_time_entries" ON public.payroll_time_entries
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- payroll_pay_runs
DROP POLICY "payroll_pay_runs_tenant" ON public.payroll_pay_runs;
CREATE POLICY "admin_all_payroll_pay_runs" ON public.payroll_pay_runs
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "board_manage_payroll_pay_runs" ON public.payroll_pay_runs
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  )) WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  ));
CREATE POLICY "tenant_read_payroll_pay_runs" ON public.payroll_pay_runs
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- payroll_form_1099s
DROP POLICY "payroll_form_1099s_tenant" ON public.payroll_form_1099s;
CREATE POLICY "admin_all_payroll_form_1099s" ON public.payroll_form_1099s
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "board_manage_payroll_form_1099s" ON public.payroll_form_1099s
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  )) WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'board_member'
  ));
CREATE POLICY "tenant_read_payroll_form_1099s" ON public.payroll_form_1099s
  FOR SELECT USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- ========== PLATFORM SETTINGS ==========
DROP POLICY "Authenticated users can update platform_settings" ON public.platform_settings;
CREATE POLICY "admin_update_platform_settings" ON public.platform_settings
  FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
