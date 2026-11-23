import { describe, it, expect, beforeEach } from 'vitest';
import { stepsOf, type ActionRecord } from '@/lib/actions';
import { FIRE_NOTICE, noticeText, type FireNoticeData } from '@/lib/actions/fireNotice';
import { RECORDS_REQUEST, type RecordsRequestData } from '@/lib/actions/recordsRequest';
import { BUDGET_AMENDMENT, amended, motionText, type BudgetAmendmentData } from '@/lib/actions/budgetAmendment';
import { PAYROLL_FILING, lastFinishedQuarter, quarterOf, returnsFor, type PayrollFilingData } from '@/lib/actions/payrollFiling';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingRecordsStore } from '@/store/useBuildingRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { recordCase, runActionTriggers, runRecordActions, startAction, startPayrollFiling, startUnitFireNotice } from '@/ux2/boardroom/recordActions';

const rec = <D,>(kind: string, data: D): ActionRecord => ({ id: 'r1', kind, title: 'T', unit: '', openedOn: '2026-11-01', dueOn: '', closedOn: '', data } as unknown as ActionRecord);
const ticks = (r: ActionRecord) => stepsOf(r).map(s => (s.done ? 1 : 0)).join('');
const store = () => useActionRecordsStore.getState();
const data = <D,>(id: string) => store().records.find(r => r.id === id)!.data as unknown as D;
const caseOf = (id: string) => recordCase(useIssuesStore.getState().cases, store().records.find(r => r.id === id)!)!;

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
  useActionRecordsStore.setState({ records: [], saveError: null });
  useBuildingRecordsStore.setState({ records: [] });
  useFinancialStore.setState({ runbooksOff: [] });
});

describe('fire alarm notice', () => {
  const full: Partial<FireNoticeData> = { pullStations: 'One by each stair.', linkedToUnits: 'no', monitored: 'no' };
  it('always says to call 911 and whether the alarm calls the fire department', () => {
    const t = noticeText({ ...FIRE_NOTICE.blank(), ...full }, { name: 'Sunny Acres', address: '1 Main St' });
    expect(t[1]).toBe('In a fire, call 911 at once.');
    expect(t.join(' ')).toContain('does not call the fire department');
    expect(t.join(' ')).toContain('does not set off the building alarm');
    const monitored = noticeText({ ...FIRE_NOTICE.blank(), ...full, monitored: 'yes', linkedToUnits: 'yes' }, { name: 'S', address: 'A' }).join(' ');
    expect(monitored).toContain('alerts the Fire and EMS Department');
    expect(monitored).toContain('Call 911 anyway');
  });
  it('steps in order: answers, wording, delivery, posting', () => {
    let d = { ...FIRE_NOTICE.blank(), ...full } as FireNoticeData;
    expect(ticks(rec('fire-notice', d))).toBe('1000');
    d = { ...d, reviewedOn: '2026-11-02' };
    d = { ...d, delivered: ['101', '102'], method: 'mail' };
    expect(ticks(rec('fire-notice', d))).toBe('1100');
    d = { ...d, deliveredOn: '2026-11-03' };
    expect(ticks(rec('fire-notice', d))).toBe('1110');
  });
  it('posting fills in the building record and closes the action; a new resident then gets only the delivery', () => {
    const { recordId } = startAction('fire-notice', 'Building notice', { ...full, reviewedOn: '2026-11-02', delivered: ['101'], method: 'hand', deliveredOn: '2026-11-03', places: [{ where: 'Lobby', photos: [] }], postedOn: '2026-11-04' }, {}, '2026-11-04');
    const recs = useBuildingRecordsStore.getState().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: 'fire-alarm-notice', doneOn: '2026-11-03', posted: true });
    expect(store().records[0].closedOn).toBe('2026-11-04');
    runRecordActions('2026-11-05');
    expect(useBuildingRecordsStore.getState().records).toHaveLength(1);
    expect(caseOf(recordId).status).toBe('closed');

    const unit = startUnitFireNotice('304', '2026-12-01');
    const d = data<FireNoticeData>(unit.recordId);
    expect(d).toMatchObject({ scope: 'unit', pullStations: 'One by each stair.', reviewedOn: '2026-11-02' });
    expect(ticks(store().records.find(r => r.id === unit.recordId)!)).toBe('1100');
    store().patchData(unit.recordId, { delivered: ['304'], method: 'hand', deliveredOn: '2026-12-02' });
    runRecordActions('2026-12-02');
    expect(store().records.find(r => r.id === unit.recordId)!.closedOn).toBe('2026-12-02');
    expect(useBuildingRecordsStore.getState().records).toHaveLength(1);
  });
});

describe('records request', () => {
  it('needs a reason for anything not shared in full', () => {
    let d: RecordsRequestData = { ...RECORDS_REQUEST.blank(), requester: 'Ann', askedOn: '2026-11-18', ownerOfRecord: 'yes', items: [{ id: 'a', what: 'Ledger', share: 'redacted', reason: '' }, { id: 'b', what: 'Minutes', share: 'full', reason: '' }] };
    expect(ticks(rec('records-request', d))).toBe('1000');
    d = { ...d, items: d.items.map(i => (i.id === 'a' ? { ...i, reason: "Other owners' balances" } : i)) };
    expect(ticks(rec('records-request', d))).toBe('1100');
    expect(stepsOf(rec('records-request', d))[1].summary).toBe('2 items · 1 not shared in full');
    expect(ticks(rec('records-request', { ...d, sentOn: '2026-11-20', how: 'copies' }))).toBe('1110');
  });
});

