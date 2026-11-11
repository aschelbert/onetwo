/**
 * The annual budget runbook, wired: 90 days before the fiscal year starts,
 * one action that walks the board through next year's budget, ten steps a
 * first-timer can follow. The app starts a draft from this year's numbers
 * (budgetDraft.ts, kept in useBudgetDraftStore) and each step edits it in
 * place, with the live numbers beside it and a way to the page where the
 * data lives (BudgetGuide.tsx). The app ticks what it can see: the draft
 * started, each decision made on the draft, the meeting's vote to adopt,
 * the owner notice posted, the switch to the new budget and dues (it does
 * that itself on the first day of the year), the adopted budget filed.
 * One action per fiscal year; a budget action the board already opened by
 * hand, or from the budget obligation on Home, counts instead.
 *
 * The database runs the same job every morning (run_annual_budget,
 * migration 065); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';
import { currentFiscalYear, fiscalLabel, nextFiscalYear } from './fiscal';
import { budgetStepKey, capFromClauses, draftDone, draftTotals, duesByUnit, seedDraft, type BudgetDraft, type BudgetStepKey } from './budgetDraft';

export const ANNUAL_BUDGET_ID = 'annual-budget';
/** Days before the fiscal year starts that the runbook opens. */
export const BUDGET_LEAD_DAYS = 90;
/** Owners hear about the adopted budget and any dues change this many days before the year starts. */
export const BUDGET_NOTICE_DAYS = 30;
export const budgetSourceId = (fyStart: string) => `${ANNUAL_BUDGET_ID}:${fyStart}`;
export const ANNUAL_BUDGET_SIT = 'runbook-annual-budget';

export const STEP = { draft: 0, costs: 1, lines: 2, reserve: 3, dues: 4, review: 5, adopt: 6, notify: 7, switch: 8, file: 9 } as const;

/** A case already working next year's budget: the runbook's own, one from the Home obligation, or one opened by hand on the wizard. */
export function openBudgetCase(cases: CaseTrackerCase[], fyStart: string): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && c.sourceId === budgetSourceId(fyStart)) || (c.status !== 'closed' && ((c.source === 'obligation' && c.sourceId === 'f1') || c.sitId === 'annual-budgeting')));
}

export function budgetSteps(fy: { start: string; end: string }): { s: string; detail?: string; ck?: string[] }[] {
  const label = fiscalLabel(fy);
  return [
    { s: `Start the ${label} draft from this year's numbers`, detail: "The app copies every budget line with what has been spent so far, the vendor contracts, the insurance premiums, the reserve study and today's dues into a draft for next year. This step ticks itself when the action opens." },
    { s: "Check next year's contracts and insurance", detail: 'Confirm what each vendor contract and insurance policy will cost next year and which line pays for it. Change a price on the contract or the policy and the draft follows.' },
    { s: `Set every line for ${label}`, detail: "Each line has a suggestion from this year's spending. Accept it or type your own; the step ticks itself when every line has been looked at." },
    { s: 'Set the reserve contribution and a cushion', detail: 'How much goes into reserves for future repairs, from the reserve study, and a contingency for the unexpected (3 to 5% is usual).' },
    { s: `Pick the ${label} dues`, detail: "The dues that pay for the lines, the cushion and the reserves, split by each unit's share. The app checks the bylaws' limit on an increase without an owner vote." },
    { s: "Put the draft on a board meeting's agenda", detail: 'Add it to a board meeting as a decision with a board vote, with the proposed budget attached as it stands.' },
    { s: 'Board votes to adopt the budget', detail: 'The vote happens at the meeting and is recorded there; this step ticks itself when it passes. A vote taken elsewhere can be recorded on this action.' },
    { s: `Tell owners by ${addDays(fy.start, -BUDGET_NOTICE_DAYS)}: the adopted budget and the new dues`, detail: 'The notice is written for you from the adopted budget. This step ticks itself when a notice about the budget is posted after this action opened.' },
    { s: `Switch Funds to the ${label} budget and dues on ${fy.start}`, detail: "On that day the app puts the adopted lines into Funds › Planning, each unit's new dues on its account, and the new reserve transfer. It can also be done earlier by hand." },
    { s: 'File the adopted budget under Building › Documents', detail: 'The app writes the adopted budget as a document and files it under Budgets, where owners can read it.' },
  ];
}

/** The fiscal year a budget action is for: the runbook's own says so; one opened by hand (Take Action, or the budget obligation on Home) is for the year after it opened. */
export function budgetFyOf(c: CaseTrackerCase): { start: string; end: string } | null {
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  if (c.source === 'runbook' && c.sourceId?.startsWith(`${ANNUAL_BUDGET_ID}:`)) {
    const start = c.sourceId.slice(ANNUAL_BUDGET_ID.length + 1);
    return { start, end: currentFiscalYear(start, fye).end };
  }
  if (c.sitId === 'annual-budgeting') return nextFiscalYear(c.created.slice(0, 10), fye);
  return null;
}

