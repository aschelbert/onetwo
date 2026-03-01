import type { CaseCheckItem } from '@/types/issues';

interface StepChecklistProps {
  checks: CaseCheckItem[];
  onToggle: (checkId: string) => void;
}

export function StepChecklist({ checks, onToggle }: StepChecklistProps) {
  return (
    <div className="space-y-1.5">
      {checks.map(ck => (
        <label key={ck.id} className="flex items-start gap-2.5 cursor-pointer group">
          <button
            onClick={(e) => { e.preventDefault(); onToggle(ck.id); }}
            className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
              ck.checked ? 'bg-sage-500 border-sage-500' : 'border-ink-300 group-hover:border-accent-400'
            }`}
          >
            {ck.checked && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <span className={`text-sm leading-tight ${ck.checked ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
            {ck.label}
          </span>
        </label>
      ))}
    </div>
  );
}
