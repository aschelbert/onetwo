import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

export default function FLBudget() {
  const store = useFinancialStore();
  const { getBudgetVariance, budgetCategories, addBudgetCategory, updateBudgetCategory, deleteBudgetCategory, getCategorySpent, addExpense, deleteExpense, getOperatingBudget, annualReserveContribution, setAnnualReserveContribution } = store;

  const [showAddCat, setShowAddCat] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', budgeted: '' });
  const [viewCatId, setViewCatId] = useState<string | null>(null);
  const [showAddExp, setShowAddExp] = useState(false);
  const [expForm, setExpForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0], vendor: '', invoice: '' });
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: '', budgeted: '' });
  const [showReserveEdit, setShowReserveEdit] = useState(false);
  const [reserveInput, setReserveInput] = useState(String(annualReserveContribution));

  const bv = getBudgetVariance();
  const totalActual = bv.reduce((s, b) => s + b.actual, 0);
  const ob = getOperatingBudget();
  const allocPct = ob.operatingBudget > 0 ? Math.round((ob.totalAllocated / ob.operatingBudget) * 100) : 0;
  const spentPct = ob.operatingBudget > 0 ? Math.round((totalActual / ob.operatingBudget) * 100) : 0;
  const viewCat = viewCatId ? budgetCategories.find(c => c.id === viewCatId) : null;

  const handleAddCategory = () => {
    const budgeted = parseFloat(catForm.budgeted);
    if (!catForm.name || !budgeted || budgeted <= 0) { alert('Fill all fields'); return; }
    if (ob.totalAllocated + budgeted > ob.operatingBudget) {
      if (!confirm(`Adding ${fmt(budgeted)} will exceed operating budget by ${fmt(ob.totalAllocated + budgeted - ob.operatingBudget)}.\n\nProceed anyway?`)) return;
    }
    addBudgetCategory(catForm.name, budgeted);
    setCatForm({ name: '', budgeted: '' });
    setShowAddCat(false);
  };

  const handleEditCategory = () => {
    if (!editCatId) return;
    const budgeted = parseFloat(editCatForm.budgeted);
    if (!editCatForm.name || !budgeted || budgeted <= 0) { alert('Fill all fields'); return; }
    const oldCat = budgetCategories.find(c => c.id === editCatId);
    const newTotal = ob.totalAllocated - (oldCat?.budgeted || 0) + budgeted;
    if (newTotal > ob.operatingBudget) {
      if (!confirm(`This change will exceed operating budget by ${fmt(newTotal - ob.operatingBudget)}.\n\nProceed anyway?`)) return;
    }
    updateBudgetCategory(editCatId, { name: editCatForm.name, budgeted });
    setEditCatId(null);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    if (!confirm(`Delete category "${name}" and all its expense records?`)) return;
    deleteBudgetCategory(id);
  };

  return (
    <div className="space-y-6">
      {/* Budget Allocation Framework */}
      <div className="bg-white border-2 border-ink-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-4">FY 2026 Budget Allocation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-sage-600 uppercase tracking-wider">Annual Revenue</p>
            <p className="text-xl font-bold text-ink-900 mt-1">{fmt(ob.annualRevenue)}</p>
            <p className="text-[10px] text-ink-400 mt-1">{store.units.length} units × 12 months</p>
          </div>
          <div className="bg-accent-50 border border-accent-200 rounded-xl p-4 cursor-pointer hover:shadow-sm" onClick={() => { setReserveInput(String(annualReserveContribution)); setShowReserveEdit(true); }}>
            <p className="text-[10px] font-semibold text-accent-600 uppercase tracking-wider">Reserve Contribution</p>
            <p className="text-xl font-bold text-accent-700 mt-1">− {fmt(ob.reserveContribution)}</p>
            <p className="text-[10px] text-ink-400 mt-1">Click to edit ✎</p>
          </div>
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Operating Budget</p>
            <p className="text-xl font-bold text-ink-900 mt-1">{fmt(ob.operatingBudget)}</p>
            <p className="text-[10px] text-ink-400 mt-1">Revenue − Reserves</p>
          </div>
          <div className={`rounded-xl p-4 border ${ob.overAllocated ? 'bg-red-50 border-red-300' : ob.unallocated === 0 ? 'bg-sage-50 border-sage-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${ob.overAllocated ? 'text-red-600' : ob.unallocated === 0 ? 'text-sage-600' : 'text-amber-600'}`}>{ob.overAllocated ? 'Over-Allocated' : 'Unallocated'}</p>
            <p className={`text-xl font-bold mt-1 ${ob.overAllocated ? 'text-red-700' : ob.unallocated === 0 ? 'text-sage-700' : 'text-amber-700'}`}>{ob.overAllocated ? `(${fmt(Math.abs(ob.unallocated))})` : fmt(ob.unallocated)}</p>
            <p className="text-[10px] text-ink-400 mt-1">{fmt(ob.totalAllocated)} allocated of {fmt(ob.operatingBudget)}</p>
          </div>
        </div>

        {/* Allocation bar */}
        <div className="bg-ink-100 rounded-full h-4 relative overflow-hidden">
          <div className={`h-4 rounded-l-full transition-all ${spentPct > 100 ? 'bg-red-500' : 'bg-sage-500'}`} style={{ width: `${Math.min(spentPct, 100)}%` }} />
          {allocPct > spentPct && (
            <div className="h-4 transition-all bg-sage-200 absolute top-0" style={{ left: `${Math.min(spentPct, 100)}%`, width: `${Math.min(allocPct - spentPct, 100 - Math.min(spentPct, 100))}%` }} />
          )}
          {allocPct > 100 && <div className="absolute right-0 top-0 h-4 w-1 bg-red-600" />}
        </div>
        <div className="flex justify-between text-[10px] text-ink-400 mt-1.5">
          <span>■ Spent: {fmt(totalActual)} ({spentPct}%)</span>
          <span>□ Allocated: {fmt(ob.totalAllocated)} ({allocPct}%)</span>
          <span>Operating budget: {fmt(ob.operatingBudget)}</span>
        </div>

        {ob.overAllocated && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Budget categories exceed operating budget by {fmt(Math.abs(ob.unallocated))}</p>
              <p className="text-xs text-red-600 mt-0.5">Reduce category budgets or increase revenue/decrease reserve contributions to balance.</p>
            </div>
          </div>
        )}
      </div>

      {/* Category Header + Add */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink-900">Budget Categories ({budgetCategories.length})</h3>
        <button onClick={() => setShowAddCat(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Category</button>
      </div>

      {/* Category cards */}
      <div className="space-y-3">
        {bv.map(b => {
          const statusColor = b.pct > 100 ? 'red' : b.pct > 80 ? 'yellow' : 'sage';
          const statusText = b.pct > 100 ? 'Over Budget' : b.pct > 80 ? 'High Spend' : 'On Track';
          const catPctOfTotal = ob.operatingBudget > 0 ? Math.round((b.budgeted / ob.operatingBudget) * 100) : 0;
          return (
            <div key={b.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className="font-semibold text-ink-900">{b.name}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${statusColor}-100 text-${statusColor}-700`}>{statusText}</span>
                  <span className="text-[10px] text-ink-300 bg-ink-50 px-1.5 py-0.5 rounded">{catPctOfTotal}% of operating budget</span>
                  {b.acctNum && <span className="text-xs text-ink-300 font-mono">{b.acctNum}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditCatId(b.id); setEditCatForm({ name: b.name, budgeted: String(b.budgeted) }); }} className="text-xs text-ink-400 hover:text-ink-600">✎ Edit</button>
                  <button onClick={() => setViewCatId(b.id)} className="text-sm text-accent-600 font-medium hover:text-accent-700">View Expenses →</button>
                  <button onClick={() => handleDeleteCategory(b.id, b.name)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm mb-2">
                <span className="text-ink-500">Budget: <span className="font-semibold">{fmt(b.budgeted)}</span></span>
                <span className="text-ink-500">Actual: <span className="font-semibold">{fmt(b.actual)}</span></span>
                <span className={`font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{b.variance >= 0 ? '+' : ''}{fmt(b.variance)} variance</span>
              </div>
              <div className="bg-ink-100 rounded-full h-2">
                <div className={`h-2 rounded-full bg-${statusColor}-500 transition-all`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Category Modal */}
      {showAddCat && (
        <Modal title="Add Budget Category" onClose={() => setShowAddCat(false)} onSave={handleAddCategory} saveLabel="Add Category">
          <div className="space-y-4">
            <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-500">
              <p>Operating budget: <strong>{fmt(ob.operatingBudget)}</strong> · Allocated: <strong>{fmt(ob.totalAllocated)}</strong> · Available: <strong className={ob.unallocated <= 0 ? 'text-red-600' : 'text-sage-600'}>{fmt(Math.max(0, ob.unallocated))}</strong></p>
            </div>
            <div><label className="block text-sm font-medium text-ink-700 mb-2">Category Name *</label><input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" placeholder="e.g., Security Services" /></div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Annual Budget *</label>
              <input type="number" value={catForm.budgeted} onChange={e => setCatForm({ ...catForm, budgeted: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" placeholder={String(Math.max(0, ob.unallocated))} />
              {catForm.budgeted && parseFloat(catForm.budgeted) > Math.max(0, ob.unallocated) && (
                <p className="text-xs text-amber-600 mt-1">⚠ This would exceed available budget by {fmt(parseFloat(catForm.budgeted) - Math.max(0, ob.unallocated))}</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Category Modal */}
      {editCatId && (
        <Modal title="Edit Budget Category" onClose={() => setEditCatId(null)} onSave={handleEditCategory} saveLabel="Save Changes">
          <div className="space-y-4">
            <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-500">
              <p>Operating budget: <strong>{fmt(ob.operatingBudget)}</strong> · Currently allocated: <strong>{fmt(ob.totalAllocated)}</strong></p>
            </div>
            <div><label className="block text-sm font-medium text-ink-700 mb-2">Category Name *</label><input value={editCatForm.name} onChange={e => setEditCatForm({ ...editCatForm, name: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" /></div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Annual Budget *</label>
              <input type="number" value={editCatForm.budgeted} onChange={e => setEditCatForm({ ...editCatForm, budgeted: e.target.value })} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" />
              {(() => {
                const oldCat = budgetCategories.find(c => c.id === editCatId);
                const newVal = parseFloat(editCatForm.budgeted) || 0;
                const newTotal = ob.totalAllocated - (oldCat?.budgeted || 0) + newVal;
                if (newTotal > ob.operatingBudget) {
                  return <p className="text-xs text-amber-600 mt-1">⚠ Total allocation would exceed operating budget by {fmt(newTotal - ob.operatingBudget)}</p>;
                }
                return null;
              })()}
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Reserve Contribution Modal */}
      {showReserveEdit && (
        <Modal title="Annual Reserve Contribution" onClose={() => setShowReserveEdit(false)} onSave={() => {
          const val = parseFloat(reserveInput);
          if (isNaN(val) || val < 0) { alert('Enter a valid amount'); return; }
          setAnnualReserveContribution(val);
          setShowReserveEdit(false);
        }} saveLabel="Update">
          <div className="space-y-4">
            <div className="bg-accent-50 rounded-lg p-3 text-xs text-accent-700">
              <p>This is the annual amount contributed from assessment revenue into reserve funds. It reduces the operating budget available for expense categories.</p>
              <p className="mt-2">Recommended annual reserve: <strong>{fmt(store.calculateRecommendedAnnualReserve())}</strong> (based on reserve study)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Annual Reserve Contribution *</label>
              <input type="number" value={reserveInput} onChange={e => setReserveInput(e.target.value)} className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg" />
              {(() => {
                const val = parseFloat(reserveInput) || 0;
                const newOp = ob.annualRevenue - val;
                if (ob.totalAllocated > newOp) {
                  return <p className="text-xs text-red-600 mt-1">⚠ This would reduce operating budget to {fmt(newOp)}, which is less than current allocations of {fmt(ob.totalAllocated)}</p>;
                }
                return <p className="text-xs text-ink-400 mt-1">Operating budget would be {fmt(newOp)} ({fmt(newOp - ob.totalAllocated)} unallocated)</p>;
              })()}
            </div>
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
    </div>
  );
}

