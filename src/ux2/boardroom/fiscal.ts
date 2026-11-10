/**
 * The fiscal calendar the year-end close and annual budget runbooks share:
 * the building's fiscal year end (Building › Details, 'MM-DD', the 31st of
 * December by default), the year just ended, the year about to start.
 */
import { fiscalYearStart } from '@/lib/ledger';
import { addDays } from '@/lib/billingCycle';

const MMDD = /^\d{2}-\d{2}$/;
export const normalizeFye = (fye: string | undefined | null) => (fye && MMDD.test(fye) ? fye : '12-31');

/** The fiscal year `today` is in. */
export function currentFiscalYear(today: string, fye: string | undefined | null): { start: string; end: string } {
  const start = fiscalYearStart(today, normalizeFye(fye));
  const [y, m, d] = start.split('-').map(Number);
  const nextStart = new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
  return { start, end: addDays(nextStart, -1) };
}

/** The fiscal year that ended most recently on or before yesterday. */
export function lastFiscalYear(today: string, fye: string | undefined | null): { start: string; end: string } {
  const { start } = currentFiscalYear(today, fye);
  const end = addDays(start, -1);
  return { start: fiscalYearStart(end, normalizeFye(fye)), end };
}

/** The fiscal year that starts next. */
export function nextFiscalYear(today: string, fye: string | undefined | null): { start: string; end: string } {
  const { end } = currentFiscalYear(today, fye);
  const start = addDays(end, 1);
  return { start, end: currentFiscalYear(start, fye).end };
}

/** '2026' for a calendar year, '2026–27' for a year that straddles two. */
export function fiscalLabel(fy: { start: string; end: string }): string {
  const a = fy.start.slice(0, 4), b = fy.end.slice(0, 4);
  return a === b ? a : `${a}–${b.slice(2)}`;
}
