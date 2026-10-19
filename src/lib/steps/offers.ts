/**
 * Offers — data-offered case rules.
 *
 * Offers surface in the queue when data conditions are met and no matching
 * open case exists.  Each offer tells the user "you should open this case"
 * with a link to start it in the drawer.
 */

import type { BoardRoleKey } from '@/types/auth';
import type { CaseTrackerCase } from '@/types/issues';
import type { BuildingSettings } from '@/lib/buildingSettings';

export interface Offer {
  id: string;
  kind:
    | 'collections'
    | 'capital_project'
    | 'fine_hearing'
    | 'insurance_claim'
    | 'conflict_check'
    | 'special_assessment';
  title: string;
  why: string;
  roleKey: BoardRoleKey;
  situationId: string;
  params: Record<string, string>;
}

export interface Approval {
  id: string;
  title: string;
  amount: number;
  status: string;
}

export interface ReserveItem {
  name: string;
  estimatedCost: number;
  currentFunding: number;
  replacementYear?: number;
}

export interface BuildOffersInput {
  delinquency: Array<{ unit: string; balance: number; daysPastDue: number }>;
  cases: CaseTrackerCase[];
  approvals: Approval[];
  settings: BuildingSettings;
  reserveItems: ReserveItem[];
  today?: Date;
}

// ── Constants ───────────────────────────────────────────────────────────

const DELINQUENCY_THRESHOLD_DAYS = 60;
const FINE_HEARING_NOTICE_DAYS = 30;

// ── Build Offers ────────────────────────────────────────────────────────

export function buildOffers(i: BuildOffersInput): Offer[] {
  const today = i.today ?? new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentYear = today.getFullYear();
  const offers: Offer[] = [];

  // ── 1. Collections — unit 60+ days past due with no open collections case
  for (const d of i.delinquency) {
    if (d.daysPastDue < DELINQUENCY_THRESHOLD_DAYS) continue;
    if (hasOpenCaseForUnit(i.cases, d.unit, 'collections')) continue;

    offers.push({
      id: `offer-collections-${d.unit}`,
      kind: 'collections',
      title: `Start collections for Unit ${d.unit}`,
      why: `$${d.balance.toLocaleString()} overdue ${d.daysPastDue} days`,
      roleKey: 'treasurer',
      situationId: 'delinquent-accounts',
      params: { unit: d.unit, balance: String(d.balance) },
    });
  }

  // ── 2. Capital project — approval above spendingLimit with no linked case
  //       or reserve item with replacementYear this year
  for (const a of i.approvals) {
    if (a.status === 'approved' || a.status === 'rejected') continue;
    if (a.amount <= i.settings.spendingLimit) continue;
    if (hasOpenCaseMatching(i.cases, a.title)) continue;

    offers.push({
      id: `offer-capital-${a.id}`,
      kind: 'capital_project',
      title: `Open capital project case for "${a.title}"`,
      why: `$${a.amount.toLocaleString()} exceeds spending limit of $${i.settings.spendingLimit.toLocaleString()}`,
      roleKey: 'president',
      situationId: 'special-assessments',
      params: { approvalId: a.id, amount: String(a.amount) },
    });
  }

  for (const r of i.reserveItems) {
    if (r.replacementYear !== currentYear) continue;
    if (hasOpenCaseMatching(i.cases, r.name)) continue;

    offers.push({
      id: `offer-capital-reserve-${r.name}`,
      kind: 'capital_project',
      title: `Plan capital project: ${r.name}`,
      why: `Replacement year ${r.replacementYear}, estimated $${r.estimatedCost.toLocaleString()}`,
      roleKey: 'president',
      situationId: 'special-assessments',
      params: { reserveName: r.name, estimatedCost: String(r.estimatedCost) },
    });
  }

  // ── 3. Fine hearing — covenant case with notice step completed 30+ days ago
  for (const c of i.cases) {
    if (c.status === 'closed') continue;
    if (c.sitId !== 'covenant-violations') continue;
    if (!c.steps) continue;

    // Look for a notice step that's been completed 30+ days
    const noticeStep = c.steps.find(
      s => s.done && s.doneDate && s.s.toLowerCase().includes('notice'),
    );
    if (!noticeStep || !noticeStep.doneDate) continue;

    const daysSinceNotice = daysBetween(noticeStep.doneDate, todayStr);
    if (daysSinceNotice < FINE_HEARING_NOTICE_DAYS) continue;

    // Check no open fine hearing case for same unit
    if (hasOpenCaseForUnit(i.cases, c.unit, 'fine')) continue;

    offers.push({
      id: `offer-fine-${c.id}`,
      kind: 'fine_hearing',
      title: `Schedule fine hearing for Unit ${c.unit}`,
      why: `Notice sent ${daysSinceNotice} days ago, no resolution`,
      roleKey: 'president',
      situationId: 'fine-hearings',
      params: { caseId: c.id, unit: c.unit },
    });
  }

  // ── 4. Special assessment — approved spend has no funding line
  for (const a of i.approvals) {
    if (a.status !== 'approved') continue;

    const hasFunding = i.reserveItems.some(r =>
      r.name.toLowerCase().includes(a.title.toLowerCase()) ||
      a.title.toLowerCase().includes(r.name.toLowerCase()),
    );
    if (hasFunding) continue;
    if (hasOpenCaseMatching(i.cases, 'special assessment')) continue;

    offers.push({
      id: `offer-special-assessment-${a.id}`,
      kind: 'special_assessment',
      title: `Evaluate special assessment for "${a.title}"`,
      why: `$${a.amount.toLocaleString()} approved with no dedicated funding source`,
      roleKey: 'treasurer',
      situationId: 'special-assessments',
      params: { approvalId: a.id, amount: String(a.amount) },
    });
  }

  return offers;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hasOpenCaseForUnit(
  cases: CaseTrackerCase[],
  unit: string,
  keyword: string,
): boolean {
  return cases.some(
    c =>
      c.status !== 'closed' &&
      c.unit === unit &&
      c.title.toLowerCase().includes(keyword),
  );
}

function hasOpenCaseMatching(
  cases: CaseTrackerCase[],
  keyword: string,
): boolean {
  const lower = keyword.toLowerCase();
  return cases.some(
    c =>
      c.status !== 'closed' &&
      (c.title.toLowerCase().includes(lower) || lower.includes(c.title.toLowerCase())),
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}
