import { useState } from 'react';
import type { CaseStep } from '@/types/issues';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { getFinancialContext, analyzeFunding, validateSpendingAmount } from '@/lib/fundingAnalysis';
import { fmt } from '@/lib/formatters';
import { ReserveImpactPanel } from './ReserveImpactPanel';
import { BudgetWarning } from './BudgetWarning';

interface SpendingDecisionPanelProps {
  caseId: string;
  stepIdx: number;
  step: CaseStep;
}

export function SpendingDecisionPanel({ caseId, stepIdx, step }: SpendingDecisionPanelProps) {
  const financialStore = useFinancialStore();
  const store = useIssuesStore();
  const building = useBuildingStore();
  const [amount, setAmount] = useState(step.spendingDecision?.amount?.toString() || '');
  const [fundingSource, setFundingSource] = useState<string>(step.spendingDecision?.fundingSource || '');
  const [rationale, setRationale] = useState(step.spendingDecision?.rationale || '');
  const [recorded, setRecorded] = useState(!!step.spendingDecision?.recordedDate);

  const parsed = parseFloat(amount);
  const ctx = getFinancialContext(financialStore);
  const bylawsLimit = 5000; // Could come from building config
  const validation = parsed > 0 ? validateSpendingAmount(parsed, fundingSource, ctx, bylawsLimit) : null;
  const analysis = parsed > 0 ? analyzeFunding(parsed, ctx) : null;

  const handleRecord = () => {
    if (!parsed || !fundingSource || !rationale.trim()) return;
    store.setSpendingDecision(caseId, stepIdx, {
      amount: parsed,
      fundingSource: fundingSource as any,
      rationale: rationale.trim(),
      recordedDate: new Date().toISOString().split('T')[0],
      recordedBy: 'Board',
    });
    setRecorded(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Spending Decision</p>
        <BudgetWarning ctx={ctx} />
      </div>

      {/* Financial Context */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center bg-mist-50 rounded-lg p-3">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Operating</p>
          <p className="text-sm font-bold text-ink-900">{fmt(ctx.operatingBalance)}</p>
        </div>
        <div className="text-center bg-mist-50 rounded-lg p-3">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Budget Left</p>
          <p className={`text-sm font-bold ${ctx.budgetRemaining > 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(ctx.budgetRemaining)}</p>
        </div>
        <div className="text-center bg-mist-50 rounded-lg p-3">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Reserves</p>
          <p className="text-sm font-bold text-ink-900">{fmt(ctx.reserveBalance)}</p>
        </div>
        <div className="text-center bg-mist-50 rounded-lg p-3">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Reserve Health</p>
          <p className={`text-sm font-bold ${ctx.reservePctFunded >= 70 ? 'text-sage-700' : ctx.reservePctFunded >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{ctx.reservePctFunded}%</p>
        </div>
      </div>

      {/* Bylaws Spending Authority */}
      <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
        <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider mb-1">Bylaws Spending Authority</p>
        <p className="text-sm text-ink-700">Board may approve up to <strong>{fmt(bylawsLimit)}</strong> without owner vote.</p>
        {parsed > bylawsLimit && (
          <p className="text-xs text-red-600 font-semibold mt-1">⚠ Amount exceeds board authority — owner vote required.</p>
        )}
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-xs font-medium text-ink-700 mb-1">Expenditure Amount</label>
        <input
          type="number"
          value={amount}
          onChange={e => { setAmount(e.target.value); setRecorded(false); }}
          placeholder="Enter amount..."
          className="w-full max-w-xs px-3 py-2 border border-ink-200 rounded-lg text-sm"
        />
      </div>

      {/* Validation */}
      {validation && (
        <div className="space-y-1">
          {validation.errors.map((e, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 font-medium">⛔ {e}</div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800">⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Funding strategies from analyzeFunding */}
      {analysis && (
        <>
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-800 uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-sm text-accent-900">{analysis.recommendation}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">Funding Strategies</p>
            {analysis.options.map(opt => (
              <button
                key={opt.strategyId || opt.source}
                onClick={() => { setFundingSource(opt.source); setRecorded(false); }}
                className={`w-full text-left rounded-lg border p-3 transition-all ${
                  fundingSource === opt.source
                    ? 'bg-accent-50 border-accent-400 ring-2 ring-accent-200'
                    : opt.recommended ? 'bg-sage-50 border-sage-200 hover:border-sage-300' : 'bg-white border-ink-100 hover:border-ink-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{opt.label}</span>
                  {opt.recommended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-200 text-sage-800">Recommended</span>}
                  {opt.approvalType === 'board' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">Board Only</span>}
                  {opt.approvalType === 'owner' && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Owner Vote</span>}
                </div>
                <p className="text-xs text-ink-500 mt-1">{opt.impact}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Reserve Impact */}
      {fundingSource === 'reserves' && parsed > 0 && (
        <ReserveImpactPanel ctx={ctx} drawAmount={parsed} />
      )}

      {/* Board Rationale */}
      {fundingSource && parsed > 0 && (
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1">Board Rationale *</label>
          <textarea
            value={rationale}
            onChange={e => { setRationale(e.target.value); setRecorded(false); }}
            rows={3}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            placeholder="Document the board's reasoning for this expenditure..."
          />
        </div>
      )}

      {/* Record Button */}
      {fundingSource && parsed > 0 && rationale.trim() && !recorded && (
        <button onClick={handleRecord} className="w-full py-2.5 rounded-lg bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 transition-colors">
          Record Spending Decision
        </button>
      )}

      {recorded && (
        <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
          <span className="text-sage-600">✓</span>
          <p className="text-sm text-sage-800 font-medium">Spending decision recorded in Decision Trail</p>
        </div>
      )}
    </div>
  );
}
