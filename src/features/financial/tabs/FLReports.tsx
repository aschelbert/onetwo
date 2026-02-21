import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

export default function FLReports() {
  const { getBalanceSheet, getIncomeStatement, getBudgetVariance } = useFinancialStore();
  const bs = getBalanceSheet();
  const pnl = getIncomeStatement('2026-01-01', '2026-12-31');
  const bv = getBudgetVariance();

  return (
    <div className="space-y-6">
      {/* Balance Sheet */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-sage-200">
          <h3 className="font-display text-lg font-bold text-ink-900">Balance Sheet</h3>
          <p className="text-xs text-ink-400">As of {new Date().toLocaleDateString()}</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Assets */}
          <div>
            <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Assets</h4>
            <div className="space-y-2 text-sm">
              {[
                ['Operating Checking', bs.assets.operating],
                ['Reserve Savings', bs.assets.reserves],
                ['Assessments Receivable', bs.assets.assessmentsAR],
                ['Late Fees Receivable', bs.assets.lateFeesAR],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
              ))}
              <div className="flex justify-between border-t border-sage-200 pt-2 font-bold"><span>Total Assets</span><span>{fmt(bs.assets.total)}</span></div>
            </div>
          </div>
          {/* Liabilities */}
          <div>
            <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Liabilities</h4>
            <div className="space-y-2 text-sm">
              {[
                ['Accounts Payable', bs.liabilities.payable],
                ['Prepaid Assessments', bs.liabilities.prepaidAssessments],
                ['Security Deposits', bs.liabilities.deposits],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
              ))}
              <div className="flex justify-between border-t border-accent-200 pt-2 font-bold"><span>Total Liabilities</span><span>{fmt(bs.liabilities.total)}</span></div>
            </div>
          </div>
          {/* Equity */}
          <div>
            <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Fund Balances</h4>
            <div className="space-y-2 text-sm">
              {[
                ['Operating Fund', bs.equity.operatingFund],
                ['Reserve Fund', bs.equity.reserveFund],
                ['Retained Surplus', bs.equity.retained],
              ].map(([label, val]) => (
                <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
              ))}
              <div className="flex justify-between border-t border-ink-200 pt-2 font-bold"><span>Total Equity</span><span>{fmt(bs.equity.total)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Income Statement */}
      <div className="bg-mist-50 border border-mist-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-mist-200">
          <h3 className="font-display text-lg font-bold text-ink-900">Income Statement (P&L)</h3>
          <p className="text-xs text-ink-400">Jan 1 – Dec 31, 2026 (YTD)</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Income</h4>
            <div className="space-y-2 text-sm">
              {Object.entries(pnl.income).map(([num, v]: [string, any]) => (
                <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
              ))}
              <div className="flex justify-between border-t border-sage-200 pt-2 font-bold text-sage-700"><span>Total Income</span><span>{fmt(pnl.totalIncome)}</span></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Expenses</h4>
            <div className="space-y-2 text-sm">
              {Object.entries(pnl.expenses).map(([num, v]: [string, any]) => (
                <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
              ))}
              <div className="flex justify-between border-t border-accent-200 pt-2 font-bold text-accent-700"><span>Total Expenses</span><span>{fmt(pnl.totalExpenses)}</span></div>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-mist-200 bg-white">
          <div className="flex justify-between text-lg font-bold"><span>Net Income</span><span className={pnl.netIncome >= 0 ? 'text-sage-700' : 'text-red-600'}>{fmt(pnl.netIncome)}</span></div>
        </div>
      </div>

      {/* Budget Variance */}
      <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100"><h3 className="font-display text-lg font-bold text-ink-900">Budget Variance Report</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-mist-50">
                <th className="px-5 py-2">Category</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {bv.map(b => (
                <tr key={b.id} className="border-b border-ink-50 hover:bg-mist-50">
                  <td className="px-5 py-2.5 font-medium text-ink-900">{b.name}</td>
                  <td className="px-3 py-2.5 text-right text-ink-500">{fmt(b.budgeted)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{fmt(b.actual)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{b.variance >= 0 ? '+' : ''}{fmt(b.variance)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`pill px-2 py-0.5 rounded ${b.pct > 100 ? 'bg-red-100 text-red-700' : b.pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-sage-100 text-sage-700'}`}>{b.pct}%</span>
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
