/**
 * CaseStepDrawer — opens a single case step in a DrawerShell with
 * the thread rail showing all steps.  Completing the step uses
 * useUndoableAction for undo support.
 */

import { useState, useCallback, useMemo } from 'react';
import DrawerShell from '@/components/ui/DrawerShell';
import { useIssuesStore } from '@/store/useIssuesStore';
import { BOARD_ROLE_LABELS } from '@/types/auth';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import type { CaseStep } from '@/types/issues';

interface CaseStepDrawerProps {
  open: boolean;
  onClose: () => void;
  caseId: string;
  stepIndex: number;
}

/**
 * ThreadRail — left rail listing all steps with status badges.
 */
function ThreadRail({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: CaseStep[];
  activeIndex: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="py-3 px-2">
      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider px-2 mb-2">
        Steps
      </p>
      <div className="flex flex-col gap-0.5">
        {steps.map((st, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={st.id || i}
              onClick={() => onSelect(i)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                isActive
                  ? 'bg-ink-50 border-l-2 border-l-accent-500'
                  : 'hover:bg-ink-50'
              }`}
            >
              <span
                className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  st.done
                    ? 'bg-sage-500 text-white'
                    : isActive
                    ? 'bg-accent-50 text-accent-600 border border-accent-200'
                    : 'bg-ink-50 text-ink-400 border border-ink-200'
                }`}
              >
                {st.done ? '\u2713' : i + 1}
              </span>
              <span
                className={`text-[11px] leading-tight line-clamp-2 ${
                  st.done
                    ? 'text-ink-400 line-through'
                    : isActive
                    ? 'font-medium text-ink-800'
                    : 'text-ink-600'
                }`}
              >
                {st.s}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CompactStepContent — simplified step body for the drawer.
 */
function CompactStepContent({ step }: { step: CaseStep }) {
  return (
    <div className="space-y-4">
      {/* Step title */}
      <p className="text-sm font-medium text-ink-900 leading-relaxed">{step.s}</p>

      {/* Timeline & reference */}
      <div className="flex flex-wrap gap-3">
        {step.t && (
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">
                Timeline
              </div>
              <div className="text-xs text-ink-700 font-medium">{step.t}</div>
            </div>
          </div>
        )}
        {step.d && (
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">
                Reference
              </div>
              <div className="text-xs text-ink-700 font-medium">{step.d}</div>
            </div>
          </div>
        )}
      </div>

      {/* Guidance */}
      {step.detail && (
        <div className="bg-mist-50 border border-mist-100 rounded-lg p-3">
          <div className="text-[10px] font-bold text-mist-500 uppercase tracking-wide mb-1">
            Guidance
          </div>
          <p className="text-[13px] text-ink-700 leading-relaxed">{step.detail}</p>
        </div>
      )}

      {/* Warning */}
      {step.w && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
          <div className="text-[10px] font-bold text-accent-500 uppercase tracking-wide mb-1">
            When
          </div>
          <p className="text-[13px] text-accent-600 leading-relaxed">{step.w}</p>
        </div>
      )}

      {/* Checklist */}
      {step.checks && step.checks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
            Checklist ({step.checks.filter(ck => ck.checked).length}/{step.checks.length})
          </p>
          {step.checks.map(ck => (
            <div
              key={ck.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                ck.checked
                  ? 'bg-sage-50 border-sage-200 text-ink-400 line-through'
                  : 'bg-white border-ink-100 text-ink-700'
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                  ck.checked ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-300'
                }`}
              >
                {ck.checked ? '\u2713' : ''}
              </span>
              {ck.label}
            </div>
          ))}
        </div>
      )}

      {/* User notes */}
      {step.userNotes && (
        <div className="bg-sand-100 rounded-lg p-3">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide mb-1">
            Note
          </p>
          <p className="text-[13px] text-ink-700 leading-relaxed">{step.userNotes}</p>
        </div>
      )}

      {/* Done info */}
      {step.done && step.doneDate && (
        <div className="flex items-center gap-2 text-xs text-sage-600">
          <span className="w-5 h-5 rounded-full bg-sage-500 text-white flex items-center justify-center text-[10px] font-bold">
            {'\u2713'}
          </span>
          Completed on {step.doneDate}
        </div>
      )}
    </div>
  );
}

export default function CaseStepDrawer({
  open,
  onClose,
  caseId,
  stepIndex: initialStepIndex,
}: CaseStepDrawerProps) {
  const caseData = useIssuesStore(s => s.cases.find(c => c.id === caseId));
  const toggleStep = useIssuesStore(s => s.toggleStep);
  const { run: runUndo } = useUndoableAction();
  const [activeStep, setActiveStep] = useState(initialStepIndex);

  const steps = caseData?.steps ?? [];
  const step = steps[activeStep];

  const roleLabel = useMemo(() => {
    if (!caseData?.assignedRole) return '';
    const key = caseData.assignedRole.toLowerCase().replace(/\s+/g, '_');
    return BOARD_ROLE_LABELS[key as keyof typeof BOARD_ROLE_LABELS] ?? caseData.assignedRole;
  }, [caseData?.assignedRole]);

  const handleComplete = useCallback(() => {
    if (!caseData || !step || step.done) return;

    // Optimistically toggle
    toggleStep(caseId, activeStep);

    runUndo({
      label: `Marked step ${activeStep + 1} complete`,
      undo: () => toggleStep(caseId, activeStep),
      commit: () => {
        // Already persisted by toggleStep
      },
    });
  }, [caseId, activeStep, caseData, step, toggleStep, runUndo]);

  if (!caseData || !step) return null;

  const breadcrumb = [
    'Case',
    caseData.title,
    `Step ${activeStep + 1} of ${steps.length}`,
    ...(roleLabel ? [roleLabel] : []),
  ];

  const rail = (
    <ThreadRail
      steps={steps}
      activeIndex={activeStep}
      onSelect={setActiveStep}
    />
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      breadcrumb={breadcrumb}
      title={step.s}
      legalRef={step.d ?? undefined}
      step={{ current: activeStep + 1, total: steps.length }}
      rail={rail}
      footer={{
        primaryLabel: step.done ? 'Completed' : 'Mark Complete',
        onPrimary: handleComplete,
        primaryDisabled: step.done,
        secondaryLabel: 'Open full case',
        onSecondary: onClose,
      }}
    >
      <CompactStepContent step={step} />
    </DrawerShell>
  );
}
