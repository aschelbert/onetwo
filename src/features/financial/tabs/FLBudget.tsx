import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

export default function FLBudget() {
  const { getBudgetVariance, getIncomeMetrics, units, budgetCategories, addBudgetCategory, getCategorySpent, addExpense, deleteExpense, recordUnitPayment, imposeLateFee, waiveLateFee } = useFinancialStore();
  const [showAddCat, setShowAddCat] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', budgeted: '' });
  const [viewCatId, setViewCatId] = useState<string | null>(null);
  const [showAddExp, setShowAddExp] = useState(false);
  const [expForm, setExpForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0], vendor: '', invoice: '' });

  // Unit management state
  const [viewUnitNum, setViewUnitNum] = useState<string | null>(null);
  const [payUnit, setPayUnit] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [feeUnit, setFeeUnit] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState('25');
  const [feeReason, setFeeReason] = useState('Late payment');

  const bv = getBudgetVariance();
  const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
  const totalActual = bv.reduce((s, b) => s + b.actual, 0);
  const overallPct = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;
  const metrics = getIncomeMetrics();
  const viewCat = viewCatId ? budgetCategories.find(c => c.id === viewCatId) : null;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">Budget Overview — FY 2026</h3>
            <p className="text-sm text-ink-400">GL-powered actuals vs. annual budget</p>
          </div>
          <button onClick={() => setShowAddCat(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Category</button>
        </div>
        <div className="bg-white rounded-lg p-4 mb-3">
          <div className="flex justify-between text-sm mb-2"><span className="text-ink-500">Total Spent</span><span className="font-bold">{fmt(totalActual)} / {fmt(totalBudgeted)}</span></div>
          <div className="bg-ink-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${overallPct > 100 ? 'bg-red-500' : overallPct > 80 ? 'bg-yellow-500' : 'bg-sage-500'}`} style={{ width: `${Math.min(overallPct, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-ink-400 mt-2">
            <span>{overallPct}% consumed</span>
            <span>{fmt(totalBudgeted - totalActual)} {totalBudgeted - totalActual >= 0 ? 'remaining' : 'over budget'}</span>
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div className="space-y-3">
        {bv.map(b => {
          const statusColor = b.pct > 100 ? 'red' : b.pct > 80 ? 'yellow' : 'sage';
          const statusText = b.pct > 100 ? 'Over Budget' : b.pct > 80 ? 'High Spend' : 'On Track';
          return (
            <div key={b.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-ink-900">{b.name}</h4>
                  <span className={`pill px-2 py-0.5 rounded bg-${statusColor}-100 text-${statusColor}-700`}>{statusText}</span>
                  {b.acctNum && <span className="text-xs text-ink-300 font-mono">{b.acctNum}</span>}
                </div>
                <button onClick={() => setViewCatId(b.id)} className="text-sm text-accent-600 font-medium hover:text-accent-700">View Expenses →</button>
              </div>
              <div className="flex items-center gap-4 text-sm mb-2">
                <span className="text-ink-500">Budget: {fmt(b.budgeted)}</span>
                <span className="text-ink-500">Actual: {fmt(b.actual)}</span>
                <span className={`font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{b.variance >= 0 ? '+' : ''}{fmt(b.variance)} variance</span>
              </div>
              <div className="bg-ink-100 rounded-full h-2">
                <div className={`h-2 rounded-full bg-${statusColor}-500 transition-all`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Income section */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Income & Collections</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Monthly Expected</p><p className="text-xl font-bold text-ink-900">{fmt(metrics.monthlyExpected)}</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Collection Rate</p><p className="text-xl font-bold text-sage-700">{metrics.collectionRate}%</p></div>
          <div className="bg-white rounded-lg p-3"><p className="text-xs text-ink-400">Outstanding</p><p className="text-xl font-bold text-accent-600">{fmt(metrics.totalOutstanding)}</p></div>
        </div>
      </div>

      {/* Unit Ledger (interactive) */}
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

      {/* Add Category Modal */}
      {showAddCat && (
        <Modal title="Add Budget Category" onClose={() => setShowAddCat(false)} onSave={() => {
          const budgeted = parseFloat(catForm.budgeted);
          if (!catForm.name || !budgeted || budgeted <= 0) { alert('Fill all fields'); return; }
          addBudgetCategory(catForm.name, budgeted);
          setCatForm({ name: '', budgeted: '' });
          setShowAddCat(false);
        }} saveLabel="Add Category">
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-2">Category Name *</label><input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" placeholder="e.g., Security Services" /></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-2">Annual Budget *</label><input type="number" value={catForm.budgeted} onChange={e => setCatForm({ ...catForm, budgeted: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" placeholder="5000" /></div>
          </div>
        </Modal>
      )}

      {/* View Category Expenses Modal */}
      {viewCat && (
        <Modal title={viewCat.name} subtitle={`Budget: ${fmt(viewCat.budgeted)} · Spent: ${fmt(getCategorySpent(viewCat))}`} onClose={() => { setViewCatId(null); setShowAddExp(false); }} wide>
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="bg-accent-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <div><p className="text-sm text-ink-500">Spent</p><p className="text-2xl font-bold text-ink-900">{fmt(getCategorySpent(viewCat))}</p></div>
                <div className="text-right"><p className="text-sm text-ink-500">Remaining</p><p className={`text-2xl font-bold ${viewCat.budgeted - getCategorySpent(viewCat) >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{fmt(viewCat.budgeted - getCategorySpent(viewCat))}</p></div>
              </div>
              <div className="bg-ink-100 rounded-full h-3">
                <div className={`h-3 rounded-full ${Math.round((getCategorySpent(viewCat) / viewCat.budgeted) * 100) > 100 ? 'bg-red-500' : 'bg-sage-500'}`} style={{ width: `${Math.min(Math.round((getCategorySpent(viewCat) / viewCat.budgeted) * 100), 100)}%` }} />
              </div>
            </div>

            <div className="flex justify-between items-center">
              <h3 className="font-display text-lg font-bold text-ink-900">Expenses ({viewCat.expenses.length})</h3>
              <button onClick={() => setShowAddExp(true)} className="px-4 py-2 bg-sage-600 text-white rounded-lg hover:bg-sage-700 font-medium text-sm">+ Add Expense</button>
            </div>

            {showAddExp && (
              <div className="bg-mist-50 rounded-lg p-4 space-y-3 border border-mist-200">
                <div><input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Description" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" step="0.01" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Amount" />
                  <input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={expForm.vendor} onChange={e => setExpForm({ ...expForm, vendor: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Vendor" />
                  <input value={expForm.invoice} onChange={e => setExpForm({ ...expForm, invoice: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Invoice #" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const amt = parseFloat(expForm.amount);
                    if (!expForm.description || !amt || !expForm.vendor || !expForm.invoice) { alert('All fields required'); return; }
                    addExpense(viewCat.id, { description: expForm.description, amount: amt, date: expForm.date, vendor: expForm.vendor, invoice: expForm.invoice });
                    setExpForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0], vendor: '', invoice: '' });
                    setShowAddExp(false);
                  }} className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium">Add</button>
                  <button onClick={() => setShowAddExp(false)} className="px-4 py-2 text-ink-500 text-sm">Cancel</button>
                </div>
              </div>
            )}

            {viewCat.expenses.length === 0 ? (
              <div className="text-center py-12 bg-mist-50 rounded-lg"><p className="text-ink-400">No expenses yet</p></div>
            ) : (
              <div className="space-y-2">
                {viewCat.expenses.map(exp => (
                  <div key={exp.id} className="bg-white border border-ink-100 rounded-lg p-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-sm text-ink-400">{exp.date}</span>
                          <span className="px-2 py-1 bg-accent-100 text-accent-700 text-xs rounded">{exp.invoice}</span>
                        </div>
                        <h4 className="font-bold text-ink-900 mb-1">{exp.description}</h4>
                        <p className="text-sm text-ink-500">Vendor: {exp.vendor}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-2xl font-bold text-ink-900">{fmt(exp.amount)}</p>
                        <button onClick={() => { if (confirm('Delete this expense?')) deleteExpense(viewCat.id, exp.id); }} className="mt-2 text-xs text-red-600 hover:text-red-800">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

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
