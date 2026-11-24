/**
 * Reserves, wired: the plan's standing document (assumptions, next year's
 * contribution, the history of changes to components), the reserve funding
 * review that changes the contribution, and the one way a component is
 * changed, so every change is dated, has a reason, and lands in the review
 * that is open, wherever it was made: in the review itself, on Funds ›
 * Planning › Reserves, when a capital project closes, or when a repair
 * extends a component's life.
 */
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { ReserveItem } from '@/types/financial';
import { DEFAULT_ASSUMPTIONS, edited, lifeExtended, replaced, reserveStanding, type ComponentChange, type PlanAssumptions } from '@/lib/reservePlan';
import { reviewPassed, type ReserveReviewData } from '@/lib/actions/reserveReview';
import type { ActionRecord } from '@/lib/actions';
import { todayIso } from '../runbook/adapters';
import { SYNC, TRIGGERS, recordCase, startAction } from './recordActions';
import { lastStudyDate } from './reserveStudy';

export interface ReservePlanDoc {
  assumptions: PlanAssumptions;
  /** The contribution a review set for next year, until the annual budget adopts it. */
  nextYearMonthly: number | null;
  nextYearSetOn: string;
  /** Every change to a component, newest first. */
  changes: ComponentChange[];
}
const BLANK: ReservePlanDoc = { assumptions: DEFAULT_ASSUMPTIONS, nextYearMonthly: null, nextYearSetOn: '', changes: [] };
export const PLAN_KIND = 'reserve-plan';

export const planFrom = (data: unknown): ReservePlanDoc => ({ ...BLANK, ...((data as Partial<ReservePlanDoc>) ?? {}) });
export const planDoc = (): ReservePlanDoc => planFrom(useActionRecordsStore.getState().doc(PLAN_KIND)?.data);
const savePlan = (changes: Partial<ReservePlanDoc>, today: string) => useActionRecordsStore.getState().setDoc(PLAN_KIND, 'Reserve funding plan', { ...planDoc(), ...changes } as unknown as Record<string, unknown>, today);

/** The reserve account's balance in the ledger. */
export const reserveBalance = (): number => Number(useFinancialStore.getState().getBalanceSheet()?.assets?.reserves ?? 0) || 0;

/** Where the reserves stand today, from the ledger, the components and the plan's assumptions. */
export function standingNow(today: string = todayIso()) {
  const fin = useFinancialStore.getState();
  return reserveStanding(fin.reserveItems, reserveBalance(), fin.annualReserveContribution, Number(today.slice(0, 4)), planDoc().assumptions);
}

/**
 * What paying a job from reserves does to the plan: percent funded now and
 * after, and the first short year after, if there is one. When the job
 * replaces a reserve component, that component's clock restarts, so the
 * money is not counted as still owed to it.
 */
export function afterPaying(amount: number, reserveItemId: string, today: string = todayIso()): { pct: number | null; pctAfter: number | null; shortAfter: number | null } {
  const fin = useFinancialStore.getState();
  const year = Number(today.slice(0, 4)), a = planDoc().assumptions, balance = reserveBalance();
  const now = reserveStanding(fin.reserveItems, balance, fin.annualReserveContribution, year, a);
  const items = fin.reserveItems.map(r => (r.id === reserveItemId ? { ...r, ...replaced(r, today) } : r));
  const after = reserveStanding(items, balance - amount, fin.annualReserveContribution, year, a);
  return { pct: now.pct, pctAfter: after.pct, shortAfter: after.short?.year ?? null };
}

const reviews = () => useActionRecordsStore.getState().records.filter(r => r.kind === 'reserve-review');
/** The review that is open, if one is. */
export const openReview = (): ActionRecord | undefined => reviews().find(r => !r.closedOn);
export const reviewData = (r: ActionRecord) => r.data as unknown as ReserveReviewData;

/** The open review, or a new one with this as what opened it. Returns its record id and its action's case id. */
export function ensureReview(reason: string, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const open = openReview();
  if (open) return { recordId: open.id, caseId: recordCase(useIssuesStore.getState().cases, open)?.id ?? null };
  return startAction('reserve-review', reason, { reason, assumptions: planDoc().assumptions }, {}, today);
}

/** Record a change in the plan's history and in the review that is open (opening one when none is). */
function log(change: ComponentChange, today: string): void {
  savePlan({ changes: [change, ...planDoc().changes].slice(0, 200) }, today);
  const { recordId } = ensureReview(`${change.name}: ${change.what}`, today);
  const r = useActionRecordsStore.getState().records.find(x => x.id === recordId);
  if (!r) return;
  // A change after the components were confirmed asks for them to be confirmed again, unless the vote is already in.
  const d = reviewData(r);
  useActionRecordsStore.getState().patchData(recordId, { changes: [...d.changes, change], ...(d.vote.on ? {} : { componentsOn: '' }) });
}

export type ComponentEdit =
  | { kind: 'add'; name: string; cost: number; life: number; lastReplaced: string }
  | { kind: 'edit'; id: string; name?: string; cost?: number; life?: number; lastReplaced?: string }
  | { kind: 'replace'; id: string; on: string; cost?: number; life?: number }
  | { kind: 'extend'; id: string; years: number }
  | { kind: 'remove'; id: string };

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Change a reserve component. The one way in: it updates the item, keeps
 * "years left" in step, and records who changed what and why. Returns false
 * when the item is not there or no reason was given.
 */
