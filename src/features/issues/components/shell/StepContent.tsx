import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { Step1BudgetReview } from './Step1BudgetReview';
import { Step3ThreeYearOutlook } from './Step3ThreeYearOutlook';
import { StepActionList } from '../workflow/StepActionList';
import { deriveActionsForStep } from '../workflow/stepActionMap';
import { isGenerateOrUploadItem, isLegalDocItem, isInsuranceDocItem, getCleanLabel, getReportMapping, aggregateCheckAttachments } from '../workflow/checkItemReportMap';
import { ReserveStudyPanel } from '../workflow/ReserveStudyPanel';
import { ContractRenewalPanel } from '../workflow/ContractRenewalPanel';
import { BudgetDraftPanel } from '../workflow/BudgetDraftPanel';
import { BylawsReviewPanel } from '../workflow/BylawsReviewPanel';

interface StepContentProps {
  c: CaseTrackerCase;
  step: CaseStep;
  stepIndex: number;
  stNote: string;
  stateAbbr: string;
  onToggleStep: (idx: number) => void;
  onAddNote: (idx: number) => void;
  onToggleAction?: (actionId: string) => void;
  onToggleCheck?: (checkId: string) => void;
  onAction?: (action: StepAction, stepIdx: number) => void;
  onNavigate?: (target: string) => void;
  onUpload?: () => void;
  onGenerateCheckDoc?: (checkId: string, reportType: string) => void;
  onUploadCheckDoc?: (checkId: string) => void;
  onAttachFromBuilding?: (checkId: string, source: 'legal' | 'insurance') => void;
  inlineStepIdx?: number | null;
  caseId?: string;
}

/**
 * Main right-column content area for one step at a time.
 * Shows jurisdiction guidance (step 0 only), step card with toggle/metadata/guidance/warning/notes,
 * and a centered navigation hint at the bottom.
 */
