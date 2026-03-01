import { useIssuesStore } from '@/store/useIssuesStore';
import { useNavigate } from 'react-router-dom';

export default function ActiveCaseWidget() {
  const ctx = useIssuesStore(s => s.activeCaseContext);
  const clear = useIssuesStore(s => s.clearActiveCaseContext);
  const navigate = useNavigate();

  if (!ctx) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 bg-white border border-ink-200 rounded-xl shadow-lg shadow-ink-200/30 p-4 max-w-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-accent-600 uppercase tracking-widest mb-0.5">Active Case</p>
          <p className="text-sm font-semibold text-ink-900 truncate">{ctx.caseTitle}</p>
          <p className="text-xs text-ink-500 truncate mt-0.5">Step {ctx.stepIdx + 1}: {ctx.stepTitle}</p>
        </div>
        <button
          onClick={clear}
          className="text-ink-300 hover:text-ink-500 transition-colors shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        onClick={() => { navigate(ctx.returnPath); clear(); }}
        className="mt-3 w-full py-2 rounded-lg bg-accent-600 text-white text-xs font-semibold hover:bg-accent-700 transition-colors"
      >
        Return to Case →
      </button>
    </div>
  );
}