export function changeComponent(e: ComponentEdit, why: string, by: string, today: string = todayIso()): boolean {
  const fin = useFinancialStore.getState();
  const year = Number(today.slice(0, 4));
  if (!why.trim()) return false;
  if (e.kind === 'add') {
    if (!e.name.trim()) return false;
    const life = Math.max(1, Math.round(e.life) || 1);
    const last = e.lastReplaced.slice(0, 4);
    const age = last ? Math.max(0, year - Number(last)) : 0;
    fin.addReserveItem({ name: e.name.trim(), estimatedCost: Math.max(0, e.cost), currentFunding: 0, usefulLife: life, lastReplaced: last, yearsRemaining: Math.max(0, life - age), isContingency: false });
    const added = useFinancialStore.getState().reserveItems.slice(-1)[0];
    log({ on: today, by, itemId: added?.id ?? '', name: e.name.trim(), what: `added at ${money(e.cost)}, ${life}-year life`, why: why.trim() }, today);
    return true;
  }
  const item: ReserveItem | undefined = fin.reserveItems.find(i => i.id === e.id);
  if (!item) return false;
  let what = '';
  if (e.kind === 'edit') {
    const next = edited(item, e, year);
    const parts = [
      next.name !== item.name ? `renamed to ${next.name}` : '',
      next.estimatedCost !== item.estimatedCost ? `cost ${money(item.estimatedCost)} to ${money(next.estimatedCost ?? 0)}` : '',
      next.usefulLife !== item.usefulLife ? `life ${item.usefulLife} to ${next.usefulLife} years` : '',
      next.lastReplaced !== item.lastReplaced ? `last replaced ${next.lastReplaced || 'cleared'}` : '',
    ].filter(Boolean);
    if (!parts.length) return false;
    fin.updateReserveItem(item.id, next);
    what = parts.join(', ');
  } else if (e.kind === 'replace') {
    fin.updateReserveItem(item.id, replaced(item, e.on, e.cost, e.life));
    what = `replaced ${e.on.slice(0, 4)}${e.cost != null ? ` at ${money(e.cost)}` : ''}; its clock restarts`;
  } else if (e.kind === 'extend') {
    if (!Math.round(e.years)) return false;
    fin.updateReserveItem(item.id, lifeExtended(item, e.years, year));
    what = `replacement moved ${Math.abs(Math.round(e.years))} year${Math.abs(Math.round(e.years)) === 1 ? '' : 's'} ${e.years > 0 ? 'later' : 'sooner'}`;
  } else {
    fin.deleteReserveItem(item.id);
    what = 'removed from the reserves';
  }
  log({ on: today, by, itemId: item.id, name: item.name, what, why: why.trim() }, today);
  return true;
}

/** Set the plan's assumptions (outside a review they are still recorded against the open one). */
export function setAssumptions(a: PlanAssumptions, today: string = todayIso()): void {
  const clean = { inflationPct: Math.max(0, Number(a.inflationPct) || 0), interestPct: Math.max(0, Number(a.interestPct) || 0), growthPct: Math.max(0, Number(a.growthPct) || 0) };
  savePlan({ assumptions: clean }, today);
}

/** A carried vote puts the contribution in effect, now or for next year, once; a failed one changes nothing. Either way the review closes. */
SYNC['reserve-review'] = (r, today) => {
  const d = reviewData(r);
  if (r.closedOn || !d.vote.on) return;
  const store = useActionRecordsStore.getState();
  if (reviewPassed(d) && !d.appliedOn) {
    if (d.effective === 'now') useFinancialStore.getState().setAnnualReserveContribution(Math.max(0, Math.round(d.monthly * 12)));
    else savePlan({ nextYearMonthly: Math.max(0, Math.round(d.monthly)), nextYearSetOn: today }, today);
    store.patchData(r.id, { appliedOn: today });
  }
  store.patch(r.id, { closedOn: today });
};

/** How long after a review closes before the plan may open another by itself. */
const QUIET_DAYS = 180;

/**
 * A review opens by itself when a reserve study is on file that is newer
 * than the last review, or when the plan shows a year the reserves run short
 * and no review has looked at it in the last six months.
 */
TRIGGERS.push((today: string) => {
  if (useFinancialStore.getState().runbooksOff.includes('reserve-funding-review') || openReview()) return;
  if (!useFinancialStore.getState().reserveItems.some(i => !i.isContingency)) return;
  const last = reviews().map(r => r.openedOn).sort().slice(-1)[0] ?? '';
  const study = lastStudyDate();
  if (study && study > last && study <= today) { ensureReview(`Reserve study of ${study}`, today); return; }
  const quietUntil = reviews().map(r => r.closedOn).filter(Boolean).sort().slice(-1)[0];
  if (quietUntil && Math.round((Date.parse(today) - Date.parse(quietUntil)) / 86400000) < QUIET_DAYS) return;
  const short = standingNow(today).short;
  if (short) ensureReview(`Reserves run short in ${short.year}`, today);
});
