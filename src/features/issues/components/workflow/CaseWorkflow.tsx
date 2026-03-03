import { useState, useRef, useCallback, type ReactNode } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { APPR_LABELS, APPR_COLORS, SITUATION_PHASES } from '@/store/useIssuesStore';
import { CaseSidebar } from './CaseSidebar';
import { WorkflowStepCard } from './WorkflowStepCard';
import { PhaseHeader } from './PhaseHeader';

interface CaseWorkflowProps {
  c: CaseTrackerCase;
  steps: CaseStep[];
  onToggleStep: (idx: number) => void;
  onAddNote: (idx: number, note: string) => void;
  onAction: (action: StepAction, idx: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEditAssignment: () => void;
  onAddApproach: () => void;
  onDelete: () => void;
  onToggleCheck?: (caseId: string, stepIdx: number, checkId: string) => void;
  onToggleAction?: (caseId: string, stepIdx: number, actionId: string) => void;
  onCompleteAllChecks?: (caseId: string, stepIdx: number) => void;
  onPutOnHold?: () => void;
  onResume?: () => void;
  onOpenBidModal?: (stepIdx: number) => void;
  onNavigate?: (target: string) => void;
  onUpload?: (caseId: string) => void;
  children?: ReactNode;
}

export function CaseWorkflow({
  c, steps, onToggleStep, onAddNote, onAction,
  onClose, onReopen, onEditAssignment, onAddApproach, onDelete,
  onToggleCheck, onToggleAction, onCompleteAllChecks, onPutOnHold, onResume,
  onOpenBidModal, onNavigate, onUpload, children,
}: CaseWorkflowProps) {
  // Find first incomplete step
  const activeStepIdx = steps.findIndex(s => !s.done);
  const [expandedSteps, setExpandedSteps] = useState<number[]>([activeStepIdx >= 0 ? activeStepIdx : 0]);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const toggleExpand = useCallback((idx: number) => {
    setExpandedSteps(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  }, []);

  const scrollToStep = useCallback((idx: number) => {
    setExpandedSteps(prev => prev.includes(idx) ? prev : [...prev, idx]);
    setTimeout(() => {
      stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const handleContinue = useCallback((currentIdx: number) => {
    // Find next uncompleted step
    const nextIdx = steps.findIndex((s, i) => i > currentIdx && !s.done);
    if (nextIdx >= 0) {
      setExpandedSteps(prev => prev.includes(nextIdx) ? prev : [...prev, nextIdx]);
      setTimeout(() => {
        stepRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } else if (currentIdx < steps.length - 1) {
      const next = currentIdx + 1;
      setExpandedSteps(prev => prev.includes(next) ? prev : [...prev, next]);
      setTimeout(() => {
        stepRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [steps]);

  // Phase grouping
  const phases = SITUATION_PHASES[c.sitId] || [];
  const hasPhases = phases.length > 0 && steps.some(s => s.phaseId);

  const stepsByPhase = hasPhases
    ? phases.map(p => ({
        ...p,
        steps: steps.map((s, i) => ({ step: s, idx: i })).filter(x => x.step.phaseId === p.id),
      }))
    : [];
  const orphanSteps = hasPhases
    ? steps.map((s, i) => ({ step: s, idx: i })).filter(x => !x.step.phaseId)
    : steps.map((s, i) => ({ step: s, idx: i }));

  const renderStepCard = (step: CaseStep, i: number) => (
    <WorkflowStepCard
      key={step.id}
      ref={(el) => { stepRefs.current[i] = el; }}
      caseId={c.id}
      step={step}
      index={i}
      isActive={i === activeStepIdx}
      isExpanded={expandedSteps.includes(i)}
      onToggleExpand={() => toggleExpand(i)}
      onToggleDone={() => onToggleStep(i)}
      onNote={(note) => onAddNote(i, note)}
      onAction={onAction}
      onContinue={() => handleContinue(i)}
      totalSteps={steps.length}
      onToggleCheck={onToggleCheck ? (checkId) => onToggleCheck(c.id, i, checkId) : undefined}
      onToggleAction={onToggleAction ? (actionId) => onToggleAction(c.id, i, actionId) : undefined}
      onCompleteAllChecks={onCompleteAllChecks ? () => onCompleteAllChecks(c.id, i) : undefined}
      onCloseCase={onClose}
      onOpenBidModal={onOpenBidModal}
      onNavigate={onNavigate}
      onUpload={onUpload ? () => onUpload(c.id) : undefined}
    />
  );

  // Calculate phase progress counts for PhaseHeader
  const getPhaseProgress = (phaseSteps: { step: CaseStep; idx: number }[]) => {
    let done = 0, total = 0;
    for (const { step } of phaseSteps) {
      if (step.actions && step.actions.length > 0) {
        done += step.actions.filter(a => a.done).length;
        total += step.actions.length;
      } else if (step.checks && step.checks.length > 0) {
        done += step.checks.filter(ck => ck.checked).length;
        total += step.checks.length;
      } else {
        done += step.done ? 1 : 0;
        total += 1;
      }
    }
    return { done, total };
  };

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar — case summary, step rail, and supporting sections */}
      <CaseSidebar
        c={c}
        steps={steps}
        activeStepIdx={activeStepIdx >= 0 ? activeStepIdx : 0}
        expandedSteps={expandedSteps}
        onStepClick={scrollToStep}
        onClose={onClose}
        onReopen={onReopen}
        onEditAssignment={onEditAssignment}
        onAddApproach={onAddApproach}
        onDelete={onDelete}
        onPutOnHold={onPutOnHold}
        onResume={onResume}
        additionalApproaches={c.additionalApproaches}
      >
        {children}
      </CaseSidebar>

      {/* Main content — workflow steps */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Step cards — grouped by phase or flat */}
        <div className="space-y-3">
          {/* Orphan steps (no phase) render first */}
          {orphanSteps.length > 0 && !hasPhases && orphanSteps.map(({ step, idx }) => renderStepCard(step, idx))}

          {/* Phase-grouped steps */}
          {hasPhases && (
            <>
              {orphanSteps.length > 0 && orphanSteps.map(({ step, idx }) => renderStepCard(step, idx))}
              {stepsByPhase.map((phase, pi) => {
                if (phase.steps.length === 0) return null;
                const progress = getPhaseProgress(phase.steps);
                return (
                  <div key={phase.id}>
                    <PhaseHeader
                      label={phase.label}
                      colorIndex={pi}
                      doneChecks={progress.done}
                      totalChecks={progress.total}
                    />
                    <div className="space-y-3">
                      {phase.steps.map(({ step, idx }) => renderStepCard(step, idx))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
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
