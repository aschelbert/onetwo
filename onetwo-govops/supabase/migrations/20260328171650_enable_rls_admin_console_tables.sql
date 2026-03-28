-- admin_console_roles
ALTER TABLE public.admin_console_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_admin_console_roles" ON public.admin_console_roles FOR SELECT USING (true);
CREATE POLICY "admin_write_admin_console_roles" ON public.admin_console_roles FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- admin_console_modules
ALTER TABLE public.admin_console_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_admin_console_modules" ON public.admin_console_modules FOR SELECT USING (true);
CREATE POLICY "admin_write_admin_console_modules" ON public.admin_console_modules FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- admin_console_permissions
ALTER TABLE public.admin_console_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_admin_console_permissions" ON public.admin_console_permissions FOR SELECT USING (true);
CREATE POLICY "admin_write_admin_console_permissions" ON public.admin_console_permissions FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
