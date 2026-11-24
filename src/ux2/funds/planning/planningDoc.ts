import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import type { Loan } from '@/lib/outlook';
import { todayIso } from '../../runbook/adapters';

/**
 * What the forward-looking screens keep between visits: each budget line's
 * growth rate for the outlook, the loan register, and the cash floor. One
 * standing record of kind 'planning'.
 */
export interface PlanningDoc {
  /** Growth rate by budget line id, percent a year. */
  rates: Record<string, number>;
  loans: Loan[];
  /** Operating cash should not fall below this many months of operating costs. */
  floorMonths: number;
}
export const PLANNING_KIND = 'planning';
const BLANK: PlanningDoc = { rates: {}, loans: [], floorMonths: 3 };

export const planningFrom = (data: unknown): PlanningDoc => ({ ...BLANK, ...((data as Partial<PlanningDoc>) ?? {}) });
export const planningDoc = (): PlanningDoc => planningFrom(useActionRecordsStore.getState().doc(PLANNING_KIND)?.data);
export const savePlanning = (changes: Partial<PlanningDoc>, today: string = todayIso()) =>
  useActionRecordsStore.getState().setDoc(PLANNING_KIND, 'Planning assumptions and loans', { ...planningDoc(), ...changes } as unknown as Record<string, unknown>, today);

/** The planning record, re-read when it changes. */
export function usePlanningDoc(): PlanningDoc {
  return planningFrom(useActionRecordsStore(s => s.records.find(r => r.kind === PLANNING_KIND))?.data);
}
