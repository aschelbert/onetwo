import { useState, forwardRef } from 'react';
import type { CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { deriveActionsForStep, type RichAction } from './stepActionMap';
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
}

interface FundingAnalysisInlineProps {
  caseId: string;
  stepTitle: string;
  onDecisionRecorded?: (approvalId: string) => void;
}

function FundingAnalysisInline({ caseId, stepTitle, onDecisionRecorded }: FundingAnalysisInlineProps) {
  const financialStore = useFinancialStore();
  const spendingStore = useSpendingStore();
  const [amount, setAmount] = useState('');
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const parsed = parseFloat(amount);
  const ctx = getFinancialContext(financialStore);
  const analysis = parsed > 0 ? analyzeFunding(parsed, ctx) : null;

  const handleRecordDecision = () => {
    if (!analysis || !selectedSource) return;
    const opt = analysis.options.find(o => o.source === selectedSource);
    if (!opt) return;
    const id = 'sa' + Date.now();
    spendingStore.addApproval({
      title: stepTitle,
      description: `Funding decision from workflow step: ${stepTitle}`,
      amount: parsed,
      category: 'capital',
      requestedBy: 'Board (Workflow)',
      status: parsed <= 5000 ? 'approved' : 'pending',
      priority: 'normal',
      vendorName: '',
      workOrderId: '',
      votes: [],
      threshold: 5000,
      notes: `Source: ${opt.label}. ${opt.impact}`,
      decidedAt: parsed <= 5000 ? new Date().toISOString().split('T')[0] : '',
      fundingSource: selectedSource as any,
      caseId,
    });
    setRecorded(true);
    onDecisionRecorded?.(id);
  };

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-700 mb-1">Project / Repair Amount</label>
        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setRecorded(false); setSelectedSource(null); }} placeholder="Enter estimated cost..." className="w-full max-w-xs px-3 py-2 border border-ink-200 rounded-lg text-sm" />
      </div>
      {analysis && (
        <>
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-800 uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-sm text-accent-900">{analysis.recommendation}</p>
          </div>
          <div className="space-y-2">
            {analysis.options.map(opt => (
              <button
                key={opt.source}
                type="button"
                onClick={() => opt.available && setSelectedSource(opt.source)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  selectedSource === opt.source
                    ? 'bg-accent-50 border-accent-400 ring-2 ring-accent-200'
                    : opt.recommended ? 'bg-sage-50 border-sage-200 hover:border-sage-300' : opt.available ? 'bg-white border-ink-100 hover:border-ink-200' : 'bg-ink-50 border-ink-100 opacity-70 cursor-not-allowed'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{opt.label}</span>
                    {opt.recommended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-200 text-sage-800">Recommended</span>}
                    {!opt.available && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Insufficient</span>}
                    {selectedSource === opt.source && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent-200 text-accent-800">Selected</span>}
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{opt.impact}</p>
                  {opt.perUnit > 0 && <p className="text-xs text-ink-400 mt-0.5">Per unit: {fmt(opt.perUnit)}</p>}
                </div>
              </button>
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
          {/* Record Decision */}
          {selectedSource && !recorded && (
            <button
              onClick={handleRecordDecision}
              className="w-full py-2.5 rounded-lg bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 transition-colors"
            >
              Record Funding Decision
            </button>
          )}
          {recorded && (
            <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-sage-600">✓</span>
              <p className="text-sm text-sage-800 font-medium">Funding decision recorded — visible in Financial → Spending Decisions</p>
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
          <span className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${action.primary ? 'bg-white bg-opacity-20 text-white' : 'bg-accent-50 text-accent-600 border border-accent-200'}`}>
            → {action.target.split(':').pop()}
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
  { caseId, step, index, isActive, isExpanded, onToggleExpand, onToggleDone, onNote, onAction, onContinue, totalSteps },
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
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={onToggleExpand}
      >
        <StatusIndicator />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium ${step.done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{step.s}</p>
            {isActive && <span className="text-[10px] font-semibold text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full">Current Step</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {step.t && <span className="text-[10px] text-ink-400 bg-ink-50 px-1.5 py-0.5 rounded">⏱ {step.t}</span>}
            {step.w && <span className="text-[10px] text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded">💡 Guidance</span>}
            {step.done && step.doneDate && <span className="text-[10px] text-sage-600">Completed {step.doneDate}</span>}
          </div>
        </div>
        <svg className={`w-5 h-5 text-ink-300 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded workspace */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="border-t border-ink-100 pt-4" />

          {/* Description — prominent at top (matching reference) */}
          {step.detail && (
            <div>
              <p className="text-sm text-ink-700 leading-relaxed">{step.detail}</p>
            </div>
          )}

          {/* Guidance banner — accent-colored, below description */}
          {step.w && (
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 flex items-start gap-2">
              <span className="text-accent-500 mt-0.5">💡</span>
              <div>
                <p className="text-xs font-semibold text-accent-700 uppercase tracking-wider mb-0.5">Guidance</p>
                <p className="text-sm text-accent-800">{step.w}</p>
              </div>
            </div>
          )}

          {/* Document reference badge */}
          {step.d && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink-500 bg-ink-50 border border-ink-100 rounded-lg px-3 py-1.5">📋 {step.d}</span>
            </div>
          )}

          {/* Two-column layout: Actions (2/3) + Completion (1/3) — matching reference */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left — Actions */}
            <div className="lg:col-span-2">
              {richActions.length > 0 && (
                <>
                  <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2.5">Actions</p>
                  <div className="space-y-2">
                    {richActions.map(action => (
                      <ActionCard key={action.id} action={action} onAction={handleRichAction} />
                    ))}
                  </div>
                </>
              )}

              {/* Inline funding analysis */}
              {inlineOpen && step.action?.type === 'inline' && <FundingAnalysisInline caseId={caseId} stepTitle={step.s} />}

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
                {/* Done toggle */}
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
                    onClick={onContinue}
                    className="w-full py-2.5 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-colors shadow-sm"
                  >
                    Continue →
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
