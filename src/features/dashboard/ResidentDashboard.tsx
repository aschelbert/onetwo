import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { fmt } from '@/lib/formatters';
import PageHeader from '@/components/shared/PageHeader';

function MetricCard({ label, value, sub, color, onClick }: { label: string; value: string; sub: string; color: string; onClick: () => void }) {
  const colors: Record<string, string> = { sage: 'border-sage-200 hover:border-sage-400', red: 'border-red-200 hover:border-red-400', yellow: 'border-yellow-200 hover:border-yellow-400', amber: 'border-amber-200 hover:border-amber-400', accent: 'border-accent-200 hover:border-accent-400' };
  const textColors: Record<string, string> = { sage: 'text-sage-700', red: 'text-red-700', yellow: 'text-yellow-700', amber: 'text-amber-700', accent: 'text-accent-700' };
  return (
    <div onClick={onClick} className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all ${colors[color] || colors.accent}`}>
      <p className="text-[11px] text-ink-400 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textColors[color] || 'text-ink-900'}`}>{value}</p>
      <p className="text-[10px] text-ink-400 mt-0.5">{sub}</p>
    </div>
  );
}

export default function ResidentDashboard() {
  const { currentUser } = useAuthStore();
  const fin = useFinancialStore();
  const { meetings } = useMeetingsStore();
  const comp = useComplianceStore();
  const building = useBuildingStore();
  const issues = useIssuesStore();
  const archives = useArchiveStore();
  const navigate = useNavigate();

  const metrics = fin.getIncomeMetrics();
  const reserveItems = fin.reserveItems;
  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const nextMeeting = upcoming[0];
  const submittedIssues = issues.issues.filter(i => i.status === 'SUBMITTED');

  const myLinkedUnits = currentUser?.linkedUnits || [];
  const myUnits = fin.units.filter(u => myLinkedUnits.includes(u.number));
  const myTotalBalance = myUnits.reduce((s, u) => s + u.balance + u.lateFees.filter(f => !f.waived).reduce((s2, lf) => s2 + lf.amount, 0), 0);
  const myUnit = myUnits[0];

  const recentComms = comp.communications.slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${currentUser!.name.split(' ')[0]}`}
        subtitle={`${building.name} -- Unit ${currentUser!.unitNumber}`}
        grades={myUnit ? [{ value: myTotalBalance > 0 ? fmt(myTotalBalance) : 'Current', label: 'Account', color: myTotalBalance > 0 ? 'text-red-300' : 'text-green-300' }] : undefined}
      />

      {myTotalBalance > 0 && (
        <div onClick={() => navigate('/my-unit')} className="bg-red-50 border border-red-200 rounded-xl p-4 cursor-pointer hover:shadow-sm transition-all flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><span className="text-lg font-bold text-red-600">!</span></div>
            <div><p className="text-sm font-bold text-red-900">Balance Due: {fmt(myTotalBalance)}</p><p className="text-xs text-red-700">Your account has an outstanding balance. Pay now to stay current.</p></div>
          </div>
          <button className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 shrink-0">Pay Now</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Monthly Fee" value={myUnit ? fmt(myUnit.monthlyFee) : '--'} sub={myUnit ? `Due day ${fin.hoaDueDay || 1}` : ''} color="accent" onClick={() => navigate('/my-unit')} />
        <MetricCard label="Account Status" value={myTotalBalance === 0 ? 'Current' : 'Past Due'} sub={myTotalBalance > 0 ? fmt(myTotalBalance) + ' owed' : 'No balance'} color={myTotalBalance === 0 ? 'sage' : 'red'} onClick={() => navigate('/my-unit')} />
        <MetricCard label="Next Meeting" value={nextMeeting ? new Date(nextMeeting.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'} sub={nextMeeting ? `${nextMeeting.type} -- ${nextMeeting.time}` : 'None scheduled'} color="accent" onClick={() => navigate('/building')} />
        <MetricCard label="Open Requests" value={String(submittedIssues.length)} sub="Community reports" color={submittedIssues.length > 0 ? 'amber' : 'sage'} onClick={() => navigate('/community')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {(() => {
            const myCases = issues.cases.filter(c => (c.status === 'open' || c.status === 'on-hold') && c.unit && myLinkedUnits.includes(c.unit));
            if (myCases.length === 0) return null;
            return (
              <div>
                <h2 className="text-sm font-bold text-ink-700 mb-3">Cases Involving Your Unit</h2>
                <div className="space-y-2">
                  {myCases.map(c => {
                    const totalSteps = c.steps?.length || 0;
                    const doneSteps = c.steps?.filter(s => s.done).length || 0;
                    const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
                    return (
                      <div key={c.id} onClick={() => navigate('/community')} className="bg-white border border-ink-100 rounded-lg p-4 cursor-pointer hover:border-accent-200 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-ink-900">{c.title}</p>
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${c.status === 'open' ? 'bg-accent-50 text-accent-600' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
                        </div>
                        <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[10px] text-ink-400 mt-1">{pct}% complete</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div>
            <h2 className="text-sm font-bold text-ink-700 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate('/my-unit')} className="flex items-center gap-3 p-4 bg-ink-900 text-white rounded-xl hover:bg-ink-800 transition-all text-left">
                <div className="w-10 h-10 bg-white bg-opacity-15 rounded-lg flex items-center justify-center text-sm font-bold">$</div>
                <div><p className="text-sm font-bold">Make a Payment</p><p className="text-xs text-accent-200">{myTotalBalance > 0 ? `Pay ${fmt(myTotalBalance)}` : 'No balance due'}</p></div>
              </button>
              <button onClick={() => navigate('/community')} className="flex items-center gap-3 p-4 bg-accent-600 text-white rounded-xl hover:bg-accent-700 transition-all text-left">
                <div className="w-10 h-10 bg-white bg-opacity-15 rounded-lg flex items-center justify-center text-sm font-bold">+</div>
                <div><p className="text-sm font-bold">Submit a Request</p><p className="text-xs text-accent-100">Maintenance, info, complaints</p></div>
              </button>
              <button onClick={() => navigate('/building')} className="flex items-center gap-3 p-4 bg-white border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all text-left">
                <div className="w-10 h-10 bg-mist-50 rounded-lg flex items-center justify-center text-sm font-bold text-ink-600">i</div>
                <div><p className="text-sm font-bold text-ink-900">Building Info</p><p className="text-xs text-ink-400">Docs, contacts, policies</p></div>
              </button>
              <button onClick={() => navigate('/archives')} className="flex items-center gap-3 p-4 bg-white border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all text-left">
                <div className="w-10 h-10 bg-mist-50 rounded-lg flex items-center justify-center text-sm font-bold text-ink-600">A</div>
                <div><p className="text-sm font-bold text-ink-900">Archives</p><p className="text-xs text-ink-400">{archives.archives.length > 0 ? `${archives.archives.length} archived periods` : 'Historical records'}</p></div>
              </button>
            </div>
          </div>

          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-ink-700 mb-3">Upcoming Meetings</h2>
              <div className="space-y-2">
                {upcoming.slice(0, 2).map(m => (
                  <div key={m.id} className="bg-white border border-ink-100 rounded-lg p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent-50 rounded-lg flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-accent-600 leading-none">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                        <span className="text-sm font-bold text-accent-800 leading-none">{new Date(m.date + 'T12:00').getDate()}</span>
                      </div>
                      <div><p className="text-sm font-medium text-ink-900">{m.title}</p><p className="text-xs text-ink-400">{m.time} -- {m.location}</p></div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-accent-50 text-accent-700">{m.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink-700 mb-3">Association Finances</h2>
            <div className="bg-white rounded-xl border border-ink-100 p-4 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Reserve Fund</span>
                <span className={`font-bold ${reservePct >= 70 ? 'text-sage-600' : reservePct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{reservePct}% funded</span>
              </div>
              <div className="w-full h-2 bg-ink-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${reservePct >= 70 ? 'bg-sage-500' : reservePct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(reservePct, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Collection Rate</span>
                <span className="font-bold text-ink-700">{metrics.collectionRate}%</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-ink-700 mb-3">Building Announcements</h2>
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {recentComms.length === 0 ? (
                <p className="p-4 text-xs text-ink-400 text-center">No recent announcements</p>
              ) : (
                recentComms.slice(0, 5).map(c => (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${c.type === 'notice' ? 'bg-accent-100 text-accent-700' : c.type === 'financial' ? 'bg-yellow-100 text-yellow-700' : c.type === 'minutes' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-600'}`}>{c.type}</span>
                      <span className="text-[10px] text-ink-400">{c.date}</span>
                    </div>
                    <p className="text-xs font-medium text-ink-800">{c.subject}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {building.management.company && (
            <div className="bg-mist-50 rounded-xl border border-mist-200 p-4">
              <h3 className="text-xs font-bold text-ink-700 mb-2">Management Company</h3>
              <p className="text-sm font-semibold text-ink-900">{building.management.company}</p>
              <p className="text-xs text-ink-500 mt-1">{building.management.contact} -- {building.management.title}</p>
              <p className="text-xs text-accent-600 mt-1">{building.management.phone}</p>
              <p className="text-xs text-accent-600">{building.management.email}</p>
              {building.management.emergency && (
                <div className="mt-2 pt-2 border-t border-mist-200">
                  <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">Emergency</p>
                  <p className="text-xs font-semibold text-red-800">{building.management.emergency}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
