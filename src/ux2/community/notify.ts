import { supabase } from '@/lib/supabase';

/**
 * Email an announcement to the building through the `send-announcement` edge
 * function, exactly the way the Board Room's Communications tab does.
 * Returns how many were sent, or a reason it could not.
 */
export async function emailAnnouncement(input: {
  title: string;
  body: string;
  category: string;
  postedBy: string;
  recipients: { email: string; name: string }[];
}): Promise<{ sent: number; note?: string }> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const sbUrl = env.VITE_SUPABASE_URL;
  const sbKey = env.VITE_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) return { sent: 0, note: 'Email not sent: Supabase is not configured.' };
  try {
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    const res = await fetch(`${sbUrl}/functions/v1/send-announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`, apikey: sbKey },
      body: JSON.stringify({ title: input.title, announcementBody: input.body, category: input.category, postedBy: input.postedBy, recipients: input.recipients }),
    });
    if (!res.ok) {
      if (res.status === 404) return { sent: 0, note: 'Email not sent: deploy the send-announcement function.' };
      return { sent: 0, note: `Email failed: ${(await res.text()).slice(0, 100)}` };
    }
    const data = (await res.json()) as { sent?: number };
    return { sent: data.sent ?? 0, note: data.sent ? undefined : 'Email sending is not configured yet.' };
  } catch (e) {
    console.error('Announcement email error:', e);
    return { sent: 0, note: 'Email sending encountered an error.' };
  }
}
