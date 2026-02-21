import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { fmt } from '@/lib/formatters';

export default function DashboardPage() {
  const { currentUser, currentRole } = useAuthStore();
  const { getIncomeMetrics, reserveItems, units, getBalanceSheet, getDelinquencyAging } = useFinancialStore();
  const { meetings } = useMeetingsStore();
  const { completions } = useComplianceStore();
  const navigate = useNavigate();

  const metrics = getIncomeMetrics();
  const bs = getBalanceSheet();
  const aging = getDelinquencyAging();
  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  const totalItems = 28;
  const completedItems = Object.values(completions).filter(Boolean).length;
  const complianceScore = Math.round((completedItems / totalItems) * 100);
  const complianceGrade = complianceScore >= 90 ? 'A' : complianceScore >= 75 ? 'B' : complianceScore >= 60 ? 'C' : 'D';

  const upcoming = meetings
    .filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED')
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextMeeting = upcoming[0];

  const myLinkedUnits = currentUser?.linkedUnits || [];
  const myUnits = units.filter(u => myLinkedUnits.includes(u.number));
  const myTotalBalance = myUnits.reduce((s, u) => s + u.balance + u.lateFees.filter(f => !f.waived).reduce((s2, lf) => s2 + lf.amount, 0), 0);
  const delinquentUnits = units.filter(u => u.balance > 0).length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-8 text-white shadow-sm">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {currentUser.name.split(' ')[0]}!</h1>
        <p className="text-accent-100">Here&apos;s what&apos;s happening in your community today</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {currentRole !== 'RESIDENT' && (
          <div onClick={() => navigate('/financial')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 cursor-pointer hover:shadow-sm hover:border-sage-400 transition-all transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-sage-100 rounded-lg p-3"><svg className="w-6 h-6 text-sage-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <span className="text-3xl font-bold text-sage-600">{metrics.collectionRate}%</span>
            </div>
            <h3 className="text-sm font-medium text-ink-500">Collection Rate</h3>
            <p className="text-xs text-ink-500 mt-1">{units.length} units · {fmt(bs.assets.operating)} cash</p>
          </div>
        )}

        <div onClick={() => navigate('/issues')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 cursor-pointer hover:shadow-sm hover:border-accent-400 transition-all transform hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent-100 rounded-lg p-3"><svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
            <span className="text-3xl font-bold text-accent-500">{delinquentUnits}</span>
          </div>
          <h3 className="text-sm font-medium text-ink-500">{currentRole === 'RESIDENT' ? 'Open Issues' : 'Delinquent Units'}</h3>
          <p className="text-xs text-red-600 mt-1">{fmt(aging.totalOutstanding)} outstanding</p>
        </div>

        {currentRole === 'RESIDENT' ? (
          <div onClick={() => navigate('/my-unit')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 cursor-pointer hover:shadow-sm hover:border-accent-400 transition-all transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-accent-100 rounded-lg p-3"><svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <span className="text-2xl font-bold text-accent-600">{fmt(myTotalBalance)}</span>
            </div>
            <h3 className="text-sm font-medium text-ink-500">Your Balance</h3>
            <p className={`text-xs mt-1 ${myTotalBalance > 0 ? 'text-red-600' : 'text-sage-600'}`}>{myTotalBalance > 0 ? '⚠ Past Due' : '✓ Current'}</p>
          </div>
        ) : (
          <div onClick={() => navigate('/financial')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 cursor-pointer hover:shadow-sm hover:border-accent-400 transition-all transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-accent-100 rounded-lg p-3"><svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <span className="text-3xl font-bold text-accent-600">{reservePct}%</span>
            </div>
            <h3 className="text-sm font-medium text-ink-500">Reserves Funded</h3>
            <p className="text-xs text-ink-500 mt-1">{fmt(totalReserveFunded)} of {fmt(totalReserveNeeded)}</p>
          </div>
        )}

        <div onClick={() => navigate('/compliance')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-6 cursor-pointer hover:shadow-sm hover:border-accent-400 transition-all transform hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent-100 rounded-lg p-3"><svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
            {nextMeeting ? (
              <span className="text-xl font-bold text-accent-600">{new Date(nextMeeting.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ) : (
              <span className="text-xl font-bold text-ink-400">—</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-ink-500">Next Meeting</h3>
          <p className="text-xs text-accent-600 mt-1">{nextMeeting ? `${nextMeeting.type} · ${nextMeeting.time}` : 'None scheduled'}</p>
        </div>
      </div>

      {currentRole !== 'RESIDENT' && (
        <div onClick={() => navigate('/compliance')} className="bg-white rounded-xl shadow-sm border border-ink-100 p-5 cursor-pointer hover:shadow-md hover:border-sage-300 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-sage-100 rounded-lg p-3"><svg className="w-6 h-6 text-sage-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
              <div><h3 className="text-sm font-semibold text-ink-700">Compliance Health Index</h3><p className="text-xs text-ink-400 mt-0.5">{completedItems} of {totalItems} items verified</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right"><span className="text-3xl font-bold text-sage-600">{complianceScore}</span><p className="text-xs text-ink-400">{complianceGrade} — {complianceScore >= 75 ? 'Good' : complianceScore >= 60 ? 'Fair' : 'Needs Attention'}</p></div>
              <svg className="w-5 h-5 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-4"><span className="mr-2">⚡</span> Quick Actions</h2>
          <div className="space-y-3">
            {currentRole === 'RESIDENT' ? (
              <>
                <button onClick={() => navigate('/my-unit')} className="w-full flex items-center justify-between p-4 bg-ink-900 text-white rounded-lg hover:bg-ink-800 shadow-md hover:shadow-sm transition-all group">
                  <div className="flex items-center space-x-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><div className="text-left"><p className="font-bold">Make a Payment</p><p className="text-sm text-accent-100">{myTotalBalance > 0 ? `Pay ${fmt(myTotalBalance)} now` : 'No balance due'}</p></div></div>
                  <svg className="h-6 w-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>
                <button onClick={() => navigate('/issues')} className="w-full flex items-center justify-between p-4 bg-accent-500 text-white rounded-lg hover:bg-accent-600 shadow-md hover:shadow-sm transition-all group">
                  <div className="flex items-center space-x-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><div className="text-left"><p className="font-bold">Report an Issue</p><p className="text-sm text-orange-100">Submit maintenance request</p></div></div>
                  <svg className="h-6 w-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/issues')} className="w-full flex items-center justify-between p-4 bg-accent-500 text-white rounded-lg hover:bg-accent-600 shadow-md hover:shadow-sm transition-all group">
                  <div className="flex items-center space-x-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg><div className="text-left"><p className="font-bold">Case Tracker</p><p className="text-sm text-orange-100">Manage active cases</p></div></div>
                  <svg className="h-6 w-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>
                <button onClick={() => navigate('/financial')} className="w-full flex items-center justify-between p-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 shadow-md hover:shadow-sm transition-all group">
                  <div className="flex items-center space-x-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><div className="text-left"><p className="font-bold">Financial Dashboard</p><p className="text-sm text-green-100">{metrics.collectionRate}% collection rate</p></div></div>
                  <svg className="h-6 w-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>
              </>
            )}
            <button onClick={() => navigate('/compliance')} className="w-full flex items-center justify-between p-4 bg-accent-600 text-white rounded-lg hover:bg-accent-700 shadow-md hover:shadow-sm transition-all group">
              <div className="flex items-center space-x-3"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <div className="text-left"><p className="font-bold">Upcoming Meeting</p><p className="text-sm text-purple-100">{nextMeeting ? `${new Date(nextMeeting.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${nextMeeting.time}` : 'None scheduled'}</p></div></div>
              <svg className="h-6 w-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
        </div>

        <div>
          <h2 className="font-display text-xl font-bold text-ink-900 mb-4"><span className="mr-2">🕐</span> At a Glance</h2>
          <div className="space-y-3">
            {currentRole !== 'RESIDENT' && delinquentUnits > 0 && (
              <div onClick={() => navigate('/financial')} className="bg-red-50 border border-red-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
                <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-red-800">{delinquentUnits} Delinquent Unit{delinquentUnits !== 1 ? 's' : ''}</p><p className="text-xs text-red-600">{fmt(aging.totalOutstanding)} outstanding</p></div><span className="text-red-400">→</span></div>
              </div>
            )}
            {upcoming.slice(0, 2).map(m => (
              <div key={m.id} onClick={() => navigate('/compliance')} className="bg-white border border-ink-100 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
                <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-ink-900">{m.title}</p><p className="text-xs text-ink-500">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {m.time} · {m.location}</p></div><span className="pill px-2 py-0.5 rounded text-xs font-semibold bg-accent-100 text-accent-700">{m.type}</span></div>
              </div>
            ))}
            {currentRole !== 'RESIDENT' && reservePct < 50 && (
              <div onClick={() => navigate('/financial')} className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
                <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-yellow-800">Reserve Fund: {reservePct}%</p><p className="text-xs text-yellow-600">{fmt(totalReserveNeeded - totalReserveFunded)} funding gap</p></div><span className="text-yellow-400">→</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
