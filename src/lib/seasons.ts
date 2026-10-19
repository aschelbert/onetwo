/**
 * Seasons — maps the compliance runbook and regulatory filings into
 * four fiscal-year seasons with milestones.
 *
 * Window rule (with defaults FY start Jan, annual meeting Apr):
 *   Filing         = Q1 of fiscal year (Jan-Mar)
 *   Annual Meeting = quarter containing annual_meeting_month (Apr-Jun)
 *   Maintenance    = whatever quarter is left (Jul-Sep)
 *   Budget         = last quarter before fiscal_year_start_month (Oct-Dec)
 *
 * Setup season exists only while tenantStatus === 'onboarding'.
 */

import type { BoardRoleKey } from '@/types/auth';
import type { BuildingSettings } from '@/lib/buildingSettings';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { RegulatoryFiling } from '@/store/useComplianceStore';
import { ALL_MILESTONES, type MilestoneDef, type SeasonId } from '@/data/milestones';
import { getMilestoneCaseMapping } from '@/data/milestoneCases';
import type { CaseTrackerCase } from '@/types/issues';

// ── Public Types ────────────────────────────────────────────────────────────

export type { SeasonId } from '@/data/milestones';

export interface Milestone {
  id: string;
  seasonId: SeasonId;
  title: string;
  itemIds: string[];
  filingCategories?: string[];
  flowId: 'runbook' | 'meeting' | 'vote' | 'budget' | 'close' | 'setup';
  order: number;
  dueRule: 'earliest_item' | 'latest_item' | 'fixed';
  fixedMonthDay?: string;
}

export interface SeasonWindow {
  seasonId: SeasonId;
  label: string;
  startMonth: number; // 1-12
  endMonth: number;   // 1-12
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}

export interface MilestoneState extends Milestone {
  status: 'complete' | 'active' | 'upcoming' | 'overdue';
  completedCount: number;
  totalCount: number;
  dueDate: string | null;
  ownerRole: BoardRoleKey;
}

export interface SeasonState extends SeasonWindow {
  milestones: MilestoneState[];
  completedCount: number;
  totalCount: number;
  isCurrent: boolean;
  daysLeft: number;
}

// ── Season Labels ───────────────────────────────────────────────────────────

