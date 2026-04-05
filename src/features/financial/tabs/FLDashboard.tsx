import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

export default function FLDashboard() {
  const store = useFinancialStore();
  const {
    getBalanceSheet, getIncomeStatement, getIncomeMetrics,
    getBudgetVariance, getDelinquencyAging, reserveItems, setActiveTab,
  } = store;

  const bs = getBalanceSheet();
  const pnl = getIncomeStatement('2026-01-01', '2026-12-31');
  const metrics = getIncomeMetrics();
  const aging = getDelinquencyAging();
  const bv = getBudgetVariance();
  const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = bv.reduce((s, b) => s + b.actual, 0);
  const budgetPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Income & Collections */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Income & Collections</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Monthly Expected</p><p className="text-xl font-bold text-ink-900">{fmt(metrics.monthlyExpected)}</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Collection Rate</p><p className="text-xl font-bold text-sage-700">{metrics.collectionRate}%</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Outstanding</p><p className="text-xl font-bold text-accent-600">{fmt(metrics.totalOutstanding)}</p></div>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide">Operating Cash</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{fmt(bs.assets.operating)}</p>
          <p className="text-xs text-ink-400 mt-1">Acct 1010</p>
        </div>
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide">Reserve Fund</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{fmt(bs.assets.reserves)}</p>
          <p className="text-xs text-ink-400 mt-1">{reservePct}% of {fmt(totalReserveNeeded)} goal</p>
        </div>
        <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Accounts Receivable</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{fmt(bs.assets.totalReceivable)}</p>
          <p className="text-xs text-ink-400 mt-1">{metrics.collectionRate}% collection rate</p>
        </div>
        <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Net Income YTD</p>
          <p className={`text-2xl font-bold mt-1 ${pnl.netIncome >= 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(pnl.netIncome)}</p>
          <p className="text-xs text-ink-400 mt-1">Income {fmt(pnl.totalIncome)} · Exp {fmt(pnl.totalExpenses)}</p>
        </div>
      </div>

      {/* Budget + Delinquency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-5 cursor-pointer hover:shadow-md transition-all" onClick={() => setActiveTab('budget')}>
          <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Budget Burn Rate</h3>
          <div className="bg-white rounded-lg p-3 mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-ink-500">Spent</span>
              <span className="font-semibold">{fmt(totalSpent)} / {fmt(totalBudgeted)}</span>
            </div>
            <div className="bg-ink-100 rounded-full h-3">
              <div className={`h-3 rounded-full ${budgetPct > 100 ? 'bg-red-500' : budgetPct > 80 ? 'bg-yellow-500' : 'bg-sage-500'}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
            </div>
            <p className="text-xs text-ink-400 mt-1">{budgetPct}% consumed · {fmt(totalBudgeted - totalSpent)} remaining</p>
          </div>
          {bv.filter(b => b.pct > 75).map(b => (
            <div key={b.id} className="flex justify-between items-center py-1.5 text-sm border-t border-sage-100">
              <span className="text-ink-700">{b.name}</span>
              <span className={`font-semibold ${b.pct > 100 ? 'text-red-600' : b.pct > 80 ? 'text-yellow-600' : 'text-sage-600'}`}>{b.pct}%</span>
            </div>
          ))}
        </div>

        <div className="bg-mist-50 border border-mist-200 rounded-xl p-5">
          <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Delinquency Aging</h3>
          <div className="bg-white rounded-lg p-3 space-y-2">
            {[
              { label: 'Current (0-30 days)', data: aging.current },
              { label: '31-60 days', data: aging.days30 },
              { label: '61-90 days', data: aging.days60 },
              { label: '90+ days', data: aging.days90plus },
            ].map((bucket) => (
              <div key={bucket.label} className="flex justify-between text-sm">
                <span className="text-ink-500">{bucket.label}</span>
                <span className="font-semibold">{bucket.data.length} units · {fmt(bucket.data.reduce((s: number, u: any) => s + u.balance, 0))}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm border-t border-mist-200 pt-2 font-bold">
              <span>Total Outstanding</span>
              <span className="text-accent-600">{fmt(aging.totalOutstanding)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

