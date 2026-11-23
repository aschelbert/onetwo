/**
 * Runs the record-backed actions: every open record of a registered kind gets
 * one Board Room action carrying that kind's steps, each step ticks itself as
 * the record shows it done, and the action closes when the record does.
 *
 * App only, like the register's runbooks: there is no database twin, so an
 * action opens as its record is started.
 *
 * `SYNC` holds what a record learns from elsewhere (a work order paid in
 * Funds, twelve months of utility bills entered) and what happens to other
 * records when it closes.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { ACTION_KINDS, actionKind, actionKindByRunbook, stepsOf, type ActionRecord } from '@/lib/actions';
import { plusDays } from '@/lib/actions/types';
import type { CaseTrackerCase } from '@/types/issues';
import { pointsFor, watched, type InspectionData } from '@/lib/actions/inspection';
import { useBuildingRecordsStore } from '@/store/useBuildingRecordsStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { amended, passed, type BudgetAmendmentData } from '@/lib/actions/budgetAmendment';
import type { FireNoticeData } from '@/lib/actions/fireNotice';
import { lastFinishedQuarter, returnsFor, type PayrollFilingData } from '@/lib/actions/payrollFiling';
import { useBuildingStore } from '@/store/useBuildingStore';
import { kindsFor, parseSqft } from '@/lib/buildingRecords';
import { SPIKE_CHECKS, UTILITIES, missingMonths, monthLabel, spikeOf, utilitiesFrom, type UtilitiesDoc, type UtilityBill } from '@/lib/utilities';
import { benchmarkDue, type BenchmarkingData } from '@/lib/actions/benchmarking';
import type { UtilitySpikeData } from '@/lib/actions/utilitySpike';
import { todayIso } from '../runbook/adapters';

export const actionSourceId = (r: Pick<ActionRecord, 'kind' | 'id'>) => `${actionKind(r.kind)?.runbookId ?? r.kind}:${r.id}`;
export const recordCase = (cases: CaseTrackerCase[], r: Pick<ActionRecord, 'kind' | 'id'>) => cases.find(c => c.source === 'runbook' && c.sourceId === actionSourceId(r));

/** The record an action belongs to, when it is a record-backed one. */
export function recordIdOf(c: Pick<CaseTrackerCase, 'source' | 'sourceId'> | undefined): string | null {
  if (c?.source !== 'runbook' || !c.sourceId) return null;
  const at = c.sourceId.lastIndexOf(':');
  return at > 0 && actionKindByRunbook(c.sourceId.slice(0, at)) ? c.sourceId.slice(at + 1) : null;
}

type Sync = (r: ActionRecord, today: string) => void;
/** Per kind: bring the record up to date from the rest of the app. Registered by the kinds that need it. */
export const SYNC: Record<string, Sync> = {};

/** A record with a work order learns here that its bill was paid. */
export const syncPaidWorkOrder: Sync = (r, today) => {
  const d = r.data as { workOrderId?: string; paidOn?: string };
  if (!d.workOrderId || d.paidOn) return;
  const wo = useFinancialStore.getState().workOrders.find(w => w.id === d.workOrderId);
  if (wo?.status === 'paid') useActionRecordsStore.getState().patchData(r.id, { paidOn: wo.paidDate || today });
};
SYNC.repair = syncPaidWorkOrder;

/** A passed amendment changes the budget lines, once, and closes. A failed one closes with the budget untouched. */
SYNC['budget-amendment'] = (r, today) => {
  const d = r.data as unknown as BudgetAmendmentData;
  const store = useActionRecordsStore.getState();
  if (r.closedOn || d.leaveOver || !d.vote.on) return;
  if (passed(d) && !d.appliedOn) {
    const fin = useFinancialStore.getState();
    const after = amended(fin.budgetCategories, d);
    after.forEach((l, i) => { if (l.budgeted !== fin.budgetCategories[i].budgeted) fin.updateBudgetCategory(l.id, { budgeted: l.budgeted }); });
    store.patchData(r.id, { appliedOn: today });
  }
  if (!passed(d) || d.ownersNotice) store.patch(r.id, { closedOn: today });
};

