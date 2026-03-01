'use client';

import { useState, useMemo } from 'react';
import type { DecisionTrailEntry, TrailEntryType } from '@/types/issues';

const iconMap: Record<TrailEntryType, string> = {
  case_created: '\u{1F4CB}',
  step_completed: '\u2705',
  board_vote: '\u{1F5F3}',
  spending_decision: '\u{1F4B0}',
  bid_uploaded: '\u{1F4E4}',
  bid_selected: '\u2713',
  conflict_check: '\u2696\uFE0F',
  communication_sent: '\u{1F4E8}',
  document_attached: '\u{1F4CE}',
  case_held: '\u23F8',
  case_resumed: '\u25B6',
  case_closed: '\u{1F3C1}',
  work_order_linked: '\u{1F517}',
  note_added: '\u{1F4DD}',
  approach_added: '\u2795',
  notice_sent: '\u{1F4EE}',
  notice_delivered: '\u{1F4EC}',
};

interface DecisionTrailProps {
  entries: DecisionTrailEntry[];
}

function groupByMonth(entries: DecisionTrailEntry[]): Record<string, DecisionTrailEntry[]> {
  const groups: Record<string, DecisionTrailEntry[]> = {};

  for (const entry of entries) {
    const d = new Date(entry.date);
    const key = `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  }

  return groups;
}

export default function DecisionTrail({ entries }: DecisionTrailProps) {
  const [expanded, setExpanded] = useState(false);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries],
  );

  const visibleEntries = expanded ? sortedEntries : sortedEntries.slice(0, 10);
  const grouped = useMemo(() => groupByMonth(visibleEntries), [visibleEntries]);

  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
          Decision Trail
        </h3>
        <p className="text-xs text-ink-400">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
        Decision Trail
      </h3>

      {Object.entries(grouped).map(([month, monthEntries]) => (
        <div key={month} className="space-y-1">
          <h4 className="text-[10px] font-semibold text-ink-400 uppercase">{month}</h4>

          <div className="border-l-2 border-ink-100 ml-2 pl-3 space-y-3">
            {monthEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <span className="text-sm leading-none mt-0.5">{iconMap[entry.type]}</span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-700">{entry.summary}</p>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span className="text-[10px] text-ink-400">
                      {new Date(entry.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-[10px] text-ink-400">{entry.actor}</span>

                    {entry.linkedEntityType && (
                      <span className="text-[10px] bg-accent-50 text-accent-600 px-1.5 py-0.5 rounded">
                        {entry.linkedEntityType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!expanded && sortedEntries.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-accent-600 hover:text-accent-700 font-medium"
        >
          View all ({sortedEntries.length})
        </button>
      )}
    </div>
  );
}
