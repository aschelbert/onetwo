import { describe, it, expect, beforeEach } from 'vitest';
import { benchmarkCsv, missingMonths, paybackYears, spikeOf, totalsFor, usualUse, yearComplete, type UtilitiesDoc, type UtilityBill } from '@/lib/utilities';
import { stepsOf, type ActionRecord } from '@/lib/actions';
import { BENCHMARKING, type BenchmarkingData } from '@/lib/actions/benchmarking';
import type { UtilitySpikeData } from '@/lib/actions/utilitySpike';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingRecordsStore } from '@/store/useBuildingRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { enterBill, recordCase, runActionTriggers, runRecordActions, saveUtilitiesDoc, startBenchmarking, utilitiesDoc } from '@/ux2/boardroom/recordActions';

const bill = (meterId: string, month: string, use: number, cost = use / 100, estimated = false): UtilityBill => ({ id: `${meterId}${month}`, meterId, month, use, cost, estimated, enteredOn: '2026-01-01' });
const water = { id: 'w', name: 'Water, main', utility: 'water' as const, account: '' };
const store = () => useActionRecordsStore.getState();
const spikes = () => store().records.filter(r => r.kind === 'utility-spike');
const ticks = (r: ActionRecord) => stepsOf(r).map(s => (s.done ? 1 : 0)).join('');

describe('utility bills', () => {
  const bills = [bill('w', '2024-10', 170000), bill('w', '2025-10', 190000), bill('w', '2026-07', 200000), bill('w', '2026-08', 210000), bill('w', '2026-09', 190000)];
  it('compares a month with the same month in earlier years', () => {
    expect(usualUse(bills, 'w', '2026-10')).toBe(180000);
    // With no earlier year, the meter's other bills stand in once there are three.
    expect(usualUse(bills.slice(2), 'w', '2026-10')).toBe(200000);
    expect(usualUse(bills.slice(3), 'w', '2026-10')).toBeNull();
  });
  it('calls a bill a spike only when it is more than half again above usual, and never on an estimated read', () => {
    expect(spikeOf(bill('w', '2026-10', 486000, 3480), bills)).toEqual({ usual: 180000, ratio: 2.7, extraCost: 2191 });
    expect(spikeOf(bill('w', '2026-10', 270000), bills)).toBeNull();
    expect(spikeOf(bill('w', '2026-10', 486000, 3480, true), bills)).toBeNull();
  });
  it('totals a year against the same months a year before, and knows what is missing', () => {
    const doc: UtilitiesDoc = { meters: [water], bills: [bill('w', '2025-01', 100, 10), bill('w', '2025-02', 100, 10), bill('w', '2026-01', 120, 14)], projects: [] };
    expect(totalsFor(doc, 2026)).toEqual([{ utility: 'water', use: 120, cost: 14, lastYearCost: 10, rate: 14 / 120 }]);
    expect(missingMonths(doc, 'w', 2025)).toHaveLength(10);
    expect(yearComplete(doc, 2025)).toBe(false);
    expect(benchmarkCsv(doc, 2025).split('\n')).toEqual(['Meter,Type,Unit,Start date,End date,Usage,Cost,Estimated', '"Water, main",Water and sewer,gallons,2025-01-01,2025-01-31,100,10,No', '"Water, main",Water and sewer,gallons,2025-02-01,2025-02-28,100,10,No']);
  });
  it('works out payback from cost, rebate and yearly saving', () => {
    expect(paybackYears({ cost: 18400, rebate: 2200, savesPerYear: 7100 })).toBe(2.3);
    expect(paybackYears({ cost: 100, rebate: 0, savesPerYear: 0 })).toBeNull();
  });
});

