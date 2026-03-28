-- Replace overly permissive UPDATE policy with admin-only
DROP POLICY "Authenticated users can update platform_settings" ON public.platform_settings;
CREATE POLICY "admin_update_platform_settings" ON public.platform_settings
  FOR UPDATE USING (is_platform_admin()) WITH CHECK (is_platform_admin());
