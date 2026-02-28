import { useState, type ReactNode } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';

interface CaseSidebarProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  activeStepIdx: number;
  expandedStep: number;
  onStepClick: (idx: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEditAssignment: () => void;
  onAddApproach: () => void;
  onDelete: () => void;
  additionalApproaches?: CaseTrackerCase['additionalApproaches'];
  children?: ReactNode;
}

function SidebarMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1 rounded-lg hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-ink-100 py-1 min-w-[160px]">
            {items.map((item, i) => (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-mist-50 transition-colors ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-ink-700'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CaseSidebar({ c, steps, activeStepIdx, expandedStep, onStepClick, onClose, onReopen, onEditAssignment, onAddApproach, onDelete, additionalApproaches, children }: CaseSidebarProps) {
  const cat = CATS.find(x => x.id === c.catId);
  const pct = steps.length > 0 ? Math.round((steps.filter(s => s.done).length / steps.length) * 100) : 0;
  const doneCount = steps.filter(s => s.done).length;

  return (
    <aside className="w-72 shrink-0 hidden lg:block">
      <div className="space-y-4">
        {/* Case Summary Card */}
        <div className="bg-white rounded-xl border border-ink-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{cat?.icon || '📋'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900 truncate">{c.title}</p>
              <p className="text-[10px] text-ink-400 font-mono">{c.id}</p>
            </div>
            <SidebarMenu items={[
              c.status === 'open'
                ? { label: 'Close Case', onClick: onClose }
                : { label: 'Reopen Case', onClick: onReopen },
              { label: 'Edit Assignment', onClick: onEditAssignment },
              { label: 'Add Approach', onClick: onAddApproach },
              { label: 'Delete Case', onClick: onDelete, danger: true },
            ]} />
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>{c.priority}</span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>{APPR_LABELS[c.approach]}</span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${c.status === 'open' ? 'bg-accent-50 text-accent-600' : 'bg-sage-100 text-sage-700'}`}>{c.status}</span>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <div className="bg-mist-50 rounded-lg px-2.5 py-1.5">
              <div className="text-ink-400 text-[10px]">Unit</div>
              <div className="font-semibold text-ink-800">{c.unit || '—'}</div>
            </div>
            <div className="bg-mist-50 rounded-lg px-2.5 py-1.5">
              <div className="text-ink-400 text-[10px]">Owner</div>
              <div className="font-semibold text-ink-800 truncate">{c.owner || '—'}</div>
            </div>
            {c.assignedTo && (
              <div className="bg-mist-50 rounded-lg px-2.5 py-1.5 col-span-2">
                <div className="text-ink-400 text-[10px]">Assigned</div>
                <div className="font-semibold text-ink-800 truncate">{c.assignedTo}{c.assignedRole ? ` (${c.assignedRole})` : ''}</div>
              </div>
            )}
          </div>

          {/* Progress donut */}
          <div className="flex items-center gap-3 mb-4">
            <svg viewBox="0 0 36 36" className="w-12 h-12 shrink-0">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={c.status === 'closed' ? '#22c55e' : '#f59e0b'} strokeWidth="3" strokeDasharray={`${pct}, 100`} />
            </svg>
            <div>
              <p className="text-sm font-bold text-ink-800">{pct}%</p>
              <p className="text-[10px] text-ink-400">{doneCount}/{steps.length} steps</p>
            </div>
          </div>

        </div>

        {/* Step Rail */}
        <div className="bg-white rounded-xl border border-ink-100 p-4 shadow-sm">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Workflow Steps</p>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-ink-100" />
            <div className="space-y-0.5">
              {steps.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => onStepClick(i)}
                  className={`relative z-10 flex items-center gap-3 w-full text-left px-1.5 py-2 rounded-lg transition-all group ${
                    expandedStep === i ? 'bg-accent-50' : 'hover:bg-mist-50'
                  }`}
                >
                  {/* Status dot */}
                  {step.done ? (
                    <div className="w-[14px] h-[14px] rounded-full bg-sage-500 flex items-center justify-center shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : i === activeStepIdx ? (
                    <div className="w-[14px] h-[14px] rounded-full bg-accent-500 ring-2 ring-accent-200 shrink-0" />
                  ) : (
                    <div className="w-[14px] h-[14px] rounded-full border-2 border-ink-200 bg-white shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs truncate ${
                      expandedStep === i ? 'text-accent-700 font-semibold'
                      : step.done ? 'text-ink-400'
                      : 'text-ink-700 font-medium'
                    }`}>
                      {i + 1}. {step.s.length > 50 ? step.s.slice(0, 50) + '...' : step.s}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Additional approaches labels */}
          {additionalApproaches && additionalApproaches.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-50 space-y-1">
              {additionalApproaches.map((aa, ai) => (
                <div key={ai} className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${APPR_COLORS[aa.approach]}`}>{APPR_LABELS[aa.approach]}</span>
                  <span className="text-[10px] text-ink-400">{aa.steps.filter(s => s.done).length}/{aa.steps.length}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supporting sections */}
        {children}
      </div>
    </aside>
  );
}
