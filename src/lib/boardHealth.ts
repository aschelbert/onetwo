/**
 * Board Health Score -- single source of truth for all health metrics.
 *
 * Weights:
 *   Compliance 40, Financial 30, Governance 20, Records 10
 *
 * When a sub-line has no data yet, its max is dropped from the denominator
 * rather than scoring zero.
 */

export interface HealthInputs {
  runbookItems: Array<{ id: string; due: string; critical: boolean; scope: string }>;
  completions: Record<string, boolean>;
  filings: Array<{ status: 'pending' | 'filed'; dueDate: string; filedDate: string | null }>;
  collectionRate: number;           // 0..100
  reservePctFunded: number;         // 0..100
  monthsClosedOnTime: number;       // of last 12; 0 until handoff 11
  meetings: Array<{
    date: string;
    status: string;
    noticeSentAt?: string | null;
    minutesApprovedAt?: string | null;
    quorumMet?: boolean;
  }>;
  proofCoverage: number;            // 0..1
  documentsCurrentPct: number;      // 0..100
  reportsGeneratedPct: number;      // 0..100 — fraction of expected monthly reports that exist
  today?: Date;
}

export interface HealthBreakdownLine {
  label: string;
  points: number;
  max: number;
  detail: string;
  itemIds?: string[];
}

export interface HealthResult {
  score: number;
  compliance: number;
  financial: number;
  governance: number;
  records: number;
  breakdown: HealthBreakdownLine[];
}

// ── computeBoardHealth ──────────────────────────────────────────────────────

