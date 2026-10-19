/**
 * CaseTimeline — "What has happened" chronological timeline for a case,
 * showing decision trail entries, communications, and step completions.
 */

import { useMemo } from 'react';
import {
  FileText,
  MessageCircle,
  Phone,
  Upload,
  CheckCircle,
  PauseCircle,
  PlayCircle,
  XCircle,
  Gavel,
  DollarSign,
  Link2,
  AlertTriangle,
} from 'lucide-react';
import type { CaseTrackerCase, DecisionTrailEntry, CaseComm } from '@/types/issues';

interface CaseTimelineProps {
  caseData: CaseTrackerCase;
}

interface TimelineEvent {
  id: string;
  date: string;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  detail?: string;
  actor?: string;
}

const TRAIL_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  case_created: { icon: <FileText size={14} />, color: 'text-accent-600 bg-accent-50' },
  step_completed: { icon: <CheckCircle size={14} />, color: 'text-sage-600 bg-sage-50' },
  board_vote: { icon: <Gavel size={14} />, color: 'text-violet-600 bg-violet-50' },
  spending_decision: { icon: <DollarSign size={14} />, color: 'text-emerald-600 bg-emerald-50' },
  bid_uploaded: { icon: <Upload size={14} />, color: 'text-blue-600 bg-blue-50' },
  bid_selected: { icon: <CheckCircle size={14} />, color: 'text-emerald-600 bg-emerald-50' },
  conflict_check: { icon: <AlertTriangle size={14} />, color: 'text-amber-600 bg-amber-50' },
  communication_sent: { icon: <MessageCircle size={14} />, color: 'text-blue-600 bg-blue-50' },
  document_attached: { icon: <FileText size={14} />, color: 'text-ink-500 bg-ink-50' },
  case_held: { icon: <PauseCircle size={14} />, color: 'text-amber-600 bg-amber-50' },
  case_resumed: { icon: <PlayCircle size={14} />, color: 'text-sage-600 bg-sage-50' },
  case_closed: { icon: <XCircle size={14} />, color: 'text-ink-400 bg-ink-50' },
  work_order_linked: { icon: <Link2 size={14} />, color: 'text-blue-600 bg-blue-50' },
  note_added: { icon: <MessageCircle size={14} />, color: 'text-ink-500 bg-ink-50' },
  approach_added: { icon: <FileText size={14} />, color: 'text-violet-600 bg-violet-50' },
  notice_sent: { icon: <MessageCircle size={14} />, color: 'text-blue-600 bg-blue-50' },
  notice_delivered: { icon: <CheckCircle size={14} />, color: 'text-sage-600 bg-sage-50' },
};

const COMM_ICONS: Record<string, React.ReactNode> = {
  note: <MessageCircle size={14} />,
  email: <MessageCircle size={14} />,
  letter: <FileText size={14} />,
  call: <Phone size={14} />,
  upload: <Upload size={14} />,
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CaseTimeline({ caseData }: CaseTimelineProps) {
  const events = useMemo(() => {
    const items: TimelineEvent[] = [];

    // Decision trail entries
    if (caseData.decisionTrail) {
      for (const entry of caseData.decisionTrail) {
        const config = TRAIL_ICONS[entry.type] || { icon: <FileText size={14} />, color: 'text-ink-500 bg-ink-50' };
        items.push({
          id: entry.id,
          date: entry.date,
          icon: config.icon,
          iconColor: config.color,
          title: entry.summary,
          detail: entry.details,
          actor: entry.actor,
        });
      }
    }

    // Communications as timeline events
    for (const comm of caseData.comms) {
      // Avoid duplicating entries already in the decision trail
      const alreadyInTrail = caseData.decisionTrail?.some(
        t => t.type === 'communication_sent' && t.linkedEntityId === comm.id,
      );
      if (alreadyInTrail) continue;

      items.push({
        id: `comm-${comm.id}`,
        date: comm.date,
        icon: COMM_ICONS[comm.type] || <MessageCircle size={14} />,
        iconColor: 'text-blue-600 bg-blue-50',
        title: comm.subject,
        detail: comm.notes || undefined,
        actor: comm.sentBy,
      });
    }

    // Sort newest first
    items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }, [caseData]);

  if (events.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-ink-400">
        No timeline events yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-3 bottom-3 w-px bg-ink-200" />

      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="relative flex items-start gap-3 pl-1">
            {/* Icon dot */}
            <div
              className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${event.iconColor}`}
            >
              {event.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-medium text-ink-800 leading-tight">
                {event.title}
              </p>
              {event.detail && (
                <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">
                  {event.detail}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-ink-400">
                  {formatDate(event.date)}
                </span>
                {event.actor && (
                  <span className="text-[10px] text-ink-400">
                    by {event.actor}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
