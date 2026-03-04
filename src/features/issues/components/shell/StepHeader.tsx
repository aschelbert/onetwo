import type { CaseStep } from '@/types/issues';

interface ShellStepHeaderProps {
  step: CaseStep;
  stepNumber: number;
  caseSitId?: string;
}

/**
 * Sticky header at top of right column in the two-column shell layout.
 * Shows "STEP N" label in accent-500, step title in font-display,
 * small progress bar (sage if done, accent if pending), and status text.
 * For steps with actions: shows segmented progress bar + count badge.
 */
export function ShellStepHeader({ step, stepNumber, caseSitId }: ShellStepHeaderProps) {
  const hasActions = step.actions && step.actions.length > 0;
  const actionsDone = hasActions ? step.actions!.filter(a => a.done).length : 0;
  const actionsTotal = hasActions ? step.actions!.length : 0;

  return (
    <div className="px-7 py-3.5 border-b border-ink-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-accent-500 uppercase tracking-wider">
              Step {stepNumber}
            </span>
            <h2 className="font-display text-base font-bold text-ink-900 truncate">{step.s}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {hasActions ? (
              <>
                {/* Segmented progress bar for action-based steps */}
                <div className="flex gap-0.5 w-24">
                  {step.actions!.map(a => (
                    <div key={a.id} className="flex-1 h-1.5 rounded-full bg-ink-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${a.done ? 'bg-sage-500' : ''}`}
                        style={{ width: a.done ? '100%' : '0%' }}
                      />
                    </div>
                  ))}
                </div>
                <span className={`text-[11px] font-bold ${step.done ? 'text-sage-500' : 'text-ink-400'}`}>
                  {step.done ? '✓ Complete' : `${actionsDone}/${actionsTotal}`}
                </span>
              </>
            ) : (
              <>
                {/* Mini progress bar */}
                <div className="w-24 h-1 bg-ink-200 rounded-full">
                  <div
                    className={`h-1 rounded-full transition-all duration-500 ${
                      step.done ? 'bg-sage-500' : 'bg-accent-500'
                    }`}
                    style={{ width: step.done ? '100%' : '0%' }}
                  />
                </div>
                <span className={`text-[11px] font-bold ${step.done ? 'text-sage-500' : 'text-ink-400'}`}>
                  {step.done ? '✓ Complete' : 'Pending'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
