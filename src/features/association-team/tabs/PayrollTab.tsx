import { useState, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import { usePayrollStore } from '@/store/usePayrollStore';
import type { StaffMember, TimeEntry, PayRun } from '@/store/usePayrollStore';

/* ── Helpers ───────────────────────────────────────────────── */

const fmt$ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const SUB_TABS = ['staff', 'time', 'pay', '1099s'] as const;
type SubTab = typeof SUB_TABS[number];
const SUB_TAB_LABELS: Record<SubTab, string> = { staff: 'Staff Directory', time: 'Time Tracking', pay: 'Pay History', '1099s': '1099s' };

const EMPTY_STAFF: Omit<StaffMember, 'id'> = { name: '', type: 'employee', role: '', rate: 0, email: '', phone: '', taxId: '', startDate: '', status: 'active' };

/* ── Component ─────────────────────────────────────────────── */

export default function PayrollTab() {
  const { staff, timeEntries, payRuns, form1099s, addStaff, updateStaff, addTimeEntry, updateTimeEntry, deleteTimeEntry, createPayRun, processPayRun, generate1099, markSent } = usePayrollStore();

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
                        pr.status === 'paid' ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {pr.status === 'paid' ? 'Paid' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pr.status === 'draft' && (
                        <button onClick={() => processPayRun(pr.id)}
                          className="px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">
                          Process
                        </button>
                      )}
                      {pr.status === 'paid' && pr.glEntryId && (
                        <span className="text-xs text-ink-400">{pr.glEntryId}</span>
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
