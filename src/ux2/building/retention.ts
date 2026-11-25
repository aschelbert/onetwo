import { useMemo } from 'react';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { monthEnd } from '@/lib/ledger';
import { upkeepFrom } from '@/lib/upkeep';
import { missingMonths, rulesWith, standing, wageRecord, type DisposalReview, type Held, type Hold, type KindStanding, type RecordKind, type WageFacts } from '@/lib/retention';
import { readToolDoc } from '../boardroom/tools/docs';
import { todayIso } from '../runbook/adapters';

/**
 * The retention schedule a building is on, with what the app holds against
 * each kind of record. One standing record of kind 'retention' keeps the
 * periods the board changed, any holds, and each year's disposal decision.
 */
export const RETENTION_KIND = 'retention';
export interface RetentionDoc { periods: Partial<Record<RecordKind, number | null>>; holds: Hold[]; reviews: DisposalReview[] }
const BLANK: RetentionDoc = { periods: {}, holds: [], reviews: [] };
export const retentionFrom = (data: unknown): RetentionDoc => ({ ...BLANK, ...((data as Partial<RetentionDoc>) ?? {}) });
export const retentionDoc = (): RetentionDoc => retentionFrom(useActionRecordsStore.getState().doc(RETENTION_KIND)?.data);
export const saveRetention = (changes: Partial<RetentionDoc>, today: string = todayIso()) =>
  useActionRecordsStore.getState().setDoc(RETENTION_KIND, 'Records retention schedule', { ...retentionDoc(), ...changes } as unknown as Record<string, unknown>, today);

/** What the board has entered about an employee that payroll does not hold. */
export interface WageExtra { address: string; under19: boolean | null; dob: string; exempt: boolean }
export const BLANK_WAGE: WageExtra = { address: '', under19: null, dob: '', exempt: false };

/** One employee's facts for the wage record, from payroll and what the board entered. */
export function wageFacts(staffId: string): WageFacts | null {
  const p = usePayrollStore.getState();
  const s = p.staff.find(x => x.id === staffId);
  if (!s) return null;
  const extra = readToolDoc<WageExtra>('wage-facts', staffId, BLANK_WAGE);
  return {
    name: s.name, occupation: s.role, rate: s.rate, ...extra,
    paid: p.payRuns.filter(r => r.staffId === staffId && r.status === 'paid').map(r => ({ start: r.periodStart, end: r.periodEnd, gross: r.grossPay })),
    days: p.timeEntries.filter(e => e.staffId === staffId).map(e => ({ date: e.date, hours: e.hours })),
  };
}

export interface KindRow extends KindStanding { incomplete: string }