describe('budget amendment', () => {
  const lines = [{ id: 'u', name: 'Utilities', budgeted: 60000 }, { id: 'm', name: 'Maintenance', budgeted: 44000 }, { id: 'a', name: 'Admin', budgeted: 9000 }];
  const d: BudgetAmendmentData = { ...BUDGET_AMENDMENT.blank(), lineId: 'u', lineName: 'Utilities', why: 'October water leak.', moves: [{ fromId: 'm', fromName: 'Maintenance', amount: 3000 }, { fromId: 'a', fromName: 'Admin', amount: 800 }] };
  it('moves the money and keeps the total', () => {
    const after = amended(lines, d);
    expect(after.map(l => l.budgeted)).toEqual([63800, 41000, 8200]);
    expect(after.reduce((t, l) => t + l.budgeted, 0)).toBe(113000);
    expect(motionText(d)).toBe('Resolved, that the adopted budget is amended to move $3,000 from Maintenance and $800 from Admin to Utilities, because October water leak.');
  });
  it('changes the budget once when the vote passes, and closes when owners are dealt with', () => {
    useFinancialStore.setState({ budgetCategories: lines.map(l => ({ ...l, expenses: [] })) as never });
    const { recordId } = startAction('budget-amendment', 'Utilities over', d as never, {}, '2026-11-06');
    expect(ticks(store().records[0])).toBe('1000');
    store().patchData(recordId, { vote: { on: '2026-12-09', inFavor: 4, against: 1 } });
    runRecordActions('2026-12-09'); runRecordActions('2026-12-10');
    expect(useFinancialStore.getState().budgetCategories.map(c => c.budgeted)).toEqual([63800, 41000, 8200]);
    expect(data<BudgetAmendmentData>(recordId).appliedOn).toBe('2026-12-09');
    expect(store().records[0].closedOn).toBe('');
    store().patchData(recordId, { ownersNotice: 'not-needed' });
    runRecordActions('2026-12-10');
    expect(store().records[0].closedOn).toBe('2026-12-10');
    expect(caseOf(recordId).status).toBe('closed');
  });
  it('leaves the budget alone when the vote fails', () => {
    useFinancialStore.setState({ budgetCategories: lines.map(l => ({ ...l, expenses: [] })) as never });
    const { recordId } = startAction('budget-amendment', 'Utilities over', { ...d, vote: { on: '2026-12-09', inFavor: 2, against: 3 } } as never, {}, '2026-12-09');
    expect(useFinancialStore.getState().budgetCategories.map(c => c.budgeted)).toEqual([60000, 44000, 9000]);
    expect(store().records.find(r => r.id === recordId)!.closedOn).toBe('2026-12-09');
  });
});

describe('payroll filing', () => {
  it('knows the quarter and its returns', () => {
    expect(quarterOf('2026-11-23')).toEqual({ period: '2026-Q4', start: '2026-10-01', end: '2026-12-31' });
    expect(lastFinishedQuarter('2027-01-05').period).toBe('2026-Q4');
    expect(lastFinishedQuarter('2026-11-23')).toEqual({ period: '2026-Q3', start: '2026-07-01', end: '2026-09-30' });
    const q4 = returnsFor('2026-Q4');
    expect(q4.find(r => r.id === 'dc-withholding')!.dueOn).toBe('2027-01-20');
    expect(q4.find(r => r.id === 'federal-941')!.dueOn).toBe('2027-01-31');
    expect(q4.some(r => r.id === 'w2-1099')).toBe(true);
    expect(returnsFor('2026-Q1').map(r => r.dueOn)).toEqual(['2026-04-20', '2026-04-30', '2026-04-30', '2026-04-30']);
  });
  it('is done when every return that applies is filed, paid and proved', () => {
    let d: PayrollFilingData = { ...PAYROLL_FILING.blank(), period: '2026-Q1', returns: returnsFor('2026-Q1'), wages: 100, wagesCheckedOn: '2026-04-02' };
    expect(ticks(rec('payroll-filing', d))).toBe('1000');
    d = { ...d, returns: d.returns.map((r, i) => (i === 3 ? { ...r, applies: false } : { ...r, filedOn: '2026-04-10' })) };
    expect(ticks(rec('payroll-filing', d))).toBe('1100');
    expect(ticks(rec('payroll-filing', { ...d, paidOn: '2026-04-10', proofOn: '2026-04-11' }))).toBe('1111');
  });
  it('opens once for a quarter in which employees were paid', () => {
    usePayrollStore.setState({ staff: [{ id: 's1', type: 'employee' }, { id: 's2', type: 'contractor' }] as never, payRuns: [{ id: 'p1', staffId: 's1', periodEnd: '2026-08-15', grossPay: 2400, status: 'paid' }, { id: 'p2', staffId: 's2', periodEnd: '2026-08-15', grossPay: 900, status: 'paid' }] as never });
    runActionTriggers('2026-10-05'); runActionTriggers('2026-10-06');
    expect(store().records).toHaveLength(1);
    expect(store().records[0]).toMatchObject({ kind: 'payroll-filing', dueOn: '2026-10-20' });
    expect(data<PayrollFilingData>(store().records[0].id)).toMatchObject({ period: '2026-Q3', wages: 2400 });
    expect(startPayrollFiling('2026-10-07').recordId).toBe(store().records[0].id);
    // Too long after the quarter, or with nobody paid, nothing opens.
    useActionRecordsStore.setState({ records: [] });
    runActionTriggers('2026-12-15');
    usePayrollStore.setState({ payRuns: [] });
    runActionTriggers('2026-10-05');
    expect(store().records).toHaveLength(0);
  });
});
