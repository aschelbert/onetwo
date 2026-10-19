/**
 * BooksStatements.tsx -- Live statements with drill-down.
 *
 * Period chips (YTD, month, quarter, compare).
 * Income Statement vs Budget table.
 * Balance Sheet (fund basis).
 * Year end package card.
 * "Share with CPA" action.
 */

import { useState, useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import { statementLines, yearEndPackage, type YearEndInputs } from '@/lib/ledgerView';
import { toPeriod, periodLabel } from '@/lib/monthClose';
import { CheckCircle, Circle, FileText, Share2 } from 'lucide-react';

type PeriodMode = 'ytd' | 'month' | 'quarter';

function getQuarterRange(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${endMonth === 2 ? '28' : endMonth === 12 || endMonth === 10 || endMonth === 8 || endMonth === 6 || endMonth === 4 ? '30' : '31'}`,
  };
}

export default function BooksStatements() {
  const store = useFinancialStore();
  const building = useBuildingStore();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = toPeriod(now);

  const [mode, setMode] = useState<PeriodMode>('ytd');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [showYearEnd, setShowYearEnd] = useState(false);

  // Compute period range
  const periodRange = useMemo(() => {
    switch (mode) {
      case 'ytd':
        return { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` };
      case 'month': {
        const [y, m] = selectedMonth.split('-');
        const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
        return {
          start: `${selectedMonth}-01`,
          end: `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`,
        };
      }
      case 'quarter':
        return getQuarterRange(currentYear, selectedQuarter);
      default:
        return { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` };
    }
  }, [mode, selectedMonth, selectedQuarter, currentYear]);

  // Statement lines
  const stmtLines = useMemo(
    () =>
      statementLines(
        store.generalLedger,
        store.budgetCategories,
        store.chartOfAccounts,
        periodRange,
      ),
    [store.generalLedger, store.budgetCategories, store.chartOfAccounts, periodRange],
  );

  // Balance sheet
  const bs = store.getBalanceSheet();
  const booksInBalance = Math.abs(bs.assets.total - bs.liabilities.total - bs.equity.total) < 0.01;

  // Available months
  const monthOpts = useMemo(() => {
    const months = new Set(store.generalLedger.map(e => toPeriod(e.date)));
    return [...months].sort().reverse();
  }, [store.generalLedger]);

  // Year end package
  const yearEndItems = useMemo(() => {
    const inputs: YearEndInputs = {
      periodCloses: store.periodCloses,
      generalLedger: store.generalLedger,
      workOrders: store.workOrders.map(wo => ({
        vendor: wo.vendor,
        amount: wo.amount,
        paidDate: wo.paidDate,
        status: wo.status,
      })),
      buildingName: building.name,
      buildingState: building.address.state,
      entityType: building.details.entityType || 'incorporated',
    };
    return yearEndPackage(currentYear, inputs);
  }, [store.periodCloses, store.generalLedger, store.workOrders, building, currentYear]);

  const yearEndDone = yearEndItems.filter(i => i.done).length;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ytd', 'month', 'quarter'] as PeriodMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-navy text-white'
                : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
            }`}
          >
            {m === 'ytd' ? 'Year to date' : m === 'month' ? 'Month' : 'Quarter'}
          </button>
        ))}

        {mode === 'month' && (
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm"
          >
            {monthOpts.map(m => (
              <option key={m} value={m}>{periodLabel(m)}</option>
            ))}
          </select>
        )}

        {mode === 'quarter' && (
          <select
            value={selectedQuarter}
            onChange={e => setSelectedQuarter(Number(e.target.value))}
            className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm"
          >
            {[1, 2, 3, 4].map(q => (
              <option key={q} value={q}>Q{q} {currentYear}</option>
            ))}
          </select>
        )}
      </div>

      {/* Income Statement vs Budget */}
      <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">
              Income Statement vs Budget
            </h3>
            <p className="text-xs text-ink-400">
              {periodRange.start} to {periodRange.end}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Share2 size={14} className="text-ink-400" />
            <span className="text-xs text-ink-400">Share with CPA</span>
          </div>
        </div>

        {/* Income */}
        <div className="p-5">
          <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Income</h4>
          <div className="space-y-1">
            {stmtLines.incomeLines.map(l => (
              <div key={l.accountNum} className="flex items-center justify-between py-1 text-sm">
                <span className="text-ink-600">
                  <span className="font-mono text-xs text-ink-400 mr-2">{l.accountNum}</span>
                  {l.accountName}
                </span>
                <span className="font-medium">{fmt(l.actual)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-sage-200 pt-2 font-bold text-sage-700 text-sm">
              <span>Total Income</span>
              <span>{fmt(stmtLines.totalIncome)}</span>
            </div>
          </div>

          {/* Expenses */}
          <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mt-6 mb-3">
            Expenses
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-100">
                  <th className="py-1 pr-2">Account</th>
                  <th className="py-1 pr-2 text-right">Actual</th>
                  <th className="py-1 pr-2 text-right">Budget</th>
                  <th className="py-1 pr-2 text-right">Variance</th>
                  <th className="py-1 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {stmtLines.expenseLines.map(l => (
                  <tr key={l.accountNum} className="border-b border-ink-50">
                    <td className="py-1.5 pr-2 text-ink-600">
                      <span className="font-mono text-xs text-ink-400 mr-2">{l.accountNum}</span>
                      {l.accountName}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-medium">{fmt(l.actual)}</td>
                    <td className="py-1.5 pr-2 text-right text-ink-400">{l.budgeted > 0 ? fmt(l.budgeted) : '--'}</td>
                    <td className={`py-1.5 pr-2 text-right font-semibold ${l.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>
                      {l.budgeted > 0 ? `${l.variance >= 0 ? '+' : ''}${fmt(l.variance)}` : '--'}
                    </td>
                    <td className="py-1.5 text-right">
                      {l.budgeted > 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          l.variancePct > 100 ? 'bg-red-100 text-red-700' : l.variancePct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-sage-100 text-sage-700'
                        }`}>
                          {l.variancePct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-accent-200 font-bold text-accent-700">
                  <td className="py-2 pr-2">Total Expenses</td>
                  <td className="py-2 pr-2 text-right">{fmt(stmtLines.totalExpenses)}</td>
                  <td className="py-2 pr-2 text-right">{fmt(stmtLines.totalBudgetedExpenses)}</td>
                  <td className="py-2 pr-2 text-right">{fmt(stmtLines.totalBudgetedExpenses - stmtLines.totalExpenses)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Net Income */}
          <div className="flex justify-between mt-4 pt-3 border-t border-ink-200 text-lg font-bold">
            <span>Net Income</span>
            <span className={stmtLines.netIncome >= 0 ? 'text-sage-700' : 'text-red-600'}>
              {fmt(stmtLines.netIncome)}
            </span>
          </div>
        </div>
      </div>

      {/* Balance Sheet (Fund Basis) */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-sage-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">Balance Sheet (Fund Basis)</h3>
            <p className="text-xs text-ink-400">As of {new Date().toLocaleDateString()}</p>
          </div>
          {booksInBalance && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              <CheckCircle size={12} />
              In balance
            </span>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Assets</h4>
            <div className="space-y-2 text-sm">
              {([
                ['Operating Checking', bs.assets.operating],
                ['Reserve Savings', bs.assets.reserves],
                ['Assessments Receivable', bs.assets.assessmentsAR],
                ['Late Fees Receivable', bs.assets.lateFeesAR],
              ] as const).map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-ink-500">{label}</span>
                  <span className="font-medium">{fmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-sage-200 pt-2 font-bold">
                <span>Total Assets</span>
                <span>{fmt(bs.assets.total)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Liabilities</h4>
            <div className="space-y-2 text-sm">
              {([
                ['Accounts Payable', bs.liabilities.payable],
                ['Prepaid Assessments', bs.liabilities.prepaidAssessments],
                ['Security Deposits', bs.liabilities.deposits],
              ] as const).map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-ink-500">{label}</span>
                  <span className="font-medium">{fmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-accent-200 pt-2 font-bold">
                <span>Total Liabilities</span>
                <span>{fmt(bs.liabilities.total)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Fund Balances</h4>
            <div className="space-y-2 text-sm">
              {([
                ['Operating Fund', bs.equity.operatingFund],
                ['Reserve Fund', bs.equity.reserveFund],
                ['Retained Surplus', bs.equity.retained],
              ] as const).map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-ink-500">{label}</span>
                  <span className="font-medium">{fmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-ink-200 pt-2 font-bold">
                <span>Total Equity</span>
                <span>{fmt(bs.equity.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Year End Package Card */}
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowYearEnd(!showYearEnd)}
          className="w-full px-5 py-4 border-b border-ink-200 flex items-center justify-between hover:bg-ink-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-ink-500" />
            <div className="text-left">
              <h3 className="font-display text-lg font-bold text-ink-900">
                {currentYear} Year End Package
              </h3>
              <p className="text-xs text-ink-400">
                {yearEndDone} of {yearEndItems.length} items complete
              </p>
            </div>
          </div>
          <span className="text-ink-400 text-sm">{showYearEnd ? 'Hide' : 'Show'}</span>
        </button>
        {showYearEnd && (
          <div className="divide-y divide-ink-100">
            {yearEndItems.map(item => (
              <div key={item.key} className="flex items-center gap-3 px-5 py-3.5">
                {item.done ? (
                  <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                ) : (
                  <Circle size={18} className="text-ink-300 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.done ? 'text-ink-900' : 'text-ink-600'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5 truncate">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
