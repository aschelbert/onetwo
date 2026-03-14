import { useState, useCallback, type ReactNode } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { APPR_LABELS, APPR_COLORS, SITUATION_PHASES, PHASE_COLORS } from '@/store/useIssuesStore';
import { CaseSidebar } from './CaseSidebar';
import { WorkflowStepCard } from './WorkflowStepCard';
import { StepHeader } from './StepHeader';

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
  onGenerateCheckDoc?: (caseId: string, stepIdx: number, checkId: string, reportType: string) => void;
  onUploadCheckDoc?: (caseId: string, stepIdx: number, checkId: string) => void;
  children?: ReactNode;
}

export function CaseWorkflow({
  c, steps, onToggleStep, onAddNote, onAction,
  onClose, onReopen, onEditAssignment, onAddApproach, onDelete,
  onToggleCheck, onToggleAction, onCompleteAllChecks, onPutOnHold, onResume,
  onOpenBidModal, onNavigate, onUpload, onGenerateCheckDoc, onUploadCheckDoc, children,
}: CaseWorkflowProps) {
  // Find first incomplete step
  const firstIncomplete = steps.findIndex(s => !s.done);
  const activeStepIdx = firstIncomplete >= 0 ? firstIncomplete : 0;
  const [activeStep, setActiveStep] = useState(activeStepIdx);

  const handleStepSelect = useCallback((idx: number) => {
    setActiveStep(idx);
  }, []);

  const handleContinue = useCallback((currentIdx: number) => {
    // Find next uncompleted step
    const nextIdx = steps.findIndex((s, i) => i > currentIdx && !s.done);
    if (nextIdx >= 0) {
      setActiveStep(nextIdx);
    } else if (currentIdx < steps.length - 1) {
      setActiveStep(currentIdx + 1);
    }
  }, [steps]);

  // Bounds safety
  const safeIdx = Math.min(activeStep, steps.length - 1);
  const currentStep = steps[Math.max(0, safeIdx)];

  // Phase info for StepHeader
  const phases = SITUATION_PHASES[c.sitId] || [];
  const currentPhase = currentStep.phaseId
    ? phases.find(p => p.id === currentStep.phaseId)
    : undefined;
  const currentPhaseIndex = currentPhase
    ? phases.findIndex(p => p.id === currentPhase.id)
    : -1;

  // Overall progress (reuse same logic as sidebar)
  const overallProgress = (() => {
    let done = 0, total = 0;
    for (const step of steps) {
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
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
      {/* Sidebar — case summary, step rail, and supporting sections */}
      <CaseSidebar
        c={c}
        steps={steps}
        activeStepIdx={firstIncomplete >= 0 ? firstIncomplete : 0}
        selectedStep={safeIdx}
        onStepClick={handleStepSelect}
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

      {/* Right column — single active step */}
      <div className="min-w-0">
        <StepHeader
          step={currentStep}
          index={safeIdx}
          totalSteps={steps.length}
          phaseName={currentPhase?.label}
          phaseColor={currentPhaseIndex >= 0 ? PHASE_COLORS[currentPhaseIndex % PHASE_COLORS.length] : undefined}
          overallProgress={overallProgress}
        />

        <div className="mt-4">
          <WorkflowStepCard
            key={currentStep.id}
            caseId={c.id}
            step={currentStep}
            index={safeIdx}
            isActive={safeIdx === (firstIncomplete >= 0 ? firstIncomplete : 0)}
            isExpanded={true}
            alwaysExpanded={true}
            onToggleExpand={() => {}}
            onToggleDone={() => onToggleStep(safeIdx)}
            onNote={(note) => onAddNote(safeIdx, note)}
            onAction={onAction}
            onContinue={() => handleContinue(safeIdx)}
            totalSteps={steps.length}
            onToggleCheck={onToggleCheck ? (checkId) => onToggleCheck(c.id, safeIdx, checkId) : undefined}
            onToggleAction={onToggleAction ? (actionId) => onToggleAction(c.id, safeIdx, actionId) : undefined}
            onCompleteAllChecks={onCompleteAllChecks ? () => onCompleteAllChecks(c.id, safeIdx) : undefined}
            onCloseCase={onClose}
            onOpenBidModal={onOpenBidModal}
            onNavigate={onNavigate}
            onUpload={onUpload ? () => onUpload(c.id) : undefined}
            onGenerateCheckDoc={onGenerateCheckDoc ? (checkId, reportType) => onGenerateCheckDoc(c.id, safeIdx, checkId, reportType) : undefined}
            onUploadCheckDoc={onUploadCheckDoc ? (checkId) => onUploadCheckDoc(c.id, safeIdx, checkId) : undefined}
          />
        </div>

        {/* Additional approaches */}
        {c.additionalApproaches?.map((aa, ai) => (
          <div key={ai} className="bg-white rounded-xl border border-ink-100 p-5 mt-4">
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
