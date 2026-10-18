import { useEffect, useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { fmt } from '@/lib/formatters';
import { computeBoardHealth, type HealthInputs } from '@/lib/boardHealth';
import { CheckCircle } from 'lucide-react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import FLDashboard from './tabs/FLDashboard';
import FLChartOfAccounts from './tabs/FLChartOfAccounts';
import FLGeneralLedger from './tabs/FLGeneralLedger';
import FLWorkOrders from './tabs/FLWorkOrders';
import FLBudget from './tabs/FLBudget';
import FLReserves from './tabs/FLReserves';
import FLReports from './tabs/FLReports';
import FLApprovals from './tabs/FLApprovals';
import FLThisMonth from './tabs/FLThisMonth';
import TheUnitsTab from '../building/tabs/TheUnitsTab';
import GLMappingConfig from './tabs/GLMappingConfig';

// ── Legacy tabs (v1) ─────────────────────────────────────────────────────

const LEGACY_TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'units', label: 'Unit Ledger' },
  { id: 'coa', label: 'Chart of Accounts' },
  { id: 'ledger', label: 'General Ledger' },
  { id: 'workorders', label: 'WO & Invoices' },
  { id: 'budget', label: 'Budget' },
  { id: 'reserves', label: 'Reserves' },
  { id: 'approvals', label: 'Spending Decisions' },
  { id: 'reports', label: 'Statements & Tax Forms' },
];

const LEGACY_TAB_COMPONENTS: Record<string, () => any> = {
  dashboard: FLDashboard,
  units: TheUnitsTab,
  coa: FLChartOfAccounts,
  ledger: FLGeneralLedger,
  workorders: FLWorkOrders,
  budget: FLBudget,
  reserves: FLReserves,
  approvals: FLApprovals,
  reports: FLReports,
};

// ── v2 tabs ──────────────────────────────────────────────────────────────

const V2_TABS = [
  { id: 'this_month', label: 'This month' },
  { id: 'money_in', label: 'Money in' },
  { id: 'money_out', label: 'Money out' },
  { id: 'plan', label: 'Plan' },
  { id: 'books', label: 'Books' },
];

type BooksSubTab = 'coa' | 'ledger' | 'statements' | 'gl_mapping';
const BOOKS_SEGMENTS: Array<{ value: BooksSubTab; label: string }> = [
  { value: 'coa', label: 'Chart of Accounts' },
  { value: 'ledger', label: 'General Ledger' },
  { value: 'statements', label: 'Statements' },
  { value: 'gl_mapping', label: 'GL Mapping' },
];

