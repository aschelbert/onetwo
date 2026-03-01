import { useState, type ReactNode } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS, SITUATION_PHASES, PHASE_COLORS } from '@/store/useIssuesStore';

interface CaseSidebarProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  activeStepIdx: number;
  expandedSteps: number[];
  onStepClick: (idx: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEditAssignment: () => void;
  onAddApproach: () => void;
  onDelete: () => void;
  onPutOnHold?: () => void;
  onResume?: () => void;
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

export function CaseSidebar({ c, steps, activeStepIdx, expandedSteps, onStepClick, onClose, onReopen, onEditAssignment, onAddApproach, onDelete, onPutOnHold, onResume, additionalApproaches, children }: CaseSidebarProps) {
  const cat = CATS.find(x => x.id === c.catId);

  // Calculate check-based progress
  let totalProgress = 0, doneProgress = 0;
  for (const step of steps) {
    if (step.checks && step.checks.length > 0) {
      totalProgress += step.checks.length;
      doneProgress += step.checks.filter(ck => ck.checked).length;
    } else {
      totalProgress += 1;
      doneProgress += step.done ? 1 : 0;
    }
  }
  const pct = totalProgress > 0 ? Math.round((doneProgress / totalProgress) * 100) : 0;

  // Phase grouping for step rail
  const phases = SITUATION_PHASES[c.sitId] || [];
  const hasPhases = phases.length > 0 && steps.some(s => s.phaseId);

  // Build menu items based on status
  const menuItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (c.status === 'open') {
    if (onPutOnHold) menuItems.push({ label: 'Put On Hold', onClick: onPutOnHold });
    menuItems.push({ label: 'Close Case', onClick: onClose });
    menuItems.push({ label: 'Edit Assignment', onClick: onEditAssignment });
    menuItems.push({ label: 'Add Approach', onClick: onAddApproach });
    menuItems.push({ label: 'Delete Case', onClick: onDelete, danger: true });
  } else if (c.status === 'on-hold') {
    if (onResume) menuItems.push({ label: 'Resume', onClick: onResume });
    menuItems.push({ label: 'Close Case', onClick: onClose });
    menuItems.push({ label: 'Edit Assignment', onClick: onEditAssignment });
    menuItems.push({ label: 'Add Approach', onClick: onAddApproach });
    menuItems.push({ label: 'Delete Case', onClick: onDelete, danger: true });
  } else {
    menuItems.push({ label: 'Reopen Case', onClick: onReopen });
    menuItems.push({ label: 'Edit Assignment', onClick: onEditAssignment });
    menuItems.push({ label: 'Delete Case', onClick: onDelete, danger: true });
  }

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
            <SidebarMenu items={menuItems} />
          </div>

          {/* ON-HOLD Banner */}
          {c.status === 'on-hold' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-bold text-amber-800 uppercase">On Hold</p>
              {c.holdReason && <p className="text-xs text-amber-700 mt-0.5">{c.holdReason}</p>}
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>{c.priority}</span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>{APPR_LABELS[c.approach]}</span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
              c.status === 'open' ? 'bg-accent-50 text-accent-600'
              : c.status === 'on-hold' ? 'bg-amber-100 text-amber-700'
              : 'bg-sage-100 text-sage-700'
            }`}>{c.status === 'on-hold' ? 'ON HOLD' : c.status}</span>
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
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={c.status === 'closed' ? '#22c55e' : c.status === 'on-hold' ? '#f59e0b' : '#f59e0b'} strokeWidth="3" strokeDasharray={`${pct}, 100`} />
            </svg>
            <div>
              <p className="text-sm font-bold text-ink-800">{pct}%</p>
              <p className="text-[10px] text-ink-400">{doneProgress}/{totalProgress} tasks</p>
            </div>
          </div>

        </div>

        {/* Step Rail */}
        <div className="bg-white rounded-xl border border-ink-100 p-4 shadow-sm">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Workflow Steps</p>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-ink-100" />

            {hasPhases ? (
              <div className="space-y-2">
                {phases.map((phase, pi) => {
                  const phaseSteps = steps.map((s, i) => ({ step: s, idx: i })).filter(x => x.step.phaseId === phase.id);
                  if (phaseSteps.length === 0) return null;
                  const phaseDone = phaseSteps.filter(x => x.step.done).length;
                  return (
                    <div key={phase.id}>
                      <div className="flex items-center gap-2 pl-1 py-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PHASE_COLORS[pi % PHASE_COLORS.length] }} />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400">{phase.label}</span>
                        <span className="text-[9px] text-ink-300">{phaseDone}/{phaseSteps.length}</span>
                      </div>
                      <div className="space-y-0.5">
                        {phaseSteps.map(({ step, idx: i }) => (
                          <button
                            key={step.id}
                            onClick={() => onStepClick(i)}
                            className={`relative z-10 flex items-center gap-3 w-full text-left px-1.5 py-2 rounded-lg transition-all group ${
                              expandedSteps.includes(i) ? 'bg-accent-50' : 'hover:bg-mist-50'
                            }`}
                          >
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
                                expandedSteps.includes(i) ? 'text-accent-700 font-semibold'
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
                  );
                })}
              </div>
            ) : (
              <div className="space-y-0.5">
                {steps.map((step, i) => (
                  <button
                    key={step.id}
                    onClick={() => onStepClick(i)}
                    className={`relative z-10 flex items-center gap-3 w-full text-left px-1.5 py-2 rounded-lg transition-all group ${
                      expandedSteps.includes(i) ? 'bg-accent-50' : 'hover:bg-mist-50'
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
                        expandedSteps.includes(i) ? 'text-accent-700 font-semibold'
                        : step.done ? 'text-ink-400'
                        : 'text-ink-700 font-medium'
                      }`}>
                        {i + 1}. {step.s.length > 50 ? step.s.slice(0, 50) + '...' : step.s}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
