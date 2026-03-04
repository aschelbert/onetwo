import { useState, useRef, useEffect } from 'react';
import type { CaseTrackerCase } from '@/types/issues';
import { CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS, SITUATION_PHASES } from '@/store/useIssuesStore';
import { PHASES } from './budgetData';

interface CaseHeaderProps {
  c: CaseTrackerCase;
  pct: number;
  onAddApproach: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
}

function ProgressRing({ pct, closed, size = 44 }: { pct: number; closed: boolean; size?: number }) {
  const r = size * 0.4;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-ink-200" strokeWidth="2.5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={closed ? '#4a7f4a' : '#7c3aed'}
          strokeWidth="2.5"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold text-ink-700">{pct}%</span>
      </div>
    </div>
  );
}

function ThreeDotMenu({ c, onAddApproach, onClose, onReopen, onDelete }: {
  c: CaseTrackerCase;
  onAddApproach: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg border border-ink-200 bg-white flex items-center justify-center text-ink-500 hover:bg-ink-50 text-sm"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-9 bg-white border border-ink-200 rounded-xl shadow-lg min-w-[170px] z-50 overflow-hidden">
          <button onClick={() => { onAddApproach(); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
            ➕ Add Approach
          </button>
          {c.status !== 'closed' ? (
            <button onClick={() => { onClose(); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              ✓ Close Case
            </button>
          ) : (
            <button onClick={() => { onReopen(); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              ↺ Reopen Case
            </button>
          )}
          <div className="border-t border-ink-100" />
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50">
            🗑 Delete Case
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Left-sidebar case header block.
 * Shows category emoji, pills, title, meta row, progress ring, and three-dot menu.
 */
export function CaseHeader({ c, pct, onAddApproach, onClose, onReopen, onDelete }: CaseHeaderProps) {
  const cat = CATS.find(x => x.id === c.catId);

  return (
    <div className="p-4 border-b border-ink-100">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{cat?.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          {/* Pills row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>
              {c.priority}
            </span>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>
              {APPR_LABELS[c.approach]}
            </span>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
              c.status === 'open' ? 'bg-yellow-50 text-yellow-700'
              : c.status === 'on-hold' ? 'bg-amber-100 text-amber-700'
              : 'bg-sage-100 text-sage-700'
            }`}>
              {c.status === 'on-hold' ? 'ON HOLD' : c.status}
            </span>
          </div>
          {/* Title */}
          <h2 className="font-display text-base font-bold text-ink-900 leading-tight">{c.title}</h2>
          {/* Meta row */}
          <p className="text-xs text-ink-400 mt-1.5">
            🏠 Unit {c.unit} · 👤 {c.owner} · {c.created} · 📋 {c.assignedTo || 'Unassigned'}
          </p>
        </div>
        {/* Progress ring + menu */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <ProgressRing pct={pct} closed={c.status === 'closed'} />
          <ThreeDotMenu c={c} onAddApproach={onAddApproach} onClose={onClose} onReopen={onReopen} onDelete={onDelete} />
        </div>
      </div>

      {/* Case notes */}
      {c.notes && (
        <div className="mt-3 bg-sand-100 border border-sand-300 rounded-lg p-3">
          <p className="text-xs text-ink-600 leading-relaxed">{c.notes}</p>
        </div>
      )}

      {/* Phase bar for annual-budgeting */}
      {c.catId === 'financial' && c.sitId === 'annual-budgeting' && c.steps && (
        <PhaseBar steps={c.steps} />
      )}
    </div>
  );
}

function PhaseBar({ steps }: { steps: NonNullable<CaseTrackerCase['steps']> }) {
  const phases = SITUATION_PHASES['annual-budgeting'] || [];
  if (phases.length === 0) return null;

  // Count done steps per phase
  const phaseProgress = phases.map(phase => {
    const phaseSteps = steps.filter(s => s.phaseId === phase.id);
    const done = phaseSteps.filter(s => s.done).length;
    return { ...phase, done, total: phaseSteps.length };
  });

  // Map phase IDs to colors from PHASES constant
  const colorMap: Record<string, string> = {};
  PHASES.forEach(p => { colorMap[p.id] = p.color; });

  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {phaseProgress.map(p => {
          const color = colorMap[p.id] || '#94a3b8';
          const filled = p.total > 0 ? p.done / p.total : 0;
          return (
            <div key={p.id} className="flex-1">
              <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${filled * 100}%`, backgroundColor: color }}
                />
              </div>
              <div className="text-[9px] text-ink-400 mt-0.5 text-center">{p.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
