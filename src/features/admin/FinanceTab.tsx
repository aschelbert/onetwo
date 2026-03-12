import { useState, Fragment } from 'react';
import { usePlatformAdminStore, accountBalance, groupBalance, getBudgetVariance, generatePnL, type PlatformAccount, type PlatformApprovalCategory } from '@/store/usePlatformAdminStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

const SUB_TABS = ['Dashboard', 'Chart of Accounts', 'General Ledger', 'Budget', 'Spending Decisions', 'Balance Sheet', 'Budget Variance', 'P&L Statement'] as const;
type SubTab = typeof SUB_TABS[number];

const CATEGORY_LABELS: Record<PlatformApprovalCategory, string> = {
  engineering: 'Engineering', marketing: 'Marketing', operations: 'Operations',
  legal: 'Legal', infrastructure: 'Infrastructure',
};
const CATEGORY_COLORS: Record<PlatformApprovalCategory, string> = {
  engineering: 'bg-blue-100 text-blue-700', marketing: 'bg-purple-100 text-purple-700',
  operations: 'bg-amber-100 text-amber-700', legal: 'bg-ink-100 text-ink-600',
  infrastructure: 'bg-teal-100 text-teal-700',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-ink-400', normal: 'text-ink-600', high: 'text-amber-600', urgent: 'text-red-600',
};

