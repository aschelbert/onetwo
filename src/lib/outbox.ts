/**
 * Outbox — unified view of all outbound communications, announcements,
 * generated letters, meeting reminders, and mail jobs.
 */

import type { OwnerCommunication, Announcement } from '@/store/useComplianceStore';
import type { GeneratedLetter } from '@/lib/services/letterEngine';
import type { Meeting } from '@/store/useMeetingsStore';
import type { MailRecord } from '@/types/mail';

// ── Types ────────────────────────────────────────────────────────────────────

export type OutboxStatus =
  | 'needs_you'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'mailed'
  | 'draft';

export type OutboxKind =
  | 'notice'
  | 'letter'
  | 'announcement'
  | 'email'
  | 'statement'
  | 'reminder';

export type OutboxAction = 'preview' | 'send' | 'edit' | 'mail' | 'fix_addresses';

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  title: string;
  detail: string;
  status: OutboxStatus;
  audience: string;
  channel: ('email' | 'portal' | 'postal')[];
  createdAt: string;
  scheduledFor?: string;
  sourceFlow?: string;
  legalRef?: string;
  actions: OutboxAction[];
}

// ── Status-order map (for sorting) ───────────────────────────────────────────

const STATUS_ORDER: Record<OutboxStatus, number> = {
  needs_you: 0,
  scheduled: 1,
  draft: 2,
  sent: 3,
  delivered: 4,
  mailed: 5,
  bounced: 6,
};

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildOutbox(args: {
  communications: OwnerCommunication[];
  announcements: Announcement[];
  letters: GeneratedLetter[];
  meetings: Meeting[];
  mailJobs?: MailRecord[];
}): OutboxItem[] {
  const { communications, announcements, letters, meetings, mailJobs } = args;
  const items: OutboxItem[] = [];

  // 1. Communications -> outbox items
  for (const c of communications) {
    let status: OutboxStatus;
    switch (c.status) {
      case 'pending':
        status = 'needs_you';
        break;
      case 'draft':
        status = 'draft';
        break;
      case 'sent':
      default:
        status = 'sent';
        break;
    }

    const actions: OutboxAction[] = [];
    if (status === 'needs_you') {
      actions.push('preview', 'send');
    } else if (status === 'draft') {
      actions.push('edit', 'send');
    } else {
      actions.push('preview');
    }

    items.push({
      id: c.id,
      kind: 'notice',
      title: c.subject,
      detail: `${c.type} via ${c.method}`,
      status,
      audience: c.recipients,
      channel: c.method.includes('email') ? ['email'] : ['portal'],
      createdAt: c.date,
      sourceFlow: 'communications',
      actions,
    });
  }

  // 2. Announcements -> outbox items (always portal, status = sent)
  for (const a of announcements) {
    items.push({
      id: a.id,
      kind: 'announcement',
      title: a.title,
      detail: a.body.slice(0, 120) + (a.body.length > 120 ? '...' : ''),
      status: 'sent',
      audience: 'All owners',
      channel: ['portal'],
      createdAt: a.postedDate,
      sourceFlow: 'announcements',
      actions: ['preview'],
    });
  }

  // 3. Generated letters -> outbox items
  for (const l of letters) {
    // Check if this letter has a matching mail job (-> mailed)
    const hasMailJob = mailJobs?.some(
      (j) => j.templateId === l.templateId && j.recipient.name === l.recipient
    );

    const status: OutboxStatus = hasMailJob ? 'mailed' : l.status === 'draft' ? 'draft' : 'sent';
    const actions: OutboxAction[] =
      status === 'draft' ? ['edit', 'send', 'mail'] : ['preview'];

    items.push({
      id: l.id,
      kind: 'letter',
      title: l.subject,
      detail: `To ${l.recipient} (Unit ${l.unitNumber})`,
      status,
      audience: l.recipient,
      channel: hasMailJob ? ['postal'] : l.sentVia === 'email' ? ['email'] : ['portal'],
      createdAt: l.sentDate || '',
      sourceFlow: 'letters',
      actions,
    });
  }

  // 4. Meetings with status SCHEDULED that have no matching notice communication ->
  //    a scheduled "Meeting reminder" at date minus 2 days
  for (const m of meetings) {
    if (m.status !== 'SCHEDULED') continue;

    const hasNotice = communications.some(
      (c) =>
        c.subject.toLowerCase().includes(m.title.toLowerCase()) ||
        c.subject.toLowerCase().includes('meeting')
    );

    if (!hasNotice) {
      const meetingDate = new Date(m.date + 'T00:00:00');
      const reminderDate = new Date(meetingDate);
      reminderDate.setDate(reminderDate.getDate() - 2);
      const scheduledFor = reminderDate.toISOString().split('T')[0];

      items.push({
        id: `reminder-${m.id}`,
        kind: 'reminder',
        title: `Meeting reminder: ${m.title}`,
        detail: `${m.date} at ${m.time} - ${m.location}`,
        status: 'scheduled',
        audience: 'All owners',
        channel: ['email'],
        createdAt: m.date,
        scheduledFor,
        sourceFlow: 'meetings',
        actions: ['preview', 'send'],
      });
    }
  }

  // 5. Mail jobs that are bounced or need address fixes
  if (mailJobs) {
    for (const j of mailJobs) {
      if (j.status === 'returned' || j.status === 'failed') {
        items.push({
          id: `mail-${j.id}`,
          kind: 'letter',
          title: j.templateName,
          detail: `Mail to ${j.recipient.name} — ${j.status}`,
          status: 'bounced',
          audience: j.recipient.name,
          channel: ['postal'],
          createdAt: j.createdAt,
          sourceFlow: 'mail',
          actions: ['fix_addresses', 'mail'],
        });
      }
    }
  }

  // Sort: needs_you first, then scheduled, then by newest createdAt
  items.sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    // Within the same status, sort newest first
    return b.createdAt.localeCompare(a.createdAt);
  });

  return items;
}