const SEASON_LABELS: Record<SeasonId, string> = {
  setup: 'Setup',
  filing: 'Filing Season',
  annual_meeting: 'Annual Meeting',
  maintenance: 'Maintenance',
  budget: 'Budget Season',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Return the quarter (0-3) that contains a given month (1-12) relative to fiscal year start. */
function fiscalQuarter(month: number, fyStart: number): number {
  // Shift month so fiscal year start becomes 0
  const shifted = ((month - fyStart) + 12) % 12;
  return Math.floor(shifted / 3);
}

/** Return the start month (1-12) of a fiscal quarter (0-3). */
function quarterStartMonth(quarter: number, fyStart: number): number {
  return ((fyStart - 1 + quarter * 3) % 12) + 1;
}

/** Return the end month (1-12) of a fiscal quarter (0-3). */
function quarterEndMonth(quarter: number, fyStart: number): number {
  return ((fyStart - 1 + quarter * 3 + 2) % 12) + 1;
}

/** Format YYYY-MM-DD for the first day of a month in a given year. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Format YYYY-MM-DD for the last day of a month in a given year. */
function monthEnd(year: number, month: number): string {
  // Day 0 of next month = last day of this month
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Determine the year for a quarter's start month given the fiscal year. */
function yearForQuarterStart(fyYear: number, quarter: number, fyStart: number): number {
  const sm = quarterStartMonth(quarter, fyStart);
  // If the start month is before the FY start month, it wraps to next calendar year
  if (fyStart > 1 && sm < fyStart) {
    return fyYear + 1;
  }
  return fyYear;
}

/** Determine the year for a quarter's end month. */
function yearForQuarterEnd(fyYear: number, quarter: number, fyStart: number): number {
  const em = quarterEndMonth(quarter, fyStart);
  if (fyStart > 1 && em < fyStart) {
    return fyYear + 1;
  }
  return fyYear;
}

/** Assign season IDs to fiscal quarters. */
function assignSeasonIds(settings: BuildingSettings): Record<number, SeasonId> {
  const fyStart = settings.fiscalYearStartMonth;
  const meetingMonth = settings.annualMeetingMonth;

  // Q0 = filing (first quarter of fiscal year)
  // Q3 = budget (last quarter before next FY start)
  // The quarter containing annual_meeting_month = annual_meeting
  // Whatever quarter is left = maintenance

  const meetingQuarter = fiscalQuarter(meetingMonth, fyStart);

  const assignment: Record<number, SeasonId> = {};
  assignment[0] = 'filing';
  assignment[3] = 'budget';

  // Annual meeting quarter
  if (meetingQuarter === 0) {
    // Overlaps with filing — filing takes precedence, bump meeting to Q1
    assignment[1] = 'annual_meeting';
    assignment[2] = 'maintenance';
  } else if (meetingQuarter === 3) {
    // Overlaps with budget — budget takes precedence, put meeting in Q2
    assignment[2] = 'annual_meeting';
    assignment[1] = 'maintenance';
  } else {
    assignment[meetingQuarter] = 'annual_meeting';
    // The remaining quarter is maintenance
    const remaining = [1, 2].find(q => q !== meetingQuarter)!;
    assignment[remaining] = 'maintenance';
  }

  return assignment;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the four season windows for a given fiscal year.
 */
export function seasonWindows(settings: BuildingSettings, year: number): SeasonWindow[] {
  const fyStart = settings.fiscalYearStartMonth;
  const quarterToSeason = assignSeasonIds(settings);

  const windows: SeasonWindow[] = [];

  for (let q = 0; q < 4; q++) {
    const seasonId = quarterToSeason[q];
    const sm = quarterStartMonth(q, fyStart);
    const em = quarterEndMonth(q, fyStart);
    const sy = yearForQuarterStart(year, q, fyStart);
    const ey = yearForQuarterEnd(year, q, fyStart);

    windows.push({
      seasonId,
      label: SEASON_LABELS[seasonId],
      startMonth: sm,
      endMonth: em,
      startDate: monthStart(sy, sm),
      endDate: monthEnd(ey, em),
    });
  }

  return windows;
}

/**
 * Build fully-hydrated season states with milestone statuses.
 */
export function buildSeasons(args: {
  items: ComplianceItem[];
  completions: Record<string, boolean>;
  filings: RegulatoryFiling[];
  settings: BuildingSettings;
  tenantStatus: 'onboarding' | 'active' | string;
  setupProgress?: { completed: number; total: number };
  today?: Date;
  /** Cases for milestone step progress — when a milestone has a linked CATS case,
   *  the milestone's progress reads from the case's steps. */
  cases?: CaseTrackerCase[];
}): SeasonState[] {
  const { items, completions, filings, settings, tenantStatus, setupProgress, today: todayArg, cases: casesList } = args;
  const today = todayArg ?? new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentYear = today.getFullYear();

  // Determine which fiscal year "today" falls in
  const fyStart = settings.fiscalYearStartMonth;
  const fyYear = today.getMonth() + 1 >= fyStart ? currentYear : currentYear - 1;

  const windows = seasonWindows(settings, fyYear);

  // Build item lookup
  const itemMap = new Map<string, ComplianceItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Build filing lookup by category
  const filingsByCategory = new Map<string, RegulatoryFiling[]>();
  for (const f of filings) {
    const list = filingsByCategory.get(f.category) || [];
    list.push(f);
    filingsByCategory.set(f.category, list);
  }

  // Filter milestones: exclude setup if not onboarding
  const activeMilestones = ALL_MILESTONES.filter(m => {
    if (m.seasonId === 'setup') return tenantStatus === 'onboarding';
    return true;
  });

  const seasons: SeasonState[] = [];

  for (const window of windows) {
    const seasonMilestones = activeMilestones
      .filter(m => m.seasonId === window.seasonId)
      .sort((a, b) => a.order - b.order);

    const milestoneStates: MilestoneState[] = seasonMilestones.map(m =>
      hydrateMilestone(m, itemMap, completions, filingsByCategory, window, todayStr, today, casesList)
    );

    const totalCount = milestoneStates.reduce((sum, ms) => sum + ms.totalCount, 0);
    const completedCount = milestoneStates.reduce((sum, ms) => sum + ms.completedCount, 0);

    const isCurrent = window.startDate <= todayStr && todayStr <= window.endDate;
    // Use date-only arithmetic (strip time) to avoid DST / UTC-local drift
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const DAY_MS = 1000 * 60 * 60 * 24;
    const daysLeft = isCurrent
      ? Math.max(0, Math.round((new Date(window.endDate).getTime() - todayDate.getTime()) / DAY_MS))
      : todayStr < window.startDate
        ? Math.round((new Date(window.startDate).getTime() - todayDate.getTime()) / DAY_MS)
        : 0;

    seasons.push({
      ...window,
      milestones: milestoneStates,
      completedCount,
      totalCount,
      isCurrent,
      daysLeft,
    });
  }

  // Insert setup season at the beginning if onboarding
  if (tenantStatus === 'onboarding') {
    const setupMs = activeMilestones.filter(m => m.seasonId === 'setup');
    const setupCompleted = setupProgress?.completed ?? 0;
    const setupTotal = setupProgress?.total ?? 1;

    const setupMilestoneStates: MilestoneState[] = setupMs.map(m => ({
      ...m,
      status: 'active' as const,
      completedCount: setupCompleted,
      totalCount: setupTotal,
      dueDate: null,
      ownerRole: m.ownerRole,
    }));

    const setupWindow: SeasonState = {
      seasonId: 'setup',
      label: SEASON_LABELS.setup,
      startMonth: 0,
      endMonth: 0,
      startDate: todayStr,
      endDate: todayStr,
      milestones: setupMilestoneStates,
      completedCount: setupCompleted,
      totalCount: setupTotal,
      isCurrent: true,
      daysLeft: 0,
    };

    seasons.unshift(setupWindow);
  }

  return seasons;
}

/**
 * Return the current season (first where isCurrent === true).
 */
export function currentSeason(seasons: SeasonState[]): SeasonState {
  return seasons.find(s => s.isCurrent) ?? seasons[0];
}

// ── Internal ────────────────────────────────────────────────────────────────

function hydrateMilestone(
  m: MilestoneDef,
  itemMap: Map<string, ComplianceItem>,
  completions: Record<string, boolean>,
  filingsByCategory: Map<string, RegulatoryFiling[]>,
  window: SeasonWindow,
  todayStr: string,
  _today: Date,
  cases?: CaseTrackerCase[],
): MilestoneState {
  // Check if this milestone has a linked CATS case
  const mapping = getMilestoneCaseMapping(m.id);
  const linkedCase = mapping && cases
    ? cases.find(c => c.linkedMilestoneId === m.id && c.status !== 'closed')
    : undefined;

  // If a linked case exists, use its steps for progress tracking
  if (linkedCase && linkedCase.steps && linkedCase.steps.length > 0) {
    const caseSteps = linkedCase.steps;
    const caseTotalCount = caseSteps.length;
    const caseCompletedCount = caseSteps.filter(s => s.done).length;
    const isComplete = caseTotalCount > 0 && caseCompletedCount === caseTotalCount;
    const isCurrent = window.startDate <= todayStr && todayStr <= window.endDate;

    // Check for overdue by looking at case due date
    const hasOverdue = linkedCase.dueDate ? linkedCase.dueDate < todayStr : false;

    let status: MilestoneState['status'];
    if (isComplete) {
      status = 'complete';
    } else if (hasOverdue) {
      status = 'overdue';
    } else if (isCurrent) {
      status = 'active';
    } else {
      status = 'upcoming';
    }

    const dueDate = linkedCase.dueDate ?? computeDueDate(m, m.itemIds.filter(id => itemMap.has(id)), [], itemMap, window);

    return {
      id: m.id,
      seasonId: m.seasonId,
      title: m.title,
      itemIds: m.itemIds,
      filingCategories: m.filingCategories,
      flowId: m.flowId,
      order: m.order,
      dueRule: m.dueRule,
      fixedMonthDay: m.fixedMonthDay,
      status,
      completedCount: caseCompletedCount,
      totalCount: caseTotalCount,
      dueDate,
      ownerRole: m.ownerRole,
    };
  }

  // Collect trackable items: runbook items that exist in the data
  const trackableItemIds = m.itemIds.filter(id => itemMap.has(id));

  // Collect filings for the milestone's categories
  const trackableFilings: RegulatoryFiling[] = [];
  if (m.filingCategories) {
    for (const cat of m.filingCategories) {
      const fs = filingsByCategory.get(cat);
      if (fs) trackableFilings.push(...fs);
    }
  }

  const totalCount = trackableItemIds.length + trackableFilings.length;

  // Count completed
  let completedCount = 0;
  for (const id of trackableItemIds) {
    if (completions[id]) completedCount++;
  }
  for (const f of trackableFilings) {
    if (f.status === 'filed') completedCount++;
  }

  // Compute due date
  const dueDate = computeDueDate(m, trackableItemIds, trackableFilings, itemMap, window);

  // Determine status
  const isComplete = totalCount > 0 && completedCount === totalCount;

  // Check if any item is overdue
  let hasOverdue = false;
  for (const id of trackableItemIds) {
    if (!completions[id]) {
      const item = itemMap.get(id);
      if (item && isFixedDate(item.due) && item.due < todayStr) {
        hasOverdue = true;
        break;
      }
    }
  }
  if (!hasOverdue) {
    for (const f of trackableFilings) {
      if (f.status === 'pending' && f.dueDate < todayStr) {
        hasOverdue = true;
        break;
      }
    }
  }

  const isCurrent = window.startDate <= todayStr && todayStr <= window.endDate;

  let status: MilestoneState['status'];
  if (isComplete) {
    status = 'complete';
  } else if (hasOverdue) {
    status = 'overdue';
  } else if (isCurrent) {
    status = 'active';
  } else {
    status = 'upcoming';
  }

  return {
    id: m.id,
    seasonId: m.seasonId,
    title: m.title,
    itemIds: m.itemIds,
    filingCategories: m.filingCategories,
    flowId: m.flowId,
    order: m.order,
    dueRule: m.dueRule,
    fixedMonthDay: m.fixedMonthDay,
    status,
    completedCount,
    totalCount,
    dueDate,
    ownerRole: m.ownerRole,
  };
}

function computeDueDate(
  m: MilestoneDef,
  trackableItemIds: string[],
  trackableFilings: RegulatoryFiling[],
  itemMap: Map<string, ComplianceItem>,
  window: SeasonWindow,
): string | null {
  if (m.dueRule === 'fixed' && m.fixedMonthDay) {
    // Determine the year from the window
    const endYear = parseInt(window.endDate.substring(0, 4), 10);
    const startYear = parseInt(window.startDate.substring(0, 4), 10);
    const fixedMonth = parseInt(m.fixedMonthDay.substring(0, 2), 10);

    // Use the year where the fixed month falls within the window
    let year = startYear;
    const candidateStart = `${startYear}-${m.fixedMonthDay}`;
    const candidateEnd = `${endYear}-${m.fixedMonthDay}`;
    if (candidateStart >= window.startDate && candidateStart <= window.endDate) {
      year = startYear;
    } else if (candidateEnd >= window.startDate && candidateEnd <= window.endDate) {
      year = endYear;
    } else {
      // Default to end year
      year = endYear;
    }

    return `${year}-${m.fixedMonthDay}`;
  }

  // Collect all dates from items and filings
  const dates: string[] = [];
  for (const id of trackableItemIds) {
    const item = itemMap.get(id);
    if (item && isFixedDate(item.due)) {
      dates.push(item.due);
    }
  }
  for (const f of trackableFilings) {
    dates.push(f.dueDate);
  }

  if (dates.length === 0) return null;

  dates.sort();

  if (m.dueRule === 'earliest_item') {
    return dates[0];
  }
  // latest_item
  return dates[dates.length - 1];
}

/** Check if a due string is a fixed date (YYYY-MM-DD) vs recurring like "Monthly" or "Per meeting". */
function isFixedDate(due: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}
