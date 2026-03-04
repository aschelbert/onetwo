import type { CaseStep } from '@/types/issues';

interface StepHeaderProps {
  step: CaseStep;
  index: number;
  totalSteps: number;
  phaseName?: string;
  phaseColor?: string;
  overallProgress: { done: number; total: number };
}

export function StepHeader({ step, index, totalSteps, phaseName, phaseColor, overallProgress }: StepHeaderProps) {
  const pct = overallProgress.total > 0 ? Math.round((overallProgress.done / overallProgress.total) * 100) : 0;

  const status = step.done ? 'Complete' : (index === 0 || step.checks?.some(ck => ck.checked) || step.actions?.some(a => a.done))
    ? 'In Progress'
    : 'Pending';

  const statusColor = status === 'Complete'
    ? 'bg-sage-100 text-sage-700'
    : status === 'In Progress'
    ? 'bg-accent-100 text-accent-700'
    : 'bg-ink-100 text-ink-500';

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-ink-100 px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Step number pill */}
        <span className="text-[10px] font-bold text-ink-400 bg-ink-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
          Step {index + 1} of {totalSteps}
        </span>

        {/* Phase badge */}
        {phaseName && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phaseColor || '#929daa' }} />
            {phaseName}
          </span>
        )}

        {/* Status badge */}
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider ${statusColor}`}>
          {status}
        </span>

        {/* Timing badge */}
        {step.t && (
          <span className="text-[10px] text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">
            ⏱ {step.t}
          </span>
        )}
      </div>

      {/* Step title */}
      <h2 className="text-lg font-semibold text-ink-900 mt-2">{step.s}</h2>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold text-ink-400 shrink-0">
          {overallProgress.done}/{overallProgress.total}
        </span>
      </div>
    </div>
  );
}