describe('utility actions', () => {
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useActionRecordsStore.setState({ records: [], saveError: null });
    useBuildingRecordsStore.setState({ records: [] });
    useFinancialStore.setState({ runbooksOff: [] });
    usePayrollStore.setState({ payRuns: [] });
    saveUtilitiesDoc({ meters: [water], bills: [bill('w', '2024-10', 170000), bill('w', '2025-10', 190000)], projects: [] }, '2026-01-01');
  });

  it('a bill far above usual opens a spike action once, with the water checklist', () => {
    expect(enterBill({ meterId: 'w', month: '2026-09', use: 200000, cost: 1400, estimated: false }, '2026-10-06')).toBeNull();
    const caseId = enterBill({ meterId: 'w', month: '2026-10', use: 486000, cost: 3480, estimated: false }, '2026-11-06');
    expect(caseId).toBeTruthy();
    expect(spikes()).toHaveLength(1);
    expect(spikes()[0]).toMatchObject({ title: 'Water, main 2.7× usual in Oct 2026', dueOn: '2026-11-13' });
    const d = spikes()[0].data as unknown as UtilitySpikeData;
    expect(d).toMatchObject({ usual: 180000, extraCost: 2191, unit: 'gallons' });
    expect(d.checks[0].label).toContain('meter at night');
    // Correcting the same month does not open a second one, and replaces the bill.
    enterBill({ meterId: 'w', month: '2026-10', use: 480000, cost: 3400, estimated: false }, '2026-11-07');
    expect(spikes()).toHaveLength(1);
    expect(utilitiesDoc().bills.filter(b => b.month === '2026-10')).toHaveLength(1);
  });

  it('closes on the next bill once the cause is dealt with, and at once when the bill was wrong', () => {
    enterBill({ meterId: 'w', month: '2026-10', use: 486000, cost: 3480, estimated: false }, '2026-11-06');
    const id = spikes()[0].id;
    store().patchData(id, { billRight: 'yes', cause: 'Pool fill valve stuck', outcome: 'expected', expectedWhy: 'Fixed same day' });
    runRecordActions('2026-11-08');
    expect(ticks(spikes()[0])).toBe('1110');
    enterBill({ meterId: 'w', month: '2026-11', use: 185000, cost: 1300, estimated: false }, '2026-12-06');
    expect(spikes()[0]).toMatchObject({ closedOn: '2026-12-06' });
    expect(spikes()[0].data).toMatchObject({ nextMonth: '2026-11', nextUse: 185000 });
    expect(recordCase(useIssuesStore.getState().cases, spikes()[0])!.status).toBe('closed');

    useActionRecordsStore.setState({ records: store().records.filter(r => r.kind === 'utilities') });
    enterBill({ meterId: 'w', month: '2026-10', use: 500000, cost: 3600, estimated: false }, '2026-11-06');
    store().patchData(spikes()[0].id, { billRight: 'no', billNote: 'Estimated' });
    runRecordActions('2026-11-07');
    expect(spikes()[0].closedOn).toBe('2026-11-07');
  });

  it('benchmarking waits on twelve months of every meter, then files the Obligations record', () => {
    const { recordId } = startBenchmarking('2027-01-04', 2026);
    const rec = () => store().records.find(r => r.id === recordId)!;
    expect(rec()).toMatchObject({ dueOn: '2027-04-01', title: 'Report for 2026' });
    expect(startBenchmarking('2027-01-05', 2026).recordId).toBe(recordId);
    store().patchData(recordId, { covered: 'yes' });
    runRecordActions('2027-01-05');
    expect(rec().data).toMatchObject({ meters: 1, metersMissing: 1 });
    expect(stepsOf(rec())[1]).toMatchObject({ done: false, summary: '1 of 1 meters missing months' });
    const doc = utilitiesDoc();
    saveUtilitiesDoc({ ...doc, bills: [...doc.bills, ...Array.from({ length: 12 }, (_, i) => bill('w', `2026-${String(i + 1).padStart(2, '0')}`, 180000))] }, '2027-01-06');
    runRecordActions('2027-01-06');
    expect(ticks(rec())).toBe('11000');
    store().patchData(recordId, { sqft: 78500, occupants: 50, detailsOn: '2027-01-06', submittedOn: '2027-03-01', confirmation: 'PM-123' });
    runRecordActions('2027-03-01');
    expect(rec().closedOn).toBe('2027-03-01');
    expect(useBuildingRecordsStore.getState().records[0]).toMatchObject({ kind: 'energy-benchmarking', number: 'PM-123', doneOn: '2027-03-01' });
  });

  it('a building that is not covered closes at the first step', () => {
    const d: BenchmarkingData = { ...BENCHMARKING.blank(), year: 2026, covered: 'no', coveredNote: 'Under the threshold' };
    expect(ticks({ id: 'x', kind: 'benchmarking', title: '', unit: '', openedOn: '', dueOn: '', closedOn: '', data: d } as unknown as ActionRecord)).toBe('11111');
  });

  it('opens itself from January 1 to April 1 for a covered building, until the report is on record', () => {
    const b = useBuildingStore.getState();
    useBuildingStore.setState({ address: { ...b.address, state: 'DC' }, details: { ...b.details, sqft: '78,500 sq ft' } });
    const reports = () => store().records.filter(r => r.kind === 'benchmarking');
    runActionTriggers('2026-11-23');
    expect(reports()).toHaveLength(0);
    runActionTriggers('2027-01-02'); runActionTriggers('2027-01-03');
    expect(reports()).toHaveLength(1);
    expect(reports()[0].data).toMatchObject({ year: 2026, sqft: 78500 });
    useActionRecordsStore.setState({ records: [] });
    useBuildingStore.setState({ details: { ...b.details, sqft: '8,000 sq ft' } });
    runActionTriggers('2027-01-02');
    expect(reports()).toHaveLength(0);
    useBuildingStore.setState({ address: b.address, details: b.details });
  });
});
