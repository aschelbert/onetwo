import type { CaseStep } from '@/types/issues';

interface ShellStepHeaderProps {
  step: CaseStep;
  stepNumber: number;
}

/**
 * Sticky header at top of right column in the two-column shell layout.
 * Shows "STEP N" label in accent-500, step title in font-display,
 * small progress bar (sage if done, accent if pending), and status text.
 */
export function ShellStepHeader({ step, stepNumber }: ShellStepHeaderProps) {
  return (
    <div className="px-7 py-3.5 border-b border-ink-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-accent-500 uppercase tracking-wider">
              Step {stepNumber}
            </span>
            <h2 className="font-display text-base font-bold text-ink-900">{step.s}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
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
          </div>
        </div>
      </div>
    </div>
  );
}
