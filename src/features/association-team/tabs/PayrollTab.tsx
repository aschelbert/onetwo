import { useState, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import { usePayrollStore } from '@/store/usePayrollStore';
import type { StaffMember, TimeEntry, PayRun } from '@/store/usePayrollStore';
import { supabase } from '@/lib/supabase';

/* ── Helpers ───────────────────────────────────────────────── */

const fmt$ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const SUB_TABS = ['staff', 'time', 'pay', '1099s'] as const;
type SubTab = typeof SUB_TABS[number];
const SUB_TAB_LABELS: Record<SubTab, string> = { staff: 'Staff Directory', time: 'Time Tracking', pay: 'Pay History', '1099s': '1099s' };

const EMPTY_STAFF: Omit<StaffMember, 'id'> = { name: '', type: 'employee', role: '', rate: 0, email: '', phone: '', taxId: '', startDate: '', status: 'active', stripeAccountId: null, stripeOnboardingComplete: false };

/* ── Component ─────────────────────────────────────────────── */

export default function PayrollTab() {
  const { staff, timeEntries, payRuns, form1099s, addStaff, updateStaff, updateStaffStripe, addTimeEntry, updateTimeEntry, deleteTimeEntry, createPayRun, processPayRun, generate1099, markSent } = usePayrollStore();

  const [subTab, setSubTab] = useState<SubTab>('staff');

  /* ── Staff modals ──────────────── */
  const [staffModal, setStaffModal] = useState<'add' | 'edit' | null>(null);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [editStaffId, setEditStaffId] = useState<string | null>(null);

  const openAddStaff = () => { setStaffForm(EMPTY_STAFF); setStaffModal('add'); };
  const openEditStaff = (s: StaffMember) => {
    const { id, ...rest } = s;
    setStaffForm(rest); setEditStaffId(id); setStaffModal('edit');
  };
  const saveStaff = () => {
    if (staffModal === 'add') addStaff(staffForm);
    else if (editStaffId) updateStaff(editStaffId, staffForm);
    setStaffModal(null);
  };

  /* ── Time entry modals ─────────── */
  const [timeModal, setTimeModal] = useState(false);
  const [timeForm, setTimeForm] = useState<Omit<TimeEntry, 'id'>>({ staffId: '', date: '', hours: 0, description: '' });
  const [editTimeId, setEditTimeId] = useState<string | null>(null);
  const [filterStaff, setFilterStaff] = useState('all');
  const [filterMonth, setFilterMonth] = useState('2026-01');

  const openAddTime = () => { setTimeForm({ staffId: staff[0]?.id ?? '', date: '', hours: 0, description: '' }); setEditTimeId(null); setTimeModal(true); };
  const openEditTime = (e: TimeEntry) => {
    setTimeForm({ staffId: e.staffId, date: e.date, hours: e.hours, description: e.description });
    setEditTimeId(e.id); setTimeModal(true);
  };
  const saveTime = () => {
    if (editTimeId) updateTimeEntry(editTimeId, timeForm);
    else addTimeEntry(timeForm);
    setTimeModal(false);
  };

  const filteredTime = useMemo(() => {
    return timeEntries
      .filter(e => (filterStaff === 'all' || e.staffId === filterStaff) && e.date.startsWith(filterMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [timeEntries, filterStaff, filterMonth]);

  const totalHrs = filteredTime.reduce((s, e) => s + e.hours, 0);
  const totalGross = filteredTime.reduce((s, e) => {
    const m = staff.find(st => st.id === e.staffId);
    return s + (m ? e.hours * m.rate : 0);
  }, 0);

  /* ── Pay run modal ─────────────── */
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ staffId: '', periodStart: '', periodEnd: '' });

  const openRunPayroll = () => { setPayForm({ staffId: staff[0]?.id ?? '', periodStart: '', periodEnd: '' }); setPayModal(true); };
  const runPayroll = () => {
    if (payForm.staffId && payForm.periodStart && payForm.periodEnd) {
      createPayRun(payForm.staffId, payForm.periodStart, payForm.periodEnd);
    }
    setPayModal(false);
  };

  /* ── Process Payment modal ──────── */
  const [processModal, setProcessModal] = useState<PayRun | null>(null);
  const [processMethod, setProcessMethod] = useState<'stripe' | 'manual'>('manual');
  const [processing, setProcessing] = useState(false);

  const openProcessModal = (pr: PayRun) => {
    const member = staff.find(s => s.id === pr.staffId);
    setProcessMethod(member?.stripeAccountId && member.stripeOnboardingComplete ? 'stripe' : 'manual');
    setProcessModal(pr);
  };

  const handleProcess = async () => {
    if (!processModal) return;
    setProcessing(true);
    await processPayRun(processModal.id, processMethod);
    setProcessing(false);
    setProcessModal(null);
  };

  /* ── Pay Stub modal ─────────────── */
  const [stubPayRun, setStubPayRun] = useState<PayRun | null>(null);
  const stubMember = stubPayRun ? staff.find(s => s.id === stubPayRun.staffId) : null;
  const stubTimeEntries = stubPayRun ? timeEntries.filter(e =>
    e.staffId === stubPayRun.staffId && e.date >= stubPayRun.periodStart && e.date <= stubPayRun.periodEnd
  ).sort((a, b) => a.date.localeCompare(b.date)) : [];

  /* ── Stripe connect helpers ─────── */
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);

  const handleConnectStripe = async (s: StaffMember) => {
    if (!supabase) return;
    setStripeLoading(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('staff-payment', {
        body: { action: 'create_staff_account', staffName: s.name },
      });
      if (error || !data?.stripeAccountId) {
        alert('Failed to create Stripe account');
        setStripeLoading(null);
        return;
      }
      updateStaffStripe(s.id, data.stripeAccountId, false);
      if (data.onboardingUrl) window.open(data.onboardingUrl, '_blank');
    } catch {
      alert('Failed to connect Stripe');
    }
    setStripeLoading(null);
  };

  const handleCheckStripeStatus = async (s: StaffMember) => {
    if (!supabase || !s.stripeAccountId) return;
    setStripeLoading(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('staff-payment', {
        body: { action: 'check_staff_status', stripeAccountId: s.stripeAccountId },
      });
      if (error) {
        alert('Failed to check status');
        setStripeLoading(null);
        return;
      }
      if (data?.onboardingComplete) {
        updateStaffStripe(s.id, s.stripeAccountId, true);
      } else if (data?.onboardingUrl) {
        window.open(data.onboardingUrl, '_blank');
      }
    } catch {
      alert('Failed to check Stripe status');
    }
    setStripeLoading(null);
  };

  /* ── 1099 state ────────────────── */
  const [year1099, setYear1099] = useState(2026);
  const [preview1099Staff, setPreview1099Staff] = useState<string | null>(null);

  const contractors = staff.filter(s => s.type === 'contractor' && s.status === 'active');

  const get1099 = (staffId: string) => form1099s.find(f => f.staffId === staffId && f.year === year1099);
  const getYTDPay = (staffId: string) =>
    payRuns.filter(pr => pr.staffId === staffId && pr.status === 'paid' && pr.periodStart.startsWith(String(year1099)))
      .reduce((s, pr) => s + pr.grossPay, 0);

  const previewContractor = preview1099Staff ? staff.find(s => s.id === preview1099Staff) : null;
  const preview1099Form = preview1099Staff ? get1099(preview1099Staff) : null;

  /* ── Counts ────────────────────── */
  const employeeCount = staff.filter(s => s.type === 'employee' && s.status === 'active').length;
  const contractorCount = staff.filter(s => s.type === 'contractor' && s.status === 'active').length;

  const staffName = (id: string) => staff.find(s => s.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex gap-1 bg-ink-50 rounded-lg p-1">
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              subTab === t ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {SUB_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ═══════════ STAFF DIRECTORY ═══════════ */}
      {subTab === 'staff' && (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-ink-50 rounded-lg p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">Total Staff</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{employeeCount + contractorCount}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Employees</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{employeeCount}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Contractors</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{contractorCount}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <button onClick={openAddStaff} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Add Staff</button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-ink-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium text-right">Rate</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Stripe</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {staff.map(s => (
                  <tr key={s.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3 font-medium text-ink-900">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.type === 'employee' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {s.type === 'employee' ? 'Employee' : 'Contractor'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{s.role}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{fmt$(s.rate)}/hr</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'
                      }`}>
                        {s.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.stripeAccountId && s.stripeOnboardingComplete ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Connected
                        </span>
                      ) : s.stripeAccountId && !s.stripeOnboardingComplete ? (
                        <button
                          onClick={() => handleCheckStripeStatus(s)}
                          disabled={stripeLoading === s.id}
                          className="text-xs text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50"
                        >
                          {stripeLoading === s.id ? 'Checking...' : 'Complete Setup'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnectStripe(s)}
                          disabled={stripeLoading === s.id}
                          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {stripeLoading === s.id ? 'Creating...' : 'Connect Stripe'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEditStaff(s)} className="text-ink-400 hover:text-ink-700 text-sm">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ TIME TRACKING ═══════════ */}
      {subTab === 'time' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
              className="border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="all">All Staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white" />
            <div className="flex-1" />
            <button onClick={openAddTime} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Add Entry</button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-ink-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium text-right">Hours</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredTime.map(e => (
                  <tr key={e.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3 text-ink-600">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 font-medium text-ink-900">{staffName(e.staffId)}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{e.hours}</td>
                    <td className="px-4 py-3 text-ink-600">{e.description}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => openEditTime(e)} className="text-ink-400 hover:text-ink-700 text-sm">Edit</button>
                      <button onClick={() => deleteTimeEntry(e.id)} className="text-red-400 hover:text-red-600 text-sm">Delete</button>
                    </td>
                  </tr>
                ))}
                {filteredTime.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No time entries for this period</td></tr>
                )}
              </tbody>
              {filteredTime.length > 0 && (
                <tfoot className="bg-ink-50 font-medium text-ink-900">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>Totals</td>
                    <td className="px-4 py-3 text-right">{totalHrs} hrs</td>
                    <td className="px-4 py-3">{fmt$(totalGross)} gross</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ PAY HISTORY ═══════════ */}
      {subTab === 'pay' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openRunPayroll} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">Run Payroll</button>
          </div>

          <div className="overflow-x-auto border border-ink-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium text-right">Hours</th>
                  <th className="px-4 py-3 font-medium text-right">Gross</th>
                  <th className="px-4 py-3 font-medium text-right">Deductions</th>
                  <th className="px-4 py-3 font-medium text-right">Net</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {payRuns.map(pr => (
                  <tr key={pr.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3 font-medium text-ink-900">{staffName(pr.staffId)}</td>
                    <td className="px-4 py-3 text-ink-600">{fmtDate(pr.periodStart)} – {fmtDate(pr.periodEnd)}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{pr.hoursWorked}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{fmt$(pr.grossPay)}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{fmt$(pr.deductions)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-900">{fmt$(pr.netPay)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        pr.status === 'paid' ? 'bg-sage-100 text-sage-700' :
                        pr.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        pr.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {pr.status === 'paid' ? 'Paid' : pr.status === 'processing' ? 'Processing' : pr.status === 'failed' ? 'Failed' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {pr.status === 'draft' && (
                        <button onClick={() => openProcessModal(pr)}
                          className="px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">
                          Process
                        </button>
                      )}
                      {pr.status === 'failed' && (
                        <button onClick={() => openProcessModal(pr)}
                          className="px-3 py-1 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700">
                          Retry
                        </button>
                      )}
                      {pr.status === 'paid' && (
                        <button onClick={() => setStubPayRun(pr)}
                          className="px-3 py-1 border border-ink-200 text-ink-700 rounded-md text-xs font-medium hover:bg-ink-50">
                          View Stub
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {payRuns.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-400">No pay runs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ 1099s ═══════════ */}
      {subTab === '1099s' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-ink-700">Tax Year</label>
            <select value={year1099} onChange={e => setYear1099(Number(e.target.value))}
              className="border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>

          {contractors.length === 0 && (
            <div className="text-center py-12 text-ink-400">No active contractors</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contractors.map(c => {
              const f = get1099(c.id);
              const ytd = getYTDPay(c.id);
              return (
                <div key={c.id} className="border border-ink-100 rounded-lg p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-ink-900">{c.name}</h4>
                      <p className="text-sm text-ink-500">{c.role}</p>
                    </div>
                    {f && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        f.status === 'sent' ? 'bg-sage-100 text-sage-700' :
                        f.status === 'generated' ? 'bg-blue-100 text-blue-700' :
                        'bg-ink-100 text-ink-500'
                      }`}>
                        {f.status === 'sent' ? 'Sent' : f.status === 'generated' ? 'Generated' : 'Draft'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-500">TIN: {c.taxId}</span>
                    <span className="font-medium text-ink-900">YTD: {fmt$(ytd)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => generate1099(c.id, year1099)}
                      className="px-3 py-1.5 bg-ink-900 text-white rounded-md text-xs font-medium hover:bg-ink-800">
                      {f ? 'Regenerate 1099' : 'Generate 1099'}
                    </button>
                    {f && f.status === 'generated' && (
                      <>
                        <button onClick={() => setPreview1099Staff(c.id)}
                          className="px-3 py-1.5 border border-ink-200 rounded-md text-xs font-medium text-ink-700 hover:bg-ink-50">
                          Preview
                        </button>
                        <button onClick={() => markSent(f.id)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">
                          Mark as Sent
                        </button>
                      </>
                    )}
                    {f && f.status === 'sent' && (
                      <button onClick={() => setPreview1099Staff(c.id)}
                        className="px-3 py-1.5 border border-ink-200 rounded-md text-xs font-medium text-ink-700 hover:bg-ink-50">
                        Preview
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Staff Add/Edit */}
      {staffModal && (
        <Modal title={staffModal === 'add' ? 'Add Staff Member' : 'Edit Staff Member'} onClose={() => setStaffModal(null)} onSave={saveStaff} saveLabel={staffModal === 'add' ? 'Add' : 'Save'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Name</label>
              <input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" placeholder="Full name or business name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Type</label>
                <select value={staffForm.type} onChange={e => setStaffForm(f => ({ ...f, type: e.target.value as 'employee' | 'contractor' }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Role</label>
                <input value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Superintendent" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Hourly Rate ($)</label>
                <input type="number" value={staffForm.rate || ''} onChange={e => setStaffForm(f => ({ ...f, rate: Number(e.target.value) }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Start Date</label>
                <input type="date" value={staffForm.startDate} onChange={e => setStaffForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
                <input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Phone</label>
                <input value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Tax ID (SSN / EIN)</label>
                <input value={staffForm.taxId} onChange={e => setStaffForm(f => ({ ...f, taxId: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" placeholder="***-**-1234" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Status</label>
                <select value={staffForm.status} onChange={e => setStaffForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Time Entry Add/Edit */}
      {timeModal && (
        <Modal title={editTimeId ? 'Edit Time Entry' : 'Add Time Entry'} onClose={() => setTimeModal(false)} onSave={saveTime} saveLabel={editTimeId ? 'Save' : 'Add'}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Staff Member</label>
              <select value={timeForm.staffId} onChange={e => setTimeForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Date</label>
                <input type="date" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Hours</label>
                <input type="number" step="0.5" value={timeForm.hours || ''} onChange={e => setTimeForm(f => ({ ...f, hours: Number(e.target.value) }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Description</label>
              <input value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" placeholder="Work performed" />
            </div>
          </div>
        </Modal>
      )}

      {/* Run Payroll */}
      {payModal && (
        <Modal title="Run Payroll" onClose={() => setPayModal(false)} onSave={runPayroll} saveLabel="Create Pay Run">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Staff Member</label>
              <select value={payForm.staffId} onChange={e => setPayForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white">
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Period Start</label>
                <input type="date" value={payForm.periodStart} onChange={e => setPayForm(f => ({ ...f, periodStart: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Period End</label>
                <input type="date" value={payForm.periodEnd} onChange={e => setPayForm(f => ({ ...f, periodEnd: e.target.value }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {payForm.staffId && payForm.periodStart && payForm.periodEnd && (() => {
              const member = staff.find(s => s.id === payForm.staffId);
              const entries = timeEntries.filter(e => e.staffId === payForm.staffId && e.date >= payForm.periodStart && e.date <= payForm.periodEnd);
              const hrs = entries.reduce((s, e) => s + e.hours, 0);
              const gross = hrs * (member?.rate ?? 0);
              const withPct = member?.type === 'employee' ? 22 : 0;
              const ded = Math.round(gross * withPct / 100 * 100) / 100;
              const net = Math.round((gross - ded) * 100) / 100;
              return (
                <div className="bg-ink-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500">Time entries found</span><span className="font-medium">{entries.length}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Total hours</span><span className="font-medium">{hrs}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Rate</span><span className="font-medium">{fmt$(member?.rate ?? 0)}/hr</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Gross pay</span><span className="font-medium">{fmt$(gross)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Withholding ({withPct}%)</span><span className="font-medium text-red-600">-{fmt$(ded)}</span></div>
                  <div className="flex justify-between border-t border-ink-200 pt-2"><span className="text-ink-900 font-medium">Net pay</span><span className="font-bold text-ink-900">{fmt$(net)}</span></div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* ── Process Payment Modal ────────────────── */}
      {processModal && (() => {
        const member = staff.find(s => s.id === processModal.staffId);
        const stripeReady = member?.stripeAccountId && member.stripeOnboardingComplete;
        return (
          <Modal title="Process Payment" subtitle={`${member?.name} — ${fmtDate(processModal.periodStart)} to ${fmtDate(processModal.periodEnd)}`} onClose={() => setProcessModal(null)}>
            <div className="space-y-5">
              {/* Summary */}
              <div className="bg-ink-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Gross Pay</span><span className="font-medium">{fmt$(processModal.grossPay)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Withholding ({processModal.withholdingPct}%)</span><span className="font-medium text-red-600">-{fmt$(processModal.deductions)}</span></div>
                <div className="flex justify-between border-t border-ink-200 pt-2"><span className="text-ink-900 font-medium">Net Payment</span><span className="font-bold text-ink-900">{fmt$(processModal.netPay)}</span></div>
              </div>

              {/* Method selection */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-3">Payment Method</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${processMethod === 'stripe' ? 'border-indigo-300 bg-indigo-50' : 'border-ink-200 hover:bg-ink-50'} ${!stripeReady ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input type="radio" name="payMethod" value="stripe" checked={processMethod === 'stripe'} onChange={() => setProcessMethod('stripe')} disabled={!stripeReady} className="text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-ink-900">Stripe Transfer</p>
                      <p className="text-xs text-ink-500">{stripeReady ? 'Send directly to connected Stripe account' : 'Staff must connect Stripe first'}</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${processMethod === 'manual' ? 'border-indigo-300 bg-indigo-50' : 'border-ink-200 hover:bg-ink-50'}`}>
                    <input type="radio" name="payMethod" value="manual" checked={processMethod === 'manual'} onChange={() => setProcessMethod('manual')} className="text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-ink-900">Manual / Offline</p>
                      <p className="text-xs text-ink-500">Record payment processed outside the system (check, cash, etc.)</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setProcessModal(null)} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium">Cancel</button>
                <button onClick={handleProcess} disabled={processing}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {processing ? 'Processing...' : `Process ${fmt$(processModal.netPay)}`}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Pay Stub Modal ──────────────────────── */}
      {stubPayRun && stubMember && (
        <Modal title="Pay Stub" wide onClose={() => setStubPayRun(null)}
          footer={
            <div className="flex justify-between w-full">
              <button onClick={() => setStubPayRun(null)} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium">Close</button>
              <button onClick={() => window.print()} className="px-4 py-2 bg-ink-900 text-white rounded-lg font-medium hover:bg-ink-800 no-print">Print</button>
            </div>
          }
        >
          <div className="print-pay-stub-root space-y-5">
            {/* DEMO disclaimer */}
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-center no-print">
              <p className="text-red-700 font-bold text-xs uppercase tracking-wider">DEMO — Not an official pay stub — For illustration purposes only</p>
            </div>

            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-lg font-bold text-ink-900">Maple Ridge Condominiums HOA</h3>
                <p className="text-sm text-ink-500">Pay Stub</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-ink-500">Pay Period</p>
                <p className="font-medium text-ink-900">{fmtDate(stubPayRun.periodStart)} – {fmtDate(stubPayRun.periodEnd)}</p>
                {stubPayRun.paidDate && <p className="text-ink-400 text-xs mt-1">Paid: {fmtDate(stubPayRun.paidDate)}</p>}
              </div>
            </div>

            {/* Employee/Contractor info */}
            <div className="grid grid-cols-2 gap-4 bg-ink-50 rounded-lg p-4 text-sm">
              <div>
                <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">
                  {stubMember.type === 'employee' ? 'Employee' : 'Contractor'}
                </p>
                <p className="font-medium text-ink-900">{stubMember.name}</p>
                <p className="text-ink-500">{stubMember.role}</p>
                <p className="text-ink-400 text-xs mt-1">TIN: {stubMember.taxId}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">Pay Run ID</p>
                <p className="font-mono text-xs text-ink-600">{stubPayRun.id}</p>
                {stubPayRun.paymentMethod && (
                  <p className="text-xs text-ink-400 mt-2">Method: {stubPayRun.paymentMethod === 'stripe' ? 'Stripe Transfer' : 'Manual/Offline'}</p>
                )}
                {stubPayRun.stripeTransferId && (
                  <p className="text-xs text-ink-400">Transfer: {stubPayRun.stripeTransferId}</p>
                )}
              </div>
            </div>

            {/* Hours detail table */}
            {stubTimeEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2">Hours Detail</h4>
                <div className="border border-ink-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-ink-500 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Hours</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {stubTimeEntries.map(te => (
                        <tr key={te.id}>
                          <td className="px-3 py-2 text-ink-600">{fmtDate(te.date)}</td>
                          <td className="px-3 py-2 text-right text-ink-600">{te.hours}</td>
                          <td className="px-3 py-2 text-ink-600">{te.description}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-ink-50 font-medium">
                      <tr>
                        <td className="px-3 py-2 text-ink-900">Total</td>
                        <td className="px-3 py-2 text-right text-ink-900">{stubPayRun.hoursWorked} hrs</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Earnings summary */}
            <div>
              <h4 className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2">Earnings Summary</h4>
              <div className="border border-ink-100 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Rate</span><span className="font-medium">{fmt$(stubMember.rate)}/hr</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Hours Worked</span><span className="font-medium">{stubPayRun.hoursWorked}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Gross Pay</span><span className="font-medium">{fmt$(stubPayRun.grossPay)}</span></div>
                {stubPayRun.withholdingPct > 0 && (
                  <div className="flex justify-between"><span className="text-ink-500">Withholding ({stubPayRun.withholdingPct}%)</span><span className="font-medium text-red-600">-{fmt$(stubPayRun.deductions)}</span></div>
                )}
                <div className="flex justify-between border-t border-ink-200 pt-2">
                  <span className="text-ink-900 font-bold">Net Pay</span>
                  <span className="font-bold text-lg text-ink-900">{fmt$(stubPayRun.netPay)}</span>
                </div>
              </div>
            </div>

            {/* GL reference */}
            {(stubPayRun.glEntryId || stubPayRun.withholdingGlEntryId) && (
              <div className="text-xs text-ink-400 pt-2 border-t border-ink-100">
                <p className="font-medium text-ink-500 mb-1">GL References</p>
                {stubPayRun.withholdingGlEntryId && <p>Accrual entry: {stubPayRun.withholdingGlEntryId}</p>}
                {stubPayRun.glEntryId && <p>Payment entry: {stubPayRun.glEntryId}</p>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 1099 Preview */}
      {preview1099Staff && previewContractor && (
        <Modal title="1099-NEC Preview" onClose={() => setPreview1099Staff(null)} wide>
          <div className="border-2 border-ink-300 rounded-lg p-6 space-y-4 font-mono text-sm">
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-center">
              <p className="text-red-700 font-bold text-xs uppercase tracking-wider">DEMO — Not for filing — For illustration purposes only</p>
            </div>

            <div className="text-center space-y-1">
              <p className="text-xs text-ink-500">Form <span className="font-bold text-lg text-ink-900">1099-NEC</span></p>
              <p className="text-xs text-ink-500">Nonemployee Compensation</p>
              <p className="text-xs text-ink-400">Department of the Treasury — Internal Revenue Service</p>
              <p className="text-xs text-ink-400">Tax Year {year1099}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-ink-200 pt-4">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-ink-400 uppercase">Payer's Name</p>
                  <p className="text-ink-900">Maple Ridge Condominiums HOA</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400 uppercase">Payer's TIN</p>
                  <p className="text-ink-900">**-***7890</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-ink-400 uppercase">Recipient's Name</p>
                  <p className="text-ink-900">{previewContractor.name}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400 uppercase">Recipient's TIN</p>
                  <p className="text-ink-900">{previewContractor.taxId}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-ink-200 pt-4">
              <div className="bg-ink-50 rounded-lg p-4">
                <p className="text-xs text-ink-400 uppercase mb-1">Box 1 — Nonemployee Compensation</p>
                <p className="text-2xl font-bold text-ink-900">{fmt$(preview1099Form?.totalCompensation ?? getYTDPay(preview1099Staff))}</p>
              </div>
            </div>

            {preview1099Form && (
              <div className="text-xs text-ink-400 text-center space-y-1 pt-2">
                {preview1099Form.generatedDate && <p>Generated: {fmtDate(preview1099Form.generatedDate)}</p>}
                {preview1099Form.sentDate && <p>Sent: {fmtDate(preview1099Form.sentDate)}</p>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
