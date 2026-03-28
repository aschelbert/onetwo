-- Users can manage their own push subscriptions
CREATE POLICY "users_manage_own_push_subs" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Platform admins can manage all
CREATE POLICY "admin_all_push_subs" ON public.push_subscriptions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