export const isBudgetAction = (c: CaseTrackerCase) => !!budgetFyOf(c);

/** The step of a budget action that is this part of the budget, by its title. */
export function budgetStepIndex(c: CaseTrackerCase, key: BudgetStepKey): number {
  return (c.steps ?? []).findIndex(s => budgetStepKey(s.s) === key);
}

/** Start next year's draft from this year's numbers, once. */
export function ensureBudgetDraft(fy: { start: string; end: string }, today: string = todayIso()): BudgetDraft | undefined {
  const store = useBudgetDraftStore.getState();
  const had = store.get(fy.start);
  if (had || !store.canSeed()) return had;
  const fin = useFinancialStore.getState();
  const b = useBuildingStore.getState();
  const variance = (fin.getBudgetVariance() as { id?: string; name: string; budgeted: number; actual: number }[]) ?? [];
  const cap = capFromClauses(b.governingClauses ?? []);
  const d = seedDraft({
    fy, label: fiscalLabel(fy), today,
    thisYear: currentFiscalYear(today, b.details?.fiscalYearEnd),
    lines: variance.map(v => ({ id: v.id, name: v.name, budgeted: v.budgeted, actual: v.actual })),
    vendors: b.vendors ?? [],
    insurance: b.insurance ?? [],
    reserveAnnual: fin.annualReserveContribution,
    recommendedReserve: Math.round(fin.calculateRecommendedAnnualReserve()),
    units: fin.units,
    capPct: cap?.pct ?? null,
  });
  store.put(d);
  return d;
}

/** Put the adopted budget into Funds: each line's amount, every unit's dues, the reserve transfer. */
export function switchToBudget(fyStart: string, today: string = todayIso()): boolean {
  const d = useBudgetDraftStore.getState().get(fyStart);
  if (!d || d.switchedAt) return false;
  const fin = useFinancialStore.getState();
  const t = draftTotals(d);
  const cats = fin.budgetCategories;
  for (const l of d.lines) {
    const cat = cats.find(c => c.id === l.categoryId) ?? cats.find(c => c.name.toLowerCase() === l.name.toLowerCase());
    if (cat) { if (cat.budgeted !== l.amount) fin.updateBudgetCategory(cat.id, { budgeted: l.amount }); }
    else fin.addBudgetCategory(l.name, l.amount);
  }
  if (t.contingency > 0) {
    const cat = cats.find(c => /contingenc/i.test(c.name));
    if (cat) fin.updateBudgetCategory(cat.id, { budgeted: t.contingency }); else fin.addBudgetCategory('Contingency', t.contingency);
  }
  for (const u of duesByUnit(fin.units, t.monthly)) if (u.next !== u.now) fin.updateUnit(u.unit, { monthlyFee: u.next });
  if (fin.annualReserveContribution !== t.reserve) fin.setAnnualReserveContribution(t.reserve);
  useBudgetDraftStore.getState().update(fyStart, x => ({ ...x, switchedAt: today }));
  return true;
}

/** The board vote that adopted the budget, when one has passed: at the meeting it was put on, or recorded on the action. */
export function adoptionOf(c: CaseTrackerCase, d: BudgetDraft): { at: string; how: string } | null {
  if (d.review) {
    const m = useMeetingsStore.getState().meetings.find(x => x.id === d.review!.meetingId);
    const item = m?.items?.find(i => i.id === d.review!.itemId);
    const r = item?.vote?.result;
    if (m && r?.passed) return { at: r.closedAt.slice(0, 10), how: `Board vote at the ${m.title} on ${m.date}: ${r.for} for, ${r.against} against${r.abstain ? `, ${r.abstain} abstaining` : ''}` };
  }
  const v = c.boardVotes;
  if (v && v.votes.length) {
    const yes = v.votes.filter(x => /^(yes|for|approve)/i.test(x.vote)).length;
    const no = v.votes.filter(x => /^(no|against|deny)/i.test(x.vote)).length;
    if (yes > no) return { at: (v.date || todayIso()).slice(0, 10), how: `Board vote recorded on the action${v.motion ? ` (${v.motion})` : ''}: ${yes} for, ${no} against` };
  }
  return null;
}

/** A "Budgets" document with a file put there after the action opened. */
const filedSince = (since: string) => useBuildingStore.getState().legalDocuments.some(doc => /\bbudgets?\b/i.test(doc.name) && doc.attachments.some(a => !a.archived && (a.uploadedAt || '') >= since));

const budgetNotice = (c: CaseTrackerCase) => useComplianceStore.getState().announcements.some(a => /budget|dues/i.test(a.title) && (a.category === 'financial' || a.category === 'meeting' || a.category === 'general') && a.postedDate.slice(0, 10) >= c.created.slice(0, 10));

