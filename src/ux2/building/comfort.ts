import { useMemo } from 'react';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { check, complaintKind, judge, rulesFrom, seasonStartFor, type Check, type ComfortRules, type Complaint, type Reading } from '@/lib/comfort';
import type { RepairData } from '@/lib/actions/repair';
import { todayIso } from '../runbook/adapters';
import { startAction } from '../boardroom/recordActions';
import type { ObligationRow, ObligationState } from './metrics';

/**
 * Heat and hot water as the building keeps them: the rules the board set and
 * every reading taken, in one standing record of kind 'comfort'. A reading
 * under the rule opens a repair, once, until a later reading meets it.
 */
export const COMFORT_KIND = 'comfort';
export interface ComfortDoc { rules: ComfortRules; readings: Reading[] }
export const comfortFrom = (data: unknown): ComfortDoc => { const d = (data as Partial<ComfortDoc>) ?? {}; return { rules: rulesFrom(d.rules), readings: d.readings ?? [] }; };
export const comfortDoc = (): ComfortDoc => comfortFrom(useActionRecordsStore.getState().doc(COMFORT_KIND)?.data);
const save = (changes: Partial<ComfortDoc>, today: string) => useActionRecordsStore.getState().setDoc(COMFORT_KIND, 'Heat and hot water', { ...comfortDoc(), ...changes } as unknown as Record<string, unknown>, today);

export const saveRules = (changes: Partial<ComfortRules>, today: string = todayIso()) => save({ rules: { ...comfortDoc().rules, ...changes } }, today);

const WORD = { heat: 'Heat', 'hot-water': 'Hot water' } as const;

/** Log a reading. One under the rule opens a repair for it, unless a repair from an earlier low reading is still open. Returns the repair's action, when one was opened. */
export function addReading(r: Omit<Reading, 'id' | 'repairId'>, today: string = todayIso()): { reading: Reading; repairCaseId: string | null } {
  const doc = comfortDoc();
  const reading: Reading = { ...r, id: `rd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` };
  const j = judge(reading, doc.rules);
  let repairCaseId: string | null = null;
  if (!j.ok) {
    const records = useActionRecordsStore.getState().records;
    const open = doc.readings.find(x => x.kind === reading.kind && x.repairId && records.some(a => a.id === x.repairId && !a.closedOn));
    if (open) reading.repairId = open.repairId;
    else {
      const data: Partial<RepairData> = { what: `${WORD[reading.kind]} is under the minimum: ${reading.temp}°F, and ${j.min}°F is asked for`, where: reading.where || (reading.unit ? `Unit ${reading.unit}` : 'The building'), foundBy: reading.by, from: `A reading logged ${reading.on}${reading.at ? ` at ${reading.at}` : ''} under Building › Upkeep` };
      const started = startAction('repair', `${WORD[reading.kind]} under the minimum${reading.unit ? ` · unit ${reading.unit}` : ''}`, data as Record<string, unknown>, { unit: reading.unit }, today);
      reading.repairId = started.recordId; repairCaseId = started.caseId;
    }
  }
  save({ readings: [reading, ...doc.readings] }, today);
  return { reading, repairCaseId };
}

/** Open requests from residents that are about heat or hot water. */
export function complaints(): Complaint[] {
  return useIssuesStore.getState().issues.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED')
    .map(i => ({ i, kind: complaintKind(`${i.title} ${i.description} ${i.category}`) })).filter(x => x.kind)
    .map(({ i, kind }) => ({ id: i.id, unit: i.unitNumber ?? '', on: (i.submittedDate || '').slice(0, 10), what: i.title || i.description, kind: kind! }));
}

/** The two checks as obligations: ongoing while they run, with a date when the season is yet to start. */
export function comfortObligations(doc: ComfortDoc, today: string): ObligationRow[] {
  const state = (c: Check): ObligationState => (c.state === 'below' || c.state === 'overdue' ? 'overdue' : c.state === 'due' ? 'in-progress' : c.state === 'out-of-season' ? 'upcoming' : 'ongoing');
  const row = (c: Check, task: string, freq: string, legalRef: string): ObligationRow => ({
    id: `comfort-${c.kind}`, task, role: 'Vice President', due: c.state === 'out-of-season' ? seasonStartFor(today, doc.rules) : c.line, dated: c.state === 'out-of-season',
    daysLeft: undefined, critical: c.state === 'below', state: state(c), scope: 'operations', fiduciaryDuty: 'obedience', kind: 'record', legalRef, howToCount: 0, rhythm: 'ongoing', freq,
  });
  const r = doc.rules, out: ObligationRow[] = [];
  const heat = check('heat', doc.readings, r, today), water = check('hot-water', doc.readings, r, today);
  if (heat.state !== 'off') out.push(row(heat, `Keep the heat at ${r.dayMin}°F by day and ${r.nightMin}°F overnight`, `A reading every ${r.heatEvery} days, ${r.seasonStart.replace('-', '/')} to ${r.seasonEnd.replace('-', '/')}`, '14 DCMR § 501'));
  if (water.state !== 'off') out.push(row(water, `Keep hot water at ${r.hotWaterMin}°F or more`, `A reading every ${r.hotWaterEvery} days, all year`, '14 DCMR ch. 6'));
  return out;
}

/** The record, the two checks and the open complaints, recomputed as readings and requests change. */
export function useComfort(today: string) {
  const data = useActionRecordsStore(s => s.records.find(r => r.kind === COMFORT_KIND))?.data;
  const issues = useIssuesStore(s => s.issues);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => { const doc = comfortFrom(data); return { doc, heat: check('heat', doc.readings, doc.rules, today), water: check('hot-water', doc.readings, doc.rules, today), complaints: complaints() }; }, [data, issues, today]);
}
