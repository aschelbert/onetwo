-- One row per notification the notify-signup edge function sends to the team
-- inbox. The function is public (the demo form posts to it from a logged-out
-- page), so it counts these rows to cap how many it will send per caller and
-- overall in an hour. Holds no personal details: a salted hash of the caller's
-- IP and the kind of notification.
-- Written only by the function (service role). RLS is on with no write
-- policies, so the anon and authenticated roles can neither read nor write it;
-- platform admins read it.

CREATE TABLE IF NOT EXISTS public.signup_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL,
  ip_hash     text
);

CREATE INDEX IF NOT EXISTS signup_notifications_recent
  ON public.signup_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS signup_notifications_ip_recent
  ON public.signup_notifications (ip_hash, created_at DESC);

ALTER TABLE public.signup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_signup_notifications" ON public.signup_notifications
  FOR SELECT USING (is_platform_admin());
