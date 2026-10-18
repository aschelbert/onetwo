/**
 * OutboxTab — Displays all outbound communications in a unified view.
 * Segment filter: All, Needs you, Scheduled, Sent, Mailed.
 * Compose button opens ComposeDrawer. Templates button opens letter templates.
 */

import { useState, useMemo } from 'react';
import {
  Circle,
  AlertCircle,
  Clock,
  CheckCircle2,
  Mail,
  Send,
  FileText,
  Plus,
  LayoutTemplate,
} from 'lucide-react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useMailStore } from '@/store/useMailStore';
import { buildOutbox, type OutboxItem, type OutboxStatus } from '@/lib/outbox';
import ComposeDrawer from '@/features/boardroom/components/ComposeDrawer';

type Segment = 'all' | 'needs_you' | 'scheduled' | 'sent' | 'mailed';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_you', label: 'Needs you' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'mailed', label: 'Mailed' },
];

const STATUS_DOT: Record<OutboxStatus, { icon: typeof Circle; color: string }> = {
  needs_you: { icon: AlertCircle, color: 'text-red-500' },
  scheduled: { icon: Clock, color: 'text-amber-500' },
  sent: { icon: CheckCircle2, color: 'text-sage-600' },
  delivered: { icon: CheckCircle2, color: 'text-sage-700' },
  bounced: { icon: AlertCircle, color: 'text-red-600' },
  mailed: { icon: Mail, color: 'text-violet-600' },
  draft: { icon: FileText, color: 'text-ink-400' },
};

const STATUS_BADGE: Record<OutboxStatus, string> = {
  needs_you: 'bg-red-100 text-red-700',
  scheduled: 'bg-amber-100 text-amber-700',
  sent: 'bg-sage-100 text-sage-700',
  delivered: 'bg-sage-100 text-sage-700',
  bounced: 'bg-red-100 text-red-700',
  mailed: 'bg-violet-100 text-violet-700',
  draft: 'bg-ink-100 text-ink-600',
};

const KIND_LABEL: Record<string, string> = {
  notice: 'Notice',
  letter: 'Letter',
  announcement: 'Announcement',
  email: 'Email',
  statement: 'Statement',
  reminder: 'Reminder',
};

export default function OutboxTab() {
  const comp = useComplianceStore();
  const letterStore = useLetterStore();
  const meetingsStore = useMeetingsStore();
  const mailStore = useMailStore();
  const [segment, setSegment] = useState<Segment>('all');
  const [composeOpen, setComposeOpen] = useState(false);

  const outboxItems = useMemo(
    () =>
      buildOutbox({
        communications: comp.communications || [],
        announcements: comp.announcements || [],
        letters: letterStore.letters,
        meetings: meetingsStore.meetings,
        mailJobs: mailStore.mailRecords,
      }),
    [comp.communications, comp.announcements, letterStore.letters, meetingsStore.meetings, mailStore.mailRecords],
  );

  const filtered = useMemo(
    () =>
      segment === 'all'
        ? outboxItems
        : outboxItems.filter((i) => i.status === segment),
    [outboxItems, segment],
  );

  // Counts for badges
  const needsYouCount = outboxItems.filter((i) => i.status === 'needs_you').length;
  const scheduledCount = outboxItems.filter((i) => i.status === 'scheduled').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Outbox</h3>
          <p className="text-xs text-ink-400 mt-0.5">
            All board communications, notices, and reminders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
          >
            <Plus size={16} />
            Compose
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-600 border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors">
            <LayoutTemplate size={16} />
            Templates
          </button>
        </div>
      </div>

      {/* Segment filter */}
      <SegmentedControl
        options={SEGMENTS}
        value={segment}
        onChange={setSegment}
        size="sm"
      />

      {/* Items */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const dot = STATUS_DOT[item.status];
          const DotIcon = dot.icon;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-ink-100 p-4 hover:border-ink-200 transition-colors"
            >
              {/* Status dot */}
              <DotIcon size={16} className={`${dot.color} shrink-0`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_BADGE[item.status]}`}
                  >
                    {item.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-500 font-medium">
                    {KIND_LABEL[item.kind] || item.kind}
                  </span>
                  <h4 className="text-sm font-semibold text-ink-900 truncate">{item.title}</h4>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-400">
                  <span>{item.audience}</span>
                  <span>{item.channel.join(', ')}</span>
                  {item.scheduledFor && <span>Scheduled: {item.scheduledFor}</span>}
                  {item.createdAt && <span>{item.createdAt}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {item.actions.includes('send') && (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-white bg-navy rounded-lg hover:bg-navy-800 transition-colors">
                    Send
                  </button>
                )}
                {item.actions.includes('edit') && (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-ink-600 border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors">
                    Edit
                  </button>
                )}
                {item.actions.includes('preview') && (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-ink-600 border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors">
                    Preview
                  </button>
                )}
                {item.actions.includes('mail') && (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
                    Mail
                  </button>
                )}
                {item.actions.includes('fix_addresses') && (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    Fix addresses
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Send size={32} className="text-ink-200 mx-auto mb-3" />
            <p className="text-ink-400 text-sm">
              {segment === 'all'
                ? 'No communications yet. Start by composing a message.'
                : `No ${segment.replace('_', ' ')} items.`}
            </p>
          </div>
        )}
      </div>

      {/* ComposeDrawer */}
      <ComposeDrawer open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
