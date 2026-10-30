import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-500',
  approved: 'bg-yellow-100 text-yellow-700',
  invoiced: 'bg-accent-100 text-accent-700',
  paid: 'bg-sage-100 text-sage-700',
};

export default function FLWorkOrders() {
  const { workOrders, unitInvoices, units, createWorkOrder, approveWorkOrder, receiveInvoice, payWorkOrder, payUnitInvoice, createUnitInvoice, getAcctName, chartOfAccounts, generalLedger, budgetCategories, setActiveTab } = useFinancialStore();
  const { vendors } = useBuildingStore();
  const issuesStore = useIssuesStore();
  const openCases = issuesStore.cases.filter(c => c.status === 'open');
  const [showCreate, setShowCreate] = useState(false);
  const [showInvoice, setShowInvoice] = useState<string | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [tab, setTab] = useState<'workOrders' | 'unitInvoices'>('workOrders');
  const [woForm, setWoForm] = useState({ title: '', vendor: '', amount: '', acctNum: '5010', caseId: '' });
  const [invForm, setInvForm] = useState({ invoiceNum: '', amount: '' });
  const [uiForm, setUiForm] = useState({ unitNum: '', type: 'fee' as 'fee' | 'special_assessment', amount: '', description: '', caseId: '' });
  const allAccts = chartOfAccounts.filter(a => a.sub !== 'header' && (a.type === 'expense' || a.type === 'asset'));

  const byStatus = (status: string) => workOrders.filter(w => w.status === status);
  const statusFlow = [
    { key: 'draft', label: 'Draft', count: byStatus('draft').length },
    { key: 'approved', label: 'Approved', count: byStatus('approved').length },
    { key: 'invoiced', label: 'Invoiced', count: byStatus('invoiced').length },
    { key: 'paid', label: 'Paid', count: byStatus('paid').length },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Toggle */}
      <div className="flex gap-1 bg-mist-50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('workOrders')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'workOrders' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Work Orders ({workOrders.length})</button>
        <button onClick={() => setTab('unitInvoices')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'unitInvoices' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Unit Invoices ({unitInvoices.length})</button>
      </div>

      {tab === 'workOrders' && (<>
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-3 flex-1">
          {statusFlow.map(s => (
            <div key={s.key} className={`rounded-xl p-3 border ${s.key === 'paid' ? 'bg-sage-50 border-sage-200' : 'bg-white border-ink-100'}`}>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{s.count}</p>
            </div>
          ))}
        </div>
        <button onClick={() => { setWoForm({ title: '', vendor: '', amount: '', acctNum: '5010', caseId: '' }); setShowCreate(true); }} className="ml-4 px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Create Work Order</button>
      </div>

      <div className="space-y-2">
        {workOrders.map(wo => (
          <div key={wo.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`pill px-2 py-0.5 rounded-full ${STATUS_COLORS[wo.status]}`}>{wo.status}</span>
                <span className="text-xs text-ink-300 font-mono">{wo.id}</span>
                <span className="font-semibold text-ink-900 truncate">{wo.title}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-ink-500">
                {wo.vendor}
                {wo.caseId && <span className="text-accent-600 ml-2">· {wo.caseId}</span>}
                {wo.invoiceNum && <span className="ml-2">· Inv: {wo.invoiceNum}</span>}
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-ink-300 font-mono">{getAcctName(wo.acctNum).split(' · ')[0]}</span>
                <span className="font-bold text-ink-900">{fmt(wo.amount)}</span>
                {wo.status === 'draft' && (
                  <button onClick={() => approveWorkOrder(wo.id)} className="px-3 py-1 bg-yellow-500 text-white rounded text-xs font-medium hover:bg-yellow-600">Approve</button>
                )}
                {wo.status === 'approved' && (
                  <button onClick={() => { setShowInvoice(wo.id); setInvForm({ invoiceNum: '', amount: String(wo.amount) }); }} className="px-3 py-1 bg-accent-600 text-white rounded text-xs font-medium hover:bg-accent-700">Receive Invoice</button>
                )}
                {wo.status === 'invoiced' && (
                  <button onClick={() => payWorkOrder(wo.id)} className="px-3 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Pay → GL</button>
                )}
                {wo.glEntryId && (
                  <span className="text-xs text-sage-600 font-mono cursor-pointer hover:text-sage-800" onClick={() => setActiveTab('ledger')} title="View in General Ledger">{wo.glEntryId} ↗</span>
                )}
              </div>
            </div>
            {/* Linkage row */}
            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
              <span className="text-ink-400">GL: <span className="font-mono text-ink-500">{wo.acctNum} {getAcctName(wo.acctNum).split(' · ').pop()}</span></span>
              {(() => { const coa = chartOfAccounts.find(a => a.num === wo.acctNum); const bc = coa?.budgetCat ? budgetCategories.find(b => b.id === coa.budgetCat) : null; return bc ? <span className="text-accent-500">Budget: {bc.name}</span> : null; })()}
              {wo.glEntryId && <span className="text-sage-500">Posted {generalLedger.find(g => g.id === wo.glEntryId)?.date || ''}</span>}
            </div>
          </div>
        ))}
      </div>
      </>)}

      {tab === 'unitInvoices' && (<>
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-4 gap-3 flex-1">
            {[
              { label: 'Total', count: unitInvoices.length },
              { label: 'Sent', count: unitInvoices.filter(i => i.status === 'sent').length },
              { label: 'Paid', count: unitInvoices.filter(i => i.status === 'paid').length },
              { label: 'Outstanding', count: unitInvoices.filter(i => i.status !== 'paid' && i.status !== 'void').length },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-3 border border-ink-100">
                <p className="text-xs font-semibold text-ink-400 uppercase">{s.label}</p>
                <p className="text-2xl font-bold text-ink-900 mt-1">{s.count}</p>
              </div>
            ))}
          </div>
          <button onClick={() => { setUiForm({ unitNum: '', type: 'fee', amount: '', description: '', caseId: '' }); setShowCreateInvoice(true); }} className="ml-4 px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium whitespace-nowrap">+ Create Invoice</button>
        </div>
        <div className="space-y-2">
          {unitInvoices.length === 0 ? (
            <div className="bg-mist-50 rounded-xl p-8 text-center border border-mist-200">
              <p className="text-ink-400 text-sm">No unit invoices yet. Click "Create Invoice" to bill a unit for fees or special assessments.</p>
            </div>
          ) : (
            unitInvoices.map(inv => (
              <div key={inv.id} className={`bg-white border rounded-xl p-4 ${inv.status === 'paid' ? 'border-sage-200' : 'border-ink-100'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`pill px-2 py-0.5 rounded-full text-xs font-semibold ${inv.status === 'paid' ? 'bg-sage-100 text-sage-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-accent-100 text-accent-700'}`}>{inv.status}</span>
                    <span className="text-xs text-ink-300 font-mono">{inv.id}</span>
                    <span className="font-semibold text-ink-900">Unit {inv.unitNumber}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-ink-900">{fmt(inv.amount)}</span>
                    {inv.status === 'sent' && (
                      <button onClick={() => payUnitInvoice(inv.id, 'stripe')} className="px-3 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Paid</button>
                    )}
                    {inv.glEntryId && <span className="text-xs text-sage-600 font-mono">{inv.glEntryId}</span>}
                  </div>
                </div>
                <p className="text-sm text-ink-500 mt-1">{inv.description}</p>
                <div className="mt-1 flex gap-3 text-[10px] text-ink-400">
                  <span>Created: {inv.createdDate}</span>
                  <span>Due: {inv.dueDate}</span>
                  {inv.paidDate && <span className="text-sage-600">Paid: {inv.paidDate} via {inv.paymentMethod}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </>)}

      {showCreate && (
        <Modal title="Create Work Order" onClose={() => setShowCreate(false)} onSave={() => {
          if (!woForm.title || !woForm.vendor) { alert('Title and vendor required'); return; }
          createWorkOrder({ title: woForm.title, vendor: woForm.vendor, amount: parseFloat(woForm.amount) || 0, acctNum: woForm.acctNum, caseId: woForm.caseId || undefined });
          setShowCreate(false);
        }} saveLabel="Create">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={woForm.title} onChange={e => setWoForm({ ...woForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Elevator repair" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Vendor *</label>
                <select value={woForm.vendor} onChange={e => setWoForm({ ...woForm, vendor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="">Select vendor...</option>
                  {vendors.filter(v => v.status === 'active').map(v => <option key={v.id} value={v.name}>{v.name} — {v.service}</option>)}
                  <option value="__other__">Other (type below)</option>
                </select>
                {woForm.vendor === '__other__' && <input value="" onChange={e => setWoForm({ ...woForm, vendor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm mt-1" placeholder="Enter vendor name" />}
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Est. Amount</label><input type="number" value={woForm.amount} onChange={e => setWoForm({ ...woForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">GL Account</label><select value={woForm.acctNum} onChange={e => setWoForm({ ...woForm, acctNum: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{allAccts.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Link to Case (optional)</label>
              <select value={woForm.caseId} onChange={e => setWoForm({ ...woForm, caseId: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                <option value="">No linked case</option>
                {openCases.map(c => <option key={c.id} value={c.id}>{c.id}: {c.title}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {showInvoice && (
        <Modal title="Receive Invoice" onClose={() => setShowInvoice(null)} onSave={() => {
          if (!invForm.invoiceNum) { alert('Invoice number required'); return; }
          receiveInvoice(showInvoice, invForm.invoiceNum, parseFloat(invForm.amount) || 0);
          setShowInvoice(null);
        }} saveLabel="Record Invoice">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Invoice Number *</label><input value={invForm.invoiceNum} onChange={e => setInvForm({ ...invForm, invoiceNum: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="INV-2026-001" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Invoice Amount</label><input type="number" value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}

      {showCreateInvoice && (
        <Modal title="Create Unit Invoice" subtitle="Bill a unit for fees or special assessments" onClose={() => setShowCreateInvoice(false)} onSave={() => {
          const amt = parseFloat(uiForm.amount);
          if (!uiForm.unitNum || !amt || amt <= 0 || !uiForm.description.trim()) { alert('Unit, amount, and description are required'); return; }
          createUnitInvoice(uiForm.unitNum, uiForm.type, amt, uiForm.description, uiForm.caseId || undefined);
          setShowCreateInvoice(false);
        }} saveLabel="Create Invoice">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Unit *</label>
              <select value={uiForm.unitNum} onChange={e => setUiForm({ ...uiForm, unitNum: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Select unit...</option>
                {units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Type</label>
                <select value={uiForm.type} onChange={e => setUiForm({ ...uiForm, type: e.target.value as 'fee' | 'special_assessment' })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="fee">Fee</option>
                  <option value="special_assessment">Special Assessment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Amount *</label>
                <input type="number" step="0.01" min="0" value={uiForm.amount} onChange={e => setUiForm({ ...uiForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Description *</label>
              <input value={uiForm.description} onChange={e => setUiForm({ ...uiForm, description: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g. Late fee — February assessment" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Link to Case (optional)</label>
              <select value={uiForm.caseId} onChange={e => setUiForm({ ...uiForm, caseId: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">No linked case</option>
                {openCases.map(c => <option key={c.id} value={c.id}>{c.id}: {c.title}</option>)}
              </select>
            </div>
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <p className="text-xs text-ink-600">This creates a GL entry ({uiForm.type === 'fee' ? 'Late Fee Receivable → Late Fee Income' : 'Special Assessment Receivable → Special Assessment Income'}) and sends the invoice to the unit owner.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
