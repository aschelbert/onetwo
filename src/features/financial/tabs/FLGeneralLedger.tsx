import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

const GL_PAGE_SIZE = 20;

const SOURCE_COLORS: Record<string, string> = {
  case: 'bg-accent-100 text-accent-700',
  expense: 'bg-sage-100 text-sage-700',
  payment: 'bg-sage-100 text-sage-700',
  assessment: 'bg-mist-100 text-ink-600',
  fee: 'bg-yellow-100 text-yellow-700',
  transfer: 'bg-mist-100 text-ink-500',
  manual: 'bg-ink-100 text-ink-500',
};

export default function FLGeneralLedger() {
  const { generalLedger, glFilter, glPage, setGlFilter, setGlPage, getAcctName, chartOfAccounts, postManualEntry, workOrders, setActiveTab } = useFinancialStore();
  const navigate = useNavigate();
  const [showJournal, setShowJournal] = useState(false);
  const [jForm, setJForm] = useState({ date: new Date().toISOString().split('T')[0], memo: '', debit: '', credit: '', amount: '' });

  let filtered = [...generalLedger];
  if (glFilter.account) filtered = filtered.filter(e => e.debitAcct === glFilter.account || e.creditAcct === glFilter.account);
  if (glFilter.source) filtered = filtered.filter(e => e.source === glFilter.source);
  if (glFilter.search) {
    const s = glFilter.search.toLowerCase();
    filtered = filtered.filter(e => e.memo.toLowerCase().includes(s) || e.id.toLowerCase().includes(s) || e.sourceId?.toLowerCase().includes(s));
  }
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const total = filtered.length;
  const pages = Math.ceil(total / GL_PAGE_SIZE);
  const paged = filtered.slice(glPage * GL_PAGE_SIZE, (glPage + 1) * GL_PAGE_SIZE);
  const totalDebits = filtered.reduce((s, e) => s + e.amount, 0);

  const sourceOpts = [...new Set(generalLedger.map(e => e.source))].sort();
  const acctOpts = [...new Set([...generalLedger.map(e => e.debitAcct), ...generalLedger.map(e => e.creditAcct)])].sort();
  const allAccts = chartOfAccounts.filter(a => a.sub !== 'header');

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
          <select value={glFilter.account} onChange={e => setGlFilter({ account: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm flex-1">
            <option value="">All Accounts</option>
            {acctOpts.map(a => <option key={a} value={a}>{getAcctName(a)}</option>)}
          </select>
          <select value={glFilter.source} onChange={e => setGlFilter({ source: e.target.value })} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
            <option value="">All Sources</option>
            {sourceOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="text" placeholder="Search memo, ID, or source ref..."
            value={glFilter.search} onChange={e => setGlFilter({ search: e.target.value })}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm flex-1"
          />
        </div>
        <button onClick={() => setShowJournal(true)} className="px-3 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium whitespace-nowrap">
          + Journal Entry
        </button>
      </div>

      <div className="text-xs text-ink-400">
        {total} entries · Total volume: {fmt(totalDebits)}
        {(glFilter.account || glFilter.source || glFilter.search) && (
          <button onClick={() => setGlFilter({ account: '', source: '', search: '' })} className="ml-2 text-accent-600 underline">Clear filters</button>
        )}
      </div>

      {/* Ledger table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100">
              <th className="py-2 pr-2 w-16">ID</th>
              <th className="py-2 pr-2 w-24">Date</th>
              <th className="py-2 pr-2">Memo</th>
              <th className="py-2 pr-2 w-28">Debit</th>
              <th className="py-2 pr-2 w-28">Credit</th>
              <th className="py-2 pr-2 w-24 text-right">Amount</th>
              <th className="py-2 w-24">Source</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(e => {
              const wo = e.sourceId ? workOrders.find(w => w.id === e.sourceId || w.glEntryId === e.id) : null;
              return (
              <tr key={e.id} className="border-b border-ink-50 hover:bg-mist-50">
                <td className="py-2 pr-2 text-xs text-ink-300 font-mono">{e.id}</td>
                <td className="py-2 pr-2 text-ink-500">{e.date}</td>
                <td className="py-2 pr-2 text-ink-800">{e.memo}</td>
                <td className="py-2 pr-2 text-xs">
                  <span className="bg-sage-50 text-sage-700 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-sage-100" onClick={() => setGlFilter({ account: e.debitAcct })} title={getAcctName(e.debitAcct)}>
                    {e.debitAcct}
                  </span>
                  <span className="text-[10px] text-ink-300 ml-1 hidden sm:inline">{getAcctName(e.debitAcct).split(' · ').pop()}</span>
                </td>
                <td className="py-2 pr-2 text-xs">
                  <span className="bg-accent-50 text-accent-700 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-accent-100" onClick={() => setGlFilter({ account: e.creditAcct })} title={getAcctName(e.creditAcct)}>
                    {e.creditAcct}
                  </span>
                  <span className="text-[10px] text-ink-300 ml-1 hidden sm:inline">{getAcctName(e.creditAcct).split(' · ').pop()}</span>
                </td>
                <td className="py-2 pr-2 text-right font-semibold">{fmt(e.amount)}</td>
                <td className="py-2">
                  <span
                    className={`pill px-1.5 py-0.5 rounded text-xs font-semibold ${SOURCE_COLORS[e.source] || 'bg-ink-100 text-ink-500'} ${(e.source !== 'manual' && e.source !== 'transfer') ? 'cursor-pointer hover:opacity-80' : ''}`}
                    onClick={() => {
                      if (e.source === 'case') navigate('/issues');
                      else if (e.source === 'expense' || (wo && wo.glEntryId)) setActiveTab('workorders');
                      else if (e.source === 'payment' || e.source === 'fee' || e.source === 'assessment') { /* Unit ledger */ }
                    }}
                  >
                    {e.source}
                    {e.sourceId && <span className="ml-0.5 text-[10px] opacity-70">{e.sourceId}</span>}
                    {wo && <span className="ml-0.5">↗</span>}
                    {(e.source === 'case' || e.source === 'payment' || e.source === 'fee') && !wo && <span className="ml-0.5">↗</span>}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setGlPage(Math.max(0, glPage - 1))} disabled={glPage === 0} className={`px-3 py-1.5 border border-ink-200 rounded-lg text-sm ${glPage === 0 ? 'opacity-40' : 'hover:bg-mist-50'}`}>← Prev</button>
          <span className="text-sm text-ink-400">Page {glPage + 1} of {pages}</span>
          <button onClick={() => setGlPage(Math.min(pages - 1, glPage + 1))} disabled={glPage >= pages - 1} className={`px-3 py-1.5 border border-ink-200 rounded-lg text-sm ${glPage >= pages - 1 ? 'opacity-40' : 'hover:bg-mist-50'}`}>Next →</button>
        </div>
      )}

      {/* Journal Entry Modal */}
      {showJournal && (
        <Modal title="Manual Journal Entry" subtitle="Double-entry: must have equal debit and credit" onClose={() => setShowJournal(false)} onSave={() => {
          const amt = parseFloat(jForm.amount);
          if (!jForm.date || !jForm.memo || !jForm.debit || !jForm.credit || !amt || amt <= 0) { alert('All fields required'); return; }
          postManualEntry(jForm.date, jForm.memo, jForm.debit, jForm.credit, amt);
          setShowJournal(false);
          setJForm({ date: new Date().toISOString().split('T')[0], memo: '', debit: '', credit: '', amount: '' });
        }} saveLabel="Post Entry">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Date *</label><input type="date" value={jForm.date} onChange={e => setJForm({ ...jForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label><input type="number" step="0.01" value={jForm.amount} onChange={e => setJForm({ ...jForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="0.00" /></div>
            </div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Memo *</label><input value={jForm.memo} onChange={e => setJForm({ ...jForm, memo: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="Description of transaction" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1">Debit Account *</label>
                <select value={jForm.debit} onChange={e => setJForm({ ...jForm, debit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Select...</option>
                  {allAccts.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-accent-700 mb-1">Credit Account *</label>
                <select value={jForm.credit} onChange={e => setJForm({ ...jForm, credit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Select...</option>
                  {allAccts.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
