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

const JOURNAL_PRESETS = [
  { id: 'vendor', label: 'Paid a vendor/bill', debit: null as string | null, credit: '1010' },
  { id: 'refund', label: 'Received a refund', debit: '1010', credit: null as string | null },
  { id: 'to-reserve', label: 'Transferred to reserves', debit: '1020', credit: '1010' },
  { id: 'from-reserve', label: 'Transferred from reserves', debit: '1010', credit: '1020' },
  { id: 'insurance', label: 'Recorded insurance claim', debit: '1140', credit: '4080' },
  { id: 'income', label: 'Received other income', debit: '1010', credit: null as string | null },
  { id: 'custom', label: 'Custom entry', debit: null as string | null, credit: null as string | null },
];

export default function FLGeneralLedger() {
  const { generalLedger, glFilter, glPage, setGlFilter, setGlPage, getAcctName, chartOfAccounts, postManualEntry, postTransfer, workOrders, setActiveTab } = useFinancialStore();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  // Journal Entry modal
  const [showJournal, setShowJournal] = useState(false);
  const [jForm, setJForm] = useState({ date: today, memo: '', debit: '', credit: '', amount: '', preset: '' });

  // Record Expense modal
  const [showExpense, setShowExpense] = useState(false);
  const [expForm, setExpForm] = useState({ date: today, category: '', payFrom: '1010', amount: '', vendor: '', description: '' });

  // Transfer Funds modal
  const [showTransfer, setShowTransfer] = useState(false);
  const [xferForm, setXferForm] = useState({ date: today, from: '1010', to: '1020', amount: '', memo: '' });

  // Derived lists
  const expenseAccts = chartOfAccounts.filter(a => a.type === 'expense' && a.sub !== 'header');
  const bankAccts = chartOfAccounts.filter(a => a.sub === 'bank');
  const allAccts = chartOfAccounts.filter(a => a.sub !== 'header');

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

  // Preset handler for journal entry
  const applyPreset = (presetId: string) => {
    const p = JOURNAL_PRESETS.find(x => x.id === presetId);
    if (!p) return;
    setJForm(f => ({ ...f, preset: presetId, debit: p.debit || '', credit: p.credit || '' }));
  };

  // Human-readable flow summary for journal entry
  const getFlowSummary = () => {
    if (!jForm.credit && !jForm.debit) return null;
    const from = jForm.credit ? getAcctName(jForm.credit) : '(select account)';
    const to = jForm.debit ? getAcctName(jForm.debit) : '(select account)';
    return `${from} \u2192 ${to}`;
  };

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
        <div className="flex gap-2 whitespace-nowrap">
          <button onClick={() => setShowExpense(true)} className="px-3 py-2 bg-sage-600 text-white rounded-lg hover:bg-sage-700 text-sm font-medium">
            Record Expense
          </button>
          <button onClick={() => setShowTransfer(true)} className="px-3 py-2 border border-ink-200 text-ink-700 rounded-lg hover:bg-mist-50 text-sm font-medium">
            Transfer Funds
          </button>
          <button onClick={() => setShowJournal(true)} className="px-3 py-2 text-ink-500 hover:text-ink-700 text-sm font-medium">
            Journal Entry
          </button>
        </div>
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

      {/* ── Record Expense Modal ─────────────────────────── */}
      {showExpense && (
        <Modal
          title="Record an Expense"
          subtitle="For vendor payments, bills, and building costs"
          onClose={() => setShowExpense(false)}
          onSave={() => {
            const amt = parseFloat(expForm.amount);
            if (!expForm.date || !expForm.category || !expForm.payFrom || !amt || amt <= 0) { alert('Date, category, pay from, and amount are required'); return; }
            const memo = [expForm.vendor, expForm.description].filter(Boolean).join(' \u2014 ') || 'Expense';
            postManualEntry(expForm.date, memo, expForm.category, expForm.payFrom, amt);
            setShowExpense(false);
            setExpForm({ date: today, category: '', payFrom: '1010', amount: '', vendor: '', description: '' });
          }}
          saveLabel="Record Expense"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Date *</label>
                <input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
                <input type="number" step="0.01" min="0" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Category *</label>
              <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Select expense category...</option>
                {expenseAccts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Pay From *</label>
              <select value={expForm.payFrom} onChange={e => setExpForm({ ...expForm, payFrom: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                {bankAccts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Vendor / Payee</label>
              <input value={expForm.vendor} onChange={e => setExpForm({ ...expForm, vendor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g. City Power Co." />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Description</label>
              <input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g. February electricity" />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Transfer Funds Modal ─────────────────────────── */}
      {showTransfer && (
        <Modal
          title="Transfer Between Accounts"
          subtitle="Move money between bank and fund accounts"
          onClose={() => setShowTransfer(false)}
          onSave={() => {
            const amt = parseFloat(xferForm.amount);
            if (!xferForm.date || !xferForm.from || !xferForm.to || !amt || amt <= 0) { alert('All fields are required'); return; }
            if (xferForm.from === xferForm.to) { alert('From and To accounts must be different'); return; }
            const memo = xferForm.memo || 'Account transfer';
            postTransfer(xferForm.date, `Transfer: ${memo}`, xferForm.from, xferForm.to, amt);
            setShowTransfer(false);
            setXferForm({ date: today, from: '1010', to: '1020', amount: '', memo: '' });
          }}
          saveLabel="Transfer Funds"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Date *</label>
              <input type="date" value={xferForm.date} onChange={e => setXferForm({ ...xferForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">From Account *</label>
              <select value={xferForm.from} onChange={e => setXferForm({ ...xferForm, from: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                {bankAccts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">To Account *</label>
              <select value={xferForm.to} onChange={e => setXferForm({ ...xferForm, to: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                {bankAccts.filter(a => a.num !== xferForm.from).map(a => <option key={a.num} value={a.num}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
              <input type="number" step="0.01" min="0" value={xferForm.amount} onChange={e => setXferForm({ ...xferForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Memo / Reason</label>
              <input value={xferForm.memo} onChange={e => setXferForm({ ...xferForm, memo: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g. Monthly reserve contribution" />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Journal Entry Modal (with presets) ───────────── */}
      {showJournal && (
        <Modal title="Manual Journal Entry" subtitle="Double-entry: must have equal debit and credit" onClose={() => setShowJournal(false)} onSave={() => {
          const amt = parseFloat(jForm.amount);
          if (!jForm.date || !jForm.memo || !jForm.debit || !jForm.credit || !amt || amt <= 0) { alert('All fields required'); return; }
          postManualEntry(jForm.date, jForm.memo, jForm.debit, jForm.credit, amt);
          setShowJournal(false);
          setJForm({ date: today, memo: '', debit: '', credit: '', amount: '', preset: '' });
        }} saveLabel="Post Entry">
          <div className="space-y-4">
            {/* Preset selector */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">What happened?</label>
              <select
                value={jForm.preset}
                onChange={e => applyPreset(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
              >
                <option value="">Select a transaction type...</option>
                {JOURNAL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

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
            {/* Human-readable flow summary */}
            {(jForm.debit || jForm.credit) && (
              <p className="text-sm text-ink-500 bg-mist-50 px-3 py-2 rounded-lg">
                {getFlowSummary()}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
