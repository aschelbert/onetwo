import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import Modal from '@/components/ui/Modal';
import type { Unit } from '@/types/financial';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type ModalKind = null | 'addUnit' | 'editUnit' | 'pay' | 'fee' | 'special' | 'detail' | 'stripe';
type SortKey = 'number' | 'owner' | 'balance' | 'status';

export default function UnitsManager() {
  const store = useFinancialStore();
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const [modal, setModal] = useState<ModalKind>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'occupied' | 'vacant' | 'delinquent'>('all');
  const [sort, setSort] = useState<SortKey>('number');
  const [form, setForm] = useState<Record<string, string>>({});

  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const resetForm = () => setForm({});

  const selectedUnit = store.units.find(u => u.number === selected);

  // Filter + sort
  let filtered = store.units.filter(u => {
    if (filter === 'occupied') return u.status === 'OCCUPIED';
    if (filter === 'vacant') return u.status === 'VACANT';
    if (filter === 'delinquent') return u.balance > 0;
    return true;
  });
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(u => u.number.includes(q) || u.owner.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  filtered.sort((a, b) => {
    if (sort === 'balance') return b.balance - a.balance;
    if (sort === 'status') return a.status.localeCompare(b.status);
    if (sort === 'owner') return a.owner.localeCompare(b.owner);
    return a.number.localeCompare(b.number);
  });

  // Stats
  const totalUnits = store.units.length;
  const occupied = store.units.filter(u => u.status === 'OCCUPIED').length;
  const delinquent = store.units.filter(u => u.balance > 0);
  const totalAR = store.units.reduce((s, u) => s + u.balance, 0);
  const monthlyRevenue = store.units.reduce((s, u) => s + u.monthlyFee, 0);

  const openDetail = (unitNum: string) => { setSelected(unitNum); setModal('detail'); };
  const openPay = (unitNum: string) => { setSelected(unitNum); resetForm(); setModal('pay'); };
  const openFee = (unitNum: string) => { setSelected(unitNum); resetForm(); sf('amount', '25'); sf('reason', 'Late payment'); setModal('fee'); };
  const openSpecial = (unitNum: string) => { setSelected(unitNum); resetForm(); setModal('special'); };

  const handleAddUnit = () => {
    if (!f('number') || !f('monthlyFee')) return alert('Unit number and monthly fee are required.');
    store.addUnit({
      number: f('number'), owner: f('owner') || 'Vacant', email: f('email'), phone: f('phone'),
      monthlyFee: parseInt(f('monthlyFee')) || 0, votingPct: parseFloat(f('votingPct')) || 0,
      status: f('status') as 'OCCUPIED' | 'VACANT' || 'VACANT',
      balance: 0, moveIn: f('moveIn') || null,
      sqft: parseInt(f('sqft')) || 0, bedrooms: parseInt(f('bedrooms')) || 0,
      parking: f('parking') || null,
    });
    setModal(null); resetForm();
  };

  const handleEditUnit = () => {
    if (!selected) return;
    store.updateUnit(selected, {
      owner: f('owner'), email: f('email'), phone: f('phone'),
      monthlyFee: parseInt(f('monthlyFee')) || 0, votingPct: parseFloat(f('votingPct')) || 0,
      status: f('status') as 'OCCUPIED' | 'VACANT',
      sqft: parseInt(f('sqft')) || 0, bedrooms: parseInt(f('bedrooms')) || 0,
      parking: f('parking') || null, moveIn: f('moveIn') || null,
    });
    setModal(null); resetForm();
  };

  const handlePay = () => {
    if (!selected || !f('amount')) return;
    store.recordUnitPayment(selected, parseFloat(f('amount')), f('method') || 'ACH');
    setModal(null); resetForm();
  };

  const handleFee = () => {
    if (!selected || !f('amount')) return;
    store.imposeLateFee(selected, parseFloat(f('amount')), f('reason') || 'Late payment');
    setModal(null); resetForm();
  };

  const handleSpecial = () => {
    if (!selected || !f('amount') || !f('reason')) return alert('Amount and reason required.');
    store.addSpecialAssessment(selected, parseFloat(f('amount')), f('reason'));
    setModal(null); resetForm();
  };

  const Field = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={f(k)} onChange={e => sf(k, e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { val: totalUnits, label: 'Total Units', color: 'text-ink-900' },
          { val: occupied, label: 'Occupied', color: 'text-sage-600' },
          { val: totalUnits - occupied, label: 'Vacant', color: 'text-ink-400' },
          { val: delinquent.length, label: 'Delinquent', color: 'text-red-600' },
          { val: fmt(totalAR), label: 'Total Outstanding', color: 'text-red-600', isStr: true },
        ].map(s => (
          <div key={s.label} className="bg-mist-50 rounded-lg p-3 border border-mist-100">
            <p className={`text-xl font-bold ${s.color}`}>{s.isStr ? s.val : String(s.val)}</p>
            <p className="text-[11px] text-ink-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Stripe Connect status & Monthly Revenue */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-white rounded-lg border border-ink-100 px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm text-ink-500">Monthly revenue:</span>
          <span className="text-sm font-bold text-ink-900">{fmt(monthlyRevenue)}</span>
        </div>
        {isBoard && (
          <button onClick={() => setModal('stripe')} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
            {store.stripeConnectId ? (store.stripeOnboardingComplete ? '✓ Stripe Connected' : 'Complete Stripe Setup') : 'Connect Stripe'}
          </button>
        )}
      </div>

      {/* Search, filter, sort */}
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units, owners..." className="flex-1 min-w-[200px] px-3 py-2 border border-ink-200 rounded-lg text-sm" />
        <div className="flex gap-1.5">
          {(['all', 'occupied', 'vacant', 'delinquent'] as const).map(fv => (
            <button key={fv} onClick={() => setFilter(fv)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === fv ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}>
              {fv.charAt(0).toUpperCase() + fv.slice(1)}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
          <option value="number">Sort: Unit #</option>
          <option value="owner">Sort: Owner</option>
          <option value="balance">Sort: Balance</option>
          <option value="status">Sort: Status</option>
        </select>
        {isBoard && (
          <button onClick={() => { resetForm(); sf('status', 'VACANT'); setModal('addUnit'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Add Unit</button>
        )}
      </div>

      {/* Units table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink-200 text-left">
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Unit</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Owner</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Monthly</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Balance</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Fees</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Status</th>
              {isBoard && <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const hasOutstanding = u.balance > 0;
              const activeFees = u.lateFees.filter(f => !f.waived).length;
              const unpaidSA = u.specialAssessments.filter(a => !a.paid).length;
              return (
                <tr key={u.number} className={`border-b border-ink-50 hover:bg-mist-50 transition-colors ${hasOutstanding ? 'bg-red-50 bg-opacity-30' : ''}`}>
                  <td className="py-3 px-3">
                    <button onClick={() => openDetail(u.number)} className="font-bold text-accent-600 hover:text-accent-700">{u.number}</button>
                  </td>
                  <td className="py-3 px-3">
                    <div>
                      <p className="font-medium text-ink-900">{u.owner}</p>
                      <p className="text-xs text-ink-400">{u.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-medium text-ink-900">{fmt(u.monthlyFee)}</td>
                  <td className="py-3 px-3">
                    <span className={`font-bold ${hasOutstanding ? 'text-red-600' : 'text-sage-600'}`}>{fmt(u.balance)}</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-1">
                      {activeFees > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">{activeFees} fee{activeFees > 1 ? 's' : ''}</span>}
                      {unpaidSA > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{unpaidSA} SA</span>}
                      {activeFees === 0 && unpaidSA === 0 && <span className="text-ink-300">—</span>}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${u.status === 'OCCUPIED' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{u.status}</span>
                  </td>
                  {isBoard && (
                    <td className="py-3 px-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => openPay(u.number)} className="px-2.5 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Pay</button>
                        <button onClick={() => openFee(u.number)} className="px-2.5 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">Fee</button>
                        <button onClick={() => openSpecial(u.number)} className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700">SA</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Unit Detail Modal ─── */}
      {modal === 'detail' && selectedUnit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="border-b p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink-900">Unit {selectedUnit.number}</h2>
                <p className="text-sm text-ink-400">{selectedUnit.owner} · {selectedUnit.email}</p>
              </div>
              <div className="flex gap-2">
                {isBoard && (
                  <button onClick={() => {
                    setForm({
                      owner: selectedUnit.owner, email: selectedUnit.email, phone: selectedUnit.phone,
                      monthlyFee: String(selectedUnit.monthlyFee), votingPct: String(selectedUnit.votingPct),
                      status: selectedUnit.status, sqft: String(selectedUnit.sqft), bedrooms: String(selectedUnit.bedrooms),
                      parking: selectedUnit.parking || '', moveIn: selectedUnit.moveIn || '',
                    });
                    setModal('editUnit');
                  }} className="px-3 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-50">Edit</button>
                )}
                <button onClick={() => setModal(null)} className="text-ink-400 hover:text-ink-600 text-xl">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Monthly Fee', val: fmt(selectedUnit.monthlyFee) },
                  { label: 'Balance', val: fmt(selectedUnit.balance), red: selectedUnit.balance > 0 },
                  { label: 'Sq Ft', val: String(selectedUnit.sqft) },
                  { label: 'Bedrooms', val: String(selectedUnit.bedrooms) },
                ].map(s => (
                  <div key={s.label} className="bg-mist-50 rounded-lg p-3 border border-mist-100">
                    <p className="text-[11px] text-ink-400">{s.label}</p>
                    <p className={`text-lg font-bold ${s.red ? 'text-red-600' : 'text-ink-900'}`}>{s.val}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-ink-400">Status:</span> <span className="font-medium">{selectedUnit.status}</span></div>
                <div><span className="text-ink-400">Move-in:</span> <span className="font-medium">{selectedUnit.moveIn || '—'}</span></div>
                <div><span className="text-ink-400">Parking:</span> <span className="font-medium">{selectedUnit.parking || '—'}</span></div>
              </div>

              {/* Late Fees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-ink-800">Late Fees & Fines</h3>
                  {isBoard && <button onClick={() => openFee(selectedUnit.number)} className="text-xs text-red-600 font-medium hover:text-red-700">+ Impose Fee</button>}
                </div>
                {selectedUnit.lateFees.length === 0 ? (
                  <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No fees.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedUnit.lateFees.map((lf, i) => (
                      <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${lf.waived ? 'bg-ink-50 border-ink-100 opacity-50' : 'bg-red-50 border-red-100'}`}>
                        <div>
                          <span className={`text-sm font-medium ${lf.waived ? 'line-through text-ink-400' : 'text-ink-900'}`}>{fmt(lf.amount)}</span>
                          <span className="text-xs text-ink-400 ml-2">{lf.reason}</span>
                          <span className="text-xs text-ink-300 ml-2">{lf.date}</span>
                        </div>
                        {!lf.waived && isBoard && (
                          <button onClick={() => store.waiveLateFee(selectedUnit.number, i)} className="text-xs text-sage-600 font-medium hover:text-sage-700">Waive</button>
                        )}
                        {lf.waived && <span className="text-[10px] text-sage-500 font-semibold">WAIVED</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Special Assessments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-ink-800">Special Assessments</h3>
                  {isBoard && <button onClick={() => openSpecial(selectedUnit.number)} className="text-xs text-amber-600 font-medium hover:text-amber-700">+ Add Assessment</button>}
                </div>
                {selectedUnit.specialAssessments.length === 0 ? (
                  <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No special assessments.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedUnit.specialAssessments.map(sa => (
                      <div key={sa.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${sa.paid ? 'bg-sage-50 border-sage-100' : 'bg-amber-50 border-amber-100'}`}>
                        <div>
                          <span className={`text-sm font-medium ${sa.paid ? 'text-sage-700' : 'text-ink-900'}`}>{fmt(sa.amount)}</span>
                          <span className="text-xs text-ink-400 ml-2">{sa.reason}</span>
                          <span className="text-xs text-ink-300 ml-2">{sa.date}</span>
                        </div>
                        {sa.paid ? (
                          <span className="text-[10px] text-sage-600 font-semibold">PAID {sa.paidDate}</span>
                        ) : isBoard ? (
                          <button onClick={() => store.markSpecialAssessmentPaid(selectedUnit.number, sa.id)} className="px-2.5 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Paid</button>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-semibold">OUTSTANDING</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-ink-800">Payment History</h3>
                  {isBoard && <button onClick={() => openPay(selectedUnit.number)} className="text-xs text-sage-600 font-medium hover:text-sage-700">+ Record Payment</button>}
                </div>
                {selectedUnit.payments.length === 0 ? (
                  <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No payments recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {[...selectedUnit.payments].reverse().map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-mist-50 rounded-lg border border-mist-100">
                        <div className="flex items-center gap-3">
                          <span className="text-sage-500">💳</span>
                          <div>
                            <span className="text-sm font-medium text-ink-900">{fmt(p.amount)}</span>
                            <span className="text-xs text-ink-400 ml-2">via {p.method}</span>
                            {p.note && <span className="text-xs text-ink-300 ml-2">{p.note}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-ink-400">{p.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stripe Payment Link */}
              {selectedUnit.balance > 0 && store.stripeConnectId && store.stripeOnboardingComplete && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-indigo-900">Send Payment Link</p>
                      <p className="text-xs text-indigo-600">Email a Stripe Checkout link to {selectedUnit.owner} for {fmt(selectedUnit.balance)}</p>
                    </div>
                    <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                      Send Payment Link →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Unit Modal ─── */}
      {modal === 'addUnit' && (
        <Modal title="Add Unit" onClose={() => { setModal(null); resetForm(); }} onSave={handleAddUnit}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit Number *" k="number" placeholder="e.g., 601" />
              <Field label="Monthly Fee *" k="monthlyFee" type="number" placeholder="450" />
            </div>
            <Field label="Owner Name" k="owner" placeholder="Owner name or Vacant" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" k="email" type="email" />
              <Field label="Phone" k="phone" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sq Ft" k="sqft" type="number" />
              <Field label="Bedrooms" k="bedrooms" type="number" />
              <Field label="Parking" k="parking" placeholder="P-601" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="VACANT">Vacant</option>
                  <option value="OCCUPIED">Occupied</option>
                </select>
              </div>
              <Field label="Voting %" k="votingPct" type="number" placeholder="2.1" />
            </div>
            <Field label="Move-in Date" k="moveIn" type="date" />
          </div>
        </Modal>
      )}

      {/* ─── Edit Unit Modal ─── */}
      {modal === 'editUnit' && (
        <Modal title={`Edit Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleEditUnit}>
          <div className="space-y-3">
            <Field label="Owner Name" k="owner" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" k="email" type="email" />
              <Field label="Phone" k="phone" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly Fee" k="monthlyFee" type="number" />
              <Field label="Voting %" k="votingPct" type="number" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sq Ft" k="sqft" type="number" />
              <Field label="Bedrooms" k="bedrooms" type="number" />
              <Field label="Parking" k="parking" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="OCCUPIED">Occupied</option>
                  <option value="VACANT">Vacant</option>
                </select>
              </div>
              <Field label="Move-in Date" k="moveIn" type="date" />
            </div>
            {isBoard && (
              <div className="pt-2 border-t">
                <button onClick={() => { if (confirm(`Delete unit ${selected}?`)) { store.removeUnit(selected!); setModal(null); resetForm(); } }} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete this unit</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ─── Record Payment Modal ─── */}
      {modal === 'pay' && (
        <Modal title={`Record Payment — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handlePay}>
          <div className="space-y-3">
            {selectedUnit && <p className="text-sm text-ink-500 bg-mist-50 rounded-lg p-3">Current balance: <span className="font-bold text-ink-900">{fmt(selectedUnit.balance)}</span></p>}
            <Field label="Amount *" k="amount" type="number" placeholder={selectedUnit ? String(selectedUnit.balance) : ''} />
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Method</label>
              <select value={f('method') || 'ACH'} onChange={e => sf('method', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="ACH">ACH / Bank Transfer</option>
                <option value="check">Check</option>
                <option value="stripe">Stripe (Online)</option>
                <option value="cash">Cash</option>
                <option value="wire">Wire Transfer</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Impose Fee Modal ─── */}
      {modal === 'fee' && (
        <Modal title={`Impose Fee — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleFee}>
          <div className="space-y-3">
            <Field label="Amount *" k="amount" type="number" placeholder="25" />
            <Field label="Reason *" k="reason" placeholder="e.g., Late payment — Feb 2026" />
          </div>
        </Modal>
      )}

      {/* ─── Special Assessment Modal ─── */}
      {modal === 'special' && (
        <Modal title={`Special Assessment — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleSpecial}>
          <div className="space-y-3">
            <p className="text-xs text-ink-500 bg-amber-50 rounded-lg p-3 border border-amber-100">Special assessments are one-time charges for capital improvements, emergency repairs, or other board-approved expenditures. A GL entry will be posted automatically.</p>
            <Field label="Amount *" k="amount" type="number" placeholder="500" />
            <Field label="Reason *" k="reason" placeholder="e.g., Roof emergency repair assessment" />
          </div>
        </Modal>
      )}

      {/* ─── Stripe Connect Modal ─── */}
      {modal === 'stripe' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="border-b p-6">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-indigo-600" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
                <div>
                  <h2 className="text-xl font-bold text-ink-900">Stripe Connect</h2>
                  <p className="text-sm text-ink-400">Self-managed payment processing for your building</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Status */}
              <div className={`rounded-xl p-4 border ${store.stripeConnectId ? (store.stripeOnboardingComplete ? 'bg-sage-50 border-sage-200' : 'bg-amber-50 border-amber-200') : 'bg-mist-50 border-mist-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${store.stripeConnectId ? (store.stripeOnboardingComplete ? 'bg-sage-500' : 'bg-amber-500 animate-pulse') : 'bg-ink-300'}`} />
                  <span className="text-sm font-bold text-ink-900">
                    {store.stripeConnectId ? (store.stripeOnboardingComplete ? 'Connected & Active' : 'Onboarding Incomplete') : 'Not Connected'}
                  </span>
                </div>
                {store.stripeConnectId && <p className="text-xs text-ink-400 font-mono">Account: {store.stripeConnectId}</p>}
              </div>

              {/* What Stripe Connect enables */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-ink-800">What Stripe Connect enables:</h3>
                {[
                  { icon: '💳', text: 'Accept online payments (ACH, credit/debit cards)' },
                  { icon: '📧', text: 'Send payment links to residents for dues, fees, and assessments' },
                  { icon: '🔄', text: 'Automatic recurring monthly assessment billing' },
                  { icon: '📊', text: 'Real-time payment tracking and reconciliation' },
                  { icon: '🧾', text: 'Automatic receipt generation and email delivery' },
                  { icon: '🏦', text: 'Direct deposit to your building\'s bank account' },
                ].map(item => (
                  <div key={item.text} className="flex items-start gap-2.5 py-1.5">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-sm text-ink-600">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Integration note */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                <p className="text-xs text-indigo-800">
                  <strong>How it works:</strong> Your building creates a Stripe Connected Account. Stripe handles
                  PCI compliance, payment processing, and payouts. ONE two takes a small platform fee per transaction.
                  Funds are deposited directly into your building's operating account.
                </p>
              </div>

              {/* Server-side setup note */}
              <div className="bg-sand-100 border border-ink-100 rounded-lg p-3">
                <p className="text-xs text-ink-600">
                  <strong>Server-side setup required:</strong> Stripe Connect requires a backend server to securely create accounts,
                  generate account links, and process webhooks. The integration uses the Stripe V2 API with{' '}
                  <code className="bg-white px-1 py-0.5 rounded text-[11px] font-mono">stripeClient.v2.core.accounts.create()</code>{' '}
                  for connected account creation, and direct charges with application fees for payment processing.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                {!store.stripeConnectId ? (
                  <button onClick={() => {
                    // In production, this calls your backend: POST /api/stripe/create-account
                    // which calls stripeClient.v2.core.accounts.create({...})
                    // and returns the account ID + account link URL
                    const demoId = 'acct_' + Math.random().toString(36).slice(2, 14);
                    store.setStripeConnect(demoId);
                    alert(`Demo: Connected Account ${demoId} created.\n\nIn production, this redirects to Stripe's onboarding flow via Account Links (v2).`);
                  }} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 text-sm text-center">
                    Connect with Stripe →
                  </button>
                ) : !store.stripeOnboardingComplete ? (
                  <button onClick={() => {
                    // In production: POST /api/stripe/create-account-link
                    // which calls stripeClient.v2.core.accountLinks.create({...})
                    store.setStripeOnboarding(true);
                    alert('Demo: Onboarding marked complete.\n\nIn production, the user is redirected to Stripe\'s hosted onboarding via Account Links.');
                  }} className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 text-sm text-center">
                    Complete Onboarding →
                  </button>
                ) : (
                  <button onClick={() => window.open('https://dashboard.stripe.com', '_blank')} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 text-sm text-center">
                    Open Stripe Dashboard →
                  </button>
                )}
                <button onClick={() => setModal(null)} className="px-4 py-3 border border-ink-200 text-ink-600 rounded-lg font-medium text-sm hover:bg-ink-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
