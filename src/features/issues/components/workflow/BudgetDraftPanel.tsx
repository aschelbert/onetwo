import { useState, useEffect } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import type { CaseStep } from '@/types/issues';

interface BudgetDraftPanelProps {
  caseId: string;
  stepIdx: number;
  step: CaseStep;
}

export function BudgetDraftPanel({ caseId, stepIdx, step }: BudgetDraftPanelProps) {
  const fin = useFinancialStore();
  const store = useIssuesStore();
  const { details } = useBuildingStore();
  const totalUnits = details.totalUnits;
  const recommended = fin.calculateRecommendedAnnualReserve();
  const variance = fin.getBudgetVariance();

  const existingDraft = step.budgetDraft;

  const [categories, setCategories] = useState<Array<{ categoryId: string; name: string; current: number; proposed: number }>>(
    existingDraft?.proposedCategories || variance.map((v: any) => ({ categoryId: v.id, name: v.name, current: v.budgeted, proposed: v.budgeted }))
  );
  const [reserveContribution, setReserveContribution] = useState(existingDraft?.proposedReserveContribution ?? fin.annualReserveContribution);
  const [contingencyPct, setContingencyPct] = useState(existingDraft?.contingencyPct ?? 4);
  const [saved, setSaved] = useState(false);

  const totalOperating = categories.reduce((s, c) => s + c.proposed, 0);
  const contingencyAmount = Math.round(totalOperating * contingencyPct / 100);
  const totalProposed = totalOperating + reserveContribution + contingencyAmount;
  const perUnitAnnual = totalUnits > 0 ? Math.round(totalProposed / totalUnits) : 0;
  const perUnitMonthly = Math.round(perUnitAnnual / 12);

  const currentTotal = variance.reduce((s: number, v: any) => s + v.budgeted, 0) + fin.annualReserveContribution;
  const currentPerUnitAnnual = totalUnits > 0 ? Math.round(currentTotal / totalUnits) : 0;
  const currentPerUnitMonthly = Math.round(currentPerUnitAnnual / 12);
  const pctIncrease = currentPerUnitAnnual > 0 ? ((perUnitAnnual - currentPerUnitAnnual) / currentPerUnitAnnual * 100).toFixed(1) : '0';

  useEffect(() => { setSaved(false); }, [categories, reserveContribution, contingencyPct]);

  const handleSave = () => {
    store.saveBudgetDraft(caseId, stepIdx, {
      proposedCategories: categories,
      proposedReserveContribution: reserveContribution,
      contingencyPct,
      contingencyAmount,
      totalProposed,
      perUnitAnnual,
      perUnitMonthly,
      savedDate: new Date().toISOString().split('T')[0],
    });
    setSaved(true);
  };

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">Budget Drafting Tool</p>

      {/* Category Editor */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Operating Expenses by Category</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Category</th>
              <th className="text-right pb-2">Current</th>
              <th className="text-right pb-2">Proposed</th>
              <th className="text-right pb-2">Variance</th>
            </tr></thead>
            <tbody>
              {categories.map((cat, i) => {
                const diff = cat.proposed - cat.current;
                return (
                  <tr key={cat.categoryId} className="border-t border-ink-50">
                    <td className="py-1.5 text-ink-700 font-medium">{cat.name}</td>
                    <td className="py-1.5 text-right text-ink-500">{fmt(cat.current)}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        value={cat.proposed}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setCategories(prev => prev.map((c, j) => j === i ? { ...c, proposed: val } : c));
                        }}
                        className="w-24 px-2 py-1 border border-ink-200 rounded text-right text-xs focus:outline-none focus:ring-1 focus:ring-accent-300"
                      />
                    </td>
                    <td className={`py-1.5 text-right font-medium ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-sage-700' : 'text-ink-400'}`}>
                      {diff > 0 ? '+' : ''}{fmt(diff)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-ink-200">
                <td className="py-2 font-semibold text-ink-900">Total Operating</td>
                <td className="py-2 text-right font-bold text-ink-700">{fmt(variance.reduce((s: number, v: any) => s + v.budgeted, 0))}</td>
                <td className="py-2 text-right font-bold text-ink-900">{fmt(totalOperating)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Reserve Contribution */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Reserve Contribution</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-xs text-ink-500 block mb-1">Annual Contribution</label>
            <input
              type="number"
              value={reserveContribution}
              onChange={e => setReserveContribution(parseFloat(e.target.value) || 0)}
              className="w-32 px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent-300"
            />
          </div>
          <div className="text-xs text-ink-500">
            <p>Recommended: <span className="font-semibold text-accent-700">{fmt(recommended)}</span></p>
            <p>Current: <span className="font-medium">{fmt(fin.annualReserveContribution)}</span></p>
          </div>
        </div>
      </div>

      {/* Contingency */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Contingency</p>
        <div className="flex items-center gap-4">
          <input
            type="range" min={3} max={5} step={0.5} value={contingencyPct}
            onChange={e => setContingencyPct(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-semibold text-ink-900 w-12 text-right">{contingencyPct}%</span>
          <span className="text-sm text-ink-600">{fmt(contingencyAmount)}</span>
        </div>
      </div>

      {/* Per-Unit Impact */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Per-Unit Assessment Impact</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Current Monthly</p>
            <p className="text-sm font-bold text-ink-900">{fmt(currentPerUnitMonthly)}</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Proposed Monthly</p>
            <p className="text-sm font-bold text-accent-700">{fmt(perUnitMonthly)}</p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">Monthly Change</p>
            <p className={`text-sm font-bold ${perUnitMonthly > currentPerUnitMonthly ? 'text-red-600' : 'text-sage-700'}`}>
              {perUnitMonthly > currentPerUnitMonthly ? '+' : ''}{fmt(perUnitMonthly - currentPerUnitMonthly)}
            </p>
          </div>
          <div className="bg-mist-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-ink-400 uppercase font-medium">% Increase</p>
            <p className={`text-sm font-bold ${parseFloat(pctIncrease) > 0 ? 'text-red-600' : 'text-sage-700'}`}>{pctIncrease}%</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-500">
          <span>Total Budget: <span className="font-semibold text-ink-900">{fmt(totalProposed)}</span></span>
          <span>Per Unit Annual: <span className="font-semibold text-ink-900">{fmt(perUnitAnnual)}</span></span>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 transition-colors"
        >
          Save Draft
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-sage-700">
            <span>✓</span>
            <span className="text-sm font-medium">Draft saved</span>
          </div>
        )}
        {existingDraft?.savedDate && !saved && (
          <span className="text-xs text-ink-400">Last saved: {existingDraft.savedDate}</span>
        )}
      </div>
    </div>
  );
}
