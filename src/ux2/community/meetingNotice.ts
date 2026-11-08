/**
 * Sending a meeting notice: posted in-app as a notice every member sees,
 * emailed to every member through `send-meeting-notice`, and logged in the
 * building's communications (which is what marks the notice sent on
 * Community › Meetings and the Board Room outbox). The result says what
 * actually went out: when the email can't be sent, the notice is still
 * posted in-app and the board is told to reach owners another way.
 */
import { useComplianceStore } from '@/store/useComplianceStore';
import type { Meeting } from '@/store/useMeetingsStore';
import { callEmailFunction } from '@/lib/services/email';

export interface NoticeResult { emailed: number; note: string }

export function noticeText(m: Meeting): string {
  const when = [m.date, m.time].filter(Boolean).join(' at ');
  const where = [m.location, m.virtualLink ? `remote: ${m.virtualLink}` : ''].filter(Boolean).join(' · ');
  const agenda = m.agenda.length ? `\n\nAgenda:\n${m.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n')}` : '';
  return `${m.title} is on ${when}${where ? `, ${where}` : ''}. Every owner is welcome.${agenda}`;
}

export async function sendMeetingNotice(m: Meeting, by: string, today = new Date().toISOString().slice(0, 10)): Promise<NoticeResult> {
  const comp = useComplianceStore.getState();
  comp.addAnnouncement({ title: `Meeting notice: ${m.title}`, body: noticeText(m), category: 'meeting', postedBy: by, postedDate: today, pinned: true });

  // No recipient list: the function sends to every member of the building with an email.
  const r = await callEmailFunction('send-meeting-notice', { title: m.title, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda });

  comp.addCommunication({
    type: 'notice',
    subject: `Notice: ${m.title} · ${m.date}`,
    date: today,
    method: r.sent ? 'email+portal' : 'portal',
    recipients: 'All members',
    respondedBy: by,
    status: 'sent',
    notes: `meeting:${m.id} · ${r.sent ? `emailed to ${r.sent}${r.reason ? ` (${r.reason})` : ''}` : `posted in-app only; not emailed: ${r.reason}`}`,
  });

  return {
    emailed: r.sent,
    note: r.sent
      ? `Notice posted in-app and emailed to ${r.sent} member${r.sent === 1 ? '' : 's'}${r.reason ? ` (${r.reason})` : ''}.`
      : `Notice posted in-app for every member, but not emailed: ${r.reason}. Owners who don't use the app need it another way (print it, or forward it).`,
  };
}
