import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { APPR_LABELS } from '@/store/useIssuesStore';

interface StepListProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  activeStep: number;
  onSelectStep: (index: number) => void;
}

/**
 * Clickable step navigation in the left sidebar.
 * Shows approach label + done/total count header, then each step as a button.
 * Active step gets ink-50 bg + accent-500 left border.
 * Done steps show green checkmark badge, pending steps show numbered badge.
 */
export function StepList({ c, steps, activeStep, onSelectStep }: StepListProps) {
  if (!steps || steps.length === 0) {
    return <p className="p-4 text-sm text-ink-400">No steps defined.</p>;
  }

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="px-3 pt-3 pb-1.5">
      {/* Section header */}
      <h3 className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2 ml-1">
        {APPR_LABELS[c.approach]} Steps
        <span className="font-normal normal-case tracking-normal ml-1.5">
          {doneCount}/{steps.length}
        </span>
      </h3>

      {/* Step buttons */}
      <div className="flex flex-col gap-0.5">
        {steps.map((st, i) => {
          const isActive = i === activeStep;
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
                <p className={`text-[13px] leading-tight truncate ${
                  isDone
                    ? 'text-ink-400 line-through'
                    : isActive
                    ? 'font-semibold text-ink-900'
                    : 'text-ink-700'
                }`}>
                  {st.s}
                </p>
                {st.t && <p className="text-[10px] text-ink-400 mt-0.5">{st.t}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