export default function FinancialPage() {
  const store = useFinancialStore();
  const { activeTab, setActiveTab, seedGeneralLedger, generalLedger, getBalanceSheet, getIncomeMetrics, getBudgetVariance, reserveItems } = store;
  const tenant = useTenantContext();
  const isV2 = tenant.features.v2FiscalLens ?? false;

  const [booksSubTab, setBooksSubTab] = useState<BooksSubTab>('coa');

  useEffect(() => {
    if (generalLedger.length === 0) seedGeneralLedger();
  }, []);

  // If v2 is enabled and current tab is not in v2 tabs, reset to this_month
  useEffect(() => {
    if (isV2 && !V2_TABS.some(t => t.id === activeTab)) {
      setActiveTab('this_month');
    }
  }, [isV2]);

  const tabs = isV2 ? V2_TABS : LEGACY_TABS;

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

  // v2 uses computeBoardHealth().financial for the header health score
  const financialHealthInputs: HealthInputs = {
    runbookItems: [],
    completions: {},
    filings: [],
    collectionRate: metrics.collectionRate,
    reservePctFunded: reservePct,
    monthsClosedOnTime: store.periodCloses.filter(pc => {
      if (!pc.closedAt) return false;
      const closedDay = new Date(pc.closedAt).getDate();
      return closedDay <= 10;
    }).length,
    meetings: [],
    proofCoverage: 0,
    documentsCurrentPct: 0,
  };
  const boardHealth = computeBoardHealth(financialHealthInputs);
  const financialScore = boardHealth.financial;

  // Legacy health score (v1)
  const healthScore = isV2
    ? financialScore
    : Math.round((metrics.collectionRate * 0.4) + (Math.min(reservePct, 100) * 0.3) + (Math.max(0, 100 - Math.abs(budgetPct - 50)) * 0.3));
  const hc = healthScore >= 80 ? 'sage' : healthScore >= 60 ? 'yellow' : 'red';

  // Books balance check: assets === liabilities + equity
  const booksInBalance = Math.abs(bs.assets.total - bs.liabilities.total - bs.equity.total) < 0.01;

  // Resolve which component to render for current tab
  function getTabContent() {
    if (!isV2) {
      const Comp = LEGACY_TAB_COMPONENTS[activeTab] || FLDashboard;
      return <Comp />;
    }
    switch (activeTab) {
      case 'this_month':
        return <FLThisMonth />;
      case 'money_in':
        // Renders existing Unit Ledger content until handoff 12
        return <TheUnitsTab />;
      case 'money_out':
        // Renders existing WO & Invoices content until handoff 12
        return <FLWorkOrders />;
      case 'plan':
        // Renders Budget and Reserves stacked until handoff 12
        return (
          <div className="space-y-8">
            <FLBudget />
            <FLReserves />
          </div>
        );
      case 'books':
        return (
          <div>
            <div className="mb-4">
              <SegmentedControl<BooksSubTab>
                options={BOOKS_SEGMENTS}
                value={booksSubTab}
                onChange={setBooksSubTab}
                size="sm"
              />
            </div>
            {booksSubTab === 'coa' && <FLChartOfAccounts />}
            {booksSubTab === 'ledger' && <FLGeneralLedger />}
            {booksSubTab === 'statements' && <FLReports />}
            {booksSubTab === 'gl_mapping' && <GLMappingConfig />}
          </div>
        );
      default:
        return <FLThisMonth />;
    }
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold">Fiscal Lens</h2>
            {isV2 && booksInBalance && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-medium">
                <CheckCircle size={12} />
                Books in balance
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Financial Health', value: `${healthScore}%`, sub: hc === 'sage' ? 'Healthy' : hc === 'yellow' ? 'Fair' : 'At Risk', color: healthScore >= 80 ? 'text-emerald-300' : healthScore >= 60 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab(isV2 ? 'this_month' : 'dashboard') },
            { label: 'Operating Cash', value: fmt(bs.assets.operating), sub: 'Current balance', color: 'text-white', onClick: () => setActiveTab(isV2 ? 'this_month' : 'dashboard') },
            { label: 'Collection Rate', value: `${metrics.collectionRate}%`, sub: fmt(metrics.monthlyExpected) + '/mo', color: metrics.collectionRate >= 90 ? 'text-emerald-300' : metrics.collectionRate >= 75 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab(isV2 ? 'money_in' : 'ledger') },
            { label: 'Budget Used', value: `${budgetPct}%`, sub: 'YTD spend', color: budgetPct <= 75 ? 'text-emerald-300' : budgetPct <= 100 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab(isV2 ? 'plan' : 'budget') },
            { label: 'Reserve Funded', value: `${reservePct}%`, sub: fmt(bs.assets.reserves), color: reservePct >= 70 ? 'text-emerald-300' : reservePct >= 40 ? 'text-yellow-300' : 'text-red-300', onClick: () => setActiveTab(isV2 ? 'plan' : 'reserves') },
            { label: 'Receivables', value: fmt(bs.assets.totalReceivable), sub: bs.assets.totalReceivable === 0 ? 'None' : 'Outstanding', color: bs.assets.totalReceivable === 0 ? 'text-emerald-300' : 'text-red-300', onClick: () => setActiveTab(isV2 ? 'money_in' : 'dashboard') },
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
          {tabs.map((t) => (
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
        {getTabContent()}
      </div>
    </div>
  );
}
