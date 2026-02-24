import { useState, useRef, useEffect } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import Modal from '@/components/ui/Modal';
import type { Unit } from '@/types/financial';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type ModalKind = null | 'addUnit' | 'editUnit' | 'pay' | 'fee' | 'special' | 'detail' | 'stripe'
  | 'editMonthly' | 'bulkAssessment' | 'sendInvoice' | 'editDueDay';
type SortKey = 'number' | 'owner' | 'balance' | 'accountStatus';
type AccountFilter = 'all' | 'current' | 'behind' | 'delinquent' | 'vacant';

function getAccountStatus(u: Unit): { label: string; color: string; sortOrder: number } {
  if (u.status === 'VACANT') return { label: 'Vacant', color: 'bg-ink-100 text-ink-500', sortOrder: 4 };
  if (u.balance === 0) return { label: 'Current', color: 'bg-sage-100 text-sage-700', sortOrder: 0 };
  const monthsBehind = Math.ceil(u.balance / u.monthlyFee);
  if (monthsBehind <= 1) return { label: '1 Month Behind', color: 'bg-yellow-100 text-yellow-700', sortOrder: 1 };
  if (monthsBehind <= 2) return { label: '2 Months Behind', color: 'bg-orange-100 text-orange-700', sortOrder: 2 };
  return { label: 'Delinquent', color: 'bg-red-100 text-red-700', sortOrder: 3 };
}

function getUnitAddress(building: { address: { street: string; city: string; state: string; zip: string } }, unitNum: string) {
  const a = building.address;
  return `${a.street}, Unit ${unitNum}, ${a.city}, ${a.state} ${a.zip}`;
}