/** A posted building-wide notice fills in the "fire alarm instructions" record under Building › Obligations. */
SYNC['fire-notice'] = (r, today) => {
  const d = r.data as unknown as FireNoticeData;
  if (r.closedOn) return;
  if (d.scope === 'unit') { if (d.deliveredOn) useActionRecordsStore.getState().patch(r.id, { closedOn: today }); return; }
  if (!d.postedOn) return;
  useBuildingRecordsStore.getState().addRecord({
    kind: 'fire-alarm-notice', name: '', number: '', doneOn: d.deliveredOn || d.postedOn, expiresOn: '', posted: true,
    notes: `Given to ${d.delivered.length} units ${d.method === 'mail' ? 'by first-class mail' : 'by hand'}; posted ${d.postedOn} at ${d.places.map(p => p.where).join(', ') || 'the common areas'}. From the fire alarm notice action.`,
  });
  useActionRecordsStore.getState().patch(r.id, { closedOn: today });
};

/** The building's meters and bills. */
export const utilitiesDoc = (): UtilitiesDoc => utilitiesFrom(useActionRecordsStore.getState().doc('utilities')?.data);
const saveUtilities = (doc: UtilitiesDoc, today: string) => useActionRecordsStore.getState().setDoc('utilities', 'Utility meters and bills', doc as unknown as Record<string, unknown>, today);
export const saveUtilitiesDoc = saveUtilities;

/**
 * Enter a utility bill (or correct the one already entered for that meter and
 * month). A bill far above the meter's usual opens a utility spike action the
 * same day. Returns the action's case id when one opened.
 */
export function enterBill(bill: Omit<UtilityBill, 'id' | 'enteredOn'>, today: string = todayIso()): string | null {
  const doc = utilitiesDoc();
  const entry: UtilityBill = { ...bill, id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, enteredOn: today };
  const bills = [...doc.bills.filter(b => !(b.meterId === bill.meterId && b.month === bill.month)), entry];
  saveUtilities({ ...doc, bills }, today);
  const spike = spikeOf(entry, bills), meter = doc.meters.find(m => m.id === bill.meterId);
  const already = useActionRecordsStore.getState().records.some(r => r.kind === 'utility-spike' && (r.data as unknown as UtilitySpikeData).meterId === bill.meterId && (r.data as unknown as UtilitySpikeData).month === bill.month);
  if (!spike || !meter || already || useFinancialStore.getState().runbooksOff.includes('utility-spike')) { runRecordActions(today); return null; }
  const data: Partial<UtilitySpikeData> = { meterId: meter.id, meterName: meter.name, utility: meter.utility, unit: UTILITIES[meter.utility].unit, month: bill.month, use: bill.use, usual: spike.usual, cost: bill.cost, extraCost: spike.extraCost, checks: SPIKE_CHECKS[meter.utility].map(label => ({ label, note: '', done: false })) };
  return startAction('utility-spike', `${meter.name} ${spike.ratio}× usual in ${monthLabel(bill.month)}`, data as Record<string, unknown>, { dueOn: plusDays(today, 7) }, today).caseId;
}

/** A spike learns of the meter's next bill, and closes on it; a wrong bill closes at once. */
SYNC['utility-spike'] = (r, today) => {
  const d = r.data as unknown as UtilitySpikeData;
  const store = useActionRecordsStore.getState();
  if (r.closedOn) return;
  if (d.billRight === 'no') { store.patch(r.id, { closedOn: today }); return; }
  if (!d.outcome) return;
  const next = utilitiesDoc().bills.filter(b => b.meterId === d.meterId && b.month > d.month).sort((a, b) => a.month.localeCompare(b.month))[0];
  if (next && !d.nextMonth) { store.patchData(r.id, { nextMonth: next.month, nextUse: next.use }); store.patch(r.id, { closedOn: today }); }
};

/** Benchmarking keeps count of the meters still missing months, files the Obligations record on confirmation, and closes. */
SYNC.benchmarking = (r, today) => {
  const d = r.data as unknown as BenchmarkingData;
  const store = useActionRecordsStore.getState();
  if (r.closedOn) return;
  if (d.covered === 'no') { store.patch(r.id, { closedOn: today }); return; }
  const doc = utilitiesDoc();
  const missing = doc.meters.filter(m => missingMonths(doc, m.id, d.year).length > 0).length;
  if (d.meters !== doc.meters.length || d.metersMissing !== missing) store.patchData(r.id, { meters: doc.meters.length, metersMissing: missing });
  if (d.submittedOn && d.confirmation.trim()) {
    useBuildingRecordsStore.getState().addRecord({ kind: 'energy-benchmarking', name: '', number: d.confirmation.trim(), doneOn: d.submittedOn, expiresOn: '', posted: false, notes: `Report for ${d.year}. From the energy benchmarking action.` });
    store.patch(r.id, { closedOn: today });
  }
};

