import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import QueueCard from '@/components/ui/QueueCard';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import type { QueueItem } from '@/lib/queue';

interface YourWeekProps {
  items: QueueItem[];
  total: number;
  onOpenDrawer: (drawer: string, params: Record<string, string>) => void;
  nextMeetingSummary: string | null;
}

function sourceToTag(source: string): { label: string; tone: 'neutral' | 'vote' | 'request' | 'case' } | undefined {
  switch (source) {
    case 'vote': return { label: 'Vote', tone: 'vote' };
    case 'request': return { label: 'Request', tone: 'request' };
    case 'case_step': return { label: 'Case', tone: 'case' };
    case 'approval': return { label: 'Approval', tone: 'vote' };
    case 'offer': return { label: 'Offer', tone: 'request' };
    default: return undefined;
  }
}

const MAX_COLLAPSED = 5;

export default function YourWeek({ items, total, onOpenDrawer, nextMeetingSummary }: YourWeekProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? items : items.slice(0, MAX_COLLAPSED);
  const hiddenCount = total - MAX_COLLAPSED;

  return (
    <div>
      <h2 className="text-sm font-bold text-ink-700 mb-3">Your week</h2>

      {items.length === 0 ? (
        <p className="text-sm text-ink-400 py-4">Nothing due this week. Enjoy your time off.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <QueueCard
              key={item.id}
              roleKey={item.roleKey as BoardRoleKey}
              roleLabel={BOARD_ROLE_LABELS[item.roleKey as BoardRoleKey] || item.roleKey}
              roleState={item.roleState}
              containerLine={item.containerLine}
              tag={sourceToTag(item.source)}
              title={item.title}
              why={item.why}
              due={item.dueDate ? { label: item.dueTone === 'overdue' ? `Overdue: ${item.dueDate}` : `Due ${item.dueDate}`, tone: item.dueTone } : undefined}
              primary={{
                label: item.primaryAction.label,
                onClick: () => onOpenDrawer(item.primaryAction.drawer, item.primaryAction.params),
              }}
              secondary={item.secondaryActions.map((a) => ({
                label: a.label,
                onClick: () => onOpenDrawer(a.drawer, a.params),
              }))}
              onOpen={() => onOpenDrawer(item.primaryAction.drawer, item.primaryAction.params)}
              emphasis={item.dueTone === 'overdue'}
              dimmed={item.roleState === 'other'}
            />
          ))}

          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full py-2 text-xs font-medium text-brand-teal hover:text-brand-teal/80 flex items-center justify-center gap-1"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              + {hiddenCount} more
            </button>
          )}

          {expanded && items.length > MAX_COLLAPSED && (
            <button
              onClick={() => setExpanded(false)}
              className="w-full py-2 text-xs font-medium text-brand-teal hover:text-brand-teal/80 flex items-center justify-center gap-1"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </button>
          )}
        </div>
      )}

      {/* Next meeting divider */}
      {nextMeetingSummary && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <p className="text-xs text-ink-500">
            <span className="font-medium text-ink-600">Next meeting:</span> {nextMeetingSummary}
          </p>
        </div>
      )}
    </div>
  );
}
