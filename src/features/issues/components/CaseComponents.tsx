import { useState } from 'react';
import { CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import type { StepAction } from '@/store/useIssuesStore';
import type { CaseTrackerCase, BoardVote } from '@/types/issues';
import { useFinancialStore } from '@/store/useFinancialStore';
import { getFinancialContext, analyzeFunding } from '@/lib/fundingAnalysis';
import { fmt } from '@/lib/formatters';

export function CaseCard({ c, onClick }: { c: CaseTrackerCase; onClick: () => void }) {
  const cat = CATS.find(x => x.id === c.catId);
  const pct = c.steps ? Math.round((c.steps.filter(s => s.done).length / c.steps.length) * 100) : 0;
  return (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-ink-100 p-4 hover:border-accent-300 hover:shadow-sm transition-all group">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{cat?.icon || '📋'}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>{c.priority}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>{APPR_LABELS[c.approach]}</span>
      </div>
      <p className="text-sm font-semibold text-ink-900 group-hover:text-accent-700 transition-colors">{c.title}</p>
      <p className="text-xs text-ink-400 mt-1">Unit {c.unit} · {c.created}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div className="h-full bg-sage-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-ink-500">{pct}%</span>
      </div>
      {(c.assignedTo || c.dueDate) && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {c.assignedTo && (
            <span className="flex items-center gap-1 text-[10px] text-ink-500">
              <span className="w-4 h-4 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center text-[8px] font-bold shrink-0">
                {c.assignedTo.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
              {c.assignedTo}
            </span>
          )}
          {c.dueDate && (() => {
            const today = new Date().toISOString().split('T')[0];
            const isOverdue = c.status === 'open' && c.dueDate < today;
            const daysUntil = Math.ceil((new Date(c.dueDate + 'T12:00').getTime() - new Date(today + 'T12:00').getTime()) / (1000*60*60*24));
            const isNear = c.status === 'open' && daysUntil >= 0 && daysUntil <= 7;
            return (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700' : isNear ? 'bg-amber-100 text-amber-700' : 'bg-ink-50 text-ink-400'}`}>
                {isOverdue ? 'OVERDUE' : `Due ${c.dueDate}`}
              </span>
            );
          })()}
        </div>
      )}
    </button>
  );
}

export function BoardVoteDisplay({ vote }: { vote: BoardVote }) {
  const approveCount = vote.votes.filter(v => v.vote === 'approve').length;
  const denyCount = vote.votes.filter(v => v.vote === 'deny').length;
  const abstainCount = vote.votes.filter(v => v.vote === 'abstain').length;
  const passed = approveCount > denyCount;
  const vColors: Record<string, string> = { approve: 'bg-sage-100 text-sage-700', deny: 'bg-red-100 text-red-700', abstain: 'bg-ink-100 text-ink-500' };
  const rowBg: Record<string, string> = { approve: 'bg-sage-50', deny: 'bg-red-50', abstain: 'bg-ink-50' };

  return (
    <>
      <div className="mb-3 p-3 bg-mist-50 rounded-lg border border-mist-200">
        <p className="text-sm font-medium text-ink-900">{vote.motion}</p>
        <p className="text-xs text-ink-400 mt-1">Vote date: {vote.date}</p>
      </div>
      <div className="space-y-1.5">
        {vote.votes.map((v, i) => (
          <div key={i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${rowBg[v.vote] || 'bg-ink-50'} border border-ink-50`}>
            <div>
              <span className="text-sm font-medium text-ink-900">{v.name}</span>
              <span className="text-xs text-ink-400 ml-2">{v.role}</span>
            </div>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${vColors[v.vote] || 'bg-ink-50 text-ink-300'}`}>
              {v.vote ? v.vote.charAt(0).toUpperCase() + v.vote.slice(1) : '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-ink-100 flex gap-4 text-sm">
        <span className="text-sage-600 font-semibold">{approveCount} Approve</span>
        <span className="text-red-600 font-semibold">{denyCount} Deny</span>
        <span className="text-ink-400">{abstainCount} Abstain</span>
        <span className={`ml-auto font-bold ${passed ? 'text-sage-700' : 'text-red-600'}`}>{passed ? 'PASSED' : 'NOT PASSED'}</span>
      </div>
    </>
  );
}

function FundingAnalysisInline() {
  const financialStore = useFinancialStore();
  const [amount, setAmount] = useState('');
  const parsed = parseFloat(amount);
  const ctx = getFinancialContext(financialStore);
  const analysis = parsed > 0 ? analyzeFunding(parsed, ctx) : null;

  return (
    <div className="mt-2 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-700 mb-1">Project / Repair Amount</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter estimated cost..."
          className="w-full max-w-xs px-3 py-2 border border-ink-200 rounded-lg text-sm"
        />
      </div>
      {analysis && (
        <>
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-800 uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-sm text-accent-900">{analysis.recommendation}</p>
          </div>
          <div className="space-y-2">
            {analysis.options.map(opt => (
              <div key={opt.source} className={`flex items-start gap-3 p-3 rounded-lg border ${opt.recommended ? 'bg-sage-50 border-sage-200' : opt.available ? 'bg-white border-ink-100' : 'bg-ink-50 border-ink-100 opacity-70'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{opt.label}</span>
                    {opt.recommended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-200 text-sage-800">Recommended</span>}
                    {!opt.available && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Insufficient</span>}
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{opt.impact}</p>
                  {opt.perUnit > 0 && <p className="text-xs text-ink-400 mt-0.5">Per unit: {fmt(opt.perUnit)}</p>}
                </div>
              </div>
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
        </>
      )}
    </div>
  );
}

export function StepsSection({ caseId, approach, steps, onToggle, onNote, onAction, inlineStepIdx }: {
  caseId: string;
  approach: string;
  steps: any[];
  onToggle: (idx: number) => void;
  onNote: (idx: number, note: string) => void;
  onAction?: (action: StepAction, idx: number) => void;
  inlineStepIdx?: number | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-100 p-5">
      <h3 className="text-lg font-semibold text-ink-800 mb-4">
        {APPR_LABELS[approach]} Steps{' '}
        <span className="text-ink-400 font-normal text-sm">({steps.filter(s => s.done).length}/{steps.length} complete)</span>
      </h3>
      <div className="space-y-3">
        {steps.map((st, i) => (
          <div key={i} className="flex items-start gap-3">
            <button
              onClick={() => onToggle(i)}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all text-sm font-bold ${st.done ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 text-ink-300 hover:border-accent-400'}`}
            >
              {st.done ? '✓' : i + 1}
            </button>
            <div className="flex-1">
              <p className={`text-sm ${st.done ? 'text-ink-400 line-through' : 'text-ink-800 font-medium'}`}>{st.s}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {st.t && <span className="text-[11px] text-ink-400">⏱ {st.t}</span>}
                {st.d && <span className="text-[11px] text-ink-400">📋 {st.d}</span>}
                {st.detail && <span className="text-[11px] text-ink-400">💡 {st.detail}</span>}
                {st.w && <span className="text-[11px] text-rose-500">⚠ {st.w}</span>}
              </div>
              {st.action && !st.done && (
                <button
                  onClick={() => onAction?.(st.action, i)}
                  className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 bg-accent-50 border border-accent-200 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-100 transition-colors"
                >
                  {st.action.type === 'navigate' ? '↗' : st.action.type === 'modal' ? '+' : '▼'} {st.action.label}
                </button>
              )}
              {st.action?.type === 'inline' && inlineStepIdx === i && (
                <FundingAnalysisInline />
              )}
              {st.done && st.doneDate && <span className="text-[10px] text-sage-500">Completed {st.doneDate}</span>}
              {st.userNotes && <p className="text-xs text-ink-400 mt-1 bg-sand-100 rounded p-2">📝 {st.userNotes}</p>}
              <button
                onClick={() => {
                  const note = prompt('Add note:', st.userNotes || '');
                  if (note !== null) onNote(i, note);
                }}
                className="text-[11px] text-accent-500 hover:text-accent-600 mt-1 inline-block"
              >
                + Add note
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
