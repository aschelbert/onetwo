import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { buildSeasons, currentSeason } from '@/lib/seasons';
import { buildQueue } from '@/lib/queue';
import { computeBoardHealth, computeStreaks, computeBadges } from '@/lib/boardHealth';
import { useReportsStore } from '@/store/useReportsStore';
import { DEFAULT_SETTINGS, type BuildingSettings } from '@/lib/buildingSettings';
import { toBoardRoleKey, type BoardRoleKey } from '@/types/auth';
import { DollarSign, PiggyBank } from 'lucide-react';
import SeasonHeader from './components/SeasonHeader';
import YourWeek from './components/YourWeek';
import BoardThisSeason from './components/BoardThisSeason';
import StreaksCard from './components/StreaksCard';
import BadgesCard from './components/BadgesCard';
import AskBox from './components/AskBox';
import DrawerRouter, { type DrawerId } from './drawers/DrawerRouter';

export default function HomePage() {
  const { currentUser } = useAuthStore();
  const tenant = useTenantContext();
  const building = useBuildingStore();
  const comp = useComplianceStore();
  const { meetings } = useMeetingsStore();
  const issues = useIssuesStore();
  const elections = useElectionStore();
  const spending = useSpendingStore();
  const fin = useFinancialStore();
  const reportsStore = useReportsStore();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<DrawerId | null>(null);
  const [drawerContext, setDrawerContext] = useState<Record<string, string>>({});

  const openDrawer = useCallback((id: string, params: Record<string, string> = {}) => {
    setDrawerId(id as DrawerId);
    setDrawerContext(params);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerId(null);
    setDrawerContext({});
  }, []);

  // ---- Derived data (all pure reads, no store mutations) ----

  // Building settings (fallback to defaults if not loaded)
  const settings: BuildingSettings = useMemo(() => ({
    ...DEFAULT_SETTINGS,
    fiscalYearStartMonth: DEFAULT_SETTINGS.fiscalYearStartMonth,
  }), []);

  // Current user's board role
  const myRoleKey: BoardRoleKey = useMemo(() => {
    const me = building.board.find(
      (m) => m.name === currentUser.name || m.email === currentUser.email,
    );
    return me?.roleKey ?? toBoardRoleKey(null);
  }, [building.board, currentUser.name, currentUser.email]);

  // Compliance items
  const refreshResult = useMemo(
    () =>
      refreshComplianceRequirements({
        state: building.address.state,
        legalDocuments: building.legalDocuments.map((d) => ({ name: d.name, status: d.status })),
        insurance: building.insurance.map((p) => ({ type: p.type, expires: p.expires })),
        boardCount: building.board.length,
        hasManagement: !!building.management.company,
      }),
    [building.address.state, building.legalDocuments, building.insurance, building.board.length, building.management.company],
  );

  const allRunbookItems = useMemo(
    () => refreshResult.categories.flatMap((c) => c.items),
    [refreshResult],
  );

  // Seasons
  const seasons = useMemo(
    () =>
      buildSeasons({
        items: allRunbookItems,
        completions: comp.completions,
        filings: comp.filings,
        settings,
        tenantStatus: tenant.status,
      }),
    [allRunbookItems, comp.completions, comp.filings, settings, tenant.status],
  );

  const season = useMemo(() => currentSeason(seasons), [seasons]);

  // Financial metrics
  const metrics = useMemo(() => fin.getIncomeMetrics(), [fin]);
  const reserveItems = fin.reserveItems;
  const totalReserveFunded = useMemo(
    () => reserveItems.reduce((s, i) => s + i.currentFunding, 0),
    [reserveItems],
  );
  const totalReserveNeeded = useMemo(
    () => reserveItems.reduce((s, i) => s + i.estimatedCost, 0),
    [reserveItems],
  );
  const reservePct = totalReserveNeeded > 0 ? Math.round((totalReserveFunded / totalReserveNeeded) * 100) : 0;

  // Delinquency for queue
  const delinquency = useMemo(() => {
    const aging = fin.getDelinquencyAging();
    const all = [
      ...aging.current.map((u) => ({ unit: u.number, balance: u.balance, daysPastDue: 30 })),
      ...aging.days30.map((u) => ({ unit: u.number, balance: u.balance, daysPastDue: 45 })),
      ...aging.days60.map((u) => ({ unit: u.number, balance: u.balance, daysPastDue: 75 })),
      ...aging.days90plus.map((u) => ({ unit: u.number, balance: u.balance, daysPastDue: 120 })),
    ];
    return all;
  }, [fin]);

  // Board Health
  const totalDocs = building.legalDocuments.length;
  const currentDocs = building.legalDocuments.filter((d) => d.status === 'current').length;
  const documentsCurrentPct = totalDocs > 0 ? Math.round((currentDocs / totalDocs) * 100) : 0;
  const attachedCount = Object.keys(comp.itemAttachments).filter(
    (k) => (comp.itemAttachments[k]?.length ?? 0) > 0,
  ).length;
  const proofCoverage = allRunbookItems.length > 0 ? attachedCount / allRunbookItems.length : 0;
  const hpElapsedMonths = new Date().getMonth() + 1;
  const reportsGeneratedPct = hpElapsedMonths > 0 ? Math.min(100, Math.round((reportsStore.reports.filter(r => r.type === 'financial_statement').length / hpElapsedMonths) * 100)) : 0;

  const healthInputs = useMemo(
    () => ({
      runbookItems: allRunbookItems.map((i) => ({ id: i.id, due: i.due, critical: i.critical, scope: i.scope })),
      completions: comp.completions,
      filings: comp.filings.map((f) => ({ status: f.status, dueDate: f.dueDate, filedDate: f.filedDate })),
      collectionRate: metrics.collectionRate,
      reservePctFunded: reservePct,
      monthsClosedOnTime: 0,
      meetings: meetings.map((m) => ({
        date: m.date,
        status: m.status,
        noticeSentAt: null,
        minutesApprovedAt:
          m.minutesApprovals && m.minutesApprovals.length > 0
            ? m.minutesApprovals[0].date
            : null,
        quorumMet: undefined,
      })),
      proofCoverage,
      documentsCurrentPct,
      reportsGeneratedPct,
    }),
    [allRunbookItems, comp.completions, comp.filings, metrics.collectionRate, reservePct, meetings, proofCoverage, documentsCurrentPct, reportsGeneratedPct],
  );

  const health = useMemo(() => computeBoardHealth(healthInputs), [healthInputs]);
  const streaks = useMemo(() => computeStreaks(healthInputs), [healthInputs]);
  const badges = useMemo(() => computeBadges(healthInputs), [healthInputs]);

  // Queue
  const queueResult = useMemo(
    () =>
      buildQueue({
        me: { roleKey: myRoleKey, name: currentUser.name },
        seasons,
        items: allRunbookItems,
        completions: comp.completions,
        filings: comp.filings,
        cases: issues.cases.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          priority: c.priority,
          nextStep: c.steps
            ? (() => {
                const idx = c.steps.findIndex((s) => !s.done);
                if (idx === -1) return undefined;
                const step = c.steps[idx];
                return {
                  title: step.s,
                  index: idx,
                  total: c.steps.length,
                  dueDate: null,
                  ownerRole: step.w ? toBoardRoleKey(step.w) : undefined,
                };
              })()
            : undefined,
        })),
        requests: issues.issues
          .filter((i) => i.status === 'SUBMITTED')
          .map((i) => ({ id: i.id, title: i.title, status: i.status, submittedAt: i.submittedDate, unit: i.unitNumber })),
        votes: elections.elections
          .filter((e) => e.status === 'open')
          .map((e) => ({
            id: e.id,
            title: e.title,
            status: e.status,
            myVote: null,
            deadline: e.scheduledCloseDate ?? undefined,
          })),
        approvals: spending.approvals.map((a) => ({
          id: a.id,
          title: a.title,
          amount: a.amount,
          status: a.status,
          votes: a.votes.map((v) => ({ name: v.member })),
        })),
        meetings: meetings.map((m) => ({ id: m.id, title: m.title, date: m.date, status: m.status })),
        delinquency,
        settings,
      }),
    [myRoleKey, currentUser.name, seasons, allRunbookItems, comp.completions, comp.filings, issues.cases, issues.issues, elections.elections, spending.approvals, meetings, delinquency, settings],
  );

  // Count of urgent items for the header
  const urgentCount = useMemo(
    () =>
      queueResult.items.filter(
        (qi) => qi.roleState === 'mine' && (qi.dueTone === 'overdue' || qi.dueTone === 'soon'),
      ).length,
    [queueResult.items],
  );

  // Next meeting summary
  const nextMeetingSummary = useMemo(() => {
    const upcoming = meetings
      .filter((m) => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED')
      .sort((a, b) => a.date.localeCompare(b.date));
    const next = upcoming[0];
    if (!next) return null;
    return `${next.title} on ${next.date} at ${next.time}`;
  }, [meetings]);

  // First name for greeting
  const firstName = currentUser.name.split(' ')[0] || currentUser.name;

  // Per-role done/open counts for BoardThisSeason
  const roleCounts = useMemo(() => {
    const counts: Record<string, { done: number; open: number; hasOverdue: boolean }> = {};
    // Count completed runbook items per primaryRole
    for (const item of allRunbookItems) {
      const role = item.primaryRole ?? 'member_at_large';
      if (!counts[role]) counts[role] = { done: 0, open: 0, hasOverdue: false };
      if (comp.completions[item.id]) {
        counts[role].done++;
      } else {
        counts[role].open++;
        const todayStr = new Date().toISOString().split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(item.due) && item.due < todayStr) {
          counts[role].hasOverdue = true;
        }
      }
    }
    // Also count queue items (votes, approvals, etc.) per roleKey
    for (const qi of queueResult.items) {
      const role = qi.roleKey;
      if (!counts[role]) counts[role] = { done: 0, open: 0, hasOverdue: false };
      // Only count non-runbook queue items (runbook already counted above)
      if (qi.source !== 'runbook' && qi.source !== 'filing') {
        counts[role].open++;
        if (qi.dueTone === 'overdue') counts[role].hasOverdue = true;
      }
    }
    return counts;
  }, [allRunbookItems, comp.completions, queueResult.items]);

  // Nudge handler -> open compose drawer
  const handleNudge = useCallback(
    (memberName: string) => {
      openDrawer('compose', { to: memberName });
    },
    [openDrawer],
  );

  // KPI helpers
  const collectionRate = metrics.collectionRate;
  const reservesFunded = reservePct;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Season header */}
      <SeasonHeader
        season={season}
        firstName={firstName}
        urgentCount={urgentCount}
        health={health}
      />

      {/* Main content: two-column on desktop */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Your Week */}
          <div className="bg-white rounded-xl border border-ink-100 p-5">
            <YourWeek
              items={queueResult.items}
              total={queueResult.total}
              onOpenDrawer={openDrawer}
              nextMeetingSummary={nextMeetingSummary}
            />
            <AskBox queueItems={queueResult.items} onOpenDrawer={openDrawer} />
          </div>
        </div>

        {/* Aside column (1/3) */}
        <div className="space-y-4">
          {/* Board this season */}
          <BoardThisSeason
            boardMembers={building.board}
            roleCounts={roleCounts}
            onNudge={handleNudge}
          />

          {/* Streaks */}
          <StreaksCard streaks={streaks} />

          {/* Badges */}
          <BadgesCard badges={badges} />

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Collection rate"
              value={`${collectionRate}%`}
              tone={collectionRate >= 95 ? 'good' : collectionRate >= 80 ? 'warn' : 'bad'}
            />
            <KpiCard
              icon={<PiggyBank className="w-4 h-4" />}
              label="Reserves funded"
              value={`${reservesFunded}%`}
              tone={reservesFunded >= 70 ? 'good' : reservesFunded >= 50 ? 'warn' : 'bad'}
            />
          </div>
        </div>
      </div>

      {/* Drawer */}
      <DrawerRouter
        drawerId={drawerId}
        open={drawerOpen}
        onClose={closeDrawer}
        context={drawerContext}
      />
    </div>
  );
}

// ---- KPI Card ----

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
}) {
  const colors = {
    good: 'text-brand-teal',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-ink-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-ink-400">{icon}</div>
        <span className="text-[10px] text-ink-400 uppercase font-medium tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
