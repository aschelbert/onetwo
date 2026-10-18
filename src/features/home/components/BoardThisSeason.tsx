import { Send } from 'lucide-react';
import type { BoardMember } from '@/store/useBuildingStore';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';

interface BoardThisSeasonProps {
  boardMembers: BoardMember[];
  /** Per-role counts: roleKey -> { done, open, hasOverdue } */
  roleCounts: Record<string, { done: number; open: number; hasOverdue: boolean }>;
  onNudge: (memberName: string) => void;
}

interface MemberRow {
  id: string;
  name: string;
  roleLabel: string;
  done: number;
  open: number;
  total: number;
  hasOverdue: boolean;
}

function ProgressBar({ done, total, hasOverdue }: { done: number; total: number; hasOverdue: boolean }) {
  if (total === 0) {
    return <div className="w-full h-1.5 bg-ink-100 rounded-full" />;
  }
  const pct = Math.round((done / total) * 100);
  const barColor = hasOverdue ? 'bg-red-500' : 'bg-brand-teal';

  return (
    <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function BoardThisSeason({ boardMembers, roleCounts, onNudge }: BoardThisSeasonProps) {
  const rows: MemberRow[] = boardMembers.map((m) => {
    const roleKey = m.roleKey || 'member_at_large';
    const counts = roleCounts[roleKey] || { done: 0, open: 0, hasOverdue: false };

    return {
      id: m.id,
      name: m.name,
      roleLabel: BOARD_ROLE_LABELS[roleKey as BoardRoleKey] || roleKey,
      done: counts.done,
      open: counts.open,
      total: counts.done + counts.open,
      hasOverdue: counts.hasOverdue,
    };
  });

  return (
    <div className="bg-white rounded-xl border border-ink-100 p-4">
      <h3 className="text-sm font-bold text-ink-700 mb-3">Board this season</h3>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-400">No board members found.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-ink-800 truncate">
                    {row.name}
                  </span>
                  <span className="text-[10px] text-ink-400 shrink-0">
                    {row.roleLabel}
                  </span>
                </div>
                <div className="mt-1">
                  <ProgressBar done={row.done} total={row.total} hasOverdue={row.hasOverdue} />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-ink-400">{row.done} done</span>
                  <span className="text-[10px] text-ink-300">/</span>
                  <span className={`text-[10px] ${row.hasOverdue ? 'text-red-600 font-medium' : 'text-ink-400'}`}>
                    {row.open} open
                  </span>
                </div>
              </div>

              {row.open > 0 && (
                <button
                  onClick={() => onNudge(row.name)}
                  className="shrink-0 text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-teal/5"
                >
                  <Send className="w-3 h-3" />
                  Nudge
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
