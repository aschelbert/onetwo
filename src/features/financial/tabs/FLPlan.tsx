/**
 * FLPlan.tsx -- Inline editable budget and reserves table.
 *
 * Two inline tables with click-to-edit cells and autosave (800ms debounce).
 * Annual reserve contribution editable field.
 * No "Add" modals or "generate report" buttons when v2FiscalLens is on.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { Pencil } from 'lucide-react';

// ── Debounce hook ────────────────────────────────────────────────────────────

function useDebouncedSave<T>(saveFn: (val: T) => void, delay = 800) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFn = useRef(saveFn);
  latestFn.current = saveFn;

  const save = useCallback(
    (val: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        latestFn.current(val);
      }, delay);
    },
    [delay],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return save;
}

// ── Inline editable cell ─────────────────────────────────────────────────────

function EditableCell({
  value,
  onSave,
  type = 'text',
  className = '',
}: {
  value: string | number;
  onSave: (val: string) => void;
  type?: 'text' | 'number';
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSave = useDebouncedSave(onSave);

  const handleClick = () => {
    setDraft(String(value));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    debouncedSave(e.target.value);
  };

  const handleBlur = () => {
    setEditing(false);
    onSave(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setEditing(false);
      onSave(draft);
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setDraft(String(value));
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`px-2 py-1 border border-accent-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${className}`}
        step={type === 'number' ? '0.01' : undefined}
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-ink-50 transition-colors group ${className}`}
      title="Click to edit"
    >
      {type === 'number' ? fmt(Number(value)) : value}
      <Pencil size={10} className="text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FLPlan() {
  const store = useFinancialStore();
  const {
    budgetCategories,
    reserveItems,
    updateBudgetCategory,
    updateReserveItem,
    annualReserveContribution,
    setAnnualReserveContribution,
    getOperatingBudget,
    getBudgetVariance,
    getCategorySpent,
    getReserveFundingStatus,
    calculateRecommendedAnnualReserve,
  } = store;

  const ob = getOperatingBudget();
  const bv = getBudgetVariance();
  const totalActual = bv.reduce((s, b) => s + b.actual, 0);
  const allocPct = ob.operatingBudget > 0 ? Math.round((ob.totalAllocated / ob.operatingBudget) * 100) : 0;
  const spentPct = ob.operatingBudget > 0 ? Math.round((totalActual / ob.operatingBudget) * 100) : 0;
  const recommendedAnnual = calculateRecommendedAnnualReserve();

  const reserveStatus = getReserveFundingStatus();
  const totalReserveFunded = reserveStatus.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveStatus.reduce((s, i) => s + i.estimatedCost, 0);
  const overallReservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Budget Allocation Overview */}
      <div className="bg-white border-2 border-ink-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-4">FY {new Date().getFullYear()} Budget Plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-sage-600 uppercase tracking-wider">Annual Revenue</p>
            <p className="text-xl font-bold text-ink-900 mt-1">{fmt(ob.annualRevenue)}</p>
          </div>
          <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-accent-600 uppercase tracking-wider">Reserve Contribution</p>
            <div className="mt-1">
              <EditableCell
                value={annualReserveContribution}
                type="number"
                onSave={val => {
                  const n = parseFloat(val);
                  if (!isNaN(n) && n >= 0) setAnnualReserveContribution(n);
                }}
                className="text-xl font-bold text-accent-700"
              />
            </div>
            <p className="text-[10px] text-ink-400 mt-1">Recommended: {fmt(recommendedAnnual)}</p>
          </div>
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Operating Budget</p>
            <p className="text-xl font-bold text-ink-900 mt-1">{fmt(ob.operatingBudget)}</p>
          </div>
          <div className={`rounded-xl p-4 border ${ob.overAllocated ? 'bg-red-50 border-red-300' : 'bg-sage-50 border-sage-200'}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${ob.overAllocated ? 'text-red-600' : 'text-sage-600'}`}>
              {ob.overAllocated ? 'Over-Allocated' : 'Unallocated'}
            </p>
            <p className={`text-xl font-bold mt-1 ${ob.overAllocated ? 'text-red-700' : 'text-ink-900'}`}>
              {ob.overAllocated ? `(${fmt(Math.abs(ob.unallocated))})` : fmt(ob.unallocated)}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-ink-100 rounded-full h-4 relative overflow-hidden">
          <div
            className={`h-4 rounded-l-full transition-all ${spentPct > 100 ? 'bg-red-500' : 'bg-sage-500'}`}
            style={{ width: `${Math.min(spentPct, 100)}%` }}
          />
          {allocPct > spentPct && (
            <div
              className="h-4 transition-all bg-sage-200 absolute top-0"
              style={{
                left: `${Math.min(spentPct, 100)}%`,
                width: `${Math.min(allocPct - spentPct, 100 - Math.min(spentPct, 100))}%`,
              }}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-ink-400 mt-1.5">
          <span>Spent: {fmt(totalActual)} ({spentPct}%)</span>
          <span>Allocated: {fmt(ob.totalAllocated)} ({allocPct}%)</span>
        </div>
      </div>

      {/* Budget Categories Table (inline editable) */}
      <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <h3 className="font-display text-lg font-bold text-ink-900">
            Budget Categories ({budgetCategories.length})
          </h3>
          <p className="text-xs text-ink-400">Click any value to edit. Changes save automatically.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-ink-50">
                <th className="px-5 py-2">Category</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Variance</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {bv.map(b => {
                const cat = budgetCategories.find(c => c.id === b.id);
                return (
                  <tr key={b.id} className="border-b border-ink-50 hover:bg-mist-50">
                    <td className="px-5 py-2.5">
                      <EditableCell
                        value={b.name}
                        onSave={val => {
                          if (val.trim()) updateBudgetCategory(b.id, { name: val.trim() });
                        }}
                        className="font-medium text-ink-900"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <EditableCell
                        value={b.budgeted}
                        type="number"
                        onSave={val => {
                          const n = parseFloat(val);
                          if (!isNaN(n) && n >= 0) updateBudgetCategory(b.id, { budgeted: n });
                        }}
                        className="text-ink-700"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{fmt(b.actual)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>
                      {b.variance >= 0 ? '+' : ''}{fmt(b.variance)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        b.pct > 100 ? 'bg-red-100 text-red-700'
                          : b.pct > 80 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-sage-100 text-sage-700'
                      }`}>
                        {b.pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reserve Items Table (inline editable) */}
      <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">
              Reserve Items ({reserveItems.length})
            </h3>
            <p className="text-xs text-ink-400">
              Overall: {overallReservePct}% funded ({fmt(totalReserveFunded)} of {fmt(totalReserveNeeded)})
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-ink-50">
                <th className="px-5 py-2">Item</th>
                <th className="px-3 py-2 text-right">Estimated Cost</th>
                <th className="px-3 py-2 text-right">Current Funding</th>
                <th className="px-3 py-2 text-right">Yrs Remaining</th>
                <th className="px-3 py-2 text-right">% Funded</th>
              </tr>
            </thead>
            <tbody>
              {reserveStatus.map(item => (
                <tr key={item.id} className="border-b border-ink-50 hover:bg-mist-50">
                  <td className="px-5 py-2.5">
                    <EditableCell
                      value={item.name}
                      onSave={val => {
                        if (val.trim()) updateReserveItem(item.id, { name: val.trim() });
                      }}
                      className="font-medium text-ink-900"
                    />
                    {item.isContingency && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs">
                        Contingency
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <EditableCell
                      value={item.estimatedCost}
                      type="number"
                      onSave={val => {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) updateReserveItem(item.id, { estimatedCost: n });
                      }}
                      className="text-ink-700"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <EditableCell
                      value={item.currentFunding}
                      type="number"
                      onSave={val => {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) updateReserveItem(item.id, { currentFunding: n });
                      }}
                      className="text-ink-700"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <EditableCell
                      value={item.yearsRemaining}
                      type="number"
                      onSave={val => {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) updateReserveItem(item.id, { yearsRemaining: n });
                      }}
                      className="text-ink-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.pct >= 75 ? 'bg-sage-100 text-sage-700'
                        : item.pct >= 50 ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-accent-100 text-accent-700'
                    }`}>
                      {item.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
