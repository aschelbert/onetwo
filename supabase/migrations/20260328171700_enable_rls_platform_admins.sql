ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_platform_admins" ON public.platform_admins FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "self_read_platform_admins" ON public.platform_admins FOR SELECT USING (user_id = auth.uid());
