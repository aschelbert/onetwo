import { useState, forwardRef } from 'react';
import type { CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import type { FundingOption } from '@/store/useSpendingStore';
import { deriveActionsForStep, type RichAction } from './stepActionMap';
import { StepChecklist } from './StepChecklist';
import { StepActionList } from './StepActionList';
import { SpendingDecisionPanel } from './SpendingDecisionPanel';
import { BidComparisonPanel } from './BidComparisonPanel';
import { ConflictCheckPanel } from './ConflictCheckPanel';
import { BudgetWarning } from './BudgetWarning';
import { BudgetReviewPanel } from './BudgetReviewPanel';
import { ReserveStudyPanel } from './ReserveStudyPanel';
import { ThreeYearOutlookPanel } from './ThreeYearOutlookPanel';
import { ContractRenewalPanel } from './ContractRenewalPanel';
import { BudgetDraftPanel } from './BudgetDraftPanel';
import { BylawsReviewPanel } from './BylawsReviewPanel';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { getFinancialContext, analyzeFunding } from '@/lib/fundingAnalysis';
import { fmt } from '@/lib/formatters';

interface WorkflowStepCardProps {
  caseId: string;
  step: CaseStep;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleDone: () => void;
  onNote: (note: string) => void;
  onAction: (action: StepAction, idx: number) => void;
  onContinue?: () => void;
  totalSteps: number;
  onToggleCheck?: (checkId: string) => void;
  onToggleAction?: (actionId: string) => void;
  onCompleteAllChecks?: () => void;
  onCloseCase?: () => void;
  onOpenBidModal?: (stepIdx: number) => void;
  onNavigate?: (target: string) => void;
  onUpload?: () => void;
  alwaysExpanded?: boolean;
}

interface FundingAnalysisInlineProps {
  caseId: string;
  stepTitle: string;
  onDecisionRecorded?: (approvalId: string) => void;
}

function StrategyCard({ opt, selected, onSelect }: { opt: FundingOption; selected: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`rounded-lg border text-left transition-all ${
        selected
          ? 'bg-accent-50 border-accent-400 ring-2 ring-accent-200'
          : opt.recommended ? 'bg-sage-50 border-sage-200 hover:border-sage-300' : 'bg-white border-ink-100 hover:border-ink-200'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full p-4 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ink-900">{opt.label}</span>
          {opt.recommended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-200 text-sage-800">Recommended</span>}
          {selected && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent-200 text-accent-800">Selected</span>}
          {opt.timeline && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-mist-100 text-ink-600">{opt.timeline}</span>}
          {opt.approvalType === 'board' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">Board Only</span>}
          {opt.approvalType === 'owner' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Owner Vote</span>}
        </div>
        <p className="text-xs text-ink-500 mt-1.5">{opt.impact}</p>
        <div className="flex items-center gap-4 mt-1.5">
          {opt.perUnit > 0 && <span className="text-xs text-ink-600 font-medium">One-time: {fmt(opt.perUnit)}/unit</span>}
          {opt.monthlyPerUnit != null && opt.monthlyPerUnit > 0 && <span className="text-xs text-ink-600 font-medium">Monthly: {fmt(opt.monthlyPerUnit)}/unit</span>}
        </div>
      </button>
      {(opt.pros || opt.cons || opt.nextSteps) && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-[11px] font-medium text-accent-600 hover:text-accent-800 transition-colors"
          >
            {expanded ? 'Hide details' : 'Show pros, cons & next steps'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {opt.pros && opt.pros.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-sage-700 uppercase tracking-wider mb-0.5">Pros</p>
                  <ul className="space-y-0.5">
                    {opt.pros.map((p, i) => <li key={i} className="text-xs text-ink-600 pl-3 relative before:content-['+'] before:absolute before:left-0 before:text-sage-500 before:font-bold">{p}</li>)}
                  </ul>
                </div>
              )}
              {opt.cons && opt.cons.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-0.5">Cons</p>
                  <ul className="space-y-0.5">
                    {opt.cons.map((c, i) => <li key={i} className="text-xs text-ink-600 pl-3 relative before:content-['–'] before:absolute before:left-0 before:text-red-400 before:font-bold">{c}</li>)}
                  </ul>
                </div>
              )}
              {opt.nextSteps && opt.nextSteps.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-accent-700 uppercase tracking-wider mb-0.5">Next Steps</p>
                  <ol className="space-y-0.5">
                    {opt.nextSteps.map((n, i) => <li key={i} className="text-xs text-ink-600 pl-3">{i + 1}. {n}</li>)}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FundingAnalysisInline({ caseId, stepTitle, onDecisionRecorded }: FundingAnalysisInlineProps) {
  const financialStore = useFinancialStore();
  const spendingStore = useSpendingStore();
  const [amount, setAmount] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const parsed = parseFloat(amount);
  const ctx = getFinancialContext(financialStore);
  const analysis = parsed > 0 ? analyzeFunding(parsed, ctx) : null;

  const handleRecordDecision = () => {
    if (!analysis || !selectedStrategy) return;
    const opt = analysis.options.find(o => o.strategyId === selectedStrategy);
    if (!opt) return;
    const id = 'sa' + Date.now();
    const notesParts = [`Strategy: ${opt.label}`, `Impact: ${opt.impact}`];
    if (opt.nextSteps?.length) notesParts.push(`Next: ${opt.nextSteps.join('; ')}`);
    spendingStore.addApproval({
      title: stepTitle,
      description: `Funding strategy from workflow step: ${stepTitle}`,
      amount: parsed,
      category: 'capital',
      requestedBy: 'Board (Workflow)',
      status: parsed <= 5000 ? 'approved' : 'pending',
      priority: 'normal',
      vendorName: '',
      workOrderId: '',
      votes: [],
      threshold: 5000,
      notes: notesParts.join('. '),
      decidedAt: parsed <= 5000 ? new Date().toISOString().split('T')[0] : '',
      fundingSource: opt.source,
      caseId,
    });
    setRecorded(true);
    onDecisionRecorded?.(id);
  };

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-700 mb-1">Project / Repair Amount</label>
        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setRecorded(false); setSelectedStrategy(null); }} placeholder="Enter estimated cost..." className="w-full max-w-xs px-3 py-2 border border-ink-200 rounded-lg text-sm" />
      </div>
      {analysis && (
        <>
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-800 uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-sm text-accent-900">{analysis.recommendation}</p>
          </div>
          <div className="space-y-2">
            {analysis.options.map(opt => (
              <StrategyCard
                key={opt.strategyId || opt.source}
                opt={opt}
                selected={selectedStrategy === (opt.strategyId || opt.source)}
                onSelect={() => setSelectedStrategy(opt.strategyId || opt.source)}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-mist-200">
            <div className="text-center">
              <p className="text-[10px] text-ink-400 font-medium uppercase">Operating</p>
              <p className="text-sm font-bold text-ink-900">{fmt(ctx.operatingBalance)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-ink-400 font-medium uppercase">Budget Left</p>
              <p className={`text-sm font-bold ${ctx.budgetRemaining > 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(ctx.budgetRemaining)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-ink-400 font-medium uppercase">Reserves</p>
              <p className="text-sm font-bold text-ink-900">{fmt(ctx.reserveBalance)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-ink-400 font-medium uppercase">Reserve Health</p>
              <p className={`text-sm font-bold ${ctx.reservePctFunded >= 70 ? 'text-sage-700' : ctx.reservePctFunded >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{ctx.reservePctFunded}%</p>
            </div>
          </div>
          {selectedStrategy && !recorded && (
            <button
              onClick={handleRecordDecision}
              className="w-full py-2.5 rounded-lg bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 transition-colors"
            >
              Record Funding Strategy
            </button>
          )}
          {recorded && (
            <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-sage-600">✓</span>
              <p className="text-sm text-sage-800 font-medium">Funding strategy recorded — visible in Financial → Spending Decisions</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionCard({ action, onAction }: { action: RichAction; onAction: (a: RichAction) => void }) {
  return (
    <button
      onClick={() => onAction(action)}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all group cursor-pointer w-full ${
        action.primary
          ? 'bg-accent-600 text-white shadow-md hover:bg-accent-700 hover:shadow-lg'
          : 'bg-white border border-ink-100 hover:border-accent-300 hover:bg-accent-50 hover:shadow-sm'
      }`}
    >
      <span className="text-lg mt-0.5 shrink-0">{action.icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`font-semibold text-sm ${action.primary ? 'text-white' : 'text-ink-900'}`}>{action.label}</div>
        <div className={`text-xs mt-0.5 ${action.primary ? 'text-accent-100' : 'text-ink-400'}`}>{action.description}</div>
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {!action.isAction && (
          <span className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${action.destination ? 'bg-red-50 text-red-600 border border-red-200' : action.primary ? 'bg-white bg-opacity-20 text-white' : 'bg-accent-50 text-accent-600 border border-accent-200'}`}>
            → {action.destination ? action.destination.split('→').pop()!.trim() : action.target.split(':').pop()}
          </span>
        )}
        <svg className={`w-4 h-4 mt-0.5 opacity-40 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 ${action.primary ? 'text-white' : 'text-ink-400'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

export const WorkflowStepCard = forwardRef<HTMLDivElement, WorkflowStepCardProps>(function WorkflowStepCard(
  { caseId, step, index, isActive, isExpanded, onToggleExpand, onToggleDone, onNote, onAction, onContinue, totalSteps, onToggleCheck, onToggleAction, onCompleteAllChecks, onCloseCase, onOpenBidModal, onNavigate, onUpload, alwaysExpanded },
  ref
) {
  const [noteText, setNoteText] = useState(step.userNotes || '');
  const [editingNote, setEditingNote] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);

  const richActions = deriveActionsForStep(step);

  const handleRichAction = (action: RichAction) => {
    if (action.type === 'inline') {
      setInlineOpen(!inlineOpen);
      onAction({ type: 'inline', target: action.target, label: action.label }, index);
    } else {
      onAction({ type: action.type, target: action.target, label: action.label }, index);
    }
  };

  const handleSaveNote = () => {
    onNote(noteText);
    setEditingNote(false);
  };

  const hasChecks = step.checks && step.checks.length > 0;
  const checkedCount = hasChecks ? step.checks!.filter(ck => ck.checked).length : 0;
  const totalChecks = hasChecks ? step.checks!.length : 0;
  const hasActions = step.actions && step.actions.length > 0;
  const actionsDoneCount = hasActions ? step.actions!.filter(a => a.done).length : 0;
  const actionsTotal = hasActions ? step.actions!.length : 0;

  // Budget warning context (for spending decision steps)
  const fin = useFinancialStore();
  const budgetCtx = step.isSpendingDecision ? getFinancialContext(fin) : null;

  // Status indicator
  const StatusIndicator = () => {
    if (step.done) {
      return (
        <div className="w-8 h-8 rounded-full bg-sage-500 flex items-center justify-center shrink-0 shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }
    if (isActive) {
      return (
        <div className="w-8 h-8 rounded-full bg-accent-500 ring-4 ring-accent-100 flex items-center justify-center shrink-0 animate-pulse">
          <div className="w-2.5 h-2.5 bg-white rounded-full" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full border-2 border-ink-200 bg-white flex items-center justify-center shrink-0 text-sm font-bold text-ink-300">
        {index + 1}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={`bg-white rounded-xl border transition-all scroll-mt-24 ${
        isExpanded
          ? 'border-accent-200 shadow-lg shadow-accent-100/30'
          : step.done
          ? 'border-ink-100 opacity-80 hover:opacity-100'
          : 'border-ink-100 hover:border-ink-200'
      }`}
    >
      {/* Collapsed header — always visible */}
      {alwaysExpanded ? (
        <div className="w-full text-left px-5 py-4 flex items-center gap-4">
          <StatusIndicator />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium ${step.done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{step.s}</p>
              {isActive && <span className="text-[10px] font-bold text-white bg-accent-500 uppercase tracking-wider px-2 py-0.5 rounded-full">CURRENT</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {step.t && <span className="text-[10px] text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">⏱ {step.t}</span>}
              {step.w && <span className="text-[10px] text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded">📍 Guidance</span>}
              {hasActions && !step.done && <span className="text-[10px] font-semibold text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">{actionsDoneCount}/{actionsTotal} actions</span>}
              {hasChecks && !step.done && !hasActions && <span className="text-[10px] font-semibold text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">{checkedCount}/{totalChecks}</span>}
              {step.done && step.doneDate && <span className="text-[10px] text-sage-600">Completed {step.doneDate}</span>}
            </div>
          </div>
        </div>
      ) : (
        <button
          className="w-full text-left px-5 py-4 flex items-center gap-4"
          onClick={onToggleExpand}
        >
          <StatusIndicator />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium ${step.done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{step.s}</p>
              {isActive && <span className="text-[10px] font-bold text-white bg-accent-500 uppercase tracking-wider px-2 py-0.5 rounded-full">CURRENT</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {step.t && <span className="text-[10px] text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">⏱ {step.t}</span>}
              {step.w && <span className="text-[10px] text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded">📍 Guidance</span>}
              {hasActions && !step.done && <span className="text-[10px] font-semibold text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">{actionsDoneCount}/{actionsTotal} actions</span>}
              {hasChecks && !step.done && !hasActions && <span className="text-[10px] font-semibold text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">{checkedCount}/{totalChecks}</span>}
              {step.done && step.doneDate && <span className="text-[10px] text-sage-600">Completed {step.doneDate}</span>}
            </div>
          </div>
          <svg className={`w-5 h-5 text-ink-300 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Expanded workspace */}
      {(isExpanded || alwaysExpanded) && (
        <div className="px-5 pb-5 space-y-4">
          <div className="border-t border-ink-100 pt-4" />

          {/* Step description — prominent at top */}
          {step.desc && (
            <p className="text-sm text-ink-700 leading-relaxed">{step.desc}</p>
          )}

          {/* Detail — additional guidance (matching reference) */}
          {step.detail && (
            <div>
              <p className="text-sm text-ink-700 leading-relaxed">{step.detail}</p>
            </div>
          )}

          {/* Jurisdiction guidance banner — yellow box, below description */}
          {step.w && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
              <span className="mt-0.5">📍</span>
              <div>
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-0.5">JURISDICTION GUIDANCE</p>
                <p className="text-sm text-yellow-900">{step.w}</p>
              </div>
            </div>
          )}

          {/* Document reference badge */}
          {step.d && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink-500 bg-ink-50 border border-ink-100 rounded-lg px-3 py-1.5">📋 {step.d}</span>
            </div>
          )}

          {/* Fiduciary & fiscal panels */}
          {step.isSpendingDecision && (
            <SpendingDecisionPanel caseId={caseId} stepIdx={index} step={step} />
          )}

          {step.requiresBids && (
            <BidComparisonPanel caseId={caseId} stepIdx={index} step={step} onOpenBidModal={onOpenBidModal ? () => onOpenBidModal(index) : undefined} />
          )}

          {step.requiresConflictCheck && (
            <ConflictCheckPanel caseId={caseId} stepId={step.id} />
          )}

          {step.isSpendingDecision && budgetCtx && (
            <BudgetWarning ctx={budgetCtx} />
          )}

          {/* Two-column layout: Actions (2/3) + Completion (1/3) — matching reference */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left — Actions */}
            <div className="lg:col-span-2">
              {/* Rich sub-actions with checkboxes and report buttons */}
              {hasActions && onToggleAction && (
                <div className="mb-4">
                  <StepActionList
                    actions={step.actions!}
                    persistent={step.persistent}
                    onToggleAction={onToggleAction}
                    onNavigate={onNavigate}
                    onUpload={onUpload}
                  />
                </div>
              )}

              {richActions.length > 0 && !hasActions && (
                <>
                  <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2.5">Actions</p>
                  <div className="space-y-2">
                    {richActions.map(action => (
                      <ActionCard key={action.id} action={action} onAction={handleRichAction} />
                    ))}
                  </div>
                </>
              )}

              {/* Inline panels */}
              {inlineOpen && step.action?.type === 'inline' && (
                step.action.target === 'funding-analysis' ? <FundingAnalysisInline caseId={caseId} stepTitle={step.s} /> :
                step.action.target === 'budget-review' ? <BudgetReviewPanel /> :
                step.action.target === 'reserve-study' ? <ReserveStudyPanel /> :
                step.action.target === 'three-year-outlook' ? <ThreeYearOutlookPanel /> :
                step.action.target === 'contract-renewals' ? <ContractRenewalPanel /> :
                step.action.target === 'budget-drafter' ? <BudgetDraftPanel caseId={caseId} stepIdx={index} step={step} /> :
                step.action.target === 'bylaws-review' ? <BylawsReviewPanel caseId={caseId} step={step} /> :
                null
              )}

              {/* Step attachments */}
              {(step.stepAttachments?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">Step Documents</p>
                  <div className="space-y-1.5">
                    {step.stepAttachments!.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-mist-50 border border-mist-100 rounded-lg">
                        <span className="text-ink-400">📄</span>
                        <span className="text-sm text-ink-700 truncate">{att.name}</span>
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{att.type}</span>
                        <span className="text-xs text-ink-300 ml-auto shrink-0">{att.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right — Completion */}
            <div className="lg:col-span-1">
              <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2.5">Completion</p>
              <div className="bg-mist-50 rounded-xl p-4 border border-mist-100 space-y-3">
                {/* Checklist, actions, or done toggle */}
                {hasActions ? (
                  <>
                    <p className="text-xs font-medium text-ink-500 mb-1">Actions ({actionsDoneCount}/{actionsTotal})</p>
                    <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sage-500 rounded-full transition-all" style={{ width: `${actionsTotal > 0 ? Math.round(actionsDoneCount / actionsTotal * 100) : 0}%` }} />
                    </div>
                    {step.done && step.doneDate && (
                      <p className="text-[10px] text-sage-500">All actions complete — {step.doneDate}</p>
                    )}
                    {!step.done && (
                      <p className="text-[10px] text-ink-400">Completes automatically when all actions are done</p>
                    )}
                  </>
                ) : hasChecks && onToggleCheck ? (
                  <>
                    <p className="text-xs font-medium text-ink-500 mb-1">Tasks ({checkedCount}/{totalChecks})</p>
                    <StepChecklist checks={step.checks!} onToggle={onToggleCheck} />
                    {step.done && step.doneDate && (
                      <p className="text-[10px] text-sage-500">All tasks complete — {step.doneDate}</p>
                    )}
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <button
                        onClick={(e) => { e.preventDefault(); onToggleDone(); }}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          step.done ? 'bg-sage-500 border-sage-500' : 'border-ink-300 group-hover:border-accent-400'
                        }`}
                      >
                        {step.done && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`text-sm font-medium ${step.done ? 'text-sage-700' : 'text-ink-700'}`}>
                        {step.done ? 'Step Complete' : 'Mark as Done'}
                      </span>
                    </label>

                    {step.done && step.doneDate && (
                      <p className="text-[10px] text-sage-500 pl-9">Completed {step.doneDate}</p>
                    )}
                  </>
                )}

                {/* Inline note */}
                <div>
                  <p className="text-xs font-medium text-ink-500 mb-1">Notes</p>
                  {editingNote ? (
                    <div className="space-y-2">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-300 focus:border-accent-300"
                        placeholder="Add notes about this step..."
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveNote} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                        <button onClick={() => { setNoteText(step.userNotes || ''); setEditingNote(false); }} className="px-3 py-1.5 border border-ink-200 text-ink-500 rounded-lg text-xs font-medium hover:bg-ink-50">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingNote(true)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        step.userNotes
                          ? 'bg-sand-100 border-sand-200 text-ink-600 hover:bg-sand-50'
                          : 'border-dashed border-ink-200 text-ink-400 hover:border-ink-300 hover:text-ink-500'
                      }`}
                    >
                      {step.userNotes ? `📝 ${step.userNotes}` : '+ Add note...'}
                    </button>
                  )}
                </div>

                {/* Step attachments mini-list */}
                {(step.stepAttachments?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-ink-500 mb-1">Attached</p>
                    <div className="space-y-1">
                      {step.stepAttachments!.map((att, i) => (
                        <div key={i} className="text-[11px] text-ink-500 bg-white rounded px-2 py-1 border border-ink-100 truncate">
                          📄 {att.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Continue button — inside completion column */}
                {!step.done && onContinue && index < totalSteps - 1 && (
                  <button
                    onClick={() => {
                      if (hasChecks && onCompleteAllChecks) onCompleteAllChecks();
                      onContinue();
                    }}
                    className="w-full py-2.5 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-colors shadow-sm"
                  >
                    Continue →
                  </button>
                )}

                {/* Close Case button — last step only */}
                {!step.done && index === totalSteps - 1 && onCloseCase && (
                  <button
                    onClick={onCloseCase}
                    className="w-full py-2.5 rounded-xl bg-sage-600 text-white text-sm font-semibold hover:bg-sage-700 transition-colors shadow-sm"
                  >
                    Close Case ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
