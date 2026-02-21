import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type ModalKind = null | 'stripe' | 'editMonthly' | 'bulkAssessment' | 'sendInvoice' | 'editDueDay';

export default function PaymentsManager() {
  const store = useFinancialStore();
  const building = useBuildingStore();
  const [modal, setModal] = useState<ModalKind>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const resetForm = () => { setForm({}); setSelectedUnits([]); };

  const stripeReady = store.stripeConnectId && store.stripeOnboardingComplete;
  const occupied = store.units.filter(u => u.status === 'OCCUPIED');
  const delinquent = store.units.filter(u => u.balance > 0);
  const monthlyRevenue = store.units.reduce((s, u) => s + u.monthlyFee, 0);
  const totalAR = store.units.reduce((s, u) => s + u.balance, 0);
  const unpaidSA = store.units.flatMap(u => u.specialAssessments.filter(a => !a.paid).map(a => ({ ...a, unit: u.number, owner: u.owner })));
  const totalSAAR = unpaidSA.reduce((s, a) => s + a.amount, 0);

  const handleStripeConnect = () => {
    // POST /api/stripe/create-account → stripeClient.v2.core.accounts.create({
    //   display_name: building.name,
    //   contact_email: building.management.email,
    //   identity: { country: 'us' },
    //   dashboard: 'full',
    //   defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
    //   configuration: { customer: {}, merchant: { capabilities: { card_payments: { requested: true } } } },
    // });
    const demoId = 'acct_' + Math.random().toString(36).slice(2, 14);
    store.setStripeConnect(demoId);
    alert(`Demo: Connected Account ${demoId} created.\n\nIn production, this calls stripeClient.v2.core.accounts.create() and redirects to Stripe's onboarding flow.`);
  };

  const handleStripeOnboard = () => {
    // POST /api/stripe/create-account-link → stripeClient.v2.core.accountLinks.create({
    //   account: stripeConnectId,
    //   use_case: { type: 'account_onboarding',
    //     account_onboarding: { configurations: ['merchant','customer'],
    //       refresh_url: window.location.href, return_url: window.location.href } },
    // });
    store.setStripeOnboarding(true);
    alert('Demo: Onboarding complete.\n\nIn production, redirects to Stripe\'s hosted onboarding via Account Links (V2 API).');
  };

  const handleBulkAssessment = () => {
    if (!f('amount') || !f('reason') || selectedUnits.length === 0) return alert('Select units, enter amount and reason.');
    const amount = parseFloat(f('amount'));
    selectedUnits.forEach(unitNum => store.addSpecialAssessment(unitNum, amount, f('reason')));
    setModal(null); resetForm();
  };

  const handleSendInvoice = () => {
    if (!f('unitNum') || !f('amount') || !f('description')) return alert('All fields required.');
    // In production: POST /api/stripe/create-invoice
    // stripeClient.checkout.sessions.create({
    //   line_items: [{ price_data: { unit_amount: amount * 100, currency: 'usd',
    //     product_data: { name: description } }, quantity: 1 }],
    //   payment_intent_data: { application_fee_amount: Math.round(amount * 100 * 0.029) },
    //   mode: 'payment',
    //   success_url: `${origin}/my-unit?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    // }, { stripeAccount: stripeConnectId });
    const amount = parseFloat(f('amount'));
    const unit = store.units.find(u => u.number === f('unitNum'));
    alert(`Demo: Invoice sent to ${unit?.owner || f('unitNum')} for ${fmt(amount)}.\n\nDescription: ${f('description')}\n\nIn production, this creates a Stripe Checkout session (direct charge) and emails the payment link to the unit owner.`);
    store.addSpecialAssessment(f('unitNum'), amount, f('description'));
    setModal(null); resetForm();
  };

  const handleUpdateMonthly = () => {
    if (!f('unitNum') || !f('monthlyFee')) return;
    store.updateUnit(f('unitNum'), { monthlyFee: parseInt(f('monthlyFee')) });
    setModal(null); resetForm();
  };

  return (
    <div className="space-y-5">

      {/* Stripe Connect Status */}
      <div className={`rounded-xl border-2 p-5 ${stripeReady ? 'bg-sage-50 border-sage-200' : store.stripeConnectId ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-indigo-600" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
            <div>
              <h3 className="text-lg font-bold text-ink-900">Stripe Connect</h3>
              <p className="text-xs text-ink-500">Payment processing for {building.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${stripeReady ? 'bg-sage-500' : store.stripeConnectId ? 'bg-amber-500 animate-pulse' : 'bg-ink-300'}`} />
            <span className={`text-sm font-semibold ${stripeReady ? 'text-sage-700' : store.stripeConnectId ? 'text-amber-700' : 'text-ink-500'}`}>
              {stripeReady ? 'Active' : store.stripeConnectId ? 'Onboarding Incomplete' : 'Not Connected'}
            </span>
          </div>
        </div>
        {store.stripeConnectId && <p className="text-xs text-ink-400 font-mono mb-3">Account: {store.stripeConnectId}</p>}
        <div className="flex gap-2">
          {!store.stripeConnectId && (
            <button onClick={handleStripeConnect} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700">Connect with Stripe →</button>
          )}
          {store.stripeConnectId && !store.stripeOnboardingComplete && (
            <button onClick={handleStripeOnboard} className="px-4 py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700">Complete Onboarding →</button>
          )}
          {stripeReady && (
            <button onClick={() => window.open('https://dashboard.stripe.com', '_blank')} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700">Open Stripe Dashboard →</button>
          )}
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { val: fmt(monthlyRevenue), label: 'Monthly Revenue', color: 'text-ink-900' },
          { val: fmt(totalAR), label: 'Accounts Receivable', color: totalAR > 0 ? 'text-red-600' : 'text-sage-600' },
          { val: fmt(totalSAAR), label: 'Unpaid Assessments', color: totalSAAR > 0 ? 'text-amber-600' : 'text-sage-600' },
          { val: String(delinquent.length), label: 'Delinquent Units', color: delinquent.length > 0 ? 'text-red-600' : 'text-sage-600' },
          { val: `${occupied.length}/${store.units.length}`, label: 'Occupied', color: 'text-ink-900' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg p-3 border border-ink-100">
            <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[11px] text-ink-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { resetForm(); sf('dueDay', String(store.hoaDueDay)); setModal('editDueDay'); }} className="px-4 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-sm font-medium hover:bg-ink-50">⚙ Assessment Due Day</button>
        <button onClick={() => { resetForm(); setModal('editMonthly'); }} className="px-4 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-sm font-medium hover:bg-ink-50">📝 Edit Unit Monthly Fee</button>
        <button onClick={() => { resetForm(); setSelectedUnits(occupied.map(u => u.number)); setModal('bulkAssessment'); }} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">📋 Bulk Special Assessment</button>
        {stripeReady && (
          <button onClick={() => { resetForm(); setModal('sendInvoice'); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">💳 Send Payment Invoice</button>
        )}
      </div>

      {/* Delinquent units list */}
      {delinquent.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="border-b border-red-100 px-5 py-3 bg-red-50"><h4 className="text-sm font-bold text-red-800">Delinquent Units</h4></div>
          <div className="divide-y divide-ink-50">
            {delinquent.sort((a, b) => b.balance - a.balance).map(u => (
              <div key={u.number} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900 text-sm">{u.number}</span>
                  <span className="text-xs text-ink-400 ml-2">{u.owner}</span>
                  <span className="text-xs text-ink-300 ml-2">{u.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-600 text-sm">{fmt(u.balance)}</span>
                  {stripeReady && (
                    <button onClick={() => {
                      alert(`Demo: Payment link sent to ${u.owner} (${u.email}) for ${fmt(u.balance)}.\n\nIn production, creates a Stripe Checkout session and emails the link.`);
                    }} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700">Send Link</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unpaid Special Assessments */}
      {unpaidSA.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="border-b border-amber-100 px-5 py-3 bg-amber-50"><h4 className="text-sm font-bold text-amber-800">Outstanding Special Assessments</h4></div>
          <div className="divide-y divide-ink-50">
            {unpaidSA.map(sa => (
              <div key={sa.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink-900 text-sm">Unit {sa.unit}</span>
                  <span className="text-xs text-ink-400 ml-2">{sa.owner}</span>
                  <span className="text-xs text-ink-300 ml-2">{sa.reason}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-amber-600 text-sm">{fmt(sa.amount)}</span>
                  <span className="text-[10px] text-ink-400">{sa.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection summary by unit */}
      <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
        <div className="border-b px-5 py-3"><h4 className="text-sm font-bold text-ink-800">Monthly Assessment Collection</h4></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink-100 bg-ink-50 text-left">
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Unit</th>
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Owner</th>
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Monthly Fee</th>
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Balance</th>
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Last Payment</th>
              <th className="px-4 py-2 text-xs font-semibold text-ink-500">Status</th>
            </tr></thead>
            <tbody>
              {store.units.filter(u => u.status === 'OCCUPIED').map(u => {
                const lastPay = u.payments.length > 0 ? [...u.payments].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
                return (
                  <tr key={u.number} className="border-b border-ink-50 hover:bg-mist-50">
                    <td className="px-4 py-2.5 font-bold text-ink-900">{u.number}</td>
                    <td className="px-4 py-2.5 text-ink-600">{u.owner}</td>
                    <td className="px-4 py-2.5 font-medium">{fmt(u.monthlyFee)}</td>
                    <td className={`px-4 py-2.5 font-bold ${u.balance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(u.balance)}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-400">{lastPay ? `${lastPay.date} · ${lastPay.method}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${u.balance === 0 ? 'bg-sage-100 text-sage-700' : u.balance <= u.monthlyFee ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {u.balance === 0 ? 'Current' : u.balance <= u.monthlyFee ? '1 Month Behind' : 'Delinquent'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modals ─── */}

      {modal === 'editDueDay' && (
        <Modal title="Assessment Due Day" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.setHoaDueDay(parseInt(f('dueDay')) || 1); setModal(null); resetForm(); }}>
          <div className="space-y-3">
            <p className="text-xs text-ink-500">Set the day of the month when monthly assessments are due.</p>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Due Day (1-28)</label><input type="number" min="1" max="28" value={f('dueDay')} onChange={e => sf('dueDay', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}

      {modal === 'editMonthly' && (
        <Modal title="Edit Unit Monthly Fee" onClose={() => { setModal(null); resetForm(); }} onSave={handleUpdateMonthly}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Select Unit</label>
              <select value={f('unitNum')} onChange={e => { sf('unitNum', e.target.value); const u = store.units.find(x => x.number === e.target.value); if (u) sf('monthlyFee', String(u.monthlyFee)); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Select unit...</option>
                {store.units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner} (currently {fmt(u.monthlyFee)})</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">New Monthly Fee</label><input type="number" value={f('monthlyFee')} onChange={e => sf('monthlyFee', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <p className="text-xs text-ink-400">Changes take effect next billing cycle. If Stripe recurring is active, the subscription will be updated automatically.</p>
          </div>
        </Modal>
      )}

      {modal === 'bulkAssessment' && (
        <Modal title="Bulk Special Assessment" onClose={() => { setModal(null); resetForm(); }} onSave={handleBulkAssessment} saveLabel="Apply Assessment">
          <div className="space-y-3">
            <p className="text-xs text-ink-500 bg-amber-50 rounded-lg p-3 border border-amber-100">Apply a one-time special assessment to multiple units. Each unit will be charged the specified amount and a GL entry will be posted.</p>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Amount per unit *</label><input type="number" value={f('amount')} onChange={e => sf('amount', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="500" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Reason *</label><input value={f('reason')} onChange={e => sf('reason', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Roof emergency repair" /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-700">Apply to units ({selectedUnits.length} selected)</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedUnits(occupied.map(u => u.number))} className="text-[10px] text-accent-600 font-medium">All Occupied</button>
                  <button type="button" onClick={() => setSelectedUnits([])} className="text-[10px] text-ink-400 font-medium">Clear</button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-50">
                {store.units.filter(u => u.status === 'OCCUPIED').map(u => (
                  <label key={u.number} className="flex items-center gap-2 px-3 py-2 hover:bg-mist-50 cursor-pointer">
                    <input type="checkbox" checked={selectedUnits.includes(u.number)} onChange={e => {
                      if (e.target.checked) setSelectedUnits(p => [...p, u.number]);
                      else setSelectedUnits(p => p.filter(n => n !== u.number));
                    }} className="rounded" />
                    <span className="text-xs font-medium text-ink-700">{u.number}</span>
                    <span className="text-xs text-ink-400">{u.owner}</span>
                  </label>
                ))}
              </div>
            </div>
            {f('amount') && selectedUnits.length > 0 && (
              <div className="bg-white border border-ink-200 rounded-lg p-3 text-center">
                <p className="text-xs text-ink-500">Total impact: <strong className="text-ink-900">{fmt(parseFloat(f('amount')) * selectedUnits.length)}</strong> across {selectedUnits.length} units</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal === 'sendInvoice' && (
        <Modal title="Send Payment Invoice" onClose={() => { setModal(null); resetForm(); }} onSave={handleSendInvoice} saveLabel="Send Invoice">
          <div className="space-y-3">
            <p className="text-xs text-ink-500 bg-indigo-50 rounded-lg p-3 border border-indigo-100">Create a one-off Stripe Checkout invoice and email the payment link to the unit owner. A special assessment will be recorded and a GL entry posted.</p>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Unit *</label>
              <select value={f('unitNum')} onChange={e => sf('unitNum', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Select unit...</option>
                {store.units.filter(u => u.status === 'OCCUPIED').map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Amount *</label><input type="number" value={f('amount')} onChange={e => sf('amount', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="500" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Description *</label><input value={f('description')} onChange={e => sf('description', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Window replacement — Unit 301" /></div>
            <div className="bg-sand-100 rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-500"><strong>Stripe flow:</strong> Creates a Checkout Session (direct charge with application fee) and emails the payment link. Payment auto-reconciles via webhook.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
