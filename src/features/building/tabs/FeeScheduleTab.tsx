import { useState, useMemo } from 'react';
import { useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import type { FeeScheduleItem } from '@/store/useFeeScheduleStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

const CATEGORIES: { key: FeeScheduleItem['category']; label: string }[] = [
  { key: 'assessment', label: 'Assessment' },
  { key: 'administrative', label: 'Administrative' },
  { key: 'violation', label: 'Violation' },
  { key: 'move', label: 'Move' },
  { key: 'amenity', label: 'Amenity' },
  { key: 'legal', label: 'Legal' },
];

const FREQUENCIES: { key: FeeScheduleItem['frequency']; label: string }[] = [
  { key: 'one-time', label: 'One-time' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'per-occurrence', label: 'Per occurrence' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];

function formatAmount(fee: FeeScheduleItem): string {
  if (fee.amountType === 'percentage') return `${fee.amount}%`;
  if (fee.amount === 0) return 'Variable';
  return fmt(fee.amount);
}

function freqLabel(freq: string): string {
  return FREQUENCIES.find(f => f.key === freq)?.label || freq;
}

export default function FeeScheduleTab() {
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const { fees, addFee, updateFee, removeFee, toggleFee } = useFeeScheduleStore();

  const [catFilter, setCatFilter] = useState<string>('all');
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});

  const f = (key: string) => form[key] || '';
  const sf = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const resetForm = () => setForm({});

  const filtered = useMemo(() => {
    let list = fees;
    if (!isBoard) list = list.filter(fee => fee.enabled);
    if (catFilter !== 'all') list = list.filter(fee => fee.category === catFilter);
    return list;
  }, [fees, catFilter, isBoard]);

  const catCounts = useMemo(() => {
    const source = isBoard ? fees : fees.filter(fee => fee.enabled);
    const counts: Record<string, number> = { all: source.length };
    CATEGORIES.forEach(c => {
      counts[c.key] = source.filter(fee => fee.category === c.key).length;
    });
    return counts;
  }, [fees, isBoard]);

  const openEdit = (fee: FeeScheduleItem) => {
    setEditId(fee.id);
    setForm({
      name: fee.name,
      category: fee.category,
      amount: String(fee.amount),
      amountType: fee.amountType,
      frequency: fee.frequency,
      description: fee.description,
      authority: fee.authority,
      glAccount: fee.glAccount,
    });
    setModal('edit');
  };

  const handleSave = () => {
    if (!f('name')) { alert('Name is required'); return; }
    const data = {
      name: f('name'),
      category: (f('category') || 'assessment') as FeeScheduleItem['category'],
      amount: parseFloat(f('amount')) || 0,
      amountType: (f('amountType') || 'flat') as FeeScheduleItem['amountType'],
      frequency: (f('frequency') || 'per-occurrence') as FeeScheduleItem['frequency'],
      description: f('description'),
      authority: f('authority'),
      glAccount: f('glAccount'),
      enabled: true,
    };
    if (modal === 'add') {
      addFee(data);
    } else {
      updateFee(editId, data);
    }
    setModal(null);
    resetForm();
  };

  // ── Resident Read-Only View ──
  if (!isBoard) {
    return (
      <div className="space-y-4">
        <div className="bg-mist-50 border border-mist-200 rounded-lg p-4">
          <p className="text-sm text-ink-600">The following fees are established per the association's governing documents.</p>
        </div>

        {/* Category filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCatFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            All ({catCounts.all})
          </button>
          {CATEGORIES.map(c => catCounts[c.key] > 0 && (
            <button key={c.key} onClick={() => setCatFilter(c.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === c.key ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
              {c.label} ({catCounts[c.key]})
            </button>
          ))}
        </div>

        {/* Read-only table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Fee</th>
                <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Category</th>
                <th className="text-right py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Amount</th>
                <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(fee => (
                <tr key={fee.id} className="border-b border-ink-100 hover:bg-ink-50">
                  <td className="py-3 px-3 font-medium text-ink-900">{fee.name}</td>
                  <td className="py-3 px-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-medium capitalize">{fee.category}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-ink-900">{formatAmount(fee)}</td>
                  <td className="py-3 px-3 text-ink-500 text-xs max-w-[300px]">{fee.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Board / PM Management View ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-display text-xl font-bold text-ink-900">Fee Schedule</h3>
        <button onClick={() => { resetForm(); sf('category', 'assessment'); sf('amountType', 'flat'); sf('frequency', 'per-occurrence'); setModal('add'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">
          + Add Fee
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setCatFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
          All ({catCounts.all})
        </button>
        {CATEGORIES.map(c => catCounts[c.key] > 0 && (
          <button key={c.key} onClick={() => setCatFilter(c.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === c.key ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {c.label} ({catCounts[c.key]})
          </button>
        ))}
      </div>

      {/* Management table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Fee</th>
              <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Category</th>
              <th className="text-right py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Amount</th>
              <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Frequency</th>
              <th className="text-left py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">GL Acct</th>
              <th className="text-center py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Status</th>
              <th className="text-right py-3 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(fee => (
              <tr key={fee.id} className={`border-b border-ink-100 ${!fee.enabled ? 'opacity-50' : 'hover:bg-ink-50'}`}>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-900">{fee.name}</span>
                    {fee.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-600 font-semibold">Default</span>}
                  </div>
                  {fee.description && <p className="text-[11px] text-ink-400 mt-0.5 max-w-[280px] truncate">{fee.description}</p>}
                </td>
                <td className="py-3 px-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 font-medium capitalize">{fee.category}</span>
                </td>
                <td className="py-3 px-3 text-right font-bold text-ink-900">{formatAmount(fee)}</td>
                <td className="py-3 px-3 text-ink-600 text-xs">{freqLabel(fee.frequency)}</td>
                <td className="py-3 px-3 text-ink-600 text-xs font-mono">{fee.glAccount}</td>
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={() => toggleFee(fee.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fee.enabled ? 'bg-sage-500' : 'bg-ink-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${fee.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                  </button>
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(fee)} className="text-xs text-accent-600 font-medium hover:text-accent-700">Edit</button>
                    {!fee.isDefault && (
                      <button onClick={() => { if (confirm(`Delete "${fee.name}"?`)) removeFee(fee.id); }} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-ink-400 text-sm">No fees match your filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Fee' : 'Edit Fee'}
          onClose={() => { setModal(null); resetForm(); }}
          onSave={handleSave}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Fee Name *</label>
              <input value={f('name')} onChange={e => sf('name', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Late Fee" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Category</label>
                <select value={f('category') || 'assessment'} onChange={e => sf('category', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Frequency</label>
                <select value={f('frequency') || 'per-occurrence'} onChange={e => sf('frequency', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  {FREQUENCIES.map(fr => <option key={fr.key} value={fr.key}>{fr.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Amount</label>
                <input type="number" value={f('amount')} onChange={e => sf('amount', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0" step="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Amount Type</label>
                <select value={f('amountType') || 'flat'} onChange={e => sf('amountType', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="flat">Flat ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">GL Account</label>
                <input value={f('glAccount')} onChange={e => sf('glAccount', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="4030" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Authority / Legal Basis</label>
                <input value={f('authority')} onChange={e => sf('authority', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Bylaws Section 7.2" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Description</label>
              <textarea value={f('description')} onChange={e => sf('description', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Explanation visible to residents..." />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
