/**
 * FLMoneyOut -- "Money out" tab for v2 Fiscal Lens.
 *
 * - Open bills list
 * - Paid this month
 * - "Pay a bill" button -> PayBillDrawer
 * - "Spending decision" button -> SpendingDrawer
 */

import { useState, useMemo } from 'react';
import { Receipt, Vote, CheckCircle, Clock, FileText } from 'lucide-react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { fmt, formatDate } from '@/lib/formatters';
import { toPeriod } from '@/lib/monthClose';
import PayBillDrawer from '../drawers/PayBillDrawer';
import SpendingDrawer from '../drawers/SpendingDrawer';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-ink-100', text: 'text-ink-600', label: 'Draft' },
  approved: { bg: 'bg-sage-100', text: 'text-sage-700', label: 'Approved' },
  invoiced: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Invoiced' },
  paid: { bg: 'bg-sage-100', text: 'text-sage-700', label: 'Paid' },
};

export default function FLMoneyOut() {
  const store = useFinancialStore();
  const spendingStore = useSpendingStore();
  const [showPayBill, setShowPayBill] = useState(false);
  const [showSpending, setShowSpending] = useState(false);

  const currentPeriod = toPeriod(new Date());

  // Open bills (work orders that aren't paid)
  const openBills = useMemo(() => {
    return store.workOrders.filter(wo => wo.status !== 'paid');
  }, [store.workOrders]);

  // Paid this month
  const paidThisMonth = useMemo(() => {
    return store.workOrders.filter(
      wo => wo.status === 'paid' && wo.paidDate && toPeriod(wo.paidDate) === currentPeriod,
    );
  }, [store.workOrders, currentPeriod]);

  // Total paid this month
  const totalPaidThisMonth = paidThisMonth.reduce((sum, wo) => sum + wo.amount, 0);

  // Expense GL entries this month for summary
  const monthlyExpenses = useMemo(() => {
    return store.generalLedger.filter(
      e => toPeriod(e.date) === currentPeriod && (e.source === 'expense' || e.source === 'case'),
    );
  }, [store.generalLedger, currentPeriod]);
  const totalMonthlyExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Pending spending approvals
  const pendingApprovals = spendingStore.approvals.filter(a => a.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-mist-50 rounded-xl p-4 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Open bills</p>
          <p className="text-2xl font-bold text-ink-900">{openBills.length}</p>
          <p className="text-xs text-ink-400">{fmt(openBills.reduce((s, w) => s + w.amount, 0))} total</p>
        </div>
        <div className="bg-mist-50 rounded-xl p-4 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Paid this month</p>
          <p className="text-2xl font-bold text-sage-700">{paidThisMonth.length}</p>
          <p className="text-xs text-ink-400">{fmt(totalPaidThisMonth)}</p>
        </div>
        <div className="bg-mist-50 rounded-xl p-4 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Month expenses</p>
          <p className="text-2xl font-bold text-ink-900">{fmt(totalMonthlyExpenses)}</p>
          <p className="text-xs text-ink-400">{monthlyExpenses.length} entries</p>
        </div>
        <div className="bg-mist-50 rounded-xl p-4 text-center">
          <p className="text-[10px] text-ink-400 font-medium uppercase">Pending votes</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingApprovals.length}</p>
          <p className="text-xs text-ink-400">{fmt(pendingApprovals.reduce((s, a) => s + a.amount, 0))}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowPayBill(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
        >
          <Receipt size={16} />
          Pay a bill
        </button>
        <button
          onClick={() => setShowSpending(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-ink-200 text-ink-700 rounded-lg text-sm font-medium hover:bg-mist-50 transition-colors"
        >
          <Vote size={16} />
          Spending decision
        </button>
      </div>

      {/* Open bills list */}
      <div>
        <h3 className="text-sm font-semibold text-ink-700 mb-3">Open bills</h3>
        {openBills.length === 0 ? (
          <div className="bg-mist-50 rounded-xl p-8 text-center">
            <CheckCircle size={24} className="mx-auto text-sage-500 mb-2" />
            <p className="text-sm text-ink-400">No open bills. All caught up.</p>
          </div>
        ) : (
          <div className="border border-ink-100 rounded-xl overflow-hidden">
            {openBills.map((wo, i) => {
              const style = STATUS_STYLES[wo.status] || STATUS_STYLES.draft;
              return (
                <div
                  key={wo.id}
                  className={`flex items-center justify-between p-4 ${
                    i !== openBills.length - 1 ? 'border-b border-ink-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-mist-100 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-ink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-800 truncate">{wo.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ink-400">{wo.vendor}</span>
                        {wo.invoiceNum && (
                          <span className="text-xs text-ink-300">#{wo.invoiceNum}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-sm font-bold text-ink-900">{fmt(wo.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paid this month */}
      {paidThisMonth.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-700 mb-3">Paid this month</h3>
          <div className="border border-ink-100 rounded-xl overflow-hidden">
            {paidThisMonth.map((wo, i) => (
              <div
                key={wo.id}
                className={`flex items-center justify-between p-4 bg-sage-50 ${
                  i !== paidThisMonth.length - 1 ? 'border-b border-sage-100' : ''
                }`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-sage-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={16} className="text-sage-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{wo.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-ink-400">{wo.vendor}</span>
                      {wo.paidDate && (
                        <span className="text-xs text-ink-300">Paid {formatDate(wo.paidDate)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-bold text-sage-700 shrink-0">{fmt(wo.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drawers */}
      <PayBillDrawer open={showPayBill} onClose={() => setShowPayBill(false)} />
      <SpendingDrawer open={showSpending} onClose={() => setShowSpending(false)} />
    </div>
  );
}
