import { useState, useEffect } from 'react';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useNavigate } from 'react-router-dom';

export default function ActiveCaseWidget() {
  const ctx = useIssuesStore(s => s.activeCaseContext);
  const update = useIssuesStore(s => s.setActiveCaseContext);
  const clear = useIssuesStore(s => s.clearActiveCaseContext);
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (ctx) {
      setMounted(false);
      const timer = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(timer);
    }
  }, [ctx?.caseId]);

  if (!ctx) return null;

  const minimized = ctx.minimized ?? false;
  const phaseColor = ctx.phaseColor || '#e53e3e';

  const handleReturn = () => {
    navigate(ctx.returnPath);
    clear();
  };

  const handleMinimize = () => {
    update({ ...ctx, minimized: true });
  };

  const handleExpand = () => {
    update({ ...ctx, minimized: false });
  };

  // ── Minimized state ──────────────────────────────────
  if (minimized) {
    return (
      <button
        onClick={handleExpand}
        className="fixed bottom-24 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
        style={{
          background: `linear-gradient(135deg, #1a1f25 0%, #6b1a1a 100%)`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25), 0 0 0 3px rgba(229,62,62,0.15)',
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
          opacity: mounted ? 1 : 0,
        }}
        title={`Return to Case ${ctx.caseId} · Step ${ctx.stepIdx + 1}`}
        aria-label={`Return to case ${ctx.caseId}, Step ${ctx.stepIdx + 1}: ${ctx.stepTitle}`}
        role="complementary"
      >
        <span className="text-xl">📋</span>
        {/* Red notification dot */}
        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
      </button>
    );
  }

  // ── Full pill state ──────────────────────────────────
  return (
    <div
      className="fixed bottom-24 right-6 z-50 w-[340px] bg-white rounded-2xl overflow-hidden transition-all duration-300 group"
      style={{
        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        transform: mounted ? 'translateY(0)' : 'translateY(40px)',
        opacity: mounted ? 1 : 0,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      role="complementary"
      aria-label={`Active workflow: Case ${ctx.caseId}, Step ${ctx.stepIdx + 1}: ${ctx.stepTitle}. Press Enter to return to case.`}
    >
      {/* Top accent bar */}
      <div
        className="h-[3px]"
        style={{ background: `linear-gradient(90deg, ${phaseColor}, #e53e3e)` }}
      />

      {/* Header */}
      <div className="px-3.5 pt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
            Active Workflow
          </span>
          {ctx.phaseLabel && (
            <span
              className="text-[10px] font-semibold rounded px-1.5 py-px"
              style={{ color: phaseColor, background: `${phaseColor}11` }}
            >
              {ctx.phaseLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); handleMinimize(); }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:bg-ink-50 hover:text-ink-600 transition-colors text-sm"
            title="Minimize"
          >
            ‒
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors text-xs"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Case + Step info */}
      <div className="px-3.5 pt-2 pb-3">
        {/* Case title row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold text-white bg-ink-900 rounded px-1.5 py-0.5 shrink-0 uppercase">
            {ctx.caseId}
          </span>
          <span className="text-xs font-medium text-ink-500 truncate">
            {ctx.caseTitle}
          </span>
        </div>

        {/* Current step card */}
        <div className="bg-ink-50 border border-ink-100 rounded-[10px] p-2.5 flex items-start gap-2.5">
          {/* Step number circle */}
          <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">{ctx.stepIdx + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink-900 leading-tight">
              {ctx.stepTitle}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {ctx.stepTiming && (
                <>
                  <span className="text-[10px] text-ink-400 font-medium">
                    ⏱ {ctx.stepTiming}
                  </span>
                  <span className="text-ink-200">·</span>
                </>
              )}
              {ctx.stepProgress && (
                <span className="text-[10px] font-semibold text-red-500">
                  {ctx.stepProgress.done}/{ctx.stepProgress.total} tasks
                </span>
              )}
              {!ctx.stepProgress && ctx.progress && (
                <span className="text-[10px] font-semibold text-red-500">
                  {ctx.progress.done}/{ctx.progress.total} steps
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Return button */}
      <div className="px-3.5 pb-3.5">
        <button
          onClick={handleReturn}
          className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Return to Case
        </button>
      </div>
    </div>
  );
}