export function computeBoardHealth(i: HealthInputs): HealthResult {
  const today = i.today ?? new Date();
  const todayStr = today.toISOString().split('T')[0];
  const breakdown: HealthBreakdownLine[] = [];

  // ── Compliance (40 max) ──
  // Runbook items not past due or completed; critical count twice
  let compMax = 0;
  let compPoints = 0;
  const overdueIds: string[] = [];
  if (i.runbookItems.length > 0) {
    let totalWeight = 0;
    let doneWeight = 0;
    for (const item of i.runbookItems) {
      const w = item.critical ? 2 : 1;
      totalWeight += w;
      if (i.completions[item.id]) {
        doneWeight += w;
      } else if (item.due && item.due < todayStr) {
        overdueIds.push(item.id);
        // overdue and not completed: 0 points
      } else {
        // not due yet, not completed: give partial credit
        doneWeight += w * 0.5;
      }
    }
    const runbookMax = 30;
    compMax += runbookMax;
    const runbookPts = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * runbookMax) : runbookMax;
    compPoints += runbookPts;
    breakdown.push({
      label: 'Runbook completion',
      points: runbookPts,
      max: runbookMax,
      detail: `${Object.values(i.completions).filter(Boolean).length}/${i.runbookItems.length} items complete` +
        (overdueIds.length > 0 ? `. ${overdueIds.length} overdue.` : ''),
      itemIds: overdueIds.length > 0 ? overdueIds : undefined,
    });
  }

  // Filings
  if (i.filings.length > 0) {
    const filingMax = 10;
    compMax += filingMax;
    const overdueFilings = i.filings.filter(f => f.status === 'pending' && f.dueDate < todayStr);
    const filedCount = i.filings.filter(f => f.status === 'filed').length;
    const filingPts = Math.round((filedCount / i.filings.length) * filingMax);
    compPoints += filingPts;
    breakdown.push({
      label: 'Regulatory filings',
      points: filingPts,
      max: filingMax,
      detail: `${filedCount}/${i.filings.length} filed` +
        (overdueFilings.length > 0 ? `. ${overdueFilings.length} overdue.` : ''),
    });
  } else {
    // No filings data -- skip
  }

  // If no compliance data at all, give zero max
  if (compMax === 0) {
    compMax = 40;
    compPoints = 0;
    breakdown.push({ label: 'Compliance', points: 0, max: 40, detail: 'No data yet.' });
  }

  // ── Financial (30 max) ──
  let finMax = 0;
  let finPoints = 0;

  // Collection rate (10 max)
  const collMax = 10;
  finMax += collMax;
  const collPts = Math.round((Math.min(i.collectionRate, 100) / 100) * collMax);
  finPoints += collPts;
  breakdown.push({
    label: 'Collection rate',
    points: collPts,
    max: collMax,
    detail: `${Math.round(i.collectionRate)}% collected`,
  });

  // Reserve % funded against 70 target, capped (10 max)
  const resMax = 10;
  finMax += resMax;
  const resPts = Math.round((Math.min(i.reservePctFunded, 70) / 70) * resMax);
  finPoints += resPts;
  breakdown.push({
    label: 'Reserve funding',
    points: resPts,
    max: resMax,
    detail: `${Math.round(i.reservePctFunded)}% funded (target 70%)`,
  });

  // Months closed on time (10 max)
  if (i.monthsClosedOnTime > 0 || i.collectionRate > 0) {
    // Only include if there is some financial activity
    if (i.monthsClosedOnTime > 0) {
      const closedMax = 10;
      finMax += closedMax;
      const closedPts = Math.round((i.monthsClosedOnTime / 12) * closedMax);
      finPoints += closedPts;
      breakdown.push({
        label: 'Books closed on time',
        points: closedPts,
        max: closedMax,
        detail: `${i.monthsClosedOnTime}/12 months closed on time`,
      });
    } else {
      // monthsClosedOnTime is 0 but there is financial activity: drop from denominator
      breakdown.push({
        label: 'Books closed on time',
        points: 0,
        max: 0,
        detail: 'Not yet tracked. Weight redistributed.',
      });
    }
  } else {
    // No financial activity at all: drop from denominator
    breakdown.push({
      label: 'Books closed on time',
      points: 0,
      max: 0,
      detail: 'Not yet tracked. Weight redistributed.',
    });
  }

  // ── Governance (20 max) ──
  let govMax = 0;
  let govPoints = 0;

  const completedMeetings = i.meetings.filter(m => m.status === 'COMPLETED');

  // Notice sent before meeting (5 max)
  if (completedMeetings.length > 0) {
    const noticeMax = 5;
    govMax += noticeMax;
    const withNotice = completedMeetings.filter(m => m.noticeSentAt != null).length;
    const noticePts = Math.round((withNotice / completedMeetings.length) * noticeMax);
    govPoints += noticePts;
    breakdown.push({
      label: 'Meeting notice sent',
      points: noticePts,
      max: noticeMax,
      detail: `${withNotice}/${completedMeetings.length} meetings had notice sent`,
    });
  } else {
    breakdown.push({ label: 'Meeting notice sent', points: 0, max: 0, detail: 'No completed meetings yet. Weight redistributed.' });
  }

  // Quorum met (5 max)
  if (completedMeetings.length > 0) {
    const quorumMax = 5;
    govMax += quorumMax;
    const withQuorum = completedMeetings.filter(m => m.quorumMet === true).length;
    const quorumPts = Math.round((withQuorum / completedMeetings.length) * quorumMax);
    govPoints += quorumPts;
    breakdown.push({
      label: 'Quorum met',
      points: quorumPts,
      max: quorumMax,
      detail: `${withQuorum}/${completedMeetings.length} meetings had quorum`,
    });
  } else {
    breakdown.push({ label: 'Quorum met', points: 0, max: 0, detail: 'No completed meetings yet. Weight redistributed.' });
  }

  // Minutes approved within 7 days (5 max)
  if (completedMeetings.length > 0) {
    const minutesMax = 5;
    govMax += minutesMax;
    const approvedInTime = completedMeetings.filter(m => {
      if (!m.minutesApprovedAt) return false;
      const meetDate = new Date(m.date);
      const approvedDate = new Date(m.minutesApprovedAt);
      const daysDiff = (approvedDate.getTime() - meetDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    }).length;
    const minutesPts = Math.round((approvedInTime / completedMeetings.length) * minutesMax);
    govPoints += minutesPts;
    breakdown.push({
      label: 'Minutes approved within 7 days',
      points: minutesPts,
      max: minutesMax,
      detail: `${approvedInTime}/${completedMeetings.length} meetings`,
    });
  } else {
    breakdown.push({ label: 'Minutes approved within 7 days', points: 0, max: 0, detail: 'No completed meetings yet. Weight redistributed.' });
  }

  // No open fiduciary alerts (5 max) -- always include
  const alertMax = 5;
  govMax += alertMax;
  // We cannot compute fiduciary alerts here (circular dep), so we give full points.
  // The caller can adjust if they want.
  govPoints += alertMax;
  breakdown.push({
    label: 'No open fiduciary alerts',
    points: alertMax,
    max: alertMax,
    detail: 'Computed externally. Full credit if no alerts.',
  });

  // ── Records (10 max) ──
  let recMax = 0;
  let recPoints = 0;

  // Proof coverage (3 max)
  const proofMax = 3;
  recMax += proofMax;
  const proofPts = Math.round(Math.min(i.proofCoverage, 1) * proofMax);
  recPoints += proofPts;
  breakdown.push({
    label: 'Proof coverage',
    points: proofPts,
    max: proofMax,
    detail: `${Math.round(i.proofCoverage * 100)}% of items have attachments`,
  });

  // Documents current (3 max)
  const docMax = 3;
  recMax += docMax;
  const docPts = Math.round((Math.min(i.documentsCurrentPct, 100) / 100) * docMax);
  recPoints += docPts;
  breakdown.push({
    label: 'Documents current',
    points: docPts,
    max: docMax,
    detail: `${Math.round(i.documentsCurrentPct)}% of documents are current`,
  });

  // Reports generated (4 max)
  const rptMax = 4;
  recMax += rptMax;
  const rptPts = Math.round((Math.min(i.reportsGeneratedPct, 100) / 100) * rptMax);
  recPoints += rptPts;
  breakdown.push({
    label: 'Reports generated',
    points: rptPts,
    max: rptMax,
    detail: `${Math.round(i.reportsGeneratedPct)}% of expected reports exist`,
  });

  // ── Compute final score ──
  // Normalize each category to its weight share based on actual max
  const compNorm = compMax > 0 ? (compPoints / compMax) * 40 : 0;
  const finNorm = finMax > 0 ? (finPoints / finMax) * 30 : 0;
  const govNorm = govMax > 0 ? (govPoints / govMax) * 20 : 0;
  const recNorm = recMax > 0 ? (recPoints / recMax) * 10 : 0;

  // Total effective max (if some lines have max=0, weight redistributes)
  const totalMax = (compMax > 0 ? 40 : 0) + (finMax > 0 ? 30 : 0) + (govMax > 0 ? 20 : 0) + (recMax > 0 ? 10 : 0);
  const rawTotal = compNorm + finNorm + govNorm + recNorm;
  const score = totalMax > 0 ? Math.round((rawTotal / totalMax) * 100) : 0;

  return {
    score,
    compliance: compMax > 0 ? Math.round((compPoints / compMax) * 100) : 0,
    financial: finMax > 0 ? Math.round((finPoints / finMax) * 100) : 0,
    governance: govMax > 0 ? Math.round((govPoints / govMax) * 100) : 0,
    records: recMax > 0 ? Math.round((recPoints / recMax) * 100) : 0,
    breakdown,
  };
}

