import { useState } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { APPR_LABELS } from '@/store/useIssuesStore';

const APPR_COLORS: Record<string, string> = {
  pre: 'text-accent-600 bg-accent-50 border-accent-200',
  self: 'text-amber-700 bg-amber-50 border-amber-200',
  legal: 'text-indigo-600 bg-indigo-50 border-indigo-200',
};

interface StepListProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  activeStep: number;
  onSelectStep: (index: number) => void;
  onToggleAdditionalStep?: (approachIdx: number, stepIdx: number) => void;
  onSelectAdditionalStep?: (approachIdx: number, stepIdx: number) => void;
  activeApproachIdx?: number | null;
}

/**
 * Clickable step navigation in the left sidebar.
 * Shows approach label + done/total count header, then each step as a button.
 * Active step gets ink-50 bg + accent-500 left border.
 * Done steps show green checkmark badge, pending steps show numbered badge.
 * Additional approaches are shown below the primary steps.
 */
export function StepList({ c, steps, activeStep, onSelectStep, onToggleAdditionalStep, onSelectAdditionalStep, activeApproachIdx }: StepListProps) {
  const [collapsedApproaches, setCollapsedApproaches] = useState<Set<number>>(new Set());

  if (!steps || steps.length === 0) {
    return <p className="p-4 text-sm text-ink-400">No steps defined.</p>;
  }

  const doneCount = steps.filter(s => s.done).length;
  const additionalApproaches = c.additionalApproaches || [];

  const toggleCollapse = (idx: number) => {
    setCollapsedApproaches(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="px-3 pt-3 pb-1.5">
      {/* Primary approach header */}
      <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2 ml-1">
        {APPR_LABELS[c.approach]} Steps
        <span className="font-normal normal-case tracking-normal ml-1.5">
          {doneCount}/{steps.length}
        </span>
      </h3>

      {/* Primary step buttons */}
      <div className="flex flex-col gap-0.5">
        {steps.map((st, i) => {
          const isActive = i === activeStep && activeApproachIdx == null;
          const isDone = st.done;

          return (
            <button
              key={st.id || i}
              onClick={() => onSelectStep(i)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                isActive
                  ? 'bg-ink-50 border border-ink-200 border-l-[3px] border-l-accent-500'
                  : 'border border-transparent hover:bg-ink-50'
              }`}
            >
              {/* Step badge */}
              <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                isDone
                  ? 'bg-sage-500 text-white'
                  : isActive
                  ? 'bg-accent-50 text-accent-600 border border-accent-200'
                  : 'bg-ink-50 text-ink-400 border border-ink-200'
              }`}>
                {isDone ? '✓' : i + 1}
              </span>

              {/* Step text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={`text-[13px] leading-tight truncate ${
                    isDone
                      ? 'text-ink-400 line-through'
                      : isActive
                      ? 'font-semibold text-ink-900'
                      : 'text-ink-700'
                  }`}>
                    {st.s}
                  </p>
                  {/* Action dots for steps with actions */}
                  {st.actions && st.actions.length > 0 && (
                    <span className="flex gap-0.5 shrink-0">
                      {st.actions.map(a => (
                        <span
                          key={a.id}
                          className={`w-1.5 h-1.5 rounded-full ${a.done ? 'bg-mist-500' : 'bg-ink-200'}`}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {st.t && <p className="text-[10px] text-ink-400 mt-0.5">{st.t}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Additional approaches */}
      {additionalApproaches.map((aa, ai) => {
        const aaDone = aa.steps.filter(s => s.done).length;
        const isCollapsed = collapsedApproaches.has(ai);
        const colorClass = APPR_COLORS[aa.approach] || APPR_COLORS.pre;

        return (
          <div key={ai} className="mt-3 pt-3 border-t border-ink-100">
            <button
              onClick={() => toggleCollapse(ai)}
              className="flex items-center gap-2 w-full ml-1 mb-2"
            >
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${colorClass}`}>
                {APPR_LABELS[aa.approach]}
              </span>
              <span className="text-[10px] text-ink-400">
                {aaDone}/{aa.steps.length}
              </span>
              <span className="text-[10px] text-ink-300 ml-auto mr-1">{isCollapsed ? '▸' : '▾'}</span>
            </button>

            {!isCollapsed && (
              <div className="flex flex-col gap-0.5">
                {aa.steps.map((st, si) => {
                  const isActiveAdditional = activeApproachIdx === ai && activeStep === si;
                  return (
                    <button
                      key={st.id || si}
                      onClick={() => onSelectAdditionalStep?.(ai, si)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                        isActiveAdditional
                          ? 'bg-ink-50 border border-ink-200 border-l-[3px] border-l-accent-500'
                          : 'border border-transparent hover:bg-ink-50'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        st.done
                          ? 'bg-sage-500 text-white'
                          : isActiveAdditional
                          ? 'bg-accent-50 text-accent-600 border border-accent-200'
                          : 'bg-ink-50 text-ink-400 border border-ink-200'
                      }`}>
                        {st.done ? '✓' : si + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[13px] leading-tight truncate ${
                            st.done
                              ? 'text-ink-400 line-through'
                              : isActiveAdditional
                              ? 'font-semibold text-ink-900'
                              : 'text-ink-700'
                          }`}>
                            {st.s}
                          </p>
                          {st.actions && st.actions.length > 0 && (
                            <span className="flex gap-0.5 shrink-0">
                              {st.actions.map(a => (
                                <span
                                  key={a.id}
                                  className={`w-1.5 h-1.5 rounded-full ${a.done ? 'bg-mist-500' : 'bg-ink-200'}`}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                        {st.t && <p className="text-[10px] text-ink-400 mt-0.5">{st.t}</p>}
                        {st.w && <p className="text-[10px] text-accent-500 mt-0.5 truncate">⚠ {st.w}</p>}
                        {st.done && st.doneDate && <p className="text-[10px] text-sage-500 mt-0.5">Completed {st.doneDate}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