export function StepContent({ c, step, stepIndex, stNote, stateAbbr, onToggleStep, onAddNote, onToggleAction, onToggleCheck, onAction, onNavigate, onUpload, onGenerateCheckDoc, onUploadCheckDoc, onAttachFromBuilding, inlineStepIdx, caseId }: StepContentProps) {
  const totalSteps = c.steps?.length || 0;
  const allDone = c.steps?.every(s => s.done) || false;

  // Annual-budgeting step 1 enrichment
  if (c.catId === 'financial' && c.sitId === 'annual-budgeting' && stepIndex === 0 && onToggleAction) {
    return <Step1BudgetReview c={c} step={step} onToggleAction={onToggleAction} />;
  }

  // Annual-budgeting step 3 enrichment
  if (c.catId === 'financial' && c.sitId === 'annual-budgeting' && stepIndex === 2 && onToggleAction) {
    return <Step3ThreeYearOutlook c={c} step={step} onToggleAction={onToggleAction} />;
  }

  return (
    <div className="p-5 md:px-7 md:py-6">
      <div className="space-y-5">
        {/* Jurisdiction guidance — only on step 0 */}
        {stNote && stepIndex === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <span>📍</span>
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  {stateAbbr} Jurisdiction Guidance
                </p>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">{stNote}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step card */}
        <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
          {/* Action bar */}
          <div className={`flex items-center justify-between px-5 py-3 border-b border-ink-100 ${
            step.done ? 'bg-sage-50' : 'bg-ink-50'
          }`}>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onToggleStep(stepIndex)}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                  step.done
                    ? 'bg-sage-500 border-sage-500 text-white'
                    : 'border-ink-200 text-ink-300 hover:border-accent-400'
                }`}
              >
                {step.done ? '✓' : stepIndex + 1}
              </button>
              <span className={`text-[13px] font-semibold ${step.done ? 'text-sage-500' : 'text-ink-900'}`}>
                {step.done ? 'Completed' : 'Mark Complete'}
              </span>
              {step.doneDate && (
                <span className="text-[11px] text-ink-400 ml-1">on {step.doneDate}</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-ink-900 mb-3.5 leading-relaxed">{step.s}</p>

            {/* Metadata chips */}
            <div className="flex flex-wrap gap-3 mb-4">
              {step.t && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px]">⏱</span>
                  <div>
                    <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">Timeline</div>
                    <div className="text-xs text-ink-700 font-medium">{step.t}</div>
                  </div>
                </div>
              )}
              {step.d && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px]">📋</span>
                  <div>
                    <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">Reference</div>
                    <div className="text-xs text-ink-700 font-medium">{step.d}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Guidance block */}
            {step.detail && (
              <div className="bg-mist-50 border border-mist-100 rounded-lg p-3 mb-3">
                <div className="text-[10px] font-bold text-mist-500 uppercase tracking-wide mb-1">Guidance</div>
                <p className="text-[13px] text-ink-700 leading-relaxed">{step.detail}</p>
              </div>
            )}

            {/* Warning block */}
            {step.w && (
              <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
                <div className="text-[10px] font-bold text-accent-500 uppercase tracking-wide mb-1">⚠ When</div>
                <p className="text-[13px] text-accent-600 leading-relaxed">{step.w}</p>
              </div>
            )}
          </div>

          {/* Actions, Checks & Rich Actions */}
          {(() => {
            const hasActions = step.actions && step.actions.length > 0;
            const hasChecks = step.checks && step.checks.length > 0;
            const hasPersistent = step.persistent && step.persistent.length > 0;
            const richActions = deriveActionsForStep(step);
            const hasRichActions = richActions.length > 0;
            const hasInteractiveContent = hasActions || hasChecks || hasPersistent || hasRichActions;

            if (!hasInteractiveContent) return null;

            const actionsDone = hasActions ? step.actions!.filter(a => a.done).length : 0;
            const actionsTotal = hasActions ? step.actions!.length : 0;
            const actionsPct = actionsTotal > 0 ? Math.round((actionsDone / actionsTotal) * 100) : 0;
            const checksDone = hasChecks ? step.checks!.filter(ck => ck.checked).length : 0;
            const checksTotal = hasChecks ? step.checks!.length : 0;
            const checksPct = checksTotal > 0 ? Math.round((checksDone / checksTotal) * 100) : 0;

            const richActionButtons = hasRichActions && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">Quick Actions</p>
                <div className="flex flex-wrap gap-2">
                  {richActions.map(ra => (
                    <button
                      key={ra.id}
                      onClick={() => onAction?.({ type: ra.type, target: ra.target, label: ra.label }, stepIndex)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        ra.primary
                          ? 'bg-accent-600 text-white hover:bg-accent-700'
                          : 'bg-white border border-ink-200 text-ink-700 hover:bg-mist-50 hover:border-ink-300'
                      }`}
                    >
                      <span>{ra.icon}</span>
                      <span>{ra.label}</span>
                      {ra.destination && (
                        <span className="text-[10px] opacity-70">→ {ra.destination}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );

            return (
              <div className="border-t border-ink-100 px-5 py-4 space-y-4">
                {/* Actions container with progress sidebar */}
                {hasActions && onToggleAction && (
                  <div className="grid grid-cols-3 gap-5">
                    <div className="col-span-2">
                      <StepActionList
                        actions={step.actions!}
                        persistent={step.persistent}
                        onToggleAction={onToggleAction}
                        onNavigate={onNavigate}
                        onUpload={onUpload}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Progress</p>
                      <div className="bg-ink-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-ink-600">{actionsDone}/{actionsTotal}</span>
                          <span className="text-[10px] text-ink-400">{actionsPct}%</span>
                        </div>
                        <div className="w-full bg-ink-200 rounded-full h-2">
                          <div
                            className="bg-sage-500 h-2 rounded-full transition-all"
                            style={{ width: `${actionsPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Checklist — each item as its own action container */}
                {hasChecks && onToggleCheck && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">
                      Checklist ({checksDone}/{checksTotal} complete)
                    </p>
                    {step.checks!.map(ck => {
                      const isGenUpload = isGenerateOrUploadItem(ck.label);
                      const isLegal = isLegalDocItem(ck.label);
                      const isInsurance = isInsuranceDocItem(ck.label);
                      const isDocItem = isGenUpload || isLegal || isInsurance;
                      const cleanLabel = isDocItem ? getCleanLabel(ck.label) : ck.label;
                      const reportType = isGenUpload ? getReportMapping(ck.label) : null;

                      return (
                        <div
                          key={ck.id}
                          className={`bg-white rounded-lg border overflow-hidden transition-all ${
                            ck.checked ? 'border-sage-200' : 'border-ink-100'
                          }`}
                        >
                          <div className={`flex items-center gap-3 px-4 py-3 ${
                            ck.checked ? 'bg-sage-50' : 'bg-white'
                          }`}>
                            <button
                              onClick={() => onToggleCheck(ck.id)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                ck.checked ? 'bg-sage-500 border-sage-500' : 'border-ink-300 hover:border-accent-400'
                              }`}
                            >
                              {ck.checked && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm leading-tight ${
                                ck.checked ? 'text-ink-400 line-through' : 'text-ink-700'
                              }`}>
                                {cleanLabel}
                              </span>
                              {isDocItem && (
                                <div className="mt-1">
                                  {ck.attachment ? (
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                                      ck.attachment.source === 'generated'
                                        ? 'bg-accent-50 text-accent-700 border border-accent-200'
                                        : 'bg-sage-50 text-sage-700 border border-sage-200'
                                    }`}>
                                      {ck.attachment.source === 'generated' ? '⚙' : '📎'} {ck.attachment.name}
                                    </span>
                                  ) : (isLegal || isInsurance) ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onAttachFromBuilding?.(ck.id, isLegal ? 'legal' : 'insurance'); }}
                                      className="text-[11px] font-medium text-sage-700 hover:text-sage-800 bg-sage-50 border border-sage-200 rounded-lg px-2 py-0.5 hover:bg-sage-100 transition-colors"
                                    >
                                      Attach from {isLegal ? 'Legal & Bylaws' : 'Insurance'}
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {reportType && onGenerateCheckDoc && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onGenerateCheckDoc(ck.id, reportType); }}
                                          className="text-[11px] font-medium text-accent-600 hover:text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-2 py-0.5 hover:bg-accent-100 transition-colors"
                                        >
                                          Generate
                                        </button>
                                      )}
                                      {onUploadCheckDoc && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onUploadCheckDoc(ck.id); }}
                                          className="text-[11px] font-medium text-ink-500 hover:text-ink-600 border border-dashed border-ink-300 rounded-lg px-2 py-0.5 hover:bg-ink-50 transition-colors"
                                        >
                                          Upload
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {ck.checked && ck.checkedDate && (
                              <span className="text-[10px] text-sage-500 shrink-0">{ck.checkedDate}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Persistent buttons when no actions */}
                {!hasActions && hasPersistent && (
                  <div className="flex flex-wrap gap-2">
                    {step.persistent!.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (p.type === 'link' && p.target && onNavigate) onNavigate(p.target);
                          else if (p.type === 'upload' && onUpload) onUpload();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-mist-50 hover:border-ink-300 transition-colors"
                      >
                        {p.type === 'link' ? '↗' : '📎'} {p.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Rich action buttons */}
                {richActionButtons}

                {/* Inline panels */}
                {inlineStepIdx === stepIndex && step.action?.type === 'inline' && (
                  step.action.target === 'reserve-study' ? <ReserveStudyPanel /> :
                  step.action.target === 'contract-renewals' ? <ContractRenewalPanel /> :
                  step.action.target === 'budget-drafter' && caseId ? <BudgetDraftPanel caseId={caseId} stepIdx={stepIndex} step={step} /> :
                  step.action.target === 'bylaws-review' && caseId ? <BylawsReviewPanel caseId={caseId} step={step} /> :
                  null
                )}
              </div>
            );
          })()}

          {/* User notes */}
          {step.userNotes && (
            <div className="border-t border-ink-100 px-5 py-3 bg-sand-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">📝 Note</span>
                <button
                  onClick={() => onAddNote(stepIndex)}
                  className="text-xs text-ink-400 hover:text-ink-600 px-2 py-0.5 rounded hover:bg-ink-50"
                >
                  Edit
                </button>
              </div>
              <p className="text-[13px] text-ink-700 leading-relaxed">{step.userNotes}</p>
            </div>
          )}

          {/* Add note button when no notes */}
          {!step.userNotes && (
            <div className="border-t border-ink-100 px-5 py-2">
              <button
                onClick={() => onAddNote(stepIndex)}
                className="text-xs text-ink-400 hover:text-ink-600 px-2 py-1 rounded hover:bg-ink-50"
              >
                + Note
              </button>
            </div>
          )}
        </div>

        {/* Document aggregation for resale-certs delivery step (step 10, index 9) */}
        {c.sitId === 'resale-certs' && stepIndex === 9 && c.steps && (() => {
          const aggregated = aggregateCheckAttachments(c.steps, 2, 7);
          const attached = aggregated.filter(d => d.attachment);
          const missing = aggregated.filter(d => !d.attachment);
          if (aggregated.length === 0) return null;
          return (
            <div className="bg-white rounded-xl border border-ink-100 overflow-hidden mt-4">
              <div className="px-5 py-3 border-b border-ink-100 bg-mist-50">
                <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">Resale Package Documents</p>
                <p className="text-[11px] text-ink-500 mt-0.5">{attached.length}/{aggregated.length} documents attached</p>
              </div>
              <div className="px-5 py-3 space-y-2">
                {attached.map(d => (
                  <div key={d.checkId} className="flex items-center gap-2 p-2 bg-sage-50 border border-sage-100 rounded-lg">
                    <span className="text-sage-600 text-sm">{d.attachment!.source === 'generated' ? '⚙' : '📎'}</span>
                    <span className="text-sm text-ink-700 flex-1 truncate">{d.checkLabel}</span>
                    <span className="text-[10px] text-sage-600 font-medium">{d.attachment!.name}</span>
                  </div>
                ))}
                {missing.map(d => (
                  <div key={d.checkId} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                    <span className="text-amber-500 text-sm">⚠</span>
                    <span className="text-sm text-ink-600 flex-1 truncate">{d.checkLabel}</span>
                    <span className="text-[10px] text-amber-600 font-medium">Missing</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Navigation hint */}
        <div className="flex justify-center mt-5">
          <p className="text-[11px] text-ink-400">
            {stepIndex < totalSteps - 1
              ? `↓ Click step ${stepIndex + 2} in the sidebar to continue`
              : allDone
              ? '✓ All steps complete — close the case via the ⋮ menu'
              : 'Complete remaining steps to finish this workflow'}
          </p>
        </div>
      </div>
    </div>
  );
}