// Three-dot dropdown menu component
function ActionMenu({ unitNum, onEdit, onPay, onFee, onSpecial }: {
  unitNum: string; onEdit: () => void; onPay: () => void; onFee: () => void; onSpecial: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="p-1.5 hover:bg-ink-100 rounded-lg transition-colors">
        <svg className="w-4 h-4 text-ink-400" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-ink-200 rounded-lg shadow-lg py-1 w-44">
          {[
            { label: '✏️ Edit Unit', action: onEdit },
            { label: '💵 Record Payment', action: onPay },
            { label: '🚨 Apply Fee', action: onFee },
            { label: '📋 Special Assessment', action: onSpecial },
          ].map(item => (
            <button key={item.label} onClick={() => { item.action(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-mist-50 transition-colors">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TheUnitsTab() {
  const store = useFinancialStore();
  const building = useBuildingStore();
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const [modal, setModal] = useState<ModalKind>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [sort, setSort] = useState<SortKey>('number');
  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const resetForm = () => { setForm({}); setSelectedUnits([]); };

  const selectedUnit = store.units.find(u => u.number === selected);
  const stripeReady = store.stripeConnectId && store.stripeOnboardingComplete;

  let filtered = store.units.filter(u => {
    if (filter === 'current') return u.status === 'OCCUPIED' && u.balance === 0;
    if (filter === 'behind') return u.status === 'OCCUPIED' && u.balance > 0 && Math.ceil(u.balance / u.monthlyFee) <= 2;
    if (filter === 'delinquent') return u.status === 'OCCUPIED' && u.balance > 0 && Math.ceil(u.balance / u.monthlyFee) > 2;
    if (filter === 'vacant') return u.status === 'VACANT';
    return true;
  });
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(u => u.number.includes(q) || u.owner.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  filtered.sort((a, b) => {
    if (sort === 'balance') return b.balance - a.balance;
    if (sort === 'accountStatus') return getAccountStatus(a).sortOrder - getAccountStatus(b).sortOrder;
    if (sort === 'owner') return a.owner.localeCompare(b.owner);
    return a.number.localeCompare(b.number);
  });

  const totalUnits = store.units.length;
  const occupied = store.units.filter(u => u.status === 'OCCUPIED');
  const currentUnits = occupied.filter(u => u.balance === 0).length;
  const behindUnits = occupied.filter(u => u.balance > 0 && Math.ceil(u.balance / u.monthlyFee) <= 2).length;
  const delinquentCount = occupied.filter(u => u.balance > 0 && Math.ceil(u.balance / u.monthlyFee) > 2).length;
  const totalAR = store.units.reduce((s, u) => s + u.balance, 0);
  const monthlyRevenue = store.units.reduce((s, u) => s + u.monthlyFee, 0);
  const unpaidSAList = store.units.flatMap(u => u.specialAssessments.filter(a => !a.paid));
  const totalSAAR = unpaidSAList.reduce((s, a) => s + a.amount, 0);

  const filterCounts: Record<AccountFilter, number> = {
    all: store.units.length, current: currentUnits, behind: behindUnits,
    delinquent: delinquentCount, vacant: totalUnits - occupied.length,
  };

  const openDetail = (unitNum: string) => { setSelected(unitNum); setModal('detail'); };
  const openEdit = (unitNum: string) => {
    const u = store.units.find(x => x.number === unitNum);
    if (u) { setSelected(unitNum); setForm({ owner: u.owner, email: u.email, phone: u.phone, monthlyFee: String(u.monthlyFee), votingPct: String(u.votingPct), status: u.status, sqft: String(u.sqft), bedrooms: String(u.bedrooms), parking: u.parking || '', moveIn: u.moveIn || '' }); setModal('editUnit'); }
  };
  const openPay = (unitNum: string) => { setSelected(unitNum); resetForm(); setModal('pay'); };
  const openFee = (unitNum: string) => { setSelected(unitNum); resetForm(); sf('amount', '25'); sf('reason', 'Late payment'); setModal('fee'); };
  const openSpecial = (unitNum: string) => { setSelected(unitNum); resetForm(); setModal('special'); };

  const handleAddUnit = () => {
    if (!f('number') || !f('monthlyFee')) return alert('Unit number and monthly fee are required.');
    store.addUnit({ number: f('number'), owner: f('owner') || 'Vacant', email: f('email'), phone: f('phone'), monthlyFee: parseInt(f('monthlyFee')) || 0, votingPct: parseFloat(f('votingPct')) || 0, status: f('status') as 'OCCUPIED' | 'VACANT' || 'VACANT', balance: 0, moveIn: f('moveIn') || null, sqft: parseInt(f('sqft')) || 0, bedrooms: parseInt(f('bedrooms')) || 0, parking: f('parking') || null });
    setModal(null); resetForm();
  };
  const handleEditUnit = () => {
    if (!selected) return;
    store.updateUnit(selected, { owner: f('owner'), email: f('email'), phone: f('phone'), monthlyFee: parseInt(f('monthlyFee')) || 0, votingPct: parseFloat(f('votingPct')) || 0, status: f('status') as 'OCCUPIED' | 'VACANT', sqft: parseInt(f('sqft')) || 0, bedrooms: parseInt(f('bedrooms')) || 0, parking: f('parking') || null, moveIn: f('moveIn') || null });
    setModal(null); resetForm();
  };
  const handlePay = () => {
    if (!selected || !f('amount')) return;
    store.recordUnitPayment(selected, parseFloat(f('amount')), f('method') || 'ACH');
    setModal(null); resetForm();
  };
  // Send invoice email via Edge Function
  const [sending, setSending] = useState(false);

  const sendInvoiceEmail = async (invoiceId: string, unitNum: string, amount: number, description: string, type: 'fee' | 'special_assessment'): Promise<{ sent: boolean; paymentUrl?: string; error?: string }> => {
    const unit = store.units.find(u => u.number === unitNum);
    const ownerEmail = unit?.email || '';
    const ownerName = unit?.owner || '';

    if (!ownerEmail) {
      return { sent: false, error: `No email address on file for Unit ${unitNum}.` };
    }

    // Try Supabase Edge Function
    const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    if (!sbUrl || sbUrl.includes('YOUR_PROJECT') || !sbKey) {
      console.warn('Supabase env vars not configured, skipping email send');
      return { sent: false, error: 'Backend not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel environment variables.' };
    }

    const payload = {
      invoiceId, unitNumber: unitNum, ownerName, ownerEmail,
      amount, description, type, buildingName: building.name,
      buildingAddress: `${building.address.street}, ${building.address.city}, ${building.address.state} ${building.address.zip}`,
    };

    console.log('Sending invoice email:', payload);

    try {
      const res = await fetch(`${sbUrl}/functions/v1/send-unit-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
        },
        body: JSON.stringify(payload),
      });

      console.log('Invoice email response status:', res.status);

      if (!res.ok) {
        const text = await res.text();
        console.error('Invoice email error response:', text);
        if (res.status === 404) {
          return { sent: false, error: 'Edge Function not deployed. Run: supabase functions deploy send-unit-invoice --no-verify-jwt' };
        }
        return { sent: false, error: `Server error ${res.status}: ${text.slice(0, 100)}` };
      }

      const data = await res.json();
      console.log('Invoice email result:', data);

      if (data.stripeError) {
        console.warn('Stripe error:', data.stripeError);
      }

      if (data.success && data.emailSent) {
        return { sent: true, paymentUrl: data.paymentUrl, error: data.stripeError ? `Email sent but Stripe failed: ${data.stripeError}` : undefined };
      }
      return { sent: false, error: data.error || 'Email delivery failed — check Mailjet sender domain.' };
    } catch (err) {
      console.error('sendInvoiceEmail network error:', err);
      return { sent: false, error: `Network error: ${String(err)}` };
    }
  };

  const handleFee = async () => {
    if (!selected || !f('amount')) return;
    const amount = parseFloat(f('amount'));
    const reason = f('reason') || 'Late payment';
    setSending(true);
    store.imposeLateFee(selected, amount, reason);
    const invoice = store.createUnitInvoice(selected, 'fee', amount, `Late Fee: ${reason}`);
    const result = await sendInvoiceEmail(invoice.id, selected, amount, `Late Fee: ${reason}`, 'fee');
    setSending(false);
    const unit = store.units.find(u => u.number === selected);
    if (result.sent) {
      alert(`✅ Late fee of ${fmt(amount)} imposed on Unit ${selected}.\nInvoice ${invoice.id} created.\nEmail sent to ${unit?.email}.${result.paymentUrl ? '\n✅ Stripe payment link included.' : '\n⚠️ No Stripe payment link — ' + (result.error || 'check STRIPE_SECRET_KEY secret.')}`);
    } else {
      alert(`Late fee of ${fmt(amount)} imposed on Unit ${selected}.\nInvoice ${invoice.id} created.\n⚠️ Email: ${result.error}`);
    }
    setModal(null); resetForm();
  };
  const handleSpecial = async () => {
    if (!selected || !f('amount') || !f('reason')) return alert('Amount and reason required.');
    const amount = parseFloat(f('amount'));
    const reason = f('reason');
    setSending(true);
    store.addSpecialAssessment(selected, amount, reason);
    const invoice = store.createUnitInvoice(selected, 'special_assessment', amount, `Special Assessment: ${reason}`);
    const result = await sendInvoiceEmail(invoice.id, selected, amount, `Special Assessment: ${reason}`, 'special_assessment');
    setSending(false);
    const unit = store.units.find(u => u.number === selected);
    if (result.sent) {
      alert(`✅ Special assessment of ${fmt(amount)} added to Unit ${selected}.\nInvoice ${invoice.id} created.\nEmail sent to ${unit?.email}.${result.paymentUrl ? '\n✅ Stripe payment link included.' : '\n⚠️ No Stripe payment link — ' + (result.error || 'check STRIPE_SECRET_KEY secret.')}`);
    } else {
      alert(`Special assessment of ${fmt(amount)} added to Unit ${selected}.\nInvoice ${invoice.id} created.\n⚠️ Email: ${result.error}`);
    }
    setModal(null); resetForm();
  };
  const handleBulkAssessment = async () => {
    if (!f('amount') || !f('reason') || selectedUnits.length === 0) return alert('Select units, enter amount and reason.');
    const amount = parseFloat(f('amount'));
    const reason = f('reason');
    setSending(true);
    let sentCount = 0;
    for (const unitNum of selectedUnits) {
      store.addSpecialAssessment(unitNum, amount, reason);
      const invoice = store.createUnitInvoice(unitNum, 'special_assessment', amount, `Special Assessment: ${reason}`);
      const result = await sendInvoiceEmail(invoice.id, unitNum, amount, `Special Assessment: ${reason}`, 'special_assessment');
      if (result.sent) sentCount++;
    }
    setSending(false);
    alert(`Bulk assessment of ${fmt(amount)} applied to ${selectedUnits.length} units.\n✅ ${sentCount}/${selectedUnits.length} invoice emails sent.`);
    setModal(null); resetForm();
  };
  const handleSendInvoice = async () => {
    if (!f('unitNum') || !f('amount') || !f('description')) return alert('All fields required.');
    const amount = parseFloat(f('amount'));
    setSending(true);
    store.addSpecialAssessment(f('unitNum'), amount, f('description'));
    const invoice = store.createUnitInvoice(f('unitNum'), 'special_assessment', amount, f('description'));
    const result = await sendInvoiceEmail(invoice.id, f('unitNum'), amount, f('description'), 'special_assessment');
    setSending(false);
    const unit = store.units.find(u => u.number === f('unitNum'));
    if (result.sent) {
      alert(`✅ Invoice ${invoice.id} sent to ${unit?.owner || f('unitNum')} (${unit?.email}).`);
    } else {
      alert(`Invoice ${invoice.id} created for ${unit?.owner || f('unitNum')}.\n⚠️ Email: ${result.error}`);
    }
    setModal(null); resetForm();
  };
  const handleUpdateMonthly = () => {
    if (!f('unitNum') || !f('monthlyFee')) return;
    store.updateUnit(f('unitNum'), { monthlyFee: parseInt(f('monthlyFee')) });
    setModal(null); resetForm();
  };
  const handleStripeConnect = () => {
    const demoId = 'acct_' + Math.random().toString(36).slice(2, 14);
    store.setStripeConnect(demoId);
    alert(`Demo: Connected Account ${demoId} created.`);
  };
  const handleStripeOnboard = () => {
    store.setStripeOnboarding(true);
    alert("Demo: Onboarding complete.");
  };

  const Field = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div><label className="block text-xs font-medium text-ink-700 mb-1">{label}</label><input type={type} value={f(k)} onChange={e => sf(k, e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={placeholder} /></div>
  );

  // Get unit invoices for detail view
  const getUnitInvoices = (unitNum: string) => store.unitInvoices.filter(i => i.unitNumber === unitNum);

  return (
    <div className="space-y-5">

      {/* Stripe Connect Bar */}
      <div className={`rounded-xl border-2 px-5 py-4 flex items-center justify-between flex-wrap gap-3 ${stripeReady ? 'bg-sage-50 border-sage-200' : store.stripeConnectId ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-indigo-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${stripeReady ? 'bg-sage-500' : store.stripeConnectId ? 'bg-amber-500 animate-pulse' : 'bg-ink-300'}`} />
              <span className="text-sm font-semibold text-ink-900">{stripeReady ? 'Stripe Connected' : store.stripeConnectId ? 'Onboarding Incomplete' : 'Stripe Not Connected'}</span>
            </div>
            {store.stripeConnectId && <p className="text-[10px] text-ink-400 font-mono mt-0.5">{store.stripeConnectId}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {!store.stripeConnectId && <button onClick={handleStripeConnect} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Connect Stripe →</button>}
          {store.stripeConnectId && !store.stripeOnboardingComplete && <button onClick={handleStripeOnboard} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Complete Onboarding →</button>}
          {stripeReady && <button onClick={() => window.open('https://dashboard.stripe.com', '_blank')} className="px-3 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-ink-50">Dashboard ↗</button>}
          <button onClick={() => setModal('stripe')} className="px-3 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-ink-50">Details</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { val: String(totalUnits), label: 'Total Units', color: 'text-ink-900' },
          { val: String(currentUnits), label: 'Current', color: 'text-sage-600' },
          { val: String(behindUnits), label: 'Behind', color: behindUnits > 0 ? 'text-yellow-600' : 'text-sage-600' },
          { val: String(delinquentCount), label: 'Delinquent', color: delinquentCount > 0 ? 'text-red-600' : 'text-sage-600' },
          { val: fmt(totalAR + totalSAAR), label: 'Total Receivable', color: totalAR > 0 ? 'text-red-600' : 'text-sage-600' },
          { val: fmt(monthlyRevenue), label: 'Monthly Revenue', color: 'text-ink-900' },
        ].map(s => (
          <div key={s.label} className="bg-mist-50 rounded-lg p-3 border border-mist-100">
            <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[11px] text-ink-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      {isBoard && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { resetForm(); sf('dueDay', String(store.hoaDueDay)); setModal('editDueDay'); }} className="px-3 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-ink-50">⚙ Due Day</button>
          <button onClick={() => { resetForm(); setModal('editMonthly'); }} className="px-3 py-2 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-ink-50">📝 Edit Monthly Fee</button>
          <button onClick={() => { resetForm(); setSelectedUnits(occupied.map(u => u.number)); setModal('bulkAssessment'); }} className="px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700">📋 Bulk Assessment</button>
          {stripeReady && <button onClick={() => { resetForm(); setModal('sendInvoice'); }} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">💳 Send Invoice</button>}
          <div className="flex-1" />
          <button onClick={() => { resetForm(); sf('status', 'VACANT'); setModal('addUnit'); }} className="px-3 py-2 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">+ Add Unit</button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units, owners, email..." className="flex-1 min-w-[200px] px-3 py-2 border border-ink-200 rounded-lg text-sm" />
        <div className="flex gap-1.5">
          {(['all','current','behind','delinquent','vacant'] as AccountFilter[]).map(fv => (
            <button key={fv} onClick={() => setFilter(fv)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filter === fv ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}>
              {fv === 'all' ? 'All' : fv === 'behind' ? 'Behind' : fv.charAt(0).toUpperCase() + fv.slice(1)}
              {fv !== 'all' && filterCounts[fv] > 0 && <span className="ml-1 text-[10px] opacity-70">{filterCounts[fv]}</span>}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
          <option value="number">Sort: Unit #</option>
          <option value="owner">Sort: Owner</option>
          <option value="balance">Sort: Balance</option>
          <option value="accountStatus">Sort: Status</option>
        </select>
      </div>

      {/* Units Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink-200 text-left">
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Unit</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Owner</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Monthly</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Balance</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Fees / SA</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Account Status</th>
              <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Last Payment</th>
              {isBoard && <th className="py-3 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wider text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const acct = getAccountStatus(u);
              const activeFees = u.lateFees.filter(lf => !lf.waived).length;
              const unitUnpaidSA = u.specialAssessments.filter(a => !a.paid).length;
              const lastPay = u.payments.length > 0 ? [...u.payments].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
              return (
                <tr key={u.number} className={`border-b border-ink-50 hover:bg-mist-50 transition-colors ${acct.sortOrder >= 3 && u.status !== 'VACANT' ? 'bg-red-50 bg-opacity-30' : acct.sortOrder >= 1 && u.status !== 'VACANT' ? 'bg-yellow-50 bg-opacity-20' : ''}`}>
                  <td className="py-3 px-3"><button onClick={() => openDetail(u.number)} className="font-bold text-accent-600 hover:text-accent-700">{u.number}</button></td>
                  <td className="py-3 px-3"><div><p className="font-medium text-ink-900">{u.owner}</p><p className="text-xs text-ink-400">{u.email}</p></div></td>
                  <td className="py-3 px-3 font-medium text-ink-900">{fmt(u.monthlyFee)}</td>
                  <td className="py-3 px-3"><span className={`font-bold ${u.balance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(u.balance)}</span></td>
                  <td className="py-3 px-3">
                    <div className="flex gap-1">
                      {activeFees > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">{activeFees} fee{activeFees > 1 ? 's' : ''}</span>}
                      {unitUnpaidSA > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{unitUnpaidSA} SA</span>}
                      {activeFees === 0 && unitUnpaidSA === 0 && <span className="text-ink-300">—</span>}
                    </div>
                  </td>
                  <td className="py-3 px-3"><span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${acct.color}`}>{acct.label}</span></td>
                  <td className="py-3 px-3 text-xs text-ink-400">{lastPay ? `${lastPay.date} · ${lastPay.method}` : '—'}</td>
                  {isBoard && (
                    <td className="py-3 px-3 text-right">
                      <ActionMenu unitNum={u.number} onEdit={() => openEdit(u.number)} onPay={() => openPay(u.number)} onFee={() => openFee(u.number)} onSpecial={() => openSpecial(u.number)} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-sm text-ink-400">No units match filters.</p>}
      </div>
      <p className="text-xs text-ink-400">{filtered.length} unit{filtered.length !== 1 ? 's' : ''} shown{filter !== 'all' ? ` (${filter})` : ''}</p>

      {/* ═══ MODALS ═══ */}

      {modal === 'detail' && selectedUnit && (() => {
        const unitAddr = getUnitAddress(building, selectedUnit.number);
        const invoices = getUnitInvoices(selectedUnit.number);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="border-b p-6 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3"><h2 className="text-xl font-bold text-ink-900">Unit {selectedUnit.number}</h2><span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${getAccountStatus(selectedUnit).color}`}>{getAccountStatus(selectedUnit).label}</span></div>
                  <p className="text-sm text-ink-400">{selectedUnit.owner} · {selectedUnit.email}</p>
                  <p className="text-xs text-ink-300 mt-1">{unitAddr}</p>
                </div>
                <div className="flex gap-2">
                  {isBoard && <button onClick={() => openEdit(selectedUnit.number)} className="px-3 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-50">Edit</button>}
                  <button onClick={() => setModal(null)} className="text-ink-400 hover:text-ink-600 text-xl">✕</button>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[{ label: 'Monthly Fee', val: fmt(selectedUnit.monthlyFee) }, { label: 'Balance', val: fmt(selectedUnit.balance), red: selectedUnit.balance > 0 }, { label: 'Sq Ft', val: String(selectedUnit.sqft) }, { label: 'Bedrooms', val: String(selectedUnit.bedrooms) }].map(s => (
                    <div key={s.label} className="bg-mist-50 rounded-lg p-3 border border-mist-100"><p className="text-[11px] text-ink-400">{s.label}</p><p className={`text-lg font-bold ${s.red ? 'text-red-600' : 'text-ink-900'}`}>{s.val}</p></div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><span className="text-ink-400">Status:</span> <span className="font-medium">{selectedUnit.status}</span></div>
                  <div><span className="text-ink-400">Move-in:</span> <span className="font-medium">{selectedUnit.moveIn || '—'}</span></div>
                  <div><span className="text-ink-400">Parking:</span> <span className="font-medium">{selectedUnit.parking || '—'}</span></div>
                </div>

                {/* Late Fees */}
                <div>
                  <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-ink-800">Late Fees & Fines</h3>{isBoard && <button onClick={() => openFee(selectedUnit.number)} className="text-xs text-red-600 font-medium">+ Impose Fee</button>}</div>
                  {selectedUnit.lateFees.length === 0 ? <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No fees.</p> : (
                    <div className="space-y-1.5">{selectedUnit.lateFees.map((lf, i) => (
                      <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${lf.waived ? 'bg-ink-50 border-ink-100 opacity-50' : 'bg-red-50 border-red-100'}`}>
                        <div><span className={`text-sm font-medium ${lf.waived ? 'line-through text-ink-400' : 'text-ink-900'}`}>{fmt(lf.amount)}</span><span className="text-xs text-ink-400 ml-2">{lf.reason}</span><span className="text-xs text-ink-300 ml-2">{lf.date}</span></div>
                        {!lf.waived && isBoard && <button onClick={() => store.waiveLateFee(selectedUnit.number, i)} className="text-xs text-sage-600 font-medium">Waive</button>}
                        {lf.waived && <span className="text-[10px] text-sage-500 font-semibold">WAIVED</span>}
                      </div>
                    ))}</div>
                  )}
                </div>

                {/* Special Assessments */}
                <div>
                  <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-ink-800">Special Assessments</h3>{isBoard && <button onClick={() => openSpecial(selectedUnit.number)} className="text-xs text-amber-600 font-medium">+ Add Assessment</button>}</div>
                  {selectedUnit.specialAssessments.length === 0 ? <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No special assessments.</p> : (
                    <div className="space-y-1.5">{selectedUnit.specialAssessments.map(sa => (
                      <div key={sa.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${sa.paid ? 'bg-sage-50 border-sage-100' : 'bg-amber-50 border-amber-100'}`}>
                        <div><span className={`text-sm font-medium ${sa.paid ? 'text-sage-700' : 'text-ink-900'}`}>{fmt(sa.amount)}</span><span className="text-xs text-ink-400 ml-2">{sa.reason}</span><span className="text-xs text-ink-300 ml-2">{sa.date}</span></div>
                        {sa.paid ? <span className="text-[10px] text-sage-600 font-semibold">PAID {sa.paidDate}</span> : isBoard ? <button onClick={() => store.markSpecialAssessmentPaid(selectedUnit.number, sa.id)} className="px-2.5 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Paid</button> : <span className="text-[10px] text-amber-600 font-semibold">OUTSTANDING</span>}
                      </div>
                    ))}</div>
                  )}
                </div>

                {/* Invoices */}
                {invoices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-ink-800 mb-2">Invoices</h3>
                    <div className="space-y-1.5">{invoices.map(inv => (
                      <div key={inv.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${inv.status === 'paid' ? 'bg-sage-50 border-sage-100' : 'bg-white border-ink-100'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-ink-400">{inv.id}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${inv.status === 'paid' ? 'bg-sage-100 text-sage-700' : inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-accent-100 text-accent-700'}`}>{inv.status.toUpperCase()}</span>
                          </div>
                          <p className="text-xs text-ink-600 mt-0.5">{inv.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-ink-900">{fmt(inv.amount)}</p>
                          <p className="text-[10px] text-ink-400">{inv.createdDate}</p>
                        </div>
                      </div>
                    ))}</div>
                  </div>
                )}

                {/* Payment History */}
                <div>
                  <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-ink-800">Payment History</h3>{isBoard && <button onClick={() => openPay(selectedUnit.number)} className="text-xs text-sage-600 font-medium">+ Record Payment</button>}</div>
                  {selectedUnit.payments.length === 0 ? <p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-3">No payments recorded.</p> : (
                    <div className="space-y-1">{[...selectedUnit.payments].reverse().map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-mist-50 rounded-lg border border-mist-100">
                        <div className="flex items-center gap-3"><span className="text-sage-500">💳</span><div><span className="text-sm font-medium text-ink-900">{fmt(p.amount)}</span><span className="text-xs text-ink-400 ml-2">via {p.method}</span>{p.note && <span className="text-xs text-ink-300 ml-2">{p.note}</span>}</div></div>
                        <span className="text-xs text-ink-400">{p.date}</span>
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {modal === 'addUnit' && <Modal title="Add Unit" onClose={() => { setModal(null); resetForm(); }} onSave={handleAddUnit}><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Unit Number *" k="number" placeholder="e.g., 601" /><Field label="Monthly Fee *" k="monthlyFee" type="number" placeholder="450" /></div><p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-2">Address: {building.address.street}, Unit {f('number') || '___'}, {building.address.city}, {building.address.state} {building.address.zip}</p><Field label="Owner Name" k="owner" placeholder="Owner name or Vacant" /><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Phone" k="phone" /></div><div className="grid grid-cols-3 gap-3"><Field label="Sq Ft" k="sqft" type="number" /><Field label="Bedrooms" k="bedrooms" type="number" /><Field label="Parking" k="parking" placeholder="P-601" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="VACANT">Vacant</option><option value="OCCUPIED">Occupied</option></select></div><Field label="Voting %" k="votingPct" type="number" placeholder="2.1" /></div><Field label="Move-in Date" k="moveIn" type="date" /></div></Modal>}

      {modal === 'editUnit' && <Modal title={`Edit Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleEditUnit}><div className="space-y-3"><p className="text-xs text-ink-400 bg-mist-50 rounded-lg p-2">{getUnitAddress(building, selected || '')}</p><Field label="Owner Name" k="owner" /><div className="grid grid-cols-2 gap-3"><Field label="Email" k="email" type="email" /><Field label="Phone" k="phone" /></div><div className="grid grid-cols-2 gap-3"><Field label="Monthly Fee" k="monthlyFee" type="number" /><Field label="Voting %" k="votingPct" type="number" /></div><div className="grid grid-cols-3 gap-3"><Field label="Sq Ft" k="sqft" type="number" /><Field label="Bedrooms" k="bedrooms" type="number" /><Field label="Parking" k="parking" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="OCCUPIED">Occupied</option><option value="VACANT">Vacant</option></select></div><Field label="Move-in Date" k="moveIn" type="date" /></div>{isBoard && <div className="pt-2 border-t"><button onClick={() => { if (confirm(`Delete unit ${selected}?`)) { store.removeUnit(selected!); setModal(null); resetForm(); } }} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete this unit</button></div>}</div></Modal>}

      {modal === 'pay' && <Modal title={`Record Payment — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handlePay}><div className="space-y-3"><Field label="Amount *" k="amount" type="number" placeholder={selectedUnit ? String(selectedUnit.balance) : ''} /><div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={f('method') || 'ACH'} onChange={e => sf('method', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="ACH">ACH / Bank Transfer</option><option value="check">Check</option>{stripeReady && <option value="stripe">Stripe (Online)</option>}<option value="cash">Cash</option><option value="wire">Wire Transfer</option></select></div></div></Modal>}

      {modal === 'fee' && <Modal title={`Impose Fee — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleFee} saveLabel={sending ? 'Sending...' : 'Save'}><div className="space-y-3"><p className="text-xs text-ink-500 bg-amber-50 rounded-lg p-3 border border-amber-100">A fee invoice will be created, recorded in the GL, and emailed to the unit owner.</p><Field label="Amount *" k="amount" type="number" placeholder="25" /><Field label="Reason *" k="reason" placeholder="e.g., Late payment — Feb 2026" />{sending && <div className="flex items-center gap-2 text-xs text-accent-600"><span className="animate-spin">⏳</span> Sending invoice email...</div>}</div></Modal>}

      {modal === 'special' && <Modal title={`Special Assessment — Unit ${selected}`} onClose={() => { setModal(null); resetForm(); }} onSave={handleSpecial} saveLabel={sending ? 'Sending...' : 'Save'}><div className="space-y-3"><p className="text-xs text-ink-500 bg-amber-50 rounded-lg p-3 border border-amber-100">A special assessment invoice will be created, recorded in the GL, and emailed to the unit owner with a Stripe payment link.</p><Field label="Amount *" k="amount" type="number" placeholder="500" /><Field label="Reason *" k="reason" placeholder="e.g., Roof emergency repair assessment" />{sending && <div className="flex items-center gap-2 text-xs text-accent-600"><span className="animate-spin">⏳</span> Sending invoice email...</div>}</div></Modal>}

      {modal === 'editDueDay' && <Modal title="Assessment Due Day" onClose={() => { setModal(null); resetForm(); }} onSave={() => { store.setHoaDueDay(parseInt(f('dueDay')) || 1); setModal(null); resetForm(); }}><div className="space-y-3"><p className="text-xs text-ink-500">Set the day of the month when monthly assessments are due.</p><div><label className="block text-xs font-medium text-ink-700 mb-1">Due Day (1-28)</label><input type="number" min="1" max="28" value={f('dueDay')} onChange={e => sf('dueDay', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div></div></Modal>}

      {modal === 'editMonthly' && <Modal title="Edit Unit Monthly Fee" onClose={() => { setModal(null); resetForm(); }} onSave={handleUpdateMonthly}><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Select Unit</label><select value={f('unitNum')} onChange={e => { sf('unitNum', e.target.value); const u = store.units.find(x => x.number === e.target.value); if (u) sf('monthlyFee', String(u.monthlyFee)); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select unit...</option>{store.units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner} ({fmt(u.monthlyFee)})</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">New Monthly Fee</label><input type="number" value={f('monthlyFee')} onChange={e => sf('monthlyFee', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div></div></Modal>}

      {modal === 'bulkAssessment' && <Modal title="Bulk Special Assessment" onClose={() => { setModal(null); resetForm(); }} onSave={handleBulkAssessment} saveLabel="Apply Assessment"><div className="space-y-3"><p className="text-xs text-ink-500 bg-amber-50 rounded-lg p-3 border border-amber-100">Apply a one-time special assessment to multiple units. Invoices will be created for each unit and recorded in the GL.</p><div><label className="block text-xs font-medium text-ink-700 mb-1">Amount per unit *</label><input type="number" value={f('amount')} onChange={e => sf('amount', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="500" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Reason *</label><input value={f('reason')} onChange={e => sf('reason', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Roof emergency repair" /></div><div><div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-ink-700">Apply to units ({selectedUnits.length} selected)</label><div className="flex gap-2"><button type="button" onClick={() => setSelectedUnits(occupied.map(u => u.number))} className="text-[10px] text-accent-600 font-medium">All Occupied</button><button type="button" onClick={() => setSelectedUnits([])} className="text-[10px] text-ink-400 font-medium">Clear</button></div></div><div className="max-h-40 overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-50">{store.units.filter(u => u.status === 'OCCUPIED').map(u => (<label key={u.number} className="flex items-center gap-2 px-3 py-2 hover:bg-mist-50 cursor-pointer"><input type="checkbox" checked={selectedUnits.includes(u.number)} onChange={e => { if (e.target.checked) setSelectedUnits(p => [...p, u.number]); else setSelectedUnits(p => p.filter(n => n !== u.number)); }} className="rounded" /><span className="text-xs font-medium text-ink-700">{u.number}</span><span className="text-xs text-ink-400">{u.owner}</span></label>))}</div></div>{f('amount') && selectedUnits.length > 0 && <div className="bg-white border border-ink-200 rounded-lg p-3 text-center"><p className="text-xs text-ink-500">Total: <strong className="text-ink-900">{fmt(parseFloat(f('amount')) * selectedUnits.length)}</strong> across {selectedUnits.length} units</p></div>}</div></Modal>}

      {modal === 'sendInvoice' && <Modal title="Send Payment Invoice" onClose={() => { setModal(null); resetForm(); }} onSave={handleSendInvoice} saveLabel="Send Invoice"><div className="space-y-3"><p className="text-xs text-ink-500 bg-indigo-50 rounded-lg p-3 border border-indigo-100">Create an invoice and email the payment link to the unit owner. Recorded in GL.</p><div><label className="block text-xs font-medium text-ink-700 mb-1">Unit *</label><select value={f('unitNum')} onChange={e => sf('unitNum', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select unit...</option>{store.units.filter(u => u.status === 'OCCUPIED').map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}</select></div><Field label="Amount *" k="amount" type="number" placeholder="500" /><Field label="Description *" k="description" placeholder="e.g., Window replacement — Unit 301" /></div></Modal>}

      {modal === 'stripe' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="border-b p-6"><div className="flex items-center gap-3"><svg className="w-8 h-8 text-indigo-600" viewBox="0 0 24 24" fill="currentColor"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg><div><h2 className="text-xl font-bold text-ink-900">Stripe Connect</h2><p className="text-sm text-ink-400">Payment processing for {building.name}</p></div></div></div>
            <div className="p-6 space-y-4">
              <div className={`rounded-xl p-4 border ${stripeReady ? 'bg-sage-50 border-sage-200' : store.stripeConnectId ? 'bg-amber-50 border-amber-200' : 'bg-mist-50 border-mist-200'}`}><div className="flex items-center gap-2 mb-1"><span className={`w-2.5 h-2.5 rounded-full ${stripeReady ? 'bg-sage-500' : store.stripeConnectId ? 'bg-amber-500 animate-pulse' : 'bg-ink-300'}`} /><span className="text-sm font-bold text-ink-900">{stripeReady ? 'Connected & Active' : store.stripeConnectId ? 'Onboarding Incomplete' : 'Not Connected'}</span></div>{store.stripeConnectId && <p className="text-xs text-ink-400 font-mono">Account: {store.stripeConnectId}</p>}</div>
              <div className="flex gap-3">
                {!store.stripeConnectId ? <button onClick={handleStripeConnect} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 text-sm">Connect with Stripe →</button> : !store.stripeOnboardingComplete ? <button onClick={handleStripeOnboard} className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 text-sm">Complete Onboarding →</button> : <button onClick={() => window.open('https://dashboard.stripe.com', '_blank')} className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 text-sm">Open Stripe Dashboard →</button>}
                <button onClick={() => setModal(null)} className="px-4 py-3 border border-ink-200 text-ink-600 rounded-lg font-medium text-sm hover:bg-ink-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

