import React from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

interface ActionReportModalProps {
  reportType: string;
  reportDesc: string;
  label: string;
  onClose: () => void;
}

function ReconciliationReport() {
  const { chartOfAccounts, generalLedger, acctBalance } = useFinancialStore();
  const bankAccounts = chartOfAccounts.filter(a => a.num.startsWith('10'));
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Verify all bank and reserve accounts are reconciled to current month-end.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100">
            <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Account</th>
            <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Last Reconciled</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Balance</th>
            <th className="text-center py-2 text-xs font-bold text-ink-400 uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {bankAccounts.map(acct => {
            const entries = generalLedger.filter(e => e.status === 'posted' && (e.debitAcct === acct.num || e.creditAcct === acct.num));
            const lastEntry = entries.length > 0 ? entries[entries.length - 1].date : 'No activity';
            const bal = acctBalance(acct.num);
            const reconciled = entries.length > 0;
            return (
              <tr key={acct.num} className="border-b border-ink-50">
                <td className="py-2 text-ink-800 font-medium">{acct.num} — {acct.name}</td>
                <td className="py-2 text-ink-600">{lastEntry}</td>
                <td className="py-2 text-right font-mono text-ink-800">{fmt(Math.abs(bal))}</td>
                <td className="py-2 text-center">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${reconciled ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>
                    {reconciled ? 'Reconciled' : 'Pending'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BudgetVarianceReport() {
  const { getBudgetVariance } = useFinancialStore();
  const rows = getBudgetVariance();

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Review each budget category for variances.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100">
            <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Category</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Budgeted</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Actual</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Variance $</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Variance %</th>
            <th className="text-center py-2 text-xs font-bold text-ink-400 uppercase">Type</th>
            <th className="text-center py-2 text-xs font-bold text-ink-400 uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => {
            const overBudget = r.variance < 0;
            const pctUsed = r.pct;
            const type = Math.abs(r.variance) > r.budgeted * 0.1 ? 'Structural' : 'One-time';
            return (
              <tr key={r.id} className="border-b border-ink-50">
                <td className="py-2 text-ink-800 font-medium">{r.name}</td>
                <td className="py-2 text-right font-mono text-ink-600">{fmt(r.budgeted)}</td>
                <td className="py-2 text-right font-mono text-ink-800">{fmt(r.actual)}</td>
                <td className={`py-2 text-right font-mono ${overBudget ? 'text-red-600' : 'text-sage-600'}`}>{fmt(r.variance)}</td>
                <td className={`py-2 text-right font-mono ${pctUsed > 100 ? 'text-red-600' : 'text-ink-600'}`}>{pctUsed}%</td>
                <td className="py-2 text-center">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-ink-50 text-ink-500">{type}</span>
                </td>
                <td className="py-2 text-center">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    pctUsed > 110 ? 'bg-red-100 text-red-700' : pctUsed > 90 ? 'bg-amber-100 text-amber-700' : 'bg-sage-100 text-sage-700'
                  }`}>
                    {pctUsed > 110 ? 'Over' : pctUsed > 90 ? 'Watch' : 'OK'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CollectionsReport() {
  const { getIncomeMetrics, getDelinquencyAging, units } = useFinancialStore();
  const metrics = getIncomeMetrics();
  const aging = getDelinquencyAging();

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">Analyze assessment collection rates and delinquency trends.</p>

      {/* Collection Rate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-mist-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Collection Rate</p>
          <p className={`text-xl font-bold ${metrics.collectionRate >= 90 ? 'text-sage-700' : 'text-red-600'}`}>{metrics.collectionRate}%</p>
        </div>
        <div className="bg-mist-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Monthly Expected</p>
          <p className="text-xl font-bold text-ink-800">{fmt(metrics.monthlyExpected)}</p>
        </div>
        <div className="bg-mist-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Outstanding</p>
          <p className="text-xl font-bold text-red-600">{fmt(metrics.totalOutstanding)}</p>
        </div>
        <div className="bg-mist-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Delinquent Units</p>
          <p className="text-xl font-bold text-ink-800">{metrics.delinquentUnits}/{metrics.totalUnits}</p>
        </div>
      </div>

      {/* Delinquency Aging Table */}
      <div>
        <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">Delinquency Aging</p>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-sage-600 font-medium">Current</p>
            <p className="text-lg font-bold text-sage-800">{aging.current.length}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-amber-600 font-medium">30 Days</p>
            <p className="text-lg font-bold text-amber-800">{aging.days30.length}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-orange-600 font-medium">60 Days</p>
            <p className="text-lg font-bold text-orange-800">{aging.days60.length}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-red-600 font-medium">90+ Days</p>
            <p className="text-lg font-bold text-red-800">{aging.days90plus.length}</p>
          </div>
        </div>
      </div>

      {/* Outstanding Receivables Table */}
      {(() => {
        const delinquent = units.filter(u => u.balance > 0);
        if (delinquent.length === 0) return <p className="text-sm text-sage-600">No outstanding receivables.</p>;
        return (
          <div>
            <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">Outstanding Receivables</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100">
                  <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Unit</th>
                  <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Owner</th>
                  <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Monthly Fee</th>
                  <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Balance Owed</th>
                </tr>
              </thead>
              <tbody>
                {delinquent.map(u => (
                  <tr key={u.number} className="border-b border-ink-50">
                    <td className="py-2 text-ink-800 font-medium">Unit {u.number}</td>
                    <td className="py-2 text-ink-600">{u.owner}</td>
                    <td className="py-2 text-right font-mono text-ink-600">{fmt(u.monthlyFee)}</td>
                    <td className="py-2 text-right font-mono text-red-600 font-semibold">{fmt(u.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

function ReserveBalancesReport() {
  const { reserveItems, chartOfAccounts, generalLedger, annualReserveContribution } = useFinancialStore();

  // Check for operating expenses charged to reserve accounts
  const reserveExpenseAccts = chartOfAccounts.filter(a => a.num.startsWith('60'));
  const operatingInReserves = generalLedger
    .filter(e => e.status === 'posted' && reserveExpenseAccts.some(a => a.num === e.debitAcct))
    .filter(e => {
      const creditAcct = chartOfAccounts.find(a => a.num === e.creditAcct);
      return creditAcct && creditAcct.type === 'asset' && creditAcct.num.startsWith('10') && !creditAcct.name.toLowerCase().includes('reserve');
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Review reserve fund balances and contribution rates.</p>

      {operatingInReserves.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-bold text-red-700 uppercase mb-1">Warning: Operating expenses charged to reserves</p>
          <p className="text-sm text-red-600">{operatingInReserves.length} transaction(s) found where operating expenses may have been paid from reserve funds.</p>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100">
            <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Component</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Current Funding</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Required</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">% Funded</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Annual Contribution</th>
          </tr>
        </thead>
        <tbody>
          {reserveItems.map(item => {
            const pctFunded = item.estimatedCost > 0 ? Math.round((item.currentFunding / item.estimatedCost) * 100) : 0;
            const annualNeeded = item.yearsRemaining > 0 ? Math.round((item.estimatedCost - item.currentFunding) / item.yearsRemaining) : 0;
            return (
              <tr key={item.id} className="border-b border-ink-50">
                <td className="py-2 text-ink-800 font-medium">{item.name}</td>
                <td className="py-2 text-right font-mono text-ink-800">{fmt(item.currentFunding)}</td>
                <td className="py-2 text-right font-mono text-ink-600">{fmt(item.estimatedCost)}</td>
                <td className="py-2 text-right">
                  <span className={`font-mono font-semibold ${pctFunded >= 70 ? 'text-sage-700' : pctFunded >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                    {pctFunded}%
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-ink-600">{fmt(annualNeeded)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="bg-mist-50 rounded-lg p-3 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">Current annual reserve contribution</span>
        <span className="text-sm font-bold text-ink-800">{fmt(annualReserveContribution)}</span>
      </div>
    </div>
  );
}

function YearEndProjectionsReport() {
  const { budgetCategories, getCategorySpent } = useFinancialStore();
  // Assume we're partway through the year — extrapolate from YTD
  const now = new Date();
  const monthsElapsed = now.getMonth() + 1; // 1-12
  const projectionFactor = monthsElapsed > 0 ? 12 / monthsElapsed : 1;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Extrapolate current run-rates to fiscal year-end.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100">
            <th className="text-left py-2 text-xs font-bold text-ink-400 uppercase">Category</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">YTD Actual</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Projected Year-End</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Budget</th>
            <th className="text-right py-2 text-xs font-bold text-ink-400 uppercase">Projected Variance</th>
          </tr>
        </thead>
        <tbody>
          {budgetCategories.map(cat => {
            const ytd = getCategorySpent(cat);
            const projected = Math.round(ytd * projectionFactor);
            const variance = cat.budgeted - projected;
            return (
              <tr key={cat.id} className="border-b border-ink-50">
                <td className="py-2 text-ink-800 font-medium">{cat.name}</td>
                <td className="py-2 text-right font-mono text-ink-800">{fmt(ytd)}</td>
                <td className="py-2 text-right font-mono text-ink-800">{fmt(projected)}</td>
                <td className="py-2 text-right font-mono text-ink-600">{fmt(cat.budgeted)}</td>
                <td className={`py-2 text-right font-mono font-semibold ${variance < 0 ? 'text-red-600' : 'text-sage-600'}`}>
                  {fmt(variance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-ink-400">Projection based on {monthsElapsed} months elapsed, linear extrapolation to 12 months.</p>
    </div>
  );
}

const REPORT_COMPONENTS: Record<string, () => React.ReactElement> = {
  reconciliation: ReconciliationReport,
  budgetVariance: BudgetVarianceReport,
  collections: CollectionsReport,
  reserveBalances: ReserveBalancesReport,
  yearEndProjections: YearEndProjectionsReport,
};

export function ActionReportModal({ reportType, reportDesc, label, onClose }: ActionReportModalProps) {
  const ReportComponent = REPORT_COMPONENTS[reportType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{label}</h2>
            <p className="text-xs text-ink-500 mt-0.5">{reportDesc}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {ReportComponent ? <ReportComponent /> : (
            <p className="text-sm text-ink-500">Report type "{reportType}" is not yet available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
