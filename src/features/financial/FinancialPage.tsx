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

const TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'coa', label: 'Chart of Accounts' },
  { id: 'ledger', label: 'General Ledger' },
  { id: 'workorders', label: 'WO & Invoices' },
  { id: 'budget', label: 'Budget' },
  { id: 'reserves', label: 'Reserves' },
  { id: 'reports', label: 'Reports' },
];

const TAB_COMPONENTS: Record<string, () => any> = {
  dashboard: FLDashboard,
  coa: FLChartOfAccounts,
  ledger: FLGeneralLedger,
  workorders: FLWorkOrders,
  budget: FLBudget,
  reserves: FLReserves,
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
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">💰 Fiscal Lens</h2>
            <p className="text-accent-200 text-sm mt-1">Double-entry general ledger, chart of accounts, budgets, reserves & reports</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white">{healthScore}%</div>
            <div className="text-accent-200 text-xs">Financial Health</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setActiveTab('dashboard')}>
            <p className="text-xs text-accent-200">Operating Cash</p>
            <p className="text-lg font-bold text-white">{fmt(bs.assets.operating)}</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setActiveTab('ledger')}>
            <p className="text-xs text-accent-200">Collection Rate</p>
            <p className={`text-lg font-bold ${metrics.collectionRate >= 90 ? 'text-green-300' : metrics.collectionRate >= 75 ? 'text-yellow-300' : 'text-red-300'}`}>{metrics.collectionRate}%</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setActiveTab('budget')}>
            <p className="text-xs text-accent-200">Budget Used</p>
            <p className={`text-lg font-bold ${budgetPct <= 75 ? 'text-green-300' : budgetPct <= 100 ? 'text-yellow-300' : 'text-red-300'}`}>{budgetPct}%</p>
            <div className="mt-1 h-1.5 bg-white bg-opacity-20 rounded-full overflow-hidden"><div className={`h-full rounded-full ${budgetPct <= 75 ? 'bg-green-400' : budgetPct <= 100 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} /></div>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setActiveTab('reserves')}>
            <p className="text-xs text-accent-200">Reserve Funded</p>
            <p className={`text-lg font-bold ${reservePct >= 70 ? 'text-green-300' : reservePct >= 40 ? 'text-yellow-300' : 'text-red-300'}`}>{reservePct}%</p>
            <div className="mt-1 h-1.5 bg-white bg-opacity-20 rounded-full overflow-hidden"><div className={`h-full rounded-full ${reservePct >= 70 ? 'bg-green-400' : reservePct >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(reservePct, 100)}%` }} /></div>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 cursor-pointer hover:bg-opacity-20" onClick={() => setActiveTab('dashboard')}>
            <p className="text-xs text-accent-200">Receivables</p>
            <p className={`text-lg font-bold ${bs.assets.totalReceivable === 0 ? 'text-green-300' : 'text-red-300'}`}>{fmt(bs.assets.totalReceivable)}</p>
          </div>
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
