import { useState, useMemo } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useCommunicationsStore } from '@/store/useCommunicationsStore';
import { closeChecklist, toPeriod, periodLabel } from '@/lib/monthClose';
import { fmt } from '@/lib/formatters';
import {
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  BookOpen,
  DollarSign,
  Shield,
  Flame,
} from 'lucide-react';
import CloseMonthDrawer from '../CloseMonthDrawer';

export default function FLThisMonth() {
  const store = useFinancialStore();
  const commsStore = useCommunicationsStore();
  const [showCloseDrawer, setShowCloseDrawer] = useState(false);

  const now = new Date();
  const currentPeriod = toPeriod(now);
  const monthName = periodLabel(currentPeriod);

  // Compute close checklist
  const steps = useMemo(() => {
    return closeChecklist(currentPeriod, {
      generalLedger: store.generalLedger,
      units: store.units,
      workOrders: store.workOrders,
      invoices: store.unitInvoices,
      communications: commsStore.communications.map(c => ({
        type: c.source === 'compose' && c.subject?.toLowerCase().includes('statement') ? 'statement' : c.source || '',
        date: c.createdAt,
      })),
      settings: { hoaDueDay: store.hoaDueDay },
    });
  }, [store.generalLedger, store.units, store.workOrders, store.unitInvoices, commsStore.communications, store.hoaDueDay, currentPeriod]);

  const doneCount = steps.filter(s => s.done).length;
  const isFullyClosed = store.periodCloses.some(pc => pc.period === currentPeriod && pc.closedAt);
  const isLocked = store.isMonthLocked(currentPeriod);

  // Operating cash
  const bs = store.getBalanceSheet();
  const operatingCash = bs.assets.operating;

  // KPIs
  const metrics = store.getIncomeMetrics();
  const bv = store.getBudgetVariance();
  const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = bv.reduce((s, b) => s + b.actual, 0);
  const budgetPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const totalReserveFunded = store.reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = store.reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  // Year elapsed percentage
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
  const yearElapsedPct = Math.round(((now.getTime() - startOfYear.getTime()) / (endOfYear.getTime() - startOfYear.getTime())) * 100);

  // Months closed on time (by the 10th)
  const closedOnTime = store.periodCloses.filter(pc => {
    if (!pc.closedAt) return false;
    const closedDay = new Date(pc.closedAt).getDate();
    return closedDay <= 10;
  }).length;

  // Streak calculation
  const streakMonths = (() => {
    let count = 0;
    const sorted = [...store.periodCloses]
      .filter(pc => pc.closedAt)
      .sort((a, b) => b.period.localeCompare(a.period));
    for (const pc of sorted) {
      const closedDay = new Date(pc.closedAt!).getDate();
      if (closedDay <= 10) {
        count++;
      } else {
        break;
      }
    }
    return count;
  })();

  // "Needs a decision" items — spending approvals from work orders
  const pendingApprovals = store.workOrders.filter(wo => wo.status === 'draft');

  return (
    <div className="space-y-6">
      {/* Header line */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-lg font-semibold text-ink-900">
            {monthName} is {doneCount} of 4 steps from closed.{' '}
            <span className="text-ink-500 font-normal">Operating cash {fmt(operatingCash)}.</span>
          </p>
          {isFullyClosed && (
            <p className="text-sm text-emerald-600 mt-1 flex items-center gap-1.5">
              <CheckCircle size={14} />
              {monthName} is closed{isLocked ? ' and locked' : ''}
            </p>
          )}
        </div>
        {!isFullyClosed && doneCount >= 3 && (
          <button
            onClick={() => setShowCloseDrawer(true)}
            className="px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
          >
            Close {monthName}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Close checklist card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-ink-200 rounded-xl overflow-hidden">
            <div className="bg-ink-50 px-5 py-3 border-b border-ink-200">
              <h3 className="text-sm font-semibold text-ink-700">Close Checklist</h3>
            </div>
            <div className="divide-y divide-ink-100">
              {steps.map((step, i) => (
                <div
                  key={step.key}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  {step.done ? (
                    <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                  ) : (
                    <Circle size={18} className="text-ink-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.done ? 'text-ink-900' : 'text-ink-600'}`}>
                      {i + 1}. {step.label}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5 truncate">{step.detail}</p>
                  </div>
                  {!step.done && (
                    <button
                      onClick={() => {
                        // Navigate to the relevant tab for the action
                        if (step.key === 'assessmentsPosted') store.setActiveTab('money_in');
                        else if (step.key === 'paymentsRecorded') store.setActiveTab('money_in');
                        else if (step.key === 'billsPaid') store.setActiveTab('money_out');
                        else if (step.key === 'statementSent') setShowCloseDrawer(true);
                      }}
                      className="text-xs text-brand-teal font-medium hover:underline shrink-0"
                    >
                      Action
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Needs a decision */}
          {pendingApprovals.length > 0 && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-yellow-200">
                <h3 className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Needs a decision ({pendingApprovals.length})
                </h3>
              </div>
              <div className="divide-y divide-yellow-100">
                {pendingApprovals.slice(0, 5).map(wo => (
                  <div key={wo.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{wo.title}</p>
                      <p className="text-xs text-ink-500">{wo.vendor} -- {fmt(wo.amount)}</p>
                    </div>
                    <button
                      onClick={() => store.setActiveTab('money_out')}
                      className="text-xs text-brand-teal font-medium hover:underline flex items-center gap-1"
                    >
                      Review <ArrowRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tell Fiscal Lens what happened */}
          <div className="border border-ink-200 rounded-xl p-5 bg-ink-50">
            <h3 className="text-sm font-semibold text-ink-700 mb-2 flex items-center gap-2">
              <BookOpen size={14} />
              Tell Fiscal Lens what happened
            </h3>
            <p className="text-xs text-ink-500 mb-3">
              Record expenses, transfer funds, or log a manual journal entry to keep the books current.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => store.setActiveTab('books')}
                className="px-3 py-1.5 text-xs font-medium text-ink-600 bg-white border border-ink-200 rounded-lg hover:bg-ink-50 transition-colors"
              >
                Record expense
              </button>
              <button
                onClick={() => store.setActiveTab('books')}
                className="px-3 py-1.5 text-xs font-medium text-ink-600 bg-white border border-ink-200 rounded-lg hover:bg-ink-50 transition-colors"
              >
                Transfer funds
              </button>
              <button
                onClick={() => store.setActiveTab('books')}
                className="px-3 py-1.5 text-xs font-medium text-ink-600 bg-white border border-ink-200 rounded-lg hover:bg-ink-50 transition-colors"
              >
                Journal entry
              </button>
            </div>
          </div>
        </div>

        {/* Right aside: At a glance KPIs + streak */}
        <div className="space-y-4">
          <div className="border border-ink-200 rounded-xl overflow-hidden">
            <div className="bg-ink-50 px-5 py-3 border-b border-ink-200">
              <h3 className="text-sm font-semibold text-ink-700">At a glance</h3>
            </div>
            <div className="divide-y divide-ink-100">
              <KpiRow
                icon={<DollarSign size={14} />}
                label="Collection rate"
                value={`${metrics.collectionRate}%`}
                color={metrics.collectionRate >= 90 ? 'text-emerald-600' : metrics.collectionRate >= 75 ? 'text-yellow-600' : 'text-red-600'}
              />
              <KpiRow
                icon={<TrendingUp size={14} />}
                label="Budget used YTD"
                value={`${budgetPct}%`}
                sub={`${yearElapsedPct}% of year elapsed`}
                color={budgetPct <= yearElapsedPct ? 'text-emerald-600' : budgetPct <= yearElapsedPct * 1.1 ? 'text-yellow-600' : 'text-red-600'}
              />
              <KpiRow
                icon={<Shield size={14} />}
                label="Reserves funded"
                value={`${reservePct}%`}
                color={reservePct >= 70 ? 'text-emerald-600' : reservePct >= 40 ? 'text-yellow-600' : 'text-red-600'}
              />
              <KpiRow
                icon={<Clock size={14} />}
                label="Closed on time"
                value={`${closedOnTime}/12`}
                sub="months"
                color={closedOnTime >= 10 ? 'text-emerald-600' : closedOnTime >= 6 ? 'text-yellow-600' : 'text-ink-500'}
              />
            </div>
          </div>

          {/* Streak */}
          <div className="border border-ink-200 rounded-xl p-4 bg-gradient-to-br from-amber-50 to-orange-50">
            <div className="flex items-center gap-2 mb-2">
              <Flame size={16} className="text-orange-500" />
              <span className="text-sm font-semibold text-ink-800">
                {streakMonths > 0 ? `${streakMonths}-month streak` : 'Start a streak'}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              {isFullyClosed
                ? `${monthName} is closed. Keep it going next month.`
                : `Close ${monthName} by the 10th and you ${streakMonths > 0 ? 'keep the streak' : 'start a streak'}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Close month drawer */}
      <CloseMonthDrawer
        open={showCloseDrawer}
        onClose={() => setShowCloseDrawer(false)}
        period={currentPeriod}
      />
    </div>
  );
}

// ── KPI Row Component ────────────────────────────────────────────────────────

function KpiRow({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-2 text-ink-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-right">
        <span className={`text-sm font-bold ${color}`}>{value}</span>
        {sub && <span className="text-[10px] text-ink-400 ml-1">{sub}</span>}
      </div>
    </div>
  );
}