/** Start the benchmarking report for a year (last year by default), unless it already has one. */
export function startBenchmarking(today: string = todayIso(), year = Number(today.slice(0, 4)) - 1) {
  const existing = useActionRecordsStore.getState().records.find(r => r.kind === 'benchmarking' && (r.data as unknown as BenchmarkingData).year === year);
  if (existing) return { recordId: existing.id, caseId: recordCase(useIssuesStore.getState().cases, existing)?.id ?? null };
  const b = useBuildingStore.getState();
  const data: Partial<BenchmarkingData> = { year, sqft: parseSqft(b.details?.sqft) ?? 0, occupants: 0 };
  return startAction('benchmarking', `Report for ${year}`, data as Record<string, unknown>, { dueOn: benchmarkDue(year) }, today);
}

/** Whether the benchmarking rule applies to this building: 'yes', 'check' or 'no'. */
export function benchmarkingApplies(): 'yes' | 'check' | 'no' {
  const b = useBuildingStore.getState();
  const found = kindsFor({ state: b.address?.state ?? '', grossSqft: parseSqft(b.details?.sqft), hasElevator: false, hasBoiler: false }).find(k => k.kind.id === 'energy-benchmarking');
  return found ? found.applies : 'no';
}

/** Wages paid in a period, from the pay runs. */
export function wagesIn(start: string, end: string): number {
  const staff = new Map(usePayrollStore.getState().staff.map(s => [s.id, s.type]));
  return Math.round(usePayrollStore.getState().payRuns.filter(p => p.status === 'paid' && staff.get(p.staffId) === 'employee' && p.periodEnd >= start && p.periodEnd <= end).reduce((t, p) => t + p.grossPay, 0) * 100) / 100;
}

/** Start the payroll filing for a quarter (the last finished one by default), unless it already has one. */
export function startPayrollFiling(today: string = todayIso(), quarter = lastFinishedQuarter(today)) {
  const existing = useActionRecordsStore.getState().records.find(r => r.kind === 'payroll-filing' && (r.data as unknown as PayrollFilingData).period === quarter.period);
  if (existing) return { recordId: existing.id, caseId: recordCase(useIssuesStore.getState().cases, existing)?.id ?? null };
  const returns = returnsFor(quarter.period);
  const data: Partial<PayrollFilingData> = { period: quarter.period, periodStart: quarter.start, periodEnd: quarter.end, wages: wagesIn(quarter.start, quarter.end), returns };
  return startAction('payroll-filing', `${quarter.period.replace('-Q', ', quarter ')}`, data as Record<string, unknown>, { dueOn: returns.map(x => x.dueOn).sort()[0] }, today);
}

/** The building-wide fire alarm notice last finished, whose answers a single unit's copy reuses. */
export const lastFireNotice = () => useActionRecordsStore.getState().records
  .filter(r => r.kind === 'fire-notice' && !!r.closedOn && (r.data as unknown as FireNoticeData).scope === 'all')
  .sort((a, b) => b.closedOn.localeCompare(a.closedOn))[0];

/** Give the notice to one unit's new owner or tenant, with the wording already settled. */
export function startUnitFireNotice(unit: string, today: string = todayIso()) {
  const last = lastFireNotice();
  if (!last) return startAction('fire-notice', `Unit ${unit}`, { scope: 'unit' }, { unit }, today);
  const d = last.data as unknown as FireNoticeData;
  return startAction('fire-notice', `Unit ${unit}, new resident`, { scope: 'unit', pullStations: d.pullStations, linkedToUnits: d.linkedToUnits, monitored: d.monitored, evacuation: d.evacuation, contact: d.contact, extra: d.extra, reviewedOn: d.reviewedOn, reviewedBy: d.reviewedBy }, { unit }, today);
}

/** Start a record-backed action: adds the record, opens its action, and returns the action's case id. */
export function startAction(kind: string, title: string, data: Record<string, unknown> = {}, extra: { unit?: string; dueOn?: string } = {}, today: string = todayIso()): { recordId: string; caseId: string | null } {
  const def = actionKind(kind);
  if (!def) return { recordId: '', caseId: null };
  const recordId = useActionRecordsStore.getState().add({ kind, title, unit: extra.unit ?? '', openedOn: today, dueOn: extra.dueOn ?? '', closedOn: '', data: { ...def.blank(), ...data } });
  runRecordActions(today);
  const r = useActionRecordsStore.getState().records.find(x => x.id === recordId);
  return { recordId, caseId: r ? recordCase(useIssuesStore.getState().cases, r)?.id ?? null : null };
}

