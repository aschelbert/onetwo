-- Messages sent from the "Contact" panel on getonetwo.com.
-- Written only by the contact-form edge function (service role). RLS is on
-- with no policies, so the anon and authenticated roles can neither read nor
-- write it; platform admins read it.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  email       text NOT NULL,
  topic       text NOT NULL,
  message     text NOT NULL,
  ip_hash     text,
  user_agent  text,
  delivered   boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS contact_messages_ip_recent
  ON public.contact_messages (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_email_recent
  ON public.contact_messages (lower(email), created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_contact_messages" ON public.contact_messages
  FOR SELECT USING (is_platform_admin());
