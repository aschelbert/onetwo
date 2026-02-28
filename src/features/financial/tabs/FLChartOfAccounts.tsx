import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import Modal from '@/components/ui/Modal';

const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-sage-100 text-sage-700',
  liability: 'bg-accent-100 text-accent-700',
  equity: 'bg-mist-100 text-mist-700',
  income: 'bg-emerald-100 text-emerald-700',
  expense: 'bg-amber-100 text-amber-700',
};

export default function FLChartOfAccounts() {
  const { chartOfAccounts, acctStatus, acctBalance, glByAccount, getAcctChildren, addCoASection, addCoAAccount, updateCoAAccount, deleteCoAAccount, setActiveTab, setGlFilter } = useFinancialStore();
  const [modal, setModal] = useState<null | 'section' | 'account' | { type: 'edit'; num: string }>(null);
  const [parentNum, setParentNum] = useState('');
  const [formData, setFormData] = useState({ num: '', name: '', type: 'expense', parent: '', sub: 'operating' });

  const headers = chartOfAccounts.filter(a => a.sub === 'header');

  const renderAccount = (acct: typeof chartOfAccounts[0], depth: number) => {
    const children = getAcctChildren(acct.num);
    const bal = acctBalance(acct.num);
    const entries = glByAccount(acct.num).length;
    const isHeader = acct.sub === 'header';
    const active = acctStatus[acct.num] !== false;

    return (
      <div key={acct.num}>
        <div className={`flex items-center justify-between py-2 px-3 rounded-lg hover:bg-mist-50 transition-colors ${!active ? 'opacity-40' : ''} ${isHeader ? 'bg-ink-50' : ''}`} style={{ paddingLeft: `${depth * 24 + 12}px` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-ink-300 font-mono w-10 shrink-0">{acct.num}</span>
            <span className={`text-sm ${isHeader ? 'font-bold text-ink-900' : 'text-ink-700'}`}>{acct.name}</span>
            <span className={`pill px-1.5 py-0.5 rounded ${TYPE_COLORS[acct.type] || 'bg-ink-100 text-ink-500'}`}>{acct.type}</span>
            {!isHeader && acct.sub !== 'header' && <span className="text-xs text-ink-300">{acct.sub}</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!isHeader && entries > 0 && (
              <button onClick={() => { setGlFilter({ account: acct.num, source: '', search: '' }); setActiveTab('ledger'); }} className="text-xs text-accent-600 hover:text-accent-700 font-medium cursor-pointer">{entries} entries →</button>
            )}
            {!isHeader && bal !== 0 && (
              <span className={`text-sm font-semibold ${bal >= 0 ? 'text-ink-900' : 'text-red-600'}`}>
                ${Math.abs(bal).toLocaleString()}
              </span>
            )}
            {isHeader && (
              <button
                onClick={() => { setParentNum(acct.num); setFormData({ ...formData, parent: acct.num }); setModal('account'); }}
                className="text-xs text-accent-600 hover:text-accent-700 font-medium"
              >
                + Add
              </button>
            )}
            {!isHeader && (
              <button
                onClick={() => { setFormData({ num: acct.num, name: acct.name, type: acct.type, parent: acct.parent || '', sub: acct.sub }); setModal({ type: 'edit', num: acct.num }); }}
                className="text-xs text-ink-400 hover:text-ink-600"
              >
                Edit
              </button>
            )}
          </div>
        </div>
        {children.map(child => renderAccount(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-400">{chartOfAccounts.length} accounts · Standard HOA numbering</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('section')} className="px-3 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">
            + Add Section
          </button>
          <button onClick={() => setModal('account')} className="px-3 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 text-sm font-medium">
            + Add Account
          </button>
        </div>
      </div>

      <div className="border border-ink-100 rounded-xl divide-y divide-ink-50">
        {headers.map(h => renderAccount(h, 0))}
      </div>

      {/* Add Section Modal */}
      {modal === 'section' && (
        <Modal title="Add Account Section" onClose={() => setModal(null)} onSave={() => {
          if (!formData.num || !formData.name) { alert('Number and name required'); return; }
          addCoASection(formData.num, formData.name, formData.type);
          setFormData({ num: '', name: '', type: 'expense', parent: '', sub: 'operating' });
          setModal(null);
        }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Account Number *</label>
              <input value={formData.num} onChange={e => setFormData({ ...formData, num: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., 7000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Section Name *</label>
              <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., Special Project Expenses" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Account Type *</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                {['asset','liability','equity','income','expense'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Account Modal */}
      {modal === 'account' && (
        <Modal title="Add Account" onClose={() => setModal(null)} onSave={() => {
          if (!formData.num || !formData.name || !formData.parent) { alert('All fields required'); return; }
          addCoAAccount(formData.num, formData.name, formData.parent, formData.sub);
          setFormData({ num: '', name: '', type: 'expense', parent: '', sub: 'operating' });
          setModal(null);
        }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Account Number *</label>
              <input value={formData.num} onChange={e => setFormData({ ...formData, num: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., 5110" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Account Name *</label>
              <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., Elevator Maintenance" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Parent Section *</label>
              <select value={formData.parent} onChange={e => setFormData({ ...formData, parent: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                <option value="">Select parent...</option>
                {headers.map(h => <option key={h.num} value={h.num}>{h.num} · {h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Subtype</label>
              <select value={formData.sub} onChange={e => setFormData({ ...formData, sub: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg">
                {['bank','receivable','payable','prepaid','deferred','deposit','accrued','fund','retained','assessment','fee','interest','other','operating','reserve'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Account Modal */}
      {modal && typeof modal === 'object' && modal.type === 'edit' && (
        <Modal title="Edit Account" onClose={() => setModal(null)} onSave={() => {
          updateCoAAccount(modal.num, formData.name, true);
          setModal(null);
        }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Account Name *</label>
              <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
            </div>
            {glByAccount(modal.num).length === 0 && (
              <button onClick={() => { deleteCoAAccount(modal.num); setModal(null); }} className="text-sm text-red-600 hover:text-red-800">
                Delete this account (no entries)
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