/** The checklist an inspection starts from, judged from what the scheduled task is called. */
export function templateFor(task: string): string {
  if (/roof/i.test(task)) return 'roof';
  if (/park|garage|lot/i.test(task)) return 'parking';
  if (/entrance|lobby|entry/i.test(task)) return 'entrance';
  if (/facade|exterior|envelope|masonry/i.test(task)) return 'facade';
  if (/move/i.test(task)) return 'moveout';
  return 'walkthrough';
}

/** Start an inspection, carrying forward the points the last one of its kind marked to watch. */
export function startInspection(title: string, opts: { scheduleId?: string; by?: string; template?: string } = {}, today: string = todayIso()) {
  const template = opts.template ?? templateFor(title);
  const last = useActionRecordsStore.getState().records
    .filter(r => r.kind === 'inspection' && !!r.closedOn && (r.data as unknown as InspectionData).template === template)
    .sort((a, b) => b.closedOn.localeCompare(a.closedOn))[0];
  const watchedLast = new Map(last ? watched(last.data as unknown as InspectionData).map(p => [p.label, p.note || 'no note']) : []);
  const points = pointsFor(template).map(p => (watchedLast.has(p.label) ? { ...p, watchedBefore: watchedLast.get(p.label) } : p));
  // Points added by hand last time and still being watched come along too.
  for (const [label, note] of watchedLast) if (!points.some(p => p.label === label)) points.push({ id: `w${points.length}`, label, result: '', note: '', photos: [], handling: '', handlingNote: '', watchedBefore: note });
  return startAction('inspection', title, { template, scheduleId: opts.scheduleId ?? '', by: opts.by ?? '', points }, {}, today);
}

/** Actions that open on the calendar: the payroll filing, in the two months after a quarter in which employees were paid. */
export function runActionTriggers(today: string = todayIso()): void {
  const off = useFinancialStore.getState().runbooksOff;
  if (!off.includes('payroll-filing')) {
    const q = lastFinishedQuarter(today);
    const sinceEnd = Math.round((Date.parse(today) - Date.parse(q.end)) / 86400000);
    if (sinceEnd <= 60 && wagesIn(q.start, q.end) > 0) startPayrollFiling(today, q);
  }
  // Energy benchmarking: from January 1 to the April 1 deadline, for a building the rule covers, until last year's report is on record.
  if (!off.includes('energy-benchmarking') && today.slice(5) <= '04-01' && benchmarkingApplies() === 'yes') {
    const year = Number(today.slice(0, 4)) - 1;
    const onFile = useBuildingRecordsStore.getState().records.some(x => x.kind === 'energy-benchmarking' && x.doneOn >= `${year + 1}-01-01`);
    if (!onFile) startBenchmarking(today, year);
  }
}

export interface RecordActionsRun { opened: string[] }

export function runRecordActions(today: string = todayIso(), triggers = false): RecordActionsRun {
  if (triggers) runActionTriggers(today);
  const off = useFinancialStore.getState().runbooksOff;
  const out: RecordActionsRun = { opened: [] };
  const kinds = new Set(ACTION_KINDS.map(k => k.kind));
  for (const r0 of useActionRecordsStore.getState().records) {
    if (!kinds.has(r0.kind)) continue;
    const def = actionKind(r0.kind)!;
    let c = recordCase(useIssuesStore.getState().cases, r0);
    if (!c && !r0.closedOn && !off.includes(def.runbookId)) {
      const id = useIssuesStore.getState().createCase({
        catId: def.catId, sitId: `runbook-${def.runbookId}`, approach: 'pre',
        title: `${def.name} · ${r0.title}`, unit: r0.unit, owner: '', priority: 'medium', assignedRole: def.role,
        notes: `Opened by the ${def.name} runbook on ${today}.`, dueDate: r0.dueOn || undefined,
        source: 'runbook', sourceId: actionSourceId(r0),
        customSteps: def.stepTitles.map(([key, title]) => ({ s: title, detail: `${def.how[key]}.` })),
      });
      out.opened.push(id);
      c = useIssuesStore.getState().cases.find(x => x.id === id);
    }
    if (!c || c.status === 'closed' || !c.steps) continue;
    SYNC[r0.kind]?.(r0, today);
    const r = useActionRecordsStore.getState().records.find(x => x.id === r0.id) ?? r0;
    stepsOf(r).forEach((s, i) => { if (s.done && c!.steps![i] && !c!.steps![i].done) useIssuesStore.getState().completeStep(c!.id, i); });
    if (r.closedOn) useIssuesStore.getState().closeCaseWithReason(c.id, 'Finished', `${def.name} · ${r.title} closed ${r.closedOn}.`);
  }
  return out;
}