function fmtDate(d: string) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FinanceTab() {
  const store = usePlatformAdminStore();
  const { platformAccounts, glEntries, platformBudgets, platformApprovals, tenants } = store;
  const [subTab, setSubTab] = useState<SubTab>('Dashboard');
  const [modal, setModal] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['1000', '2000', '3000', '4000', '5000', '6000']));
  const [expandedApproval, setExpandedApproval] = useState<string | null>(null);

  // GL modal form
  const [glForm, setGlForm] = useState({ date: '', memo: '', debitAcct: '', creditAcct: '', amount: '', source: 'manual' });

  // Account modal form
  const [acctForm, setAcctForm] = useState({ num: '', name: '', type: 'expense' as PlatformAccount['type'], subType: '', parentNum: '' });

  // Spending approval form
  const [approvalForm, setApprovalForm] = useState({ title: '', description: '', amount: '', category: 'engineering' as PlatformApprovalCategory, priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent', requestedBy: '' });

  const monthsElapsed = 2; // Jan + Feb 2026

  // Finance calculations
  const revenueAccounts = platformAccounts.filter(a => a.type === 'revenue' && a.subType !== 'header' && a.subType !== 'contra');
  const totalRevenue = revenueAccounts.reduce((s, a) => s + accountBalance(a.num, platformAccounts, glEntries), 0);
  const totalCOGS = groupBalance('5000', platformAccounts, glEntries);
  const totalOpEx = groupBalance('6000', platformAccounts, glEntries);
  const netIncome = totalRevenue - totalCOGS - totalOpEx;
  const cashBalance = accountBalance('1010', platformAccounts, glEntries) + accountBalance('1020', platformAccounts, glEntries);
  const monthlyBurn = monthsElapsed > 0 ? (totalCOGS + totalOpEx) / monthsElapsed : 0;
  const runway = monthlyBurn > 0 ? Math.round(cashBalance / monthlyBurn) : 999;
  const grossMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCOGS) / totalRevenue) * 100) : 0;

  // Health score
  const healthScore = store.getPlatformHealthScore();
  const hc = healthScore >= 80 ? 'sage' : healthScore >= 60 ? 'yellow' : 'red';

  // Balance sheet
  const bs = store.getPlatformBalanceSheet();

  // Budget burn rate for header KPI
  const activeBudgets = platformBudgets.filter(b => b.isActive);
  const totalBudgeted = activeBudgets.reduce((s, b) => s + b.budgeted * monthsElapsed, 0);
  const totalActual = activeBudgets.reduce((s, b) => s + Math.abs(accountBalance(b.acctNum, platformAccounts, glEntries)), 0);
  const budgetBurnPct = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  // Header (parent) accounts
  const headerAccounts = platformAccounts.filter(a => a.parentNum === null && a.subType === 'header').sort((a, b) => a.sortOrder - b.sortOrder);

  const getChildren = (parentNum: string) => platformAccounts.filter(a => a.parentNum === parentNum).sort((a, b) => a.sortOrder - b.sortOrder);

  const toggleGroup = (num: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

  const nonHeaderAccounts = platformAccounts.filter(a => a.subType !== 'header');

  const handleAddGLEntry = () => {
    if (!glForm.date || !glForm.memo || !glForm.debitAcct || !glForm.creditAcct || !glForm.amount) {
      alert('All fields are required'); return;
    }
    if (glForm.debitAcct === glForm.creditAcct) {
      alert('Debit and credit accounts must differ'); return;
    }
    store.addGLEntry({
      date: glForm.date, memo: glForm.memo, debitAcct: glForm.debitAcct,
      creditAcct: glForm.creditAcct, amount: parseFloat(glForm.amount),
      source: glForm.source, ref: null,
    });
    setGlForm({ date: '', memo: '', debitAcct: '', creditAcct: '', amount: '', source: 'manual' });
    setModal(null);
  };

  const handleAddAccount = () => {
    if (!acctForm.num || !acctForm.name || !acctForm.type) {
      alert('Number, name, and type are required'); return;
    }
    store.addPlatformAccount({
      num: acctForm.num, name: acctForm.name, type: acctForm.type,
      subType: acctForm.subType || acctForm.type, parentNum: acctForm.parentNum || null,
      isActive: true, sortOrder: parseInt(acctForm.num) || 0,
    });
    setAcctForm({ num: '', name: '', type: 'expense', subType: '', parentNum: '' });
    setModal(null);
  };

  const handleAddApproval = () => {
    const amount = parseFloat(approvalForm.amount);
    if (!approvalForm.title.trim()) { alert('Title is required'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    if (!approvalForm.requestedBy.trim()) { alert('Requester name is required'); return; }
    store.addPlatformApproval({
      title: approvalForm.title.trim(),
      description: approvalForm.description.trim(),
      amount,
      category: approvalForm.category,
      priority: approvalForm.priority,
      requestedBy: approvalForm.requestedBy.trim(),
    });
    setApprovalForm({ title: '', description: '', amount: '', category: 'engineering', priority: 'normal', requestedBy: '' });
    setModal(null);
  };

  // P&L report
  const pnl = generatePnL('2026-01-01', '2026-12-31', platformAccounts, glEntries);

  return (
    <div className="space-y-0">
      {/* ═══ Fiscal Lens Header ═══ */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Fiscal Lens</h2>
            <p className="text-accent-200 text-sm mt-1">Platform financial management — GL, budgets, spending approvals & reports</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold ${hc === 'sage' ? 'text-green-300' : hc === 'yellow' ? 'text-yellow-300' : 'text-red-300'}`}>{healthScore}%</div>
            <div className="text-accent-200 text-xs">Financial Health</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setSubTab('Dashboard')}>
            <p className="text-[11px] text-accent-100 leading-tight">Cash Position</p>
            <p className="text-sm font-bold text-white mt-1">{fmt(cashBalance)}</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setSubTab('Dashboard')}>
            <p className="text-[11px] text-accent-100 leading-tight">Revenue YTD</p>
            <p className="text-sm font-bold text-white mt-1">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setSubTab('P&L Statement')}>
            <p className="text-[11px] text-accent-100 leading-tight">Net Income</p>
            <p className={`text-sm font-bold mt-1 ${netIncome >= 0 ? 'text-green-300' : 'text-red-300'}`}>{fmt(netIncome)}</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setSubTab('Dashboard')}>
            <p className="text-[11px] text-accent-100 leading-tight">Gross Margin</p>
            <p className={`text-sm font-bold mt-1 ${grossMargin >= 60 ? 'text-green-300' : grossMargin >= 40 ? 'text-yellow-300' : 'text-red-300'}`}>{grossMargin}%</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setSubTab('Dashboard')}>
            <p className="text-[11px] text-accent-100 leading-tight">Runway</p>
            <p className={`text-sm font-bold mt-1 ${runway >= 12 ? 'text-green-300' : runway >= 6 ? 'text-yellow-300' : 'text-red-300'}`}>{runway} mo</p>
          </div>
        </div>
      </div>

      {/* Sub-tab nav */}
      <div className="bg-white border-x border-b border-ink-100 overflow-x-auto">
        <div className="flex min-w-max px-4">
          {SUB_TABS.map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${subTab === t ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="bg-white border-x border-b border-ink-100 rounded-b-xl p-6">

      {/* ═══ Dashboard ═══ */}
      {subTab === 'Dashboard' && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Cash Position', value: fmt(cashBalance), sub: 'Operating + Stripe' },
              { label: 'Revenue YTD', value: fmt(totalRevenue), sub: `${monthsElapsed} months` },
              { label: 'Net Income YTD', value: fmt(netIncome), sub: netIncome >= 0 ? 'Profitable' : 'Net loss', color: netIncome >= 0 ? 'text-sage-600' : 'text-red-600' },
              { label: 'Runway', value: `${runway} mo`, sub: `At ${fmt(monthlyBurn)}/mo burn` },
            ].map(m => (
              <div key={m.label} className="bg-white border border-ink-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-ink-400 uppercase">{m.label}</p>
                <p className={`text-2xl font-bold mt-1 ${(m as { color?: string }).color || 'text-ink-900'}`}>{m.value}</p>
                <p className="text-xs text-ink-400">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Budget Burn Rate Overview */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-ink-900">Budget Burn Rate — YTD</h4>
              <span className={`text-sm font-bold ${budgetBurnPct > 100 ? 'text-red-600' : budgetBurnPct > 85 ? 'text-amber-600' : 'text-sage-600'}`}>
                {budgetBurnPct}% of YTD budget used
              </span>
            </div>
            <div className="h-3 bg-ink-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${budgetBurnPct > 100 ? 'bg-red-500' : budgetBurnPct > 85 ? 'bg-amber-500' : 'bg-sage-500'}`}
                style={{ width: `${Math.min(budgetBurnPct, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-ink-400">
              <span>Spent: {fmt(totalActual)}</span>
              <span>Budget: {fmt(totalBudgeted)}</span>
            </div>
          </div>

          {/* 3-column: Revenue, Expenses, Key Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Breakdown */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-3">Revenue Breakdown</h4>
              <div className="space-y-2">
                {revenueAccounts.map(a => {
                  const bal = accountBalance(a.num, platformAccounts, glEntries);
                  return bal !== 0 ? (
                    <div key={a.num} className="flex items-center justify-between py-1">
                      <span className="text-sm text-ink-600">{a.name}</span>
                      <span className="text-sm font-semibold text-sage-700">{fmt(bal)}</span>
                    </div>
                  ) : null;
                })}
                <div className="border-t border-ink-200 pt-2 mt-2 flex items-center justify-between">
                  <span className="font-bold text-ink-900">Total Revenue</span>
                  <span className="font-bold text-sage-700">{fmt(totalRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Expense Summary */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-3">Expense Summary</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-600">Cost of Goods Sold</span>
                  <span className="text-sm font-semibold text-red-600">{fmt(totalCOGS)}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-600">Operating Expenses</span>
                  <span className="text-sm font-semibold text-red-600">{fmt(totalOpEx)}</span>
                </div>
                <div className="border-t border-ink-200 pt-2 mt-2 flex items-center justify-between">
                  <span className="font-bold text-ink-900">Total Expenses</span>
                  <span className="font-bold text-red-600">{fmt(totalCOGS + totalOpEx)}</span>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-3">Key Metrics</h4>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-ink-400">Gross Margin</p>
                  <p className="text-lg font-bold text-ink-900">{grossMargin}%</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400">Monthly Burn</p>
                  <p className="text-lg font-bold text-ink-900">{fmt(monthlyBurn)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400">COGS %</p>
                  <p className="text-lg font-bold text-ink-900">{totalRevenue > 0 ? Math.round((totalCOGS / totalRevenue) * 100) : 0}%</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400">Active Tenancies</p>
                  <p className="text-lg font-bold text-ink-900">{tenants.filter(t => t.status === 'active').length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Chart of Accounts ═══ */}
      {subTab === 'Chart of Accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-ink-900">Chart of Accounts ({platformAccounts.length} accounts)</h4>
            <button onClick={() => setModal('addAccount')} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium">+ Add Account</button>
          </div>
          <div className="border border-ink-100 rounded-xl overflow-hidden">
            {headerAccounts.map(header => {
              const isExpanded = expandedGroups.has(header.num);
              const children = getChildren(header.num);
              const headerBal = groupBalance(header.num, platformAccounts, glEntries);
              return (
                <Fragment key={header.num}>
                  <div className="flex items-center justify-between px-4 py-3 bg-ink-50 border-b border-ink-100 cursor-pointer hover:bg-ink-100" onClick={() => toggleGroup(header.num)}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-400">{isExpanded ? '▼' : '▶'}</span>
                      <span className="font-mono text-xs text-ink-400">{header.num}</span>
                      <span className="font-bold text-ink-900">{header.name}</span>
                    </div>
                    <span className="font-semibold text-ink-700">{fmt(headerBal)}</span>
                  </div>
                  {isExpanded && children.map(child => {
                    const grandchildren = getChildren(child.num);
                    const childBal = grandchildren.length > 0 ? groupBalance(child.num, platformAccounts, glEntries) : accountBalance(child.num, platformAccounts, glEntries);
                    return (
                      <Fragment key={child.num}>
                        <div className={`flex items-center justify-between px-4 py-2.5 border-b border-ink-50 ${grandchildren.length > 0 ? 'bg-mist-50 pl-8' : 'pl-10'}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-ink-400">{child.num}</span>
                            <span className={`text-sm ${grandchildren.length > 0 ? 'font-semibold text-ink-800' : 'text-ink-700'}`}>{child.name}</span>
                          </div>
                          <span className={`text-sm ${childBal !== 0 ? 'font-semibold text-ink-700' : 'text-ink-300'}`}>{fmt(childBal)}</span>
                        </div>
                        {grandchildren.map(gc => {
                          const gcBal = accountBalance(gc.num, platformAccounts, glEntries);
                          return (
                            <div key={gc.num} className="flex items-center justify-between px-4 py-2 border-b border-ink-50 pl-14">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-ink-400">{gc.num}</span>
                                <span className="text-sm text-ink-600">{gc.name}</span>
                              </div>
                              <span className={`text-sm ${gcBal !== 0 ? 'font-semibold text-ink-600' : 'text-ink-300'}`}>{fmt(gcBal)}</span>
                            </div>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ General Ledger ═══ */}
      {subTab === 'General Ledger' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-ink-900">General Ledger</h4>
            <button onClick={() => setModal('addGL')} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium">+ Journal Entry</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200">
                  <th className="py-3 pr-3 w-24">Date</th>
                  <th className="py-3 pr-3">Memo</th>
                  <th className="py-3 pr-3 w-28">Debit Acct</th>
                  <th className="py-3 pr-3 w-28">Credit Acct</th>
                  <th className="py-3 text-right w-24">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...glEntries].sort((a, b) => b.date.localeCompare(a.date) || b.postedAt.localeCompare(a.postedAt)).slice(0, 40).map(e => {
                  const debitName = platformAccounts.find(a => a.num === e.debitAcct)?.name || e.debitAcct;
                  const creditName = platformAccounts.find(a => a.num === e.creditAcct)?.name || e.creditAcct;
                  return (
                    <tr key={e.id} className="border-b border-ink-50 hover:bg-mist-50">
                      <td className="py-2.5 pr-3 text-xs text-ink-500">{fmtDate(e.date)}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{e.memo}</td>
                      <td className="py-2.5 pr-3 text-xs"><span className="font-mono text-ink-400">{e.debitAcct}</span> <span className="text-ink-500">{debitName}</span></td>
                      <td className="py-2.5 pr-3 text-xs"><span className="font-mono text-ink-400">{e.creditAcct}</span> <span className="text-ink-500">{creditName}</span></td>
                      <td className="py-2.5 text-right font-semibold">{fmt(e.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-400">Showing {Math.min(40, glEntries.length)} of {glEntries.length} entries</p>
        </div>
      )}

      {/* ═══ Budget ═══ */}
      {subTab === 'Budget' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-ink-900">Monthly Budget vs Actuals — FY 2026</h4>
              <p className="text-xs text-ink-400 mt-1">{monthsElapsed} months elapsed (Jan-Feb)</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200">
                  <th className="py-3 pr-3">Category</th>
                  <th className="py-3 pr-3 text-right">Monthly Budget</th>
                  <th className="py-3 pr-3 text-right">Avg/Mo Actual</th>
                  <th className="py-3 pr-3 text-right">YTD Actual</th>
                  <th className="py-3 pr-3 text-right">YTD Budget</th>
                  <th className="py-3 pr-3 text-right">Variance</th>
                  <th className="py-3 w-32">Burn Rate</th>
                </tr>
              </thead>
              <tbody>
                {platformBudgets.filter(b => b.isActive).map(b => {
                  const v = getBudgetVariance(b, monthsElapsed, platformAccounts, glEntries);
                  const barColor = v.status === 'over' ? 'bg-red-500' : v.status === 'warning' ? 'bg-amber-500' : 'bg-sage-500';
                  const varColor = v.variance >= 0 ? 'text-sage-600' : 'text-red-600';
                  return (
                    <tr key={b.id} className="border-b border-ink-50">
                      <td className="py-3 pr-3 font-medium text-ink-700">{v.name}</td>
                      <td className="py-3 pr-3 text-right text-ink-600">{fmt(v.monthlyBudget)}</td>
                      <td className="py-3 pr-3 text-right text-ink-600">{fmt(v.avgMonthly)}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{fmt(v.ytdActual)}</td>
                      <td className="py-3 pr-3 text-right text-ink-500">{fmt(v.ytdBudget)}</td>
                      <td className={`py-3 pr-3 text-right font-semibold ${varColor}`}>
                        {v.variance >= 0 ? '+' : ''}{fmt(v.variance)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(v.burnPct, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-bold w-10 text-right ${v.status === 'over' ? 'text-red-600' : v.status === 'warning' ? 'text-amber-600' : 'text-sage-600'}`}>
                            {v.burnPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Spending Decisions ═══ */}
      {subTab === 'Spending Decisions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-ink-900">Spending Decisions</h4>
              <p className="text-xs text-ink-400 mt-1">
                {platformApprovals.filter(a => a.status === 'pending').length} pending &middot; {fmt(platformApprovals.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0))} total requested
              </p>
            </div>
            <button onClick={() => setModal('addApproval')} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium">+ New Request</button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {(['pending', 'approved', 'denied'] as const).map(status => {
              const items = platformApprovals.filter(a => a.status === status);
              const total = items.reduce((s, a) => s + a.amount, 0);
              const colors = { pending: 'bg-yellow-50 border-yellow-200 text-yellow-700', approved: 'bg-sage-50 border-sage-200 text-sage-700', denied: 'bg-red-50 border-red-200 text-red-700' };
              return (
                <div key={status} className={`border rounded-xl p-4 ${colors[status]}`}>
                  <p className="text-xs font-semibold uppercase">{status}</p>
                  <p className="text-2xl font-bold mt-1">{items.length}</p>
                  <p className="text-xs mt-0.5">{fmt(total)}</p>
                </div>
              );
            })}
          </div>

          {/* Approval list */}
          <div className="space-y-3">
            {platformApprovals.map(a => {
              const isExpanded = expandedApproval === a.id;
              const statusColors = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-sage-100 text-sage-700', denied: 'bg-red-100 text-red-700' };
              return (
                <div key={a.id} className="border border-ink-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-ink-50" onClick={() => setExpandedApproval(isExpanded ? null : a.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-ink-400">{isExpanded ? '▼' : '▶'}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink-900">{a.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${CATEGORY_COLORS[a.category]}`}>{CATEGORY_LABELS[a.category]}</span>
                          <span className={`text-xs font-semibold ${PRIORITY_COLORS[a.priority]}`}>{a.priority}</span>
                        </div>
                        <p className="text-xs text-ink-400 mt-0.5">by {a.requestedBy} &middot; {fmtDate(a.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-lg font-bold text-ink-900">{fmt(a.amount)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[a.status]}`}>{a.status}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-ink-100 bg-ink-50">
                      {a.description && <p className="text-sm text-ink-600 mt-3 mb-3">{a.description}</p>}
                      {/* Votes */}
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-ink-500 uppercase mb-2">Votes ({a.votes.length})</p>
                        {a.votes.length === 0 ? (
                          <p className="text-xs text-ink-400 italic">No votes yet</p>
                        ) : (
                          <div className="space-y-1">
                            {a.votes.map((v, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${v.vote === 'approve' ? 'bg-sage-500' : 'bg-red-500'}`}>
                                  {v.vote === 'approve' ? '✓' : '✗'}
                                </span>
                                <span className="text-ink-700">{v.voter}</span>
                                <span className="text-ink-400 text-xs">{fmtDate(v.date)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      {a.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); store.castPlatformVote(a.id, 'Admin', 'approve'); }}
                            className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-semibold hover:bg-sage-700">Approve</button>
                          <button onClick={(e) => { e.stopPropagation(); store.castPlatformVote(a.id, 'Admin', 'deny'); }}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Deny</button>
                          <button onClick={(e) => { e.stopPropagation(); store.deletePlatformApproval(a.id); }}
                            className="px-3 py-1.5 border border-ink-200 text-ink-500 rounded-lg text-xs font-semibold hover:bg-ink-100 ml-auto">Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {platformApprovals.length === 0 && (
              <div className="text-center py-12 text-ink-400 text-sm">No spending requests yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Balance Sheet ═══ */}
      {subTab === 'Balance Sheet' && (
        <div className="max-w-[700px]">
          <div className="text-center mb-6">
            <h4 className="font-display text-xl font-bold text-ink-900">ONE two GovOps Platform</h4>
            <p className="text-sm text-ink-500">Balance Sheet</p>
            <p className="text-xs text-ink-400 mt-1">As of March 11, 2026</p>
          </div>

          {/* Assets */}
          <div className="mb-4">
            <div className="bg-sage-50 px-4 py-2 rounded-t-lg">
              <h5 className="font-bold text-sage-800 text-sm uppercase">Assets</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Cash & Bank Accounts</span>
                <span className="text-sm font-mono">{fmt(bs.assets.cash)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Accounts Receivable</span>
                <span className="text-sm font-mono">{fmt(bs.assets.receivables)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Prepaid Expenses</span>
                <span className="text-sm font-mono">{fmt(bs.assets.prepaid)}</span>
              </div>
              <div className="flex items-center justify-between py-2 font-bold text-ink-900">
                <span>Total Assets</span>
                <span className="font-mono">{fmt(bs.assets.total)}</span>
              </div>
            </div>
          </div>

          {/* Liabilities */}
          <div className="mb-4">
            <div className="bg-accent-50 px-4 py-2">
              <h5 className="font-bold text-accent-800 text-sm uppercase">Liabilities</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Accounts Payable & Credit Cards</span>
                <span className="text-sm font-mono">{fmt(bs.liabilities.payables)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Accrued Expenses</span>
                <span className="text-sm font-mono">{fmt(bs.liabilities.accrued)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Deferred Revenue</span>
                <span className="text-sm font-mono">{fmt(bs.liabilities.deferred)}</span>
              </div>
              <div className="flex items-center justify-between py-2 font-bold text-ink-900">
                <span>Total Liabilities</span>
                <span className="font-mono">{fmt(bs.liabilities.total)}</span>
              </div>
            </div>
          </div>

          {/* Equity */}
          <div className="mb-4">
            <div className="bg-ink-50 px-4 py-2">
              <h5 className="font-bold text-ink-600 text-sm uppercase">Equity</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Founder Equity</span>
                <span className="text-sm font-mono">{fmt(bs.equity.founder)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-50">
                <span className="text-sm text-ink-600">Retained Earnings</span>
                <span className="text-sm font-mono">{fmt(bs.equity.retained)}</span>
              </div>
              <div className="flex items-center justify-between py-2 font-bold text-ink-900">
                <span>Total Equity</span>
                <span className="font-mono">{fmt(bs.equity.total)}</span>
              </div>
            </div>
          </div>

          {/* Total L+E */}
          <div className="border-x border-b border-ink-100 px-4 rounded-b-lg" style={{ borderTop: '3px double #111827' }}>
            <div className="flex items-center justify-between py-3 text-ink-900">
              <span className="text-lg font-bold">Total Liabilities + Equity</span>
              <span className="text-lg font-bold font-mono">{fmt(bs.liabilities.total + bs.equity.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Budget Variance ═══ */}
      {subTab === 'Budget Variance' && (
        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-ink-900">Budget Variance Report — FY 2026</h4>
            <p className="text-xs text-ink-400 mt-1">{monthsElapsed} months elapsed &middot; Overall burn: {budgetBurnPct}%</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200">
                  <th className="py-3 pr-3">Category</th>
                  <th className="py-3 pr-3 text-right">Monthly Budget</th>
                  <th className="py-3 pr-3 text-right">Avg/Mo Actual</th>
                  <th className="py-3 pr-3 text-right">YTD Actual</th>
                  <th className="py-3 pr-3 text-right">YTD Budget</th>
                  <th className="py-3 pr-3 text-right">Variance ($)</th>
                  <th className="py-3 pr-3 text-right">Variance (%)</th>
                  <th className="py-3 w-32">Burn Rate</th>
                </tr>
              </thead>
              <tbody>
                {platformBudgets.filter(b => b.isActive).map(b => {
                  const v = getBudgetVariance(b, monthsElapsed, platformAccounts, glEntries);
                  const barColor = v.status === 'over' ? 'bg-red-500' : v.status === 'warning' ? 'bg-amber-500' : 'bg-sage-500';
                  const varColor = v.variance >= 0 ? 'text-sage-600' : 'text-red-600';
                  const variancePct = v.ytdBudget > 0 ? Math.round((v.variance / v.ytdBudget) * 100) : 0;
                  return (
                    <tr key={b.id} className={`border-b border-ink-50 ${v.status === 'over' ? 'bg-red-50' : ''}`}>
                      <td className="py-3 pr-3">
                        <span className="font-medium text-ink-700">{v.name}</span>
                        {v.status === 'over' && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">OVER</span>}
                      </td>
                      <td className="py-3 pr-3 text-right text-ink-600">{fmt(v.monthlyBudget)}</td>
                      <td className="py-3 pr-3 text-right text-ink-600">{fmt(v.avgMonthly)}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{fmt(v.ytdActual)}</td>
                      <td className="py-3 pr-3 text-right text-ink-500">{fmt(v.ytdBudget)}</td>
                      <td className={`py-3 pr-3 text-right font-semibold ${varColor}`}>
                        {v.variance >= 0 ? '+' : ''}{fmt(v.variance)}
                      </td>
                      <td className={`py-3 pr-3 text-right font-semibold ${varColor}`}>
                        {variancePct >= 0 ? '+' : ''}{variancePct}%
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(v.burnPct, 100)}%` }} />
                          </div>
                          <span className={`text-xs font-bold w-10 text-right ${v.status === 'over' ? 'text-red-600' : v.status === 'warning' ? 'text-amber-600' : 'text-sage-600'}`}>
                            {v.burnPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 font-bold">
                  <td className="py-3 pr-3 text-ink-900">Total</td>
                  <td className="py-3 pr-3 text-right text-ink-600">{fmt(activeBudgets.reduce((s, b) => s + b.budgeted, 0))}</td>
                  <td className="py-3 pr-3 text-right text-ink-600">{fmt(monthsElapsed > 0 ? totalActual / monthsElapsed : 0)}</td>
                  <td className="py-3 pr-3 text-right">{fmt(totalActual)}</td>
                  <td className="py-3 pr-3 text-right text-ink-500">{fmt(totalBudgeted)}</td>
                  <td className={`py-3 pr-3 text-right ${totalBudgeted - totalActual >= 0 ? 'text-sage-600' : 'text-red-600'}`}>
                    {totalBudgeted - totalActual >= 0 ? '+' : ''}{fmt(totalBudgeted - totalActual)}
                  </td>
                  <td className="py-3 pr-3"></td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${budgetBurnPct > 100 ? 'bg-red-500' : budgetBurnPct > 85 ? 'bg-amber-500' : 'bg-sage-500'}`}
                          style={{ width: `${Math.min(budgetBurnPct, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right ${budgetBurnPct > 100 ? 'text-red-600' : budgetBurnPct > 85 ? 'text-amber-600' : 'text-sage-600'}`}>
                        {budgetBurnPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ═══ P&L Statement ═══ */}
      {subTab === 'P&L Statement' && (
        <div className="max-w-[700px]">
          <div className="text-center mb-6">
            <h4 className="font-display text-xl font-bold text-ink-900">ONE two GovOps Platform</h4>
            <p className="text-sm text-ink-500">Income Statement</p>
            <p className="text-xs text-ink-400 mt-1">January 1 — March 11, 2026</p>
          </div>

          {/* Revenue */}
          <div className="mb-4">
            <div className="bg-sage-50 px-4 py-2 rounded-t-lg">
              <h5 className="font-bold text-sage-800 text-sm uppercase">Revenue</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              {pnl.revenue.map(r => (
                <div key={r.num} className="flex items-center justify-between py-2 border-b border-ink-50">
                  <span className="text-sm text-ink-600">{r.name}</span>
                  <span className="text-sm font-mono">{fmt(r.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 font-bold text-ink-900">
                <span>Total Revenue</span>
                <span className="font-mono">{fmt(pnl.totalRevenue)}</span>
              </div>
            </div>
          </div>

          {/* COGS */}
          <div className="mb-4">
            <div className="bg-accent-50 px-4 py-2">
              <h5 className="font-bold text-accent-800 text-sm uppercase">Cost of Goods Sold</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              {pnl.cogs.map(r => (
                <div key={r.num} className="flex items-center justify-between py-2 border-b border-ink-50">
                  <span className="text-sm text-ink-600">{r.name}</span>
                  <span className="text-sm font-mono">({fmt(r.amount)})</span>
                </div>
              ))}
              <div className={`flex items-center justify-between py-2 font-bold ${pnl.grossProfit >= 0 ? 'text-sage-700' : 'text-red-700'}`}>
                <span>Gross Profit</span>
                <span className="font-mono">{fmt(pnl.grossProfit)}</span>
              </div>
            </div>
          </div>

          {/* Operating Expenses */}
          <div className="mb-4">
            <div className="bg-ink-50 px-4 py-2">
              <h5 className="font-bold text-ink-600 text-sm uppercase">Operating Expenses</h5>
            </div>
            <div className="border-x border-ink-100 px-4">
              {pnl.opex.map(r => (
                <div key={r.num} className="flex items-center justify-between py-2 border-b border-ink-50">
                  <span className="text-sm text-ink-600">{r.name}</span>
                  <span className="text-sm font-mono">({fmt(r.amount)})</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 font-bold text-ink-900">
                <span>Total Operating Expenses</span>
                <span className="font-mono">({fmt(pnl.totalOpEx)})</span>
              </div>
            </div>
          </div>

          {/* Net Income */}
          <div className="border-x border-b border-ink-100 px-4 rounded-b-lg" style={{ borderTop: '3px double #111827' }}>
            <div className={`flex items-center justify-between py-3 ${pnl.netIncome >= 0 ? 'text-sage-700' : 'text-red-700'}`}>
              <span className="text-lg font-bold">Net Income</span>
              <span className="text-lg font-bold font-mono">{fmt(pnl.netIncome)}</span>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* ═══ Modals ═══ */}
      {modal === 'addGL' && (
        <Modal title="Journal Entry" subtitle="Record a new double-entry transaction" onClose={() => setModal(null)} onSave={handleAddGLEntry} saveLabel="Post Entry">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Date *</label>
                <input type="date" value={glForm.date} onChange={e => setGlForm({ ...glForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
                <input type="number" step="0.01" value={glForm.amount} onChange={e => setGlForm({ ...glForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Memo *</label>
              <input value={glForm.memo} onChange={e => setGlForm({ ...glForm, memo: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Description of the transaction" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Debit Account *</label>
                <select value={glForm.debitAcct} onChange={e => setGlForm({ ...glForm, debitAcct: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="">Select...</option>
                  {nonHeaderAccounts.map(a => <option key={a.num} value={a.num}>{a.num} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Credit Account *</label>
                <select value={glForm.creditAcct} onChange={e => setGlForm({ ...glForm, creditAcct: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="">Select...</option>
                  {nonHeaderAccounts.map(a => <option key={a.num} value={a.num}>{a.num} — {a.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Source</label>
              <select value={glForm.source} onChange={e => setGlForm({ ...glForm, source: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                <option value="manual">Manual</option>
                <option value="stripe">Stripe</option>
                <option value="payroll">Payroll</option>
                <option value="expense">Expense</option>
                <option value="payout">Payout</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'addAccount' && (
        <Modal title="Add Account" subtitle="Add a new account to the chart of accounts" onClose={() => setModal(null)} onSave={handleAddAccount} saveLabel="Create Account">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Account Number *</label>
                <input value={acctForm.num} onChange={e => setAcctForm({ ...acctForm, num: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g. 6110" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Type *</label>
                <select value={acctForm.type} onChange={e => setAcctForm({ ...acctForm, type: e.target.value as PlatformAccount['type'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Name *</label>
              <input value={acctForm.name} onChange={e => setAcctForm({ ...acctForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Account name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Sub-type</label>
                <input value={acctForm.subType} onChange={e => setAcctForm({ ...acctForm, subType: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g. opex, bank" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Parent Account</label>
                <select value={acctForm.parentNum} onChange={e => setAcctForm({ ...acctForm, parentNum: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="">None (top-level)</option>
                  {platformAccounts.filter(a => a.subType === 'header' || getChildren(a.num).length > 0).map(a =>
                    <option key={a.num} value={a.num}>{a.num} — {a.name}</option>
                  )}
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'addApproval' && (
        <Modal title="New Spending Request" subtitle="Submit a spending request for team approval" onClose={() => setModal(null)} onSave={handleAddApproval} saveLabel="Submit Request">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Title *</label>
              <input value={approvalForm.title} onChange={e => setApprovalForm({ ...approvalForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g. Upgrade cloud hosting" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Description</label>
              <textarea value={approvalForm.description} onChange={e => setApprovalForm({ ...approvalForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Why is this needed? What's the expected impact?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
                <input type="number" step="0.01" value={approvalForm.amount} onChange={e => setApprovalForm({ ...approvalForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Requested By *</label>
                <input value={approvalForm.requestedBy} onChange={e => setApprovalForm({ ...approvalForm, requestedBy: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Your name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Category</label>
                <select value={approvalForm.category} onChange={e => setApprovalForm({ ...approvalForm, category: e.target.value as PlatformApprovalCategory })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="engineering">Engineering</option>
                  <option value="marketing">Marketing</option>
                  <option value="operations">Operations</option>
                  <option value="legal">Legal</option>
                  <option value="infrastructure">Infrastructure</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Priority</label>
                <select value={approvalForm.priority} onChange={e => setApprovalForm({ ...approvalForm, priority: e.target.value as 'low' | 'normal' | 'high' | 'urgent' })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
