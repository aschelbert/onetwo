import { useState, useRef, useCallback, type ReactNode } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { APPR_LABELS, APPR_COLORS } from '@/store/useIssuesStore';
import { CaseSidebar } from './CaseSidebar';
import { WorkflowStepCard } from './WorkflowStepCard';

interface CaseWorkflowProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  onToggleStep: (idx: number) => void;
  onAddNote: (idx: number, note: string) => void;
  onAction: (action: StepAction, idx: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEditAssignment: () => void;
  children?: ReactNode;
}

export function CaseWorkflow({
  c, steps, onToggleStep, onAddNote, onAction,
  onClose, onReopen, onEditAssignment, children,
}: CaseWorkflowProps) {
  // Find first incomplete step
  const activeStepIdx = steps.findIndex(s => !s.done);
  const [expandedStep, setExpandedStep] = useState<number>(activeStepIdx >= 0 ? activeStepIdx : 0);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const scrollToStep = useCallback((idx: number) => {
    setExpandedStep(idx);
    setTimeout(() => {
      stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const handleContinue = useCallback((currentIdx: number) => {
    // Find next uncompleted step
    const nextIdx = steps.findIndex((s, i) => i > currentIdx && !s.done);
    if (nextIdx >= 0) {
      scrollToStep(nextIdx);
    } else if (currentIdx < steps.length - 1) {
      scrollToStep(currentIdx + 1);
    }
  }, [steps, scrollToStep]);

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar — case summary, step rail, and supporting sections */}
      <CaseSidebar
        c={c}
        steps={steps}
        activeStepIdx={activeStepIdx >= 0 ? activeStepIdx : 0}
        expandedStep={expandedStep}
        onStepClick={scrollToStep}
        onClose={onClose}
        onReopen={onReopen}
        onEditAssignment={onEditAssignment}
        additionalApproaches={c.additionalApproaches}
      >
        {children}
      </CaseSidebar>

      {/* Main content — workflow steps */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Step cards accordion */}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <WorkflowStepCard
              key={step.id}
              ref={(el) => { stepRefs.current[i] = el; }}
              step={step}
              index={i}
              isActive={i === activeStepIdx}
              isExpanded={expandedStep === i}
              onToggleExpand={() => setExpandedStep(expandedStep === i ? -1 : i)}
              onToggleDone={() => onToggleStep(i)}
              onNote={(note) => onAddNote(i, note)}
              onAction={onAction}
              onContinue={() => handleContinue(i)}
              totalSteps={steps.length}
            />
          ))}
        </div>

        {/* Additional approaches */}
        {c.additionalApproaches?.map((aa, ai) => (
          <div key={ai} className="bg-white rounded-xl border border-ink-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${APPR_COLORS[aa.approach]}`}>{APPR_LABELS[aa.approach]}</span>
              <h3 className="text-lg font-semibold text-ink-800">Steps</h3>
              <span className="text-ink-400 text-sm">({aa.steps.filter(s => s.done).length}/{aa.steps.length} complete · added {aa.addedDate})</span>
            </div>
            <div className="space-y-3">
              {aa.steps.map((st, si) => (
                <div key={si} className="flex items-start gap-3">
                  <button onClick={() => onAction({ type: 'navigate', target: `additional:${ai}:${si}`, label: 'toggle' }, si)} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all text-sm font-bold ${st.done ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 text-ink-300 hover:border-accent-400'}`}>
                    {st.done ? '✓' : si + 1}
                  </button>
                  <div className="flex-1">
                    <p className={`text-sm ${st.done ? 'text-ink-400 line-through' : 'text-ink-800 font-medium'}`}>{st.s}</p>
                    {st.w && <span className="text-[11px] text-rose-500">⚠ {st.w}</span>}
                    {st.done && st.doneDate && <span className="text-[10px] text-sage-500 block">Completed {st.doneDate}</span>}
                    {st.userNotes && <p className="text-xs text-ink-400 mt-1 bg-sand-100 rounded p-2">📝 {st.userNotes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
