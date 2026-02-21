import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

export default function FLReserves() {
  const { getReserveFundingStatus, calculateRecommendedAnnualReserve, chartOfAccounts, addReserveItem, updateReserveItem, deleteReserveItem } = useFinancialStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', estimatedCost: '', currentFunding: '', usefulLife: '', lastReplaced: '', yearsRemaining: '', isContingency: false });

  const status = getReserveFundingStatus();
  const totalFunded = status.reduce((s, i) => s + i.currentFunding, 0);
  const totalNeeded = status.reduce((s, i) => s + i.estimatedCost, 0);
  const overallPct = totalNeeded > 0 ? Math.round((totalFunded / totalNeeded) * 100) : 0;
  const recommendedAnnual = calculateRecommendedAnnualReserve();
  const nonContingency = status.filter(i => !i.isContingency);
  const urgent = nonContingency.filter(i => i.yearsRemaining < 3).sort((a, b) => a.yearsRemaining - b.yearsRemaining);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="bg-sage-50 border border-sage-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">Reserve Fund Status</h3>
            <p className="text-sm text-ink-400">Total: {fmt(totalFunded)} of {fmt(totalNeeded)} · {overallPct}% funded</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Item</button>
        </div>
        <div className="bg-white rounded-lg p-4">
          <div className="bg-ink-100 rounded-full h-4 mb-2"><div className="bg-sage-500 h-4 rounded-full" style={{ width: `${overallPct}%` }} /></div>
          <div className="flex justify-between text-sm"><span className="text-ink-500">{overallPct}% funded</span><span className="font-semibold text-ink-700">Gap: {fmt(totalNeeded - totalFunded)}</span></div>
        </div>
      </div>

      {/* Recommended annual */}
      <div className="bg-mist-50 border border-mist-200 rounded-xl p-5">
        <h3 className="font-display text-lg font-bold text-ink-900 mb-2">Recommended Annual Contribution</h3>
        <p className="text-3xl font-bold text-ink-900">{fmt(recommendedAnnual)}</p>
        <p className="text-sm text-ink-400 mt-1">{fmt(recommendedAnnual / 12)}/month · Based on remaining useful life and funding gaps</p>
      </div>

      {/* Urgent items */}
      {urgent.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-display text-lg font-bold text-red-800 mb-3">⚠ Approaching Replacement</h3>
          <div className="space-y-2">
            {urgent.map(i => (
              <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100">
                <div><p className="font-semibold text-ink-900">{i.name}</p><p className="text-xs text-ink-400">{i.yearsRemaining} years remaining · Last: {i.lastReplaced}</p></div>
                <div className="text-right"><p className="font-bold text-red-700">{fmt(i.gap)} gap</p><p className="text-xs text-ink-400">Need {fmt(i.annualNeeded)}/yr</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All items */}
      <div className="space-y-3">
        {status.map(i => {
          const glAcct = chartOfAccounts.find(a => a.reserveItem === i.id);
          return (
            <div key={i.id} className="bg-white border border-ink-100 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="font-semibold text-ink-900">
                    {i.name} {i.isContingency && <span className="pill px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 ml-2">Contingency</span>}
                  </h4>
                  <p className="text-xs text-ink-400">{glAcct ? glAcct.num + ' · ' : ''}Life: {i.usefulLife}yr · Last: {i.lastReplaced}{!i.isContingency ? ' · ' + i.yearsRemaining + 'yr remaining' : ''}</p>
                </div>
                <button onClick={() => {
                  setForm({ name: i.name, estimatedCost: String(i.estimatedCost), currentFunding: String(i.currentFunding), usefulLife: String(i.usefulLife), lastReplaced: i.lastReplaced, yearsRemaining: String(i.yearsRemaining), isContingency: i.isContingency });
                  setEditId(i.id);
                }} className="px-3 py-1.5 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 text-xs font-medium">Edit</button>
              </div>
              <div className="flex items-center gap-4 text-sm mb-2">
                <span className="text-ink-500">Funded: {fmt(i.currentFunding)}</span>
                <span className="text-ink-500">Needed: {fmt(i.estimatedCost)}</span>
                <span className={`font-semibold ${i.pct >= 100 ? 'text-sage-600' : 'text-accent-600'}`}>{i.pct}%</span>
              </div>
              <div className="bg-ink-100 rounded-full h-2"><div className={`h-2 rounded-full ${i.pct >= 75 ? 'bg-sage-500' : i.pct >= 50 ? 'bg-yellow-500' : 'bg-accent-500'}`} style={{ width: `${Math.min(i.pct, 100)}%` }} /></div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {(showAdd || editId) && (
        <Modal title={editId ? 'Edit Reserve Item' : 'Add Reserve Item'} onClose={() => { setShowAdd(false); setEditId(null); }} onSave={() => {
          const data = { name: form.name, estimatedCost: parseFloat(form.estimatedCost) || 0, currentFunding: parseFloat(form.currentFunding) || 0, usefulLife: parseFloat(form.usefulLife) || 0, lastReplaced: form.lastReplaced, yearsRemaining: parseFloat(form.yearsRemaining) || 0, isContingency: form.isContingency };
          if (!data.name) { alert('Name required'); return; }
          if (editId) { updateReserveItem(editId, data); } else { addReserveItem(data); }
          setShowAdd(false); setEditId(null);
          setForm({ name: '', estimatedCost: '', currentFunding: '', usefulLife: '', lastReplaced: '', yearsRemaining: '', isContingency: false });
        }} saveLabel={editId ? 'Save' : 'Add Item'} footer={
          editId ? (
            <div className="flex justify-between w-full">
              <button onClick={() => { deleteReserveItem(editId); setEditId(null); }} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium text-sm">Delete</button>
              <div className="flex space-x-3">
                <button onClick={() => { setEditId(null); }} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
                <button onClick={() => {
                  updateReserveItem(editId, { name: form.name, estimatedCost: parseFloat(form.estimatedCost) || 0, currentFunding: parseFloat(form.currentFunding) || 0, usefulLife: parseFloat(form.usefulLife) || 0, lastReplaced: form.lastReplaced, yearsRemaining: parseFloat(form.yearsRemaining) || 0, isContingency: form.isContingency });
                  setEditId(null);
                }} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Save</button>
              </div>
            </div>
          ) : undefined
        }>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Item Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Estimated Cost</label><input type="number" value={form.estimatedCost} onChange={e => setForm({ ...form, estimatedCost: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Current Funding</label><input type="number" value={form.currentFunding} onChange={e => setForm({ ...form, currentFunding: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Useful Life (yrs)</label><input type="number" value={form.usefulLife} onChange={e => setForm({ ...form, usefulLife: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Last Replaced</label><input value={form.lastReplaced} onChange={e => setForm({ ...form, lastReplaced: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Years Remaining</label><input type="number" step="0.1" value={form.yearsRemaining} onChange={e => setForm({ ...form, yearsRemaining: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isContingency} onChange={e => setForm({ ...form, isContingency: e.target.checked })} className="h-4 w-4" /><span className="text-sm text-ink-700">Contingency fund</span></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