/** Tick the steps the draft and the app show done, record what the app sees on the draft, and switch over on the first day of the year. */
export function syncBudgetCase(c: CaseTrackerCase, today: string = todayIso()): void {
  if (c.status === 'closed' || !c.steps || !isBudgetAction(c)) return;
  const fy = budgetFyOf(c)!;
  const store = useBudgetDraftStore.getState();
  let d = store.get(fy.start) ?? ensureBudgetDraft(fy, today);
  if (!d) return;
  const created = c.created.slice(0, 10);
  // What the app sees elsewhere, written onto the draft.
  if (!d.adoptedAt) { const a = adoptionOf(c, d); if (a) store.update(fy.start, x => ({ ...x, adoptedAt: a.at, adoptedHow: a.how })); }
  if (!d.noticeAt && budgetNotice(c)) store.update(fy.start, x => ({ ...x, noticeAt: today }));
  if (!d.filedAt && d.adoptedAt && filedSince(created)) store.update(fy.start, x => ({ ...x, filedAt: today }));
  d = store.get(fy.start)!;
  if (d.adoptedAt && !d.switchedAt && today >= fy.start) { switchToBudget(fy.start, today); d = store.get(fy.start)!; }
  const done = draftDone(d);
  const complete = useIssuesStore.getState().completeStep;
  const latest = useIssuesStore.getState().cases.find(x => x.id === c.id) ?? c;
  (latest.steps ?? []).forEach((s, i) => {
    const key = budgetStepKey(s.s);
    if (key && done[key] && !s.done) complete(c.id, i);
  });
}

/** The budget an annual meeting presents: the first fiscal year starting after six months before the meeting. */
export function budgetForMeeting(meetingDate: string): { fy: { start: string; end: string }; label: string; action?: CaseTrackerCase; draft?: BudgetDraft; adoptedAt?: string } {
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  const fy = nextFiscalYear(addDays(meetingDate, -183), fye);
  const action = openBudgetCase(useIssuesStore.getState().cases, fy.start);
  const draft = useBudgetDraftStore.getState().get(fy.start);
  const adoptIdx = action ? budgetStepIndex(action, 'adopt') : -1;
  const adoptedAt = draft?.adoptedAt ?? (action && adoptIdx >= 0 && action.steps![adoptIdx].done ? (action.steps![adoptIdx].doneDate ?? undefined) : undefined);
  return { fy, label: fiscalLabel(fy), action, draft, adoptedAt };
}

/** The annual meeting step that brings the budget to owners, under its current and earlier titles. */
export const MEETING_BUDGET_STEP = /^(present the adopted budget|finalize proposed budget)/i;

export interface BudgetRun { fyStart: string; caseId: string | null; opened: boolean }

function openBudgetAction(fy: { start: string; end: string }, today: string): string {
  const label = fiscalLabel(fy);
  const id = useIssuesStore.getState().createCase({
    catId: 'financial',
    sitId: ANNUAL_BUDGET_SIT,
    approach: 'pre',
    title: `Annual budget · ${label}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'high',
    notes: `Opened by the Annual budget runbook on ${today}: the fiscal year ${label} starts ${fy.start}. Each step walks through the draft; owners must hear the adopted budget and the dues by ${addDays(fy.start, -BUDGET_NOTICE_DAYS)}.`,
    assignedRole: 'Treasurer',
    dueDate: addDays(fy.start, -BUDGET_NOTICE_DAYS),
    source: 'runbook',
    sourceId: budgetSourceId(fy.start),
    customSteps: budgetSteps(fy),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncBudgetCase(created, today);
  return id;
}

export function runAnnualBudget(today: string = todayIso()): BudgetRun {
  const fin = useFinancialStore.getState();
  const fye = useBuildingStore.getState().details?.fiscalYearEnd;
  const fy = nextFiscalYear(today, fye);
  // Every open budget action keeps ticking, and switches over on its year's first day, whichever year it is for.
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && isBudgetAction(c) && c.sourceId !== budgetSourceId(fy.start)) syncBudgetCase(c, today);
  const existing = openBudgetCase(useIssuesStore.getState().cases, fy.start);
  if (existing) { syncBudgetCase(existing, today); return { fyStart: fy.start, caseId: existing.id, opened: false }; }
  if (fin.runbooksOff.includes(ANNUAL_BUDGET_ID)) return { fyStart: fy.start, caseId: null, opened: false };
  if (today < addDays(fy.start, -BUDGET_LEAD_DAYS)) return { fyStart: fy.start, caseId: null, opened: false };
  return { fyStart: fy.start, caseId: openBudgetAction(fy, today), opened: true };
}

/** Start next year's budget now, before the runbook would (a board that wants a head start). Returns the action's id. */
export function startBudgetNow(today: string = todayIso()): string {
  const fy = nextFiscalYear(today, useBuildingStore.getState().details?.fiscalYearEnd);
  return openBudgetCase(useIssuesStore.getState().cases, fy.start)?.id ?? openBudgetAction(fy, today);
}
