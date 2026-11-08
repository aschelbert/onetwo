import { callEmailFunction } from '@/lib/services/email';

/**
 * Email an announcement to the building through the `send-announcement` edge
 * function. Returns how many were sent and, when none (or not all) went out,
 * why, in plain words.
 */
export async function emailAnnouncement(input: {
  title: string;
  body: string;
  category: string;
  postedBy: string;
  recipients: { email: string; name: string }[];
}): Promise<{ sent: number; note?: string }> {
  const r = await callEmailFunction('send-announcement', { title: input.title, announcementBody: input.body, category: input.category, postedBy: input.postedBy, recipients: input.recipients });
  return { sent: r.sent, note: r.sent ? (r.reason ? `${r.reason[0].toUpperCase()}${r.reason.slice(1)}.` : undefined) : `Not emailed: ${r.reason}.` };
}