/** Every kind of record on the schedule, with what is held, what is missing and what is past its period. */
export function retentionRows(today: string = todayIso()): KindRow[] {
  const doc = retentionDoc();
  const b = useBuildingStore.getState(), fin = useFinancialStore.getState(), pay = usePayrollStore.getState();
  const records = useActionRecordsStore.getState().records;
  const first = (dates: (string | undefined)[]) => dates.filter((d): d is string => !!d).sort()[0] ?? '';
  const isTax = (name: string) => /\btax|1120|d-20|d-30|990\b/i.test(name);
  const docs = b.legalDocuments.map(d => ({ id: d.id, label: d.name, date: first(d.attachments.map(a => a.uploadedAt)) }));
  const held = useMeetingsStore.getState().meetings.filter(m => m.date && m.date <= today && !/cancel/i.test(m.status));
  const months = [...new Set(fin.generalLedger.filter(e => e.status !== 'void').map(e => e.date.slice(0, 7)))];
  const gaps = missingMonths(months, today);
  const paidBills = fin.workOrders.filter(w => w.status === 'paid');
  const noInvoice = paidBills.filter(w => !(w.attachments?.length) && !w.invoiceNum);
  const employees = pay.staff.filter(s => s.type === 'employee');
  const wageGaps = employees.map(s => ({ s, missing: wageRecord(wageFacts(s.id)!).filter(c => !c.ok) })).filter(x => x.missing.length);
  const noMinutes = held.filter(m => !m.minutes?.trim() && !m.minutesApprovedAt && !(m.items ?? []).some(i => (i as { minutes?: string }).minutes?.trim()));
  const items: Record<RecordKind, { items: Held[]; incomplete: string }> = {
    governing: { items: docs.filter(d => !isTax(d.label)), incomplete: '' },
    minutes: { items: held.map(m => ({ id: m.id, label: m.title, date: m.date })), incomplete: noMinutes.length ? `${noMinutes.length} held meeting${noMinutes.length === 1 ? '' : 's'} with no minutes` : '' },
    ledger: { items: months.map(m => ({ id: m, label: m, date: monthEnd(`${m}-01`) })), incomplete: gaps.length ? `${gaps.length} month${gaps.length === 1 ? '' : 's'} with no entries (${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''})` : '' },
    bills: { items: paidBills.map(w => ({ id: w.id, label: `${w.title} ${w.vendor}`, date: w.paidDate ?? '' })), incomplete: noInvoice.length ? `${noInvoice.length} paid bill${noInvoice.length === 1 ? '' : 's'} with no invoice on file` : '' },
    tax: { items: docs.filter(d => isTax(d.label)), incomplete: '' },
    // A contract's period runs from when it ends; the app holds no end date for a vendor, so none comes due on its own.
    contracts: { items: b.vendors.map(v => ({ id: v.id, label: `${v.name} ${v.service}`, date: '' })), incomplete: '' },
    wages: { items: pay.payRuns.filter(r => r.status === 'paid' && employees.some(s => s.id === r.staffId)).map(r => ({ id: r.id, label: `Pay period ${r.periodStart} to ${r.periodEnd}`, date: r.periodEnd })), incomplete: wageGaps.length ? `${wageGaps.length} employee${wageGaps.length === 1 ? '' : 's'} with something missing` : '' },
    upkeep: { items: [...usePropertyLogStore.getState().logs.map(l => ({ id: l.id, label: l.title, date: l.date })), ...upkeepFrom(records.find(r => r.kind === 'upkeep')?.data).visits.map((v, i) => ({ id: `v${i}`, label: v.task, date: v.doneOn }))], incomplete: '' },
    actions: { items: [...useIssuesStore.getState().cases.filter(c => c.status === 'closed').map(c => ({ id: c.id, label: c.title, date: (c.completedAt ?? '').slice(0, 10), unit: c.unit || undefined })), ...useLetterStore.getState().letters.map(l => ({ id: l.id, label: (l as { subject?: string }).subject ?? 'Letter', date: ((l as { sentDate?: string; createdAt?: string }).sentDate ?? (l as { createdAt?: string }).createdAt ?? '').slice(0, 10), unit: (l as { unitNumber?: string }).unitNumber }))], incomplete: '' },
    // Kept while the owner owns the unit; the period starts when they leave, which the app does not date.
    'unit-documents': { items: fin.unitDocuments.map(d => ({ id: d.id, label: `Unit ${d.unitNumber} ${d.filename}`, date: '', unit: d.unitNumber })), incomplete: '' },
  };
  return rulesWith(doc.periods).map(rule => ({ ...standing(rule, items[rule.kind].items, doc.holds, today), incomplete: items[rule.kind].incomplete }));
}

/** The rows, recomputed when anything they read changes. */
export function useRetention(today: string) {
  const a = useActionRecordsStore(s => s.records), b1 = useBuildingStore(s => s.legalDocuments), b2 = useBuildingStore(s => s.vendors);
  const f1 = useFinancialStore(s => s.generalLedger), f2 = useFinancialStore(s => s.workOrders), f3 = useFinancialStore(s => s.unitDocuments);
  const c = useIssuesStore(s => s.cases), l = useLetterStore(s => s.letters), m = useMeetingsStore(s => s.meetings), p1 = usePayrollStore(s => s.payRuns), p2 = usePayrollStore(s => s.timeEntries), p3 = usePayrollStore(s => s.staff), g = usePropertyLogStore(s => s.logs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ rows: retentionRows(today), doc: retentionDoc() }), [today, a, b1, b2, f1, f2, f3, c, l, m, p1, p2, p3, g]);
}
