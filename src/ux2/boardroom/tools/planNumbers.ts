import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { utilitiesFrom } from '@/lib/utilities';
import type { Measure } from '@/lib/caseTools';

/**
 * What the app can already measure for a year's objectives, from the records
 * it keeps. The dues increase and anything custom are entered by the board.
 */
export function measuredNow(year: string): Partial<Record<Measure, number>> {
  const fin = useFinancialStore.getState();
  const cost = fin.reserveItems.reduce((t, i) => t + i.estimatedCost, 0);
  const funded = fin.reserveItems.reduce((t, i) => t + i.currentFunding, 0);
  const yearDues = fin.units.reduce((t, u) => t + u.monthlyFee * 12, 0);
  const owed = fin.units.reduce((t, u) => t + Math.max(0, u.balance), 0);
  const doc = utilitiesFrom(useActionRecordsStore.getState().records.find(r => r.kind === 'utilities')?.data);
  const bills = doc.bills.filter(b => b.month.startsWith(year.slice(0, 4) + '-'));
  const out: Partial<Record<Measure, number>> = {};
  if (cost > 0) out['reserve-funded'] = Math.round((funded / cost) * 100);
  if (yearDues > 0) out['late-dues'] = Math.round((owed / yearDues) * 1000) / 10;
  if (bills.length) out.utilities = Math.round(bills.reduce((t, b) => t + b.cost, 0));
  return out;
}
