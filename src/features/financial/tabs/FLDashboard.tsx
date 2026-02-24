import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

export default function FLDashboard() {
  const store = useFinancialStore();
  const {
    getBalanceSheet, getIncomeStatement, getIncomeMetrics,
    getBudgetVariance, getDelinquencyAging, reserveItems, setActiveTab,
    units, recordUnitPayment, imposeLateFee, waiveLateFee,
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

  // Unit ledger modals
  const [viewUnitNum, setViewUnitNum] = useState<string | null>(null);
  const [payUnit, setPayUnit] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [feeUnit, setFeeUnit] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState('25');
  const [feeReason, setFeeReason] = useState('Late payment');

  return (
    <div className="space-y-6">
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

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { tab: 'coa', label: 'Chart of Accounts', icon: '📊' },
          { tab: 'ledger', label: 'General Ledger', icon: '📒' },
          { tab: 'workorders', label: 'WO & Invoices', icon: '📋' },
          { tab: 'reports', label: 'Financial Reports', icon: '📈' },
        ].map(({ tab, label, icon }) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className="bg-white border border-ink-100 rounded-xl p-4 text-left hover:shadow-md hover:border-ink-300 transition-all group">
            <span className="text-2xl">{icon}</span>
            <p className="text-sm font-semibold text-ink-700 mt-2 group-hover:text-accent-600">{label}</p>
          </button>
        ))}
      </div>

      {/* Income & Collections */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Income & Collections</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Monthly Expected</p><p className="text-xl font-bold text-ink-900">{fmt(metrics.monthlyExpected)}</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Collection Rate</p><p className="text-xl font-bold text-sage-700">{metrics.collectionRate}%</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Outstanding</p><p className="text-xl font-bold text-accent-600">{fmt(metrics.totalOutstanding)}</p></div>
        </div>
      </div>

      {/* Unit Ledger */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Unit Ledger</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100">
              <th className="py-2 pr-2">Unit</th><th className="py-2 pr-2">Owner</th><th className="py-2 pr-2 text-right">Monthly</th><th className="py-2 pr-2 text-right">Balance</th><th className="py-2 pr-2">Status</th><th className="py-2 pr-2 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {units.map(u => {
                const unpaidFees = u.lateFees.filter(f => !f.waived);
                return (
                  <tr key={u.number} className={`border-b border-ink-50 hover:bg-mist-50 ${u.balance > 0 ? 'bg-red-50' : ''}`}>
                    <td className="py-2 pr-2 font-semibold cursor-pointer text-accent-600 hover:text-accent-700" onClick={() => setViewUnitNum(u.number)}>{u.number}</td>
                    <td className="py-2 pr-2 text-ink-700">{u.owner}</td>
                    <td className="py-2 pr-2 text-right">{fmt(u.monthlyFee)}</td>
                    <td className={`py-2 pr-2 text-right font-semibold ${u.balance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{u.balance > 0 ? fmt(u.balance) : '$0'}</td>
                    <td className="py-2">
                      <span className={`pill px-2 py-0.5 rounded ${u.balance > 0 ? 'bg-red-100 text-red-700' : u.status === 'VACANT' ? 'bg-ink-100 text-ink-500' : 'bg-sage-100 text-sage-700'}`}>
                        {u.balance > 0 ? 'Delinquent' : u.status}
                      </span>
                      {unpaidFees.length > 0 && <span className="ml-1 text-xs text-red-500">+{unpaidFees.length} fee{unpaidFees.length > 1 ? 's' : ''}</span>}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <div className="flex justify-end gap-1">
                        {u.balance > 0 && <button onClick={() => { setPayUnit(u.number); setPayAmount(String(u.balance)); }} className="px-2 py-0.5 bg-sage-600 text-white rounded text-xs hover:bg-sage-700">Pay</button>}
                        <button onClick={() => { setFeeUnit(u.number); setFeeAmount('25'); setFeeReason('Late payment'); }} className="px-2 py-0.5 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600">Fee</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unit Detail Modal */}
      {viewUnitNum && (() => {
        const u = units.find(x => x.number === viewUnitNum);
        if (!u) return null;
        const unpaidFees = u.lateFees.filter(f => !f.waived);
        return (
          <Modal title={`Unit ${u.number} — ${u.owner}`} subtitle={`${fmt(u.monthlyFee)}/mo · ${u.sqft} sqft · ${u.bedrooms}BR`} onClose={() => setViewUnitNum(null)} wide>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400">Balance</p><p className={`text-xl font-bold ${u.balance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{u.balance > 0 ? fmt(u.balance) : '$0'}</p></div>
                <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400">Late Fees</p><p className="text-xl font-bold text-yellow-600">{fmt(unpaidFees.reduce((s, f) => s + f.amount, 0))}</p></div>
                <div className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400">Paid YTD</p><p className="text-xl font-bold text-sage-600">{fmt(u.payments.reduce((s, p) => s + p.amount, 0))}</p></div>
              </div>
              <div className="flex gap-2">
                {u.balance > 0 && <button onClick={() => { setViewUnitNum(null); setPayUnit(u.number); setPayAmount(String(u.balance)); }} className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium">Record Payment</button>}
                <button onClick={() => { setViewUnitNum(null); setFeeUnit(u.number); setFeeAmount('25'); setFeeReason('Late payment'); }} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium">Impose Late Fee</button>
              </div>
              {unpaidFees.length > 0 && (
                <div>
                  <p className="text-xs text-red-500 font-semibold uppercase mb-2">Outstanding Late Fees</p>
                  {unpaidFees.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-red-50 border border-red-100 rounded-lg mb-1">
                      <div><span className="text-xs text-ink-700">{f.date}</span> <span className="text-xs text-ink-400 ml-2">{f.reason}</span></div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-red-600">{fmt(f.amount)}</span>
                        <button onClick={() => { waiveLateFee(u.number, i); }} className="text-xs text-accent-600 hover:text-accent-700">Waive</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {u.payments.length > 0 && (
                <div>
                  <p className="text-xs text-ink-400 font-semibold uppercase mb-2">Payment History</p>
                  {u.payments.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-white border border-ink-50 rounded-lg mb-1">
                      <div><span className="text-xs text-ink-700">{p.date}</span> <span className="text-xs text-ink-400 ml-2">{p.method} {p.note}</span></div>
                      <span className="text-sm font-semibold text-sage-600">{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* Record Payment Modal */}
      {payUnit && (
        <Modal title={`Record Payment — Unit ${payUnit}`} onClose={() => setPayUnit(null)} onSave={() => {
          const amt = parseFloat(payAmount);
          if (!amt || amt <= 0) { alert('Enter a valid amount'); return; }
          recordUnitPayment(payUnit, amt, 'check');
          setPayUnit(null);
        }} saveLabel="Record Payment">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Amount *</label><input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}

      {/* Impose Late Fee Modal */}
      {feeUnit && (
        <Modal title={`Impose Late Fee — Unit ${feeUnit}`} onClose={() => setFeeUnit(null)} onSave={() => {
          const amt = parseFloat(feeAmount);
          if (!amt || amt <= 0) { alert('Enter a valid amount'); return; }
          imposeLateFee(feeUnit, amt, feeReason);
          setFeeUnit(null);
        }} saveLabel="Impose Fee">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Fee Amount *</label><input type="number" step="0.01" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Reason</label><input value={feeReason} onChange={e => setFeeReason(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