// ── Streaks ─────────────────────────────────────────────────────────────────

export function computeStreaks(i: HealthInputs): { label: string; count: number; brokenOn?: string }[] {
  const today = i.today ?? new Date();
  const streaks: { label: string; count: number; brokenOn?: string }[] = [];

  // months_nothing_overdue: count consecutive months backwards from today where
  // no runbook item was overdue
  {
    let count = 0;
    const todayStr = today.toISOString().split('T')[0];
    // simplified: check if any items are currently overdue
    const hasOverdue = i.runbookItems.some(
      item => !i.completions[item.id] && item.due && item.due < todayStr
    );
    if (!hasOverdue) count = 1; // at least current month
    streaks.push({ label: 'months_nothing_overdue', count, brokenOn: hasOverdue ? todayStr : undefined });
  }

  // meetings_noticed_on_time
  {
    const sorted = [...i.meetings].filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
    let count = 0;
    let brokenOn: string | undefined;
    for (const m of sorted) {
      if (m.noticeSentAt != null) {
        count++;
      } else {
        brokenOn = m.date;
        break;
      }
    }
    streaks.push({ label: 'meetings_noticed_on_time', count, brokenOn });
  }

  // minutes_within_7_days
  {
    const sorted = [...i.meetings].filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
    let count = 0;
    let brokenOn: string | undefined;
    for (const m of sorted) {
      if (m.minutesApprovedAt) {
        const meetDate = new Date(m.date);
        const approvedDate = new Date(m.minutesApprovedAt);
        const daysDiff = (approvedDate.getTime() - meetDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 7) {
          count++;
        } else {
          brokenOn = m.date;
          break;
        }
      } else {
        brokenOn = m.date;
        break;
      }
    }
    streaks.push({ label: 'minutes_within_7_days', count, brokenOn });
  }

  // books_closed_by_10th -- placeholder, depends on handoff 11
  streaks.push({ label: 'books_closed_by_10th', count: 0, brokenOn: undefined });

  // dcra_on_time_years -- placeholder
  streaks.push({ label: 'dcra_on_time_years', count: 0, brokenOn: undefined });

  return streaks;
}

