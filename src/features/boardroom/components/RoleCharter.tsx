/**
 * RoleCharter — Displays the role charter for a given board role.
 * Shows runbook items grouped by frequency, with status dots and action buttons.
 * Used in Board Room (full) and Community Room (readOnly).
 */

import { useState, useMemo } from 'react';
import { Printer, ChevronRight, Send, Circle, CheckCircle2, AlertCircle, ArrowRightLeft, UserCog } from 'lucide-react';
import { useRunbook } from '@/features/compliance/useRunbook';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import RunbookDrawer from '@/features/compliance/RunbookDrawer';

interface RoleCharterProps {
  roleKey: BoardRoleKey;
  readOnly?: boolean;
  onCompose?: (recipientName: string) => void;
  /** Current user's role key */
  myRoleKey?: BoardRoleKey | null;
  /** Whether the current user is the president */
  isPresident?: boolean;
  /** Called when the user clicks "Change my seat" */
  onChangeSeat?: () => void;
  /** Called when the president clicks "Reassign" */
  onReassign?: () => void;
}

const FREQ_ORDER: Record<string, number> = {
  'Per meeting': 0,
  Monthly: 1,
  Quarterly: 2,
  'Semi-Annual': 3,
  Annual: 4,
  Biennial: 5,
  'As needed': 6,
  Ongoing: 7,
};

export default function RoleCharter({ roleKey, readOnly, onCompose, myRoleKey, isPresident, onChangeSeat, onReassign }: RoleCharterProps) {
  const { allItems } = useRunbook();
  const { completions } = useComplianceStore();
  const { board } = useBuildingStore();
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);

  // Find the board member assigned to this role
  const assignee = useMemo(
    () => board.find((m) => m.roleKey === roleKey),
    [board, roleKey],
  );

  // Filter items where primaryRole or backstopRole matches
  const roleItems = useMemo(
    () =>
      allItems.filter(
        (i) => i.primaryRole === roleKey || i.backstopRole === roleKey,
      ),
    [allItems, roleKey],
  );

  // Group by frequency
  const grouped = useMemo(() => {
    const map = new Map<string, typeof roleItems>();
    for (const item of roleItems) {
      const freq = item.freq || 'Ongoing';
      if (!map.has(freq)) map.set(freq, []);
      map.get(freq)!.push(item);
    }
    // Sort groups by frequency order
    const entries = [...map.entries()].sort(
      (a, b) => (FREQ_ORDER[a[0]] ?? 99) - (FREQ_ORDER[b[0]] ?? 99),
    );
    return entries;
  }, [roleItems]);

  // Counts
  const completedCount = roleItems.filter((i) => completions[i.id]).length;
  const totalCount = roleItems.length;
  const roleLabel = BOARD_ROLE_LABELS[roleKey] || roleKey;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">{roleLabel}</h3>
          {assignee && (
            <p className="text-sm text-ink-500 mt-0.5">{assignee.name}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-ink-400">
              {completedCount}/{totalCount} tasks complete
            </span>
            {totalCount > 0 && (
              <div className="w-24 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-teal rounded-full transition-all"
                  style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* "Change my seat" — shown when viewing your own role */}
          {!readOnly && myRoleKey === roleKey && onChangeSeat && (
            <button
              onClick={onChangeSeat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
            >
              <ArrowRightLeft size={14} />
              Change my seat
            </button>
          )}
          {/* "Reassign" — shown for president on other roles */}
          {!readOnly && isPresident && myRoleKey !== roleKey && onReassign && (
            <button
              onClick={onReassign}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
            >
              <UserCog size={14} />
              Reassign
            </button>
          )}
          {!readOnly && assignee && onCompose && (
            <button
              onClick={() => onCompose(assignee.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
            >
              <Send size={14} />
              Send to {assignee.name.split(' ')[0]}
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-600 border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      {/* Grouped items */}
      {grouped.map(([freq, items]) => (
        <div key={freq}>
          <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-2">
            {freq} ({items.length})
          </p>
          <div className="space-y-1.5">
            {items.map((item) => {
              const done = !!completions[item.id];
              const isPrimary = item.primaryRole === roleKey;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    done
                      ? 'border-sage-200 bg-sage-50/50'
                      : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  {/* Status dot */}
                  {done ? (
                    <CheckCircle2 size={16} className="text-sage-600 shrink-0" />
                  ) : item.critical ? (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  ) : (
                    <Circle size={16} className="text-ink-300 shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? 'text-ink-400 line-through' : 'text-ink-800'}`}>
                      {item.task}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.legalRef && (
                        <span className="text-[10px] text-ink-400">{item.legalRef}</span>
                      )}
                      {item.consequence && (
                        <span className="text-[10px] text-red-400">{item.consequence}</span>
                      )}
                      {!isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                          Backstop
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Due pill */}
                  {item.due && /^\d{4}-\d{2}-\d{2}$/.test(item.due) && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        done
                          ? 'bg-sage-100 text-sage-600'
                          : new Date(item.due) < new Date()
                            ? 'bg-red-100 text-red-700'
                            : 'bg-ink-100 text-ink-600'
                      }`}
                    >
                      {item.due}
                    </span>
                  )}

                  {/* Action button */}
                  {!readOnly && (
                    <button
                      onClick={() => setDrawerItemId(item.id)}
                      className="p-1.5 hover:bg-ink-100 rounded-lg transition-colors shrink-0"
                    >
                      <ChevronRight size={16} className="text-ink-400" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {roleItems.length === 0 && (
        <p className="text-center text-ink-400 py-8 text-sm">
          No runbook items assigned to this role.
        </p>
      )}

      {/* RunbookDrawer */}
      {drawerItemId && (
        <RunbookDrawer
          itemId={drawerItemId}
          onClose={() => setDrawerItemId(null)}
        />
      )}
    </div>
  );
}
