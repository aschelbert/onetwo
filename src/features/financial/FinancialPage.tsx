import { useEffect, useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import FLDashboard from './tabs/FLDashboard';
import FLChartOfAccounts from './tabs/FLChartOfAccounts';
import FLGeneralLedger from './tabs/FLGeneralLedger';
import FLWorkOrders from './tabs/FLWorkOrders';
import FLBudget from './tabs/FLBudget';
import FLReserves from './tabs/FLReserves';
import FLReports from './tabs/FLReports';
import FLApprovals from './tabs/FLApprovals';

const TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'coa', label: 'Chart of Accounts' },
  { id: 'ledger', label: 'General Ledger' },
  { id: 'workorders', label: 'WO & Invoices' },
  { id: 'budget', label: 'Budget' },
  { id: 'reserves', label: 'Reserves' },
  { id: 'approvals', label: 'Spending Decisions' },
  { id: 'reports', label: 'Reports' },
];

const TAB_COMPONENTS: Record<string, () => any> = {
  dashboard: FLDashboard,
  coa: FLChartOfAccounts,
  ledger: FLGeneralLedger,
  workorders: FLWorkOrders,
  budget: FLBudget,
  reserves: FLReserves,
  approvals: FLApprovals,
  reports: FLReports,
};

export default function FinancialPage() {
  const store = useFinancialStore();
  const { activeTab, setActiveTab, seedGeneralLedger, generalLedger, getBalanceSheet, getIncomeMetrics, getBudgetVariance, reserveItems } = store;

  useEffect(() => {
    if (generalLedger.length === 0) seedGeneralLedger();
  }, []);

  const TabContent = TAB_COMPONENTS[activeTab] || FLDashboard;

  // Compute quick KPIs for header
  const bs = getBalanceSheet();
  const metrics = getIncomeMetrics();
  const bv = getBudgetVariance();
  const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = bv.reduce((s, b) => s + b.actual, 0);
  const budgetPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;
  const healthScore = Math.round((metrics.collectionRate * 0.4) + (Math.min(reservePct, 100) * 0.3) + (Math.max(0, 100 - Math.abs(budgetPct - 50)) * 0.3));
  const hc = healthScore >= 80 ? 'sage' : healthScore >= 60 ? 'yellow' : 'red';

  return (
    <div className="space-y-0">
      {/* Header — dark gradient matching dashboard */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <div><h2 className="font-display text-2xl font-bold">💰 Fiscal Lens</h2></div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Financial Health', value: `${healthScore}%`, sub: hc === 'sage' ? 'Healthy' : hc === 'yellow' ? 'Fair' : 'At Risk', color: healthScore >= 80 ? 'text-emerald-300' : healthScore >= 60 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab('dashboard') },
            { label: 'Operating Cash', value: fmt(bs.assets.operating), sub: 'Current balance', color: 'text-white', onClick: () => setActiveTab('dashboard') },
            { label: 'Collection Rate', value: `${metrics.collectionRate}%`, sub: fmt(metrics.monthlyExpected) + '/mo', color: metrics.collectionRate >= 90 ? 'text-emerald-300' : metrics.collectionRate >= 75 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab('ledger') },
            { label: 'Budget Used', value: `${budgetPct}%`, sub: 'YTD spend', color: budgetPct <= 75 ? 'text-emerald-300' : budgetPct <= 100 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab('budget') },
            { label: 'Reserve Funded', value: `${reservePct}%`, sub: fmt(bs.assets.reserve), color: reservePct >= 70 ? 'text-emerald-300' : reservePct >= 40 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab('reserves') },
            { label: 'Receivables', value: fmt(bs.assets.totalReceivable), sub: bs.assets.totalReceivable === 0 ? 'None' : 'Outstanding', color: bs.assets.totalReceivable === 0 ? 'text-emerald-300' : 'text-red-300', onClick: () => setActiveTab('dashboard') },
          ].map(m => (
            <div key={m.label} onClick={m.onClick} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center cursor-pointer hover:bg-opacity-20 transition-colors">
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-accent-100 mt-0.5 leading-tight truncate">{m.sub}</p>
              <p className="text-[10px] text-accent-200 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'border-ink-900 text-ink-900'
                  : 'border-transparent text-ink-400 hover:text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
        <TabContent />
      </div>
    </div>
  );
}