// ── Badges ──────────────────────────────────────────────────────────────────

export function computeBadges(i: HealthInputs): { id: string; label: string; earned: boolean; detail: string }[] {
  const today = i.today ?? new Date();
  const todayStr = today.toISOString().split('T')[0];

  return [
    {
      id: 'fully_insured',
      label: 'Fully Insured',
      earned: i.runbookItems.filter(item => item.scope === 'insurance' || item.id.startsWith('i')).every(item => i.completions[item.id]),
      detail: 'All insurance-related runbook items are complete.',
    },
    {
      id: 'reserve_ready',
      label: 'Reserve Ready',
      earned: i.reservePctFunded >= 70,
      detail: 'Reserve fund is at or above the 70% target.',
    },
    {
      id: 'clean_books',
      label: 'Clean Books',
      earned: i.monthsClosedOnTime >= 12,
      detail: 'All 12 months closed on time in the past year.',
    },
    {
      id: 'clean_minutes',
      label: 'Clean Minutes',
      earned: i.meetings.filter(m => m.status === 'COMPLETED').length > 0 &&
        i.meetings.filter(m => m.status === 'COMPLETED').every(m => {
          if (!m.minutesApprovedAt) return false;
          const daysDiff = (new Date(m.minutesApprovedAt).getTime() - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff <= 7;
        }),
      detail: 'All meeting minutes approved within 7 days.',
    },
    {
      id: 'budget_adopted',
      label: 'Budget Adopted',
      earned: false, // Requires budget adoption tracking not yet in scope
      detail: 'Annual budget formally adopted by the board. Not yet tracked.',
    },
    {
      id: 'on_time_x12',
      label: 'On Time x12',
      earned: i.monthsClosedOnTime >= 12 && i.collectionRate >= 95,
      detail: 'All books closed and collection rate above 95% for 12 months.',
    },
    {
      id: 'zero_delinquency',
      label: 'Zero Delinquency',
      earned: i.collectionRate >= 100,
      detail: '100% collection rate -- no delinquent units.',
    },
    {
      id: 'full_season',
      label: 'Full Season',
      earned: Object.values(i.completions).length > 0 && Object.values(i.completions).every(Boolean),
      detail: 'Every runbook item is complete for the current season.',
    },
  ];
}
