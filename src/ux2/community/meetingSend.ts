/**
 * Sending a meeting's notice (step 2) and its summary (step 4) by app, email
 * and mail, and saying what really went out on each. In the app it's a pinned
 * notice every member sees; by email through the meeting-notice and
 * announcement functions; by mail as a printed letter through the building's
 * mail account, one per unit without an email (or that asked for paper).
 * Every send is also logged in the building's communications as proof.
 */
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMailStore, MAIL_NOT_CONNECTED } from '@/store/useMailStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { getActiveTenantId } from '@/lib/supabase';
import { callEmailFunction } from '@/lib/services/email';
import type { Meeting } from '@/store/useMeetingsStore';
import type { Unit } from '@/types/financial';
import { emailAnnouncement } from './notify';
import type { Channel, ChannelReport } from './meetingRecord';

async function mailLetters(units: Pick<Unit, 'number' | 'owner'>[], subject: string, body: string, refId: string): Promise<{ sent: number; note?: string }> {
  if (!units.length) return { sent: 0 };
  const mail = useMailStore.getState();
  if (!mail.mailingSettings.mailConnected) return { sent: 0, note: MAIL_NOT_CONNECTED };
  const addr = useBuildingStore.getState().address;
  const results = await Promise.allSettled(units.map(u => mail.sendNotice({
    caseId: refId,
    tenantId: getActiveTenantId() ?? '',
    templateId: 'meeting-letter',
    templateName: subject,
    subject,
    body,
    recipient: { name: u.owner || `Owner, Unit ${u.number}`, address: { line1: addr.street, line2: `Unit ${u.number}`, city: addr.city, state: addr.state, zip: addr.zip } },
    deliveryMethod: 'first-class',
    pageCount: Math.max(1, Math.ceil(body.length / 2500)),
    includeReturnEnvelope: false,
    emailCopy: false,
    mergeVariables: {},
  })));
  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
  return { sent, note: failed ? `${results.length - sent} letter${results.length - sent === 1 ? '' : 's'} not sent: ${(failed.reason as Error)?.message ?? 'the mail service refused it'}` : undefined };
}

export interface SendInput {
  meeting: Meeting;
  channels: Record<Channel, boolean>;
  units: Unit[];
  mailUnits: string[];
  by: string;
  today: string;
}

/** Step 2: the notice and the ballots. Returns what went out on each channel. */
export async function sendNotice(input: SendInput & { body: string }): Promise<ChannelReport> {
  const { meeting: m, channels, units, by, today } = input;
  const comp = useComplianceStore.getState();
  const report: ChannelReport = {};
  if (channels.app) {
    comp.addAnnouncement({ title: `Meeting notice: ${m.title}`, body: input.body, category: 'meeting', postedBy: by, postedDate: today, pinned: true });
    report.app = units.length;
  }
  if (channels.email) {
    const r = await callEmailFunction('send-meeting-notice', { title: m.title, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda, body: input.body });
    report.email = r.sent;
    if (r.reason) report.emailNote = r.reason;
  }
  if (channels.mail) {
    const r = await mailLetters(units.filter(u => input.mailUnits.includes(u.number)), `Notice of the ${m.title}`, input.body, `meeting:${m.id}`);
    report.mail = r.sent;
    if (r.note) report.mailNote = r.note;
  }
  comp.addCommunication({
    type: 'notice', subject: `Notice: ${m.title} · ${m.date}`, date: today,
    method: [channels.app ? 'portal' : '', report.email ? 'email' : '', report.mail ? 'mail' : ''].filter(Boolean).join('+') || 'portal',
    recipients: 'All members', respondedBy: by, status: 'sent',
    notes: `meeting:${m.id} · ${channelLine(report)}`,
  });
  return report;
}

/** Step 4: the summary of what was decided. */
export async function sendSummary(input: SendInput & { title: string; body: string }): Promise<ChannelReport> {
  const { channels, units, by, today } = input;
  const comp = useComplianceStore.getState();
  const report: ChannelReport = {};
  if (channels.app) {
    comp.addAnnouncement({ title: input.title, body: input.body, category: 'meeting', postedBy: by, postedDate: today, pinned: false });
    report.app = units.length;
  }
  if (channels.email) {
    const r = await emailAnnouncement({ title: input.title, body: input.body, category: 'meeting', postedBy: by, recipients: units.filter(u => u.email).map(u => ({ email: u.email, name: u.owner })) });
    report.email = r.sent;
    if (r.note) report.emailNote = r.note;
  }
  if (channels.mail) {
    const r = await mailLetters(units.filter(u => input.mailUnits.includes(u.number)), input.title, input.body, `meeting:${input.meeting.id}`);
    report.mail = r.sent;
    if (r.note) report.mailNote = r.note;
  }
  comp.addCommunication({
    type: 'summary', subject: input.title, date: today, method: 'portal', recipients: 'All members', respondedBy: by, status: 'sent',
    notes: `meeting:${input.meeting.id} · ${channelLine(report)}`,
  });
  return report;
}

/** "app 42 · email 35 · mail 6", with what didn't go out. */
export function channelLine(r: ChannelReport): string {
  return [
    r.app != null ? `in the app for ${r.app}` : '',
    r.email != null ? `emailed to ${r.email}${r.emailNote ? ` (${r.emailNote})` : ''}` : '',
    r.mail != null ? `mailed to ${r.mail}${r.mailNote ? ` (${r.mailNote})` : ''}` : '',
  ].filter(Boolean).join(' · ');
}
