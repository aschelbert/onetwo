import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

export function BudgetReviewPanel() {
  const fin = useFinancialStore();
  const variance = fin.getBudgetVariance();
  const reserveStatus = fin.getReserveFundingStatus();
  const income = fin.getIncomeMetrics();
  const aging = fin.getDelinquencyAging();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    variance: true, reserves: false, collection: false, receivables: false,
  });

  const toggle = (key: string) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const totalFunded = reserveStatus.reduce((sum: number, r: any) => sum + r.currentFunding, 0);
  const totalNeeded = reserveStatus.reduce((sum: number, r: any) => sum + r.estimatedCost, 0);
  const reservePctFunded = totalNeeded > 0 ? Math.round((totalFunded / totalNeeded) * 100) : 100;
  const urgentItems = reserveStatus.filter((r: any) => r.yearsRemaining <= 3 && r.pct < 70);

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-3">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">Financial Review Summary</p>

      {/* Budget Variance */}
      <div className="bg-white rounded-lg border border-ink-100">
        <button onClick={() => toggle('variance')} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Budget Variance</span>
          <svg className={`w-4 h-4 text-ink-400 transition-transform ${openSections.variance ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {openSections.variance && (
          <div className="px-4 pb-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-ink-400 uppercase tracking-wider">
                  <th className="text-left pb-2">Category</th>
                  <th className="text-right pb-2">Budgeted</th>
                  <th className="text-right pb-2">Actual</th>
                  <th className="text-right pb-2">Variance</th>
                  <th className="text-right pb-2">%</th>
                </tr></thead>
                <tbody>
                  {variance.map((v: any) => (
                    <tr key={v.id} className="border-t border-ink-50">
                      <td className="py-1.5 text-ink-700">{v.name}</td>
                      <td className="py-1.5 text-right text-ink-600">{fmt(v.budgeted)}</td>
                      <td className="py-1.5 text-right text-ink-600">{fmt(v.actual)}</td>
                      <td className={`py-1.5 text-right font-medium ${v.variance >= 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(v.variance)}</td>
                      <td className={`py-1.5 text-right ${v.pct > 100 ? 'text-red-600 font-semibold' : 'text-ink-500'}`}>{v.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reserve Balances */}
      <div className="bg-white rounded-lg border border-ink-100">
        <button onClick={() => toggle('reserves')} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Reserve Balances</span>
          <svg className={`w-4 h-4 text-ink-400 transition-transform ${openSections.reserves ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {openSections.reserves && (
          <div className="px-4 pb-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Total Funded</p>
                <p className="text-sm font-bold text-ink-900">{fmt(totalFunded)}</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Total Needed</p>
                <p className="text-sm font-bold text-ink-900">{fmt(totalNeeded)}</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">% Funded</p>
                <p className={`text-sm font-bold ${reservePctFunded >= 70 ? 'text-sage-700' : reservePctFunded >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{reservePctFunded}%</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Urgent Items</p>
                <p className={`text-sm font-bold ${urgentItems.length > 0 ? 'text-red-600' : 'text-sage-700'}`}>{urgentItems.length}</p>
              </div>
            </div>
            {urgentItems.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-red-700 uppercase mb-1">Items needing attention (&le;3 yrs, &lt;70% funded)</p>
                {urgentItems.map((item: any) => (
                  <p key={item.id} className="text-xs text-red-800">{item.name} — {item.pct}% funded, {item.yearsRemaining} yrs remaining</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collection Rate */}
      <div className="bg-white rounded-lg border border-ink-100">
        <button onClick={() => toggle('collection')} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Collection Rate</span>
          <svg className={`w-4 h-4 text-ink-400 transition-transform ${openSections.collection ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {openSections.collection && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Collection Rate</p>
                <p className={`text-lg font-bold ${income.collectionRate >= 90 ? 'text-sage-700' : income.collectionRate >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{income.collectionRate}%</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Monthly Expected</p>
                <p className="text-sm font-bold text-ink-900">{fmt(income.monthlyExpected)}</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Monthly Collected</p>
                <p className="text-sm font-bold text-ink-900">{fmt(income.monthlyCollected)}</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-ink-400 uppercase font-medium">Delinquent Units</p>
                <p className={`text-sm font-bold ${income.delinquentUnits > 0 ? 'text-red-600' : 'text-sage-700'}`}>{income.delinquentUnits}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Outstanding Receivables */}
      <div className="bg-white rounded-lg border border-ink-100">
        <button onClick={() => toggle('receivables')} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-900">Outstanding Receivables</span>
          <svg className={`w-4 h-4 text-ink-400 transition-transform ${openSections.receivables ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {openSections.receivables && (
          <div className="px-4 pb-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-ink-400 uppercase tracking-wider">
                  <th className="text-left pb-2">Bucket</th>
                  <th className="text-right pb-2">Units</th>
                  <th className="text-right pb-2">Amount</th>
                </tr></thead>
                <tbody>
                  <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Current</td><td className="py-1.5 text-right text-ink-600">{aging.current}</td><td className="py-1.5 text-right text-ink-600">—</td></tr>
                  <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">30 days</td><td className="py-1.5 text-right text-ink-600">{aging.days30}</td><td className="py-1.5 text-right text-yellow-600">{aging.days30 > 0 ? 'Past due' : '—'}</td></tr>
                  <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">60 days</td><td className="py-1.5 text-right text-ink-600">{aging.days60}</td><td className="py-1.5 text-right text-orange-600">{aging.days60 > 0 ? 'Past due' : '—'}</td></tr>
                  <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">90+ days</td><td className="py-1.5 text-right text-red-600 font-semibold">{aging.days90plus}</td><td className="py-1.5 text-right text-red-600 font-semibold">{aging.days90plus > 0 ? 'Severely past due' : '—'}</td></tr>
                  <tr className="border-t-2 border-ink-200"><td className="py-1.5 text-ink-900 font-semibold">Total Outstanding</td><td className="py-1.5" /><td className="py-1.5 text-right text-ink-900 font-bold">{fmt(aging.totalOutstanding)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
