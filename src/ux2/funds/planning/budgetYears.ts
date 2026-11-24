import { useMemo } from 'react';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { budgetLineAccounts } from '@/lib/ledger';
import { blankYear, isLocked, kept, kindOf, withAmounts, yearLines, type BudgetYear, type LineKind } from '@/lib/budgetYear';
import { currentFiscalYear, fiscalLabel, lastFiscalYear } from '../../boardroom/fiscal';
import { readToolDoc, saveToolDoc } from '../../boardroom/tools/docs';
import { todayIso } from '../../runbook/adapters';

/**
 * The budget of each fiscal year, kept as one record a year (kind
 * 'budget-year', keyed by the year's first day). The current year's record
 * follows the live budget lines until the board adopts it; after that the
 * lines only change through a budget amendment, and every change is listed.
 * When a new year's budget takes over, the outgoing year is kept with what
 * each line spent.
 */
export const BUDGET_YEAR = 'budget-year';
const fye = () => useBuildingStore.getState().details?.fiscalYearEnd;
const who = () => useAuthStore.getState().currentUser?.name || 'The board';

export const yearDoc = (fyStart: string): BudgetYear | undefined => {
  const y = readToolDoc<BudgetYear>(BUDGET_YEAR, fyStart, blankYear(fyStart));
  return y.lines.length || y.adoptedOn ? y : undefined;
};
const save = (y: BudgetYear, today: string) => saveToolDoc<BudgetYear>(BUDGET_YEAR, y.key, blankYear(y.key), y, today);

/** How each line of a year is spread: 'seasonal' lines take the shape of the year before's spending, the rest are even. */
export function shapes(fyStart: string, lines: { id: string; name: string }[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const modes = readToolDoc<{ lines: Record<string, string> }>('budget-spread', fyStart, { lines: {} }).lines;
  if (!Object.values(modes).includes('seasonal')) return out;
  const fin = useFinancialStore.getState();
  const prior = lastFiscalYear(fyStart, fye());
  for (const l of lines) {
    if (modes[l.id] !== 'seasonal') continue;
    const accts = new Set(budgetLineAccounts(l, fin.chartOfAccounts).map(a => a.num));
    const months = Array(12).fill(0) as number[];
    for (const e of fin.generalLedger) if (e.status !== 'void' && e.date >= prior.start && e.date <= prior.end && accts.has(e.debitAcct)) months[Number(e.date.slice(5, 7)) - 1] += e.amount;
    if (months.some(n => n > 0)) out.set(l.id, months);
  }
  return out;
}

/** The year `today` falls in, from the live budget lines; its record is created or brought up to date. */
export function syncCurrentYear(today: string = todayIso(), why = 'Changed on Funds › Planning'): BudgetYear {
  const fy = currentFiscalYear(today, fye());
  const fin = useFinancialStore.getState();
  const had = yearDoc(fy.start);
  const live = fin.budgetCategories.map(c => ({ id: c.id, name: c.name, amount: c.budgeted }));
  const base: BudgetYear = had ?? { ...blankYear(fy.start, fy.end, fiscalLabel(fy)), reserve: fin.annualReserveContribution, monthlyDues: fin.units.reduce((t, u) => t + u.monthlyFee, 0) };
  let next: BudgetYear;
  if (!had) {
    const shape = shapes(fy.start, live);
    next = { ...base, lines: yearLines(live.map(l => ({ ...l, shape: shape.get(l.id) }))) };
  } else {
    next = withAmounts(base, live, { on: today, why, by: who() });
    if (!isLocked(next)) next = { ...next, reserve: fin.annualReserveContribution, monthlyDues: fin.units.reduce((t, u) => t + u.monthlyFee, 0) };
  }
  if (JSON.stringify(next) !== JSON.stringify(had)) save(next, today);
  return next;
}

/** Mark the current year's budget as adopted (a vote taken outside the annual budget action). From then on its lines are locked. */
export function markAdopted(on: string, how: string, today: string = todayIso()): void {
  const y = syncCurrentYear(today);
  save({ ...y, adoptedOn: on, adoptedHow: how.trim(), lines: y.lines.map(l => ({ ...l, adopted: l.amount })) }, today);
}

/** Whether the current year's lines are locked: its budget has been adopted. */
export const budgetLocked = (today: string = todayIso()) => isLocked(yearDoc(currentFiscalYear(today, fye()).start));

/**
 * A new year's adopted budget takes over. The year that is ending is kept
 * with what each line spent, and the new year's record is written from the
 * adopted lines, already locked. Called before the live lines change.
 */
export function turnYear(next: { fyStart: string; fyEnd: string; label: string; adoptedOn: string; adoptedHow: string; reserve: number; monthlyDues: number; lines: { id: string; name: string; amount: number; kind?: LineKind }[] }, today: string = todayIso()): void {
  const fin = useFinancialStore.getState();
  const out = lastFiscalYear(next.fyStart, fye());
  const had = yearDoc(out.start);
  if (!had?.keptOn) {
    const live = fin.budgetCategories.map(c => ({ id: c.id, name: c.name, amount: c.budgeted }));
    const leaving: BudgetYear = had ?? { ...blankYear(out.start, out.end, fiscalLabel(out)), reserve: fin.annualReserveContribution, monthlyDues: fin.units.reduce((t, u) => t + u.monthlyFee, 0), lines: yearLines(live) };
    save(kept({ ...leaving, fyEnd: leaving.fyEnd || out.end, label: leaving.label || fiscalLabel(out) }, fin.chartOfAccounts, fin.generalLedger, today), today);
  }
  const shape = shapes(next.fyStart, next.lines);
  save({ ...blankYear(next.fyStart, next.fyEnd, next.label), adoptedOn: next.adoptedOn, adoptedHow: next.adoptedHow, reserve: next.reserve, monthlyDues: next.monthlyDues, lines: yearLines(next.lines.map(l => ({ ...l, shape: shape.get(l.id) }))) }, today);
}

/** Every year on record, newest first, and the current one brought up to date. */
export function useBudgetYears(today: string) {
  const records = useActionRecordsStore(s => s.records);
  const cats = useFinancialStore(s => s.budgetCategories);
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd);
  return useMemo(() => {
    const fy = currentFiscalYear(today, fiscalYearEnd);
    const years = records.filter(r => r.kind === BUDGET_YEAR).map(r => ({ ...blankYear(''), ...(r.data as object) } as BudgetYear)).filter(y => y.key && y.lines.length).sort((a, b) => b.key.localeCompare(a.key));
    const current = years.find(y => y.key === fy.start);
    // A line the record has not caught up with yet still shows, spread evenly.
    const kindById = new Map((current?.lines ?? []).map(l => [l.id, l] as const));
    const lines = cats.map(c => kindById.get(c.id) ?? yearLines([{ id: c.id, name: c.name, amount: c.budgeted, kind: kindOf(c.name) }])[0]);
    return { fy, years, current, lines, past: years.filter(y => y.key < fy.start), locked: isLocked(current) };
  }, [records, cats, today, fiscalYearEnd]);
}
