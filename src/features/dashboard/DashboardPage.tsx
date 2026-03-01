import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { computeFiduciaryAlerts } from '@/lib/fiduciaryAlerts';
import { getBudgetAlerts } from '@/lib/fundingAnalysis';
import { fmt } from '@/lib/formatters';
import { FiduciaryAlerts } from './FiduciaryAlerts';

export default function DashboardPage() {
  const { currentUser, currentRole } = useAuthStore();
  const fin = useFinancialStore();
  const { meetings } = useMeetingsStore();
  const comp = useComplianceStore();
  const building = useBuildingStore();
  const issues = useIssuesStore();
  const archives = useArchiveStore();
  const navigate = useNavigate();

  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const metrics = fin.getIncomeMetrics();
  const bs = fin.getBalanceSheet();
  const aging = fin.getDelinquencyAging();
  const reserveItems = fin.reserveItems;
  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  // Compliance
  const refreshResult = refreshComplianceRequirements({
    state: building.address.state,
    legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: building.board.length,
    hasManagement: !!building.management.company,
  });
  const totalItems = refreshResult.categories.reduce((s, c) => s + c.items.length, 0);
  const completedItems = Object.values(comp.completions).filter(Boolean).length;
  const complianceScore = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const complianceGrade = complianceScore >= 90 ? 'A' : complianceScore >= 75 ? 'B' : complianceScore >= 60 ? 'C' : 'D';

  // Building health
  const totalDocs = building.legalDocuments.length;
  const currentDocs = building.legalDocuments.filter(d => d.status === 'current').length;
  const docsWithFiles = building.legalDocuments.filter(d => d.attachments && d.attachments.length > 0).length;
  const legalScore = totalDocs > 0 ? Math.round(((currentDocs / totalDocs) * 60) + ((docsWithFiles / totalDocs) * 40)) : 0;
  const totalPolicies = building.insurance.length;
  const activePolicies = building.insurance.filter(p => new Date(p.expires) > new Date()).length;
  const policiesWithDocs = building.insurance.filter(p => p.attachments && p.attachments.length > 0).length;
  const insScore = totalPolicies > 0 ? Math.round(((activePolicies / totalPolicies) * 70) + ((policiesWithDocs / totalPolicies) * 30)) : 0;
  const govScore = Math.round(([building.board.length >= 3, !!building.management.company, building.legalCounsel.length > 0, building.vendors.filter(v => v.status === 'active').length >= 3].filter(Boolean).length / 4) * 100);
  const buildingHealth = Math.round(legalScore * 0.35 + insScore * 0.35 + govScore * 0.30);
  const buildingGrade = buildingHealth >= 90 ? 'A' : buildingHealth >= 80 ? 'B' : buildingHealth >= 70 ? 'C' : buildingHealth >= 60 ? 'D' : 'F';

  // Meetings
  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const nextMeeting = upcoming[0];
  const pastMeetings = meetings.filter(m => m.status === 'COMPLETED');

  // Issues & Cases
  const openCases = issues.cases.filter(c => c.status === 'open');
  const urgentCases = openCases.filter(c => c.priority === 'urgent' || c.priority === 'high');
  const submittedIssues = issues.issues.filter(i => i.status === 'SUBMITTED');

  // Overdue filings
  const overdueFilings = comp.filings.filter(f => f.status === 'pending' && new Date(f.dueDate) < new Date());

  // Expiring insurance (within 90 days)
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const expiringInsurance = building.insurance.filter(p => { const exp = new Date(p.expires); return exp > now && exp < in90; });

  // Resident data
  const myLinkedUnits = currentUser?.linkedUnits || [];
  const myUnits = fin.units.filter(u => myLinkedUnits.includes(u.number));
  const myTotalBalance = myUnits.reduce((s, u) => s + u.balance + u.lateFees.filter(f => !f.waived).reduce((s2, lf) => s2 + lf.amount, 0), 0);
  const myUnit = myUnits[0];

  // Recent communications (last 5)
  const recentComms = comp.communications.slice(0, 5);

  // Fiduciary alerts
  const fiduciaryAlerts = isBoard ? computeFiduciaryAlerts({
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    reservePctFunded: reservePct,
    openCases: issues.cases.filter(c => c.status === 'open'),
    delinquentUnits: aging.days60.concat(aging.days90plus).map(u => ({ number: u.unit || '', balance: u.balance || 0, daysPastDue: 60 })),
    boardVotesWithoutConflictChecks: 0,
    bylawsSpendingLimit: 5000,
    pendingSpendingAboveLimit: 0,
  }) : [];
  const budgetAlerts = isBoard ? getBudgetAlerts(fin.getBudgetVariance()) : [];

  // Deep link helper for Financial page (uses Zustand store-based tabs)
  const goFinancial = (tab: string) => { fin.setActiveTab(tab); navigate('/financial'); };

  // Shared activity feed builder
  const buildActivities = () => {
    type Activity = { icon: string; text: string; date: string; path: string };
    const activities: Activity[] = [];
    pastMeetings.slice(0, 2).forEach(m => activities.push({ icon: '🗓', text: `${m.title} completed`, date: m.date, path: '/boardroom' }));
    comp.filings.filter(f => f.status === 'filed').slice(0, 2).forEach(f => activities.push({ icon: '✅', text: `${f.name} filed`, date: f.filedDate || '', path: '/boardroom' }));
    recentComms.slice(0, 2).forEach(c => activities.push({ icon: '📨', text: c.subject, date: c.date, path: '/boardroom' }));
    archives.archives.slice(0, 1).forEach(a => activities.push({ icon: '📦', text: `${a.label} archived`, date: a.createdAt.split('T')[0], path: '/archives' }));
    activities.sort((a, b) => b.date.localeCompare(a.date));
    return activities;
  };

  // Work orders data (used by management dashboard)
  const openWorkOrders = fin.workOrders.filter(w => w.status !== 'paid');
  const openWoTotal = openWorkOrders.reduce((s, w) => s + w.amount, 0);

  // Vendor data
  const activeVendors = building.vendors.filter(v => v.status === 'active');
  const expiringContracts = building.vendors.filter(v => {
    if (!v.contract || v.status !== 'active') return false;
    const match = v.contract.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return false;
    const exp = new Date(match[0]);
    return exp > now && exp < in90;
  });

  // ─── BOARD MEMBER DASHBOARD ───
  if (currentRole === 'BOARD_MEMBER') {
    const attentionItems: { label: string; count: number; color: string; onClick: () => void; icon: string }[] = [];
    if (overdueFilings.length > 0) attentionItems.push({ label: 'Overdue Filings', count: overdueFilings.length, color: 'red', onClick: () => navigate('/boardroom?tab=runbook'), icon: '📅' });
    if (urgentCases.length > 0) attentionItems.push({ label: 'Urgent Cases', count: urgentCases.length, color: 'red', onClick: () => navigate('/issues'), icon: '🚨' });
    if (submittedIssues.length > 0) attentionItems.push({ label: 'New Requests', count: submittedIssues.length, color: 'amber', onClick: () => navigate('/issues'), icon: '📥' });
    if (expiringInsurance.length > 0) attentionItems.push({ label: 'Insurance Expiring', count: expiringInsurance.length, color: 'amber', onClick: () => navigate('/building?tab=insurance'), icon: '🛡' });
    if (aging.days90plus.length > 0) attentionItems.push({ label: '90+ Days Past Due', count: aging.days90plus.length, color: 'red', onClick: () => goFinancial('unitLedgers'), icon: '⚠' });
    if (reservePct < 50) attentionItems.push({ label: 'Low Reserves', count: reservePct, color: 'amber', onClick: () => goFinancial('reserves'), icon: '💰' });

    const activities = buildActivities();

    return (
      <div className="space-y-5">
        {/* Header with grade badges */}
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Welcome back, {currentUser.name.split(' ')[0]}</h1>
              <p className="text-accent-200 text-sm mt-1">{building.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center bg-white bg-opacity-10 rounded-lg px-4 py-2">
                <p className="text-[10px] text-accent-200">Building</p>
                <p className={`text-lg font-bold ${buildingHealth >= 80 ? 'text-green-300' : buildingHealth >= 60 ? 'text-yellow-300' : 'text-red-300'}`}>{buildingGrade}</p>
              </div>
              <div className="text-center bg-white bg-opacity-10 rounded-lg px-4 py-2">
                <p className="text-[10px] text-accent-200">Compliance</p>
                <p className={`text-lg font-bold ${complianceScore >= 75 ? 'text-green-300' : complianceScore >= 60 ? 'text-yellow-300' : 'text-red-300'}`}>{complianceGrade}</p>
              </div>
            </div>
          </div>
        </div>

        {fiduciaryAlerts.length > 0 && <FiduciaryAlerts alerts={fiduciaryAlerts} />}

        {/* Attention Pills */}
        {attentionItems.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {attentionItems.map(item => (
              <button key={item.label} onClick={item.onClick} className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:shadow-sm ${item.color === 'red' ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'}`}>
                <span>{item.icon}</span>
                <span className="font-bold">{item.count}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 2x2 KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Collection Rate" value={`${metrics.collectionRate}%`} sub={`${fmt(metrics.monthlyExpected)}/mo`} color={metrics.collectionRate >= 90 ? 'sage' : metrics.collectionRate >= 75 ? 'yellow' : 'red'} onClick={() => goFinancial('dashboard')} />
          <MetricCard label="Reserve Funding" value={`${reservePct}%`} sub={`${fmt(totalReserveFunded)} funded`} color={reservePct >= 70 ? 'sage' : reservePct >= 50 ? 'yellow' : 'red'} onClick={() => goFinancial('reserves')} />
          <MetricCard label="Compliance Score" value={`${complianceScore}%`} sub={`${complianceGrade} grade · ${completedItems}/${totalItems}`} color={complianceScore >= 75 ? 'sage' : complianceScore >= 60 ? 'yellow' : 'red'} onClick={() => navigate('/boardroom?tab=runbook')} />
          <MetricCard label="Open Cases" value={`${openCases.length}`} sub={`${urgentCases.length} urgent/high`} color={urgentCases.length > 0 ? 'red' : openCases.length > 0 ? 'accent' : 'sage'} onClick={() => navigate('/issues')} />
        </div>

        {/* Action Items */}
        {(() => {
          const memberRecord = building.board.find(b => b.name === currentUser.name);
          const userRole = memberRecord?.role || 'President';
          const allRunbookItems = refreshResult.categories.flatMap(c => c.items);
          const myRunbookItems = allRunbookItems.filter(i => !comp.completions[i.id] && !i.autoPass && i.role === userRole);
          const myOverdueFilings = comp.filings.filter(f => f.status === 'pending' && new Date(f.dueDate) < new Date() && f.responsible === userRole);
          const myCases = openCases.filter(c => c.priority === 'urgent' || c.priority === 'high');
          const nextMtg = upcoming[0];
          const totalActions = myRunbookItems.length + myOverdueFilings.length + myCases.length + (nextMtg ? 1 : 0);

          if (totalActions === 0) return null;

          type ActionItem = { icon: string; label: string; sub: string; path: string; color: string; priority: number };
          const actionItems: ActionItem[] = [];
          myOverdueFilings.forEach(f => actionItems.push({ icon: '📅', label: f.name, sub: `Overdue: ${f.dueDate}`, path: '/boardroom?tab=runbook', color: 'red', priority: 1 }));
          myCases.forEach(c => actionItems.push({ icon: '🚨', label: c.title, sub: `${c.priority} · ${c.status}`, path: '/issues', color: 'red', priority: 2 }));
          if (nextMtg) {
            const daysUntil = Math.ceil((new Date(nextMtg.date + 'T12:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 14) actionItems.push({ icon: '🏛', label: nextMtg.title, sub: `${daysUntil <= 0 ? 'Today' : `In ${daysUntil} days`} · ${nextMtg.time}`, path: '/boardroom?tab=meetings', color: daysUntil <= 3 ? 'red' : 'amber', priority: 3 });
          }
          myRunbookItems.slice(0, 3).forEach(i => actionItems.push({ icon: '📋', label: i.task, sub: `${i.freq} · Due: ${i.due}`, path: '/boardroom?tab=runbook', color: i.critical ? 'red' : 'amber', priority: 4 }));
          actionItems.sort((a, b) => a.priority - b.priority);

          return (
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <h2 className="text-sm font-bold text-ink-700">Your Action Items</h2>
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">{totalActions}</span>
                </div>
                <span className="text-[10px] text-ink-400 font-medium">Role: {userRole}</span>
              </div>
              <div className="space-y-1.5">
                {actionItems.slice(0, 6).map((item, idx) => (
                  <button key={idx} onClick={() => navigate(item.path)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all hover:shadow-sm ${item.color === 'red' ? 'bg-red-50 border border-red-100 hover:border-red-200' : 'bg-amber-50 border border-amber-100 hover:border-amber-200'}`}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-900 truncate">{item.label}</p>
                      <p className="text-[10px] text-ink-500">{item.sub}</p>
                    </div>
                    <span className="text-ink-300 text-xs">→</span>
                  </button>
                ))}
              </div>
              {totalActions > 6 && <p className="text-[10px] text-ink-400 mt-2 text-center">+ {totalActions - 6} more items</p>}
            </div>
          );
        })()}

        {/* Budget Alerts */}
        {budgetAlerts.filter(a => a.level === 'high' || a.level === 'critical').length > 0 && (
          <div onClick={() => goFinancial('budget')} className="bg-white rounded-xl border border-ink-100 p-4 cursor-pointer hover:border-accent-200 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">💰</span>
              <h2 className="text-sm font-bold text-ink-700">Budget Alerts</h2>
            </div>
            <div className="space-y-2">
              {budgetAlerts.filter(a => a.level === 'high' || a.level === 'critical').map(alert => (
                <div key={alert.categoryName} className={`rounded-lg p-3 ${alert.level === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-ink-700">{alert.categoryName}</span>
                    <span className={`text-xs font-bold ${alert.level === 'critical' ? 'text-red-700' : 'text-orange-700'}`}>{alert.percentUsed}%</span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${alert.level === 'critical' ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(alert.percentUsed, 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-ink-500 mt-1">${alert.spent.toLocaleString()} of ${alert.budgeted.toLocaleString()} · ${alert.remaining.toLocaleString()} remaining</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Upcoming Meetings */}
            {upcoming.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ink-700">Upcoming Meetings</h2>
                  <button onClick={() => navigate('/boardroom?tab=meetings')} className="text-xs text-accent-600 hover:text-accent-700 font-medium">View all →</button>
                </div>
                <div className="space-y-2">
                  {upcoming.slice(0, 3).map(m => (
                    <div key={m.id} onClick={() => navigate('/boardroom?tab=meetings')} className="bg-white border border-ink-100 rounded-lg p-3.5 cursor-pointer hover:border-accent-200 hover:shadow-sm transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent-50 rounded-lg flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold text-accent-600 leading-none">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                          <span className="text-sm font-bold text-accent-800 leading-none">{new Date(m.date + 'T12:00').getDate()}</span>
                        </div>
                        <div><p className="text-sm font-medium text-ink-900">{m.title}</p><p className="text-xs text-ink-400">{m.time} · {m.location}</p></div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-accent-50 text-accent-700">{m.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <h2 className="text-sm font-bold text-ink-700 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <QAction icon="📋" label="Compliance" sub={`${complianceGrade} grade`} onClick={() => navigate('/boardroom?tab=runbook')} />
                <QAction icon="💰" label="Fiscal Lens" sub={`${metrics.collectionRate}% rate`} onClick={() => goFinancial('dashboard')} />
                <QAction icon="🚨" label="Cases" sub={`${openCases.length} open`} onClick={() => navigate('/issues')} />
                <QAction icon="🏢" label="Building" sub={`${buildingGrade} health`} onClick={() => navigate('/building')} />
              </div>
            </div>
          </div>

          <div>
            {/* Recent Activity */}
            <h2 className="text-sm font-bold text-ink-700 mb-3">Recent Activity</h2>
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {activities.length === 0 ? (
                <p className="p-4 text-xs text-ink-400 text-center">No recent activity</p>
              ) : (
                activities.slice(0, 8).map((a, i) => (
                  <div key={i} onClick={() => navigate(a.path)} className="px-4 py-3 cursor-pointer hover:bg-mist-50 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <span className="text-base mt-0.5">{a.icon}</span>
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium text-ink-800 truncate">{a.text}</p><p className="text-[10px] text-ink-400">{a.date}</p></div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Delinquency Aging */}
            {aging.totalOutstanding > 0 && (
              <div className="mt-4">
                <h2 className="text-sm font-bold text-ink-700 mb-3">Delinquency Aging</h2>
                <div onClick={() => goFinancial('unitLedgers')} className="bg-white rounded-xl border border-ink-100 p-4 cursor-pointer hover:border-red-200 hover:shadow-sm transition-all space-y-2">
                  <AgingRow label="Current (0-30)" count={aging.current.length} total={metrics.delinquentUnits} color="yellow" />
                  <AgingRow label="30-60 Days" count={aging.days30.length} total={metrics.delinquentUnits} color="orange" />
                  <AgingRow label="60-90 Days" count={aging.days60.length} total={metrics.delinquentUnits} color="red" />
                  <AgingRow label="90+ Days" count={aging.days90plus.length} total={metrics.delinquentUnits} color="red" />
                  <div className="pt-2 border-t border-ink-100 flex justify-between text-xs"><span className="text-ink-500 font-medium">Total Outstanding</span><span className="font-bold text-red-700">{fmt(aging.totalOutstanding)}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── PROPERTY MANAGER DASHBOARD ───
  if (currentRole === 'PROPERTY_MANAGER') {
    const attentionItems: { label: string; count: number; color: string; onClick: () => void; icon: string }[] = [];
    if (submittedIssues.length > 0) attentionItems.push({ label: 'New Requests', count: submittedIssues.length, color: 'amber', onClick: () => navigate('/issues'), icon: '📥' });
    if (openWorkOrders.length > 0) attentionItems.push({ label: 'Open Work Orders', count: openWorkOrders.length, color: 'amber', onClick: () => goFinancial('workorders'), icon: '🔧' });
    if (urgentCases.length > 0) attentionItems.push({ label: 'Urgent Cases', count: urgentCases.length, color: 'red', onClick: () => navigate('/issues'), icon: '🚨' });
    if (expiringContracts.length > 0) attentionItems.push({ label: 'Contracts Expiring', count: expiringContracts.length, color: 'amber', onClick: () => navigate('/building?tab=vendors'), icon: '📄' });

    const activities = buildActivities();

    return (
      <div className="space-y-5">
        {/* Header — Operations Overview */}
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Welcome back, {currentUser.name.split(' ')[0]}</h1>
              <p className="text-accent-200 text-sm mt-1">{building.name} · Operations Overview</p>
            </div>
            <div className="text-right">
              <p className="text-accent-200 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Attention Pills */}
        {attentionItems.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {attentionItems.map(item => (
              <button key={item.label} onClick={item.onClick} className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:shadow-sm ${item.color === 'red' ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100' : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'}`}>
                <span>{item.icon}</span>
                <span className="font-bold">{item.count}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 2x2 KPI Grid — Operational Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Open Work Orders" value={`${openWorkOrders.length}`} sub={`${fmt(openWoTotal)} pending`} color={openWorkOrders.length > 5 ? 'red' : openWorkOrders.length > 0 ? 'amber' : 'sage'} onClick={() => goFinancial('workorders')} />
          <MetricCard label="New Requests" value={`${submittedIssues.length}`} sub="Submitted issues" color={submittedIssues.length > 0 ? 'amber' : 'sage'} onClick={() => navigate('/issues')} />
          <MetricCard label="Collection Rate" value={`${metrics.collectionRate}%`} sub={`${fmt(metrics.monthlyExpected)}/mo`} color={metrics.collectionRate >= 90 ? 'sage' : metrics.collectionRate >= 75 ? 'yellow' : 'red'} onClick={() => goFinancial('dashboard')} />
          <MetricCard label="Delinquent Units" value={`${metrics.delinquentUnits}`} sub={`${fmt(aging.totalOutstanding)} owed`} color={metrics.delinquentUnits === 0 ? 'sage' : 'red'} onClick={() => goFinancial('unitLedgers')} />
        </div>

        {/* Action Items */}
        {(() => {
          const myCases = openCases.filter(c => c.priority === 'urgent' || c.priority === 'high');
          const nextMtg = upcoming[0];
          const totalActions = submittedIssues.length + openWorkOrders.length + myCases.length + expiringContracts.length + (nextMtg ? 1 : 0);

          if (totalActions === 0) return null;

          type ActionItem = { icon: string; label: string; sub: string; onClick: () => void; color: string; priority: number };
          const actionItems: ActionItem[] = [];
          submittedIssues.slice(0, 3).forEach(i => actionItems.push({ icon: '📥', label: i.title || 'New Request', sub: `${i.type} · ${i.status}`, onClick: () => navigate('/issues'), color: 'amber', priority: 1 }));
          openWorkOrders.slice(0, 3).forEach(w => actionItems.push({ icon: '🔧', label: w.title, sub: `${w.vendor} · ${fmt(w.amount)}`, onClick: () => goFinancial('workorders'), color: 'amber', priority: 2 }));
          myCases.slice(0, 2).forEach(c => actionItems.push({ icon: '🚨', label: c.title, sub: `${c.priority} · ${c.status}`, onClick: () => navigate('/issues'), color: 'red', priority: 3 }));
          expiringContracts.slice(0, 2).forEach(v => actionItems.push({ icon: '📄', label: v.name, sub: `Contract: ${v.contract}`, onClick: () => navigate('/building?tab=vendors'), color: 'amber', priority: 4 }));
          if (nextMtg) {
            const daysUntil = Math.ceil((new Date(nextMtg.date + 'T12:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 14) actionItems.push({ icon: '🏛', label: nextMtg.title, sub: `${daysUntil <= 0 ? 'Today' : `In ${daysUntil} days`} · ${nextMtg.time}`, onClick: () => navigate('/boardroom?tab=meetings'), color: daysUntil <= 3 ? 'red' : 'amber', priority: 5 });
          }
          actionItems.sort((a, b) => a.priority - b.priority);

          return (
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <h2 className="text-sm font-bold text-ink-700">Your Action Items</h2>
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">{Math.min(totalActions, 99)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {actionItems.slice(0, 6).map((item, idx) => (
                  <button key={idx} onClick={item.onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all hover:shadow-sm ${item.color === 'red' ? 'bg-red-50 border border-red-100 hover:border-red-200' : 'bg-amber-50 border border-amber-100 hover:border-amber-200'}`}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-900 truncate">{item.label}</p>
                      <p className="text-[10px] text-ink-500">{item.sub}</p>
                    </div>
                    <span className="text-ink-300 text-xs">→</span>
                  </button>
                ))}
              </div>
              {totalActions > 6 && <p className="text-[10px] text-ink-400 mt-2 text-center">+ {totalActions - 6} more items</p>}
            </div>
          );
        })()}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Open Cases Summary */}
            {openCases.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ink-700">Open Cases</h2>
                  <button onClick={() => navigate('/issues')} className="text-xs text-accent-600 hover:text-accent-700 font-medium">View all →</button>
                </div>
                <div className="space-y-2">
                  {openCases.slice(0, 5).map(c => (
                    <div key={c.id} onClick={() => navigate('/issues')} className="bg-white border border-ink-100 rounded-lg p-3.5 cursor-pointer hover:border-accent-200 hover:shadow-sm transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${c.priority === 'urgent' ? 'bg-red-100 text-red-700' : c.priority === 'high' ? 'bg-orange-100 text-orange-700' : c.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-ink-100 text-ink-600'}`}>{c.priority}</span>
                        <div><p className="text-sm font-medium text-ink-900">{c.title}</p><p className="text-xs text-ink-400">{c.unit ? `Unit ${c.unit} · ` : ''}{c.created}</p></div>
                      </div>
                      <span className="text-ink-300 text-xs">→</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Meetings */}
            {upcoming.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ink-700">Upcoming Meetings</h2>
                  <button onClick={() => navigate('/boardroom?tab=meetings')} className="text-xs text-accent-600 hover:text-accent-700 font-medium">View all →</button>
                </div>
                <div className="space-y-2">
                  {upcoming.slice(0, 3).map(m => (
                    <div key={m.id} onClick={() => navigate('/boardroom?tab=meetings')} className="bg-white border border-ink-100 rounded-lg p-3.5 cursor-pointer hover:border-accent-200 hover:shadow-sm transition-all flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent-50 rounded-lg flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold text-accent-600 leading-none">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                          <span className="text-sm font-bold text-accent-800 leading-none">{new Date(m.date + 'T12:00').getDate()}</span>
                        </div>
                        <div><p className="text-sm font-medium text-ink-900">{m.title}</p><p className="text-xs text-ink-400">{m.time} · {m.location}</p></div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-accent-50 text-accent-700">{m.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Vendor Status */}
            <div>
              <h2 className="text-sm font-bold text-ink-700 mb-3">Vendor Status</h2>
              <div onClick={() => navigate('/building?tab=vendors')} className="bg-white rounded-xl border border-ink-100 p-4 cursor-pointer hover:border-accent-200 hover:shadow-sm transition-all space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-500">Active Vendors</span>
                  <span className="font-bold text-ink-700">{activeVendors.length}</span>
                </div>
                {expiringContracts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <p className="text-xs font-semibold text-amber-800">{expiringContracts.length} contract{expiringContracts.length !== 1 ? 's' : ''} expiring soon</p>
                    {expiringContracts.slice(0, 3).map(v => (
                      <p key={v.name} className="text-[10px] text-amber-700 mt-0.5">{v.name} · {v.contract}</p>
                    ))}
                  </div>
                )}
                {expiringContracts.length === 0 && (
                  <p className="text-xs text-sage-600">All contracts current</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div>
              <h2 className="text-sm font-bold text-ink-700 mb-3">Recent Activity</h2>
              <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
                {activities.length === 0 ? (
                  <p className="p-4 text-xs text-ink-400 text-center">No recent activity</p>
                ) : (
                  activities.slice(0, 8).map((a, i) => (
                    <div key={i} onClick={() => navigate(a.path)} className="px-4 py-3 cursor-pointer hover:bg-mist-50 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <span className="text-base mt-0.5">{a.icon}</span>
                        <div className="flex-1 min-w-0"><p className="text-xs font-medium text-ink-800 truncate">{a.text}</p><p className="text-[10px] text-ink-400">{a.date}</p></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── RESIDENT DASHBOARD ───
  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {currentUser.name.split(' ')[0]}</h1>
            <p className="text-accent-200 text-sm mt-1">{building.name} · Unit {currentUser.unitNumber}</p>
          </div>
          {myUnit && (
            <div className={`text-center rounded-lg px-5 py-2.5 ${myTotalBalance > 0 ? 'bg-red-500 bg-opacity-30' : 'bg-green-500 bg-opacity-20'}`}>
              <p className="text-[10px] text-accent-200">Account</p>
              <p className="text-lg font-bold">{myTotalBalance > 0 ? fmt(myTotalBalance) : '✓ Current'}</p>
            </div>
          )}
        </div>
      </div>

      {myTotalBalance > 0 && (
        <div onClick={() => navigate('/my-unit')} className="bg-red-50 border border-red-200 rounded-xl p-4 cursor-pointer hover:shadow-sm transition-all flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><span className="text-lg">⚠</span></div>
            <div><p className="text-sm font-bold text-red-900">Balance Due: {fmt(myTotalBalance)}</p><p className="text-xs text-red-700">Your account has an outstanding balance. Pay now to stay current.</p></div>
          </div>
          <button className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 shrink-0">Pay Now</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Monthly Fee" value={myUnit ? fmt(myUnit.monthlyFee) : '—'} sub={myUnit ? `Due day ${fin.hoaDueDay || 1}` : ''} color="accent" onClick={() => navigate('/my-unit')} />
        <MetricCard label="Account Status" value={myTotalBalance === 0 ? 'Current' : 'Past Due'} sub={myTotalBalance > 0 ? fmt(myTotalBalance) + ' owed' : 'No balance'} color={myTotalBalance === 0 ? 'sage' : 'red'} onClick={() => navigate('/my-unit')} />
        <MetricCard label="Next Meeting" value={nextMeeting ? new Date(nextMeeting.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} sub={nextMeeting ? `${nextMeeting.type} · ${nextMeeting.time}` : 'None scheduled'} color="accent" onClick={() => navigate('/building')} />
        <MetricCard label="Open Requests" value={String(submittedIssues.length)} sub="Community reports" color={submittedIssues.length > 0 ? 'amber' : 'sage'} onClick={() => navigate('/community')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Active Cases (owner's unit) */}
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
                <div className="w-10 h-10 bg-white bg-opacity-15 rounded-lg flex items-center justify-center text-lg">💳</div>
                <div><p className="text-sm font-bold">Make a Payment</p><p className="text-xs text-accent-200">{myTotalBalance > 0 ? `Pay ${fmt(myTotalBalance)}` : 'No balance due'}</p></div>
              </button>
              <button onClick={() => navigate('/community')} className="flex items-center gap-3 p-4 bg-accent-600 text-white rounded-xl hover:bg-accent-700 transition-all text-left">
                <div className="w-10 h-10 bg-white bg-opacity-15 rounded-lg flex items-center justify-center text-lg">🔧</div>
                <div><p className="text-sm font-bold">Submit a Request</p><p className="text-xs text-accent-100">Maintenance, info, complaints</p></div>
              </button>
              <button onClick={() => navigate('/building')} className="flex items-center gap-3 p-4 bg-white border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all text-left">
                <div className="w-10 h-10 bg-mist-50 rounded-lg flex items-center justify-center text-lg">🏢</div>
                <div><p className="text-sm font-bold text-ink-900">Building Info</p><p className="text-xs text-ink-400">Docs, contacts, policies</p></div>
              </button>
              <button onClick={() => navigate('/archives')} className="flex items-center gap-3 p-4 bg-white border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all text-left">
                <div className="w-10 h-10 bg-mist-50 rounded-lg flex items-center justify-center text-lg">📦</div>
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
                      <div><p className="text-sm font-medium text-ink-900">{m.title}</p><p className="text-xs text-ink-400">{m.time} · {m.location}</p></div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-accent-50 text-accent-700">{m.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Financial Transparency */}
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
              <p className="text-xs text-ink-500 mt-1">{building.management.contact} · {building.management.title}</p>
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

function MiniStat({ label, val, good }: { label: string; val: string; good: boolean }) {
  return (<div className="text-center"><p className="text-[10px] text-ink-400">{label}</p><p className={`text-sm font-bold ${good ? 'text-sage-600' : 'text-yellow-600'}`}>{val}</p></div>);
}

function QAction({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white border border-ink-100 rounded-xl p-3.5 text-left hover:border-accent-200 hover:shadow-sm transition-all">
      <span className="text-lg">{icon}</span>
      <p className="text-xs font-bold text-ink-900 mt-1.5">{label}</p>
      <p className="text-[10px] text-ink-400">{sub}</p>
    </button>
  );
}

function AgingRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  if (count === 0) return null;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = color === 'yellow' ? 'bg-yellow-400' : color === 'orange' ? 'bg-orange-400' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="text-ink-500">{label}</span><span className="font-medium text-ink-700">{count} unit{count !== 1 ? 's' : ''}</span></div>
      <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
