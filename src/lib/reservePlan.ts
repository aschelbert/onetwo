/**
 * The reserve funding plan: one calculation behind every reserve figure the
 * app shows. Percent funded, the first year the reserves would run short and
 * the three contribution levels all come from here, so the Planning tile, the
 * year's goals, the five-year outlook and a capital project's funding step
 * read the same numbers.
 *
 * Percent funded is the reserve balance against what should have been set
 * aside by now: for each component, its cost today times the share of its
 * life already used. The plan then replays every replacement in its year, at
 * its inflated cost, adds the contributions and the interest, and reports
 * the balance year by year.
 */
import type { ReserveItem } from '@/types/financial';

export interface PlanAssumptions {
  /** Costs rise by this much a year. */
  inflationPct: number;
  /** The reserve account earns this much a year. */
  interestPct: number;
  /** The contribution grows by this much a year. */
  growthPct: number;
}
export const DEFAULT_ASSUMPTIONS: PlanAssumptions = { inflationPct: 3, interestPct: 2, growthPct: 3 };
export const PLAN_YEARS = 30;

export interface Component { id: string; name: string; cost: number; life: number; age: number; replaceYear: number; costThen: number; shouldHave: number }

const r0 = (n: number) => Math.round(n);
const yearOf = (s: string | undefined) => { const y = Number(String(s ?? '').slice(0, 4)); return Number.isFinite(y) && y > 1900 ? y : null; };

/** A reserve item as the plan sees it in a year: how old it is, when it is replaced, what that will cost, and what should be set aside for it by now. */
export function componentOf(item: ReserveItem, year: number, a: PlanAssumptions = DEFAULT_ASSUMPTIONS): Component {
  const life = Math.max(1, Math.round(item.usefulLife) || 1);
  const last = yearOf(item.lastReplaced);
  // With a replacement year on file, age follows the calendar; without one, the years left as entered stand in.
  const age = last != null ? Math.max(0, year - last) : Math.max(0, life - Math.max(0, Math.round(item.yearsRemaining)));
  const replaceYear = Math.max(year, year + (life - age));
  const cost = Math.max(0, item.estimatedCost);
  return {
    id: item.id, name: item.name, cost, life, age: Math.min(age, life), replaceYear,
    costThen: r0(cost * Math.pow(1 + a.inflationPct / 100, replaceYear - year)),
    shouldHave: r0(cost * Math.min(1, age / life)),
  };
}

/** The components the plan funds: every reserve item but the contingency line. */
export const componentsOf = (items: ReserveItem[], year: number, a: PlanAssumptions = DEFAULT_ASSUMPTIONS) =>
  items.filter(i => !i.isContingency).map(i => componentOf(i, year, a)).sort((x, y) => x.replaceYear - y.replaceYear || x.name.localeCompare(y.name));

/** What should be in the reserves today, and the balance against it. Null when there is nothing to fund yet. */
export function percentFunded(balance: number, comps: Pick<Component, 'shouldHave'>[]): number | null {
  const should = comps.reduce((t, c) => t + c.shouldHave, 0);
  return should > 0 ? Math.round((Math.max(0, balance) / should) * 100) : null;
}

export interface PlanYear { year: number; contribution: number; interest: number; spent: number; replaced: string[]; end: number; pct: number | null }

/** The reserve balance year by year at a monthly contribution. A component is replaced in its year and again every `life` years after. */
export function project(balance: number, monthly: number, comps: Component[], year: number, a: PlanAssumptions = DEFAULT_ASSUMPTIONS, years: number = PLAN_YEARS): PlanYear[] {
  const out: PlanYear[] = [];
  let bal = balance;
  for (let n = 0; n < years; n++) {
    const y = year + n;
    const contribution = r0(monthly * 12 * Math.pow(1 + a.growthPct / 100, n));
    const interest = r0(Math.max(0, bal) * (a.interestPct / 100));
    const due = comps.filter(c => y >= c.replaceYear && (y - c.replaceYear) % c.life === 0);
    const spent = r0(due.reduce((t, c) => t + c.cost * Math.pow(1 + a.inflationPct / 100, n), 0));
    bal = bal + contribution + interest - spent;
    // What should be set aside at the end of this year, at that year's prices.
    const should = comps.reduce((t, c) => {
      const used = y >= c.replaceYear ? (y - c.replaceYear) % c.life : c.age + n + 1;
      return t + c.cost * Math.pow(1 + a.inflationPct / 100, n + 1) * Math.min(1, used / c.life);
    }, 0);
    out.push({ year: y, contribution, interest, spent, replaced: due.map(c => c.name), end: r0(bal), pct: should > 0 ? Math.round((Math.max(0, bal) / should) * 100) : null });
  }
  return out;
}

/** The first year the balance goes below zero, with how far. */
export function firstShort(rows: PlanYear[]): { year: number; by: number; what: string } | null {
  const r = rows.find(x => x.end < 0);
  return r ? { year: r.year, by: -r.end, what: r.replaced.join(', ') } : null;
}

export type LevelId = 'today' | 'never-short' | 'full';
export interface Level { id: LevelId; label: string; monthly: number; note: string; short: ReturnType<typeof firstShort>; pctIn10: number | null }
/** The year "fully funded" aims at. */
export const FULL_BY_YEARS = 15;

/** The lowest monthly figure, to the nearest $50, that passes a test. */
function lowest(pass: (monthly: number) => boolean, ceiling: number): number {
  let lo = 0, hi = Math.max(50, Math.ceil(ceiling / 50) * 50);
  while (!pass(hi) && hi < 5_000_000) hi *= 2;
  while (hi - lo > 50) { const mid = Math.round((lo + hi) / 100) * 50; if (pass(mid)) hi = mid; else lo = mid; }
  return pass(lo) ? lo : hi;
}

/**
 * The three contribution levels, the same wherever a level is shown:
 * today's; the lowest that keeps every year of the plan above zero; and the
 * lowest that has the reserves fully funded in fifteen years.
 */
export function levels(balance: number, currentMonthly: number, comps: Component[], year: number, a: PlanAssumptions = DEFAULT_ASSUMPTIONS): Level[] {
  const run = (m: number) => project(balance, m, comps, year, a);
  const ceiling = comps.reduce((t, c) => t + c.costThen, 0) / 12;
  const neverShort = comps.length ? lowest(m => !firstShort(run(m)), ceiling) : 0;
  const full = comps.length ? lowest(m => { const r = run(m); return !firstShort(r) && (r[FULL_BY_YEARS - 1]?.pct ?? 0) >= 100; }, ceiling) : 0;
  const make = (id: LevelId, label: string, monthly: number, note: string): Level => { const rows = run(monthly); return { id, label, monthly, note, short: firstShort(rows), pctIn10: rows[9]?.pct ?? null }; };
  return [
    make('today', 'Today', Math.round(currentMonthly), 'No change'),
    make('never-short', 'Never short', Math.max(neverShort, 0), 'The lowest that keeps every year above zero'),
    make('full', `Fully funded by ${year + FULL_BY_YEARS}`, Math.max(full, neverShort), 'Reserves match what should be set aside'),
  ];
}

/** Everything a screen needs about the reserves today. */
export function reserveStanding(items: ReserveItem[], balance: number, annualContribution: number, year: number, a: PlanAssumptions = DEFAULT_ASSUMPTIONS) {
  const comps = componentsOf(items, year, a);
  const monthly = Math.round(annualContribution / 12);
  const rows = project(balance, monthly, comps, year, a);
  return {
    comps, monthly, rows,
    pct: percentFunded(balance, comps),
    shouldHave: comps.reduce((t, c) => t + c.shouldHave, 0),
    costToday: comps.reduce((t, c) => t + c.cost, 0),
    short: firstShort(rows),
  };
}

// ── Keeping a component up to date ───────────────────────────────────────────
export interface ComponentChange { on: string; by: string; itemId: string; name: string; what: string; why: string }

/** The fields to store when a component is replaced: its clock restarts, at the new cost and life. */
export function replaced(item: ReserveItem, on: string, cost?: number, life?: number): Partial<ReserveItem> {
  const l = Math.max(1, Math.round(life ?? item.usefulLife) || 1);
  return { lastReplaced: on.slice(0, 4), usefulLife: l, yearsRemaining: l, estimatedCost: Math.max(0, cost ?? item.estimatedCost), currentFunding: 0 };
}

/** The fields to store when a repair or a condition report changes how long a component will last: its replacement moves by that many years. */
export function lifeExtended(item: ReserveItem, years: number, year: number): Partial<ReserveItem> {
  const c = componentOf(item, year);
  const life = Math.max(c.age + 1, c.life + Math.round(years));
  return { usefulLife: life, yearsRemaining: Math.max(0, life - c.age) };
}

/** The fields to store for an edit made by hand, keeping "years left" in step with life and the last replacement. */
export function edited(item: ReserveItem, patch: { name?: string; cost?: number; life?: number; lastReplaced?: string }, year: number): Partial<ReserveItem> {
  const life = Math.max(1, Math.round(patch.life ?? item.usefulLife) || 1);
  const last = patch.lastReplaced !== undefined ? patch.lastReplaced.slice(0, 4) : item.lastReplaced;
  const ly = yearOf(last);
  const yearsRemaining = ly != null ? Math.max(0, life - Math.max(0, year - ly)) : Math.min(life, Math.max(0, Math.round(item.yearsRemaining)));
  return { name: patch.name ?? item.name, estimatedCost: Math.max(0, patch.cost ?? item.estimatedCost), usefulLife: life, lastReplaced: last, yearsRemaining };
}
