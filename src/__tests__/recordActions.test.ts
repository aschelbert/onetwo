import { describe, it, expect, beforeEach } from 'vitest';
import { ACTION_KINDS, actionKind, stageOf, stepsOf, type ActionRecord } from '@/lib/actions';
import { BID_REQUEST, lowest, trueCost, type BidRequestData } from '@/lib/actions/bidRequest';
import { REPAIR, type RepairData } from '@/lib/actions/repair';
import { INSPECTION, pointsFor, type InspectionData } from '@/lib/actions/inspection';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { recordCase, recordIdOf, runRecordActions, startAction, startInspection, templateFor } from '@/ux2/boardroom/recordActions';
import { PANELS } from '@/ux2/boardroom/action/panels';
import { RUNBOOKS } from '@/ux2/boardroom/runbooks';
import { runbookPlan } from '@/ux2/boardroom/runbookPlans';

const rec = <D,>(kind: string, data: D, over: Partial<ActionRecord<D>> = {}): ActionRecord<D> => ({ id: 'r1', kind, title: 'T', unit: '', openedOn: '2026-11-01', dueOn: '', closedOn: '', data, ...over });
const so = (r: unknown) => stepsOf(r as ActionRecord);
const ticks = (r: unknown) => so(r).map(s => (s.done ? 1 : 0)).join('');
const bid = (id: string, vendor: string, amount: number, addBack = 0, insuranceOk = true) => ({ id, vendor, amount, addBack, insuranceOk, licenceOk: true, warranty: '', references: '' });

describe('every record-backed action', () => {
  it('has a title, a way of ticking, and a panel for each step', () => {
    for (const k of ACTION_KINDS) {
      const keys = k.stepTitles.map(([key]) => key);
      expect(new Set(keys).size, k.kind).toBe(keys.length);
      for (const key of keys) {
        expect(k.how[key], `${k.kind}.${key} how`).toBeTruthy();
        expect(PANELS[k.kind]?.[key], `${k.kind}.${key} panel`).toBeTypeOf('function');
      }
      const blank = rec(k.kind, k.blank());
      expect(so(blank).map(s => s.key)).toEqual(keys);
      // A blank record has done nothing yet.
      expect(so(blank).some(s => s.done), k.kind).toBe(false);
    }
  });
  it('is a runbook with a plan that matches its steps', () => {
    for (const k of ACTION_KINDS) {
      const def = RUNBOOKS.find(r => r.id === k.runbookId)!;
      expect(def, k.runbookId).toBeTruthy();
      expect(runbookPlan(def)).toMatchObject({ live: true });
      expect(runbookPlan(def).steps.map(s => s.title)).toEqual(k.stepTitles.map(([, t]) => t));
    }
  });
});

describe('request for proposals', () => {
  const d = (over: Partial<BidRequestData> = {}): BidRequestData => ({ ...BID_REQUEST.blank(), ...over });
  it('compares bids on what they really cost', () => {
    const bids = [bid('a', 'Green Thumb', 8400), bid('b', 'B', 7650, 900), bid('c', 'C', 7900)];
    expect(trueCost(bids[1])).toBe(8550);
    expect(lowest(bids)?.id).toBe('c');
  });
  it('moves through scope, invitations, comparison, award and contract', () => {
    let data = d();
    expect(ticks(rec('bid-request', data))).toBe('00000');
    data = d({ scope: { ...data.scope, what: 'Grounds' }, bidsDueOn: '2026-12-05' });
    expect(ticks(rec('bid-request', data))).toBe('10000');
    data = { ...data, invited: [{ vendor: 'A', sentOn: 'x' }, { vendor: 'B', sentOn: 'x' }, { vendor: 'C', sentOn: 'x' }] };
    expect(ticks(rec('bid-request', data))).toBe('11000');
    data = { ...data, bids: [bid('a', 'A', 8400), bid('b', 'B', 7650), bid('c', 'C', 7900, 0, false)] };
    expect(ticks(rec('bid-request', data))).toBe('11000');
    data = { ...data, recommendedBidId: 'c' };
    expect(ticks(rec('bid-request', data))).toBe('11100');
    data = { ...data, awardedOn: '2026-12-09' };
    const steps = so(rec('bid-request', data));
    expect(steps[3].done).toBe(true);
    // The contract waits on the winner's certificate.
    expect(steps[4]).toMatchObject({ done: false, waitsOn: "C's insurance certificate" });
  });
  it('asks for fewer bids when the board sets it so', () => {
    const data = d({ minBids: 1, invited: [{ vendor: 'A', sentOn: 'x' }], scope: { ...d().scope, what: 'x' }, bidsDueOn: '2026-12-01' });
    expect(ticks(rec('bid-request', data))).toBe('11000');
  });
});

describe('maintenance repair', () => {
  const d = (over: Partial<RepairData> = {}): RepairData => ({ ...REPAIR.blank(), ...over });
  it('holds the work on a permit and the sign-off on its final inspection', () => {
    const data = d({ what: 'Flashing lifted', permit: { answered: true, answers: ['systems'], number: '', finalInspectionOn: '' }, vendor: 'Apex', workOrderId: 'WO-1' });
    const s = so(rec('repair', data));
    expect(s.map(x => (x.done ? 1 : 0)).join('')).toBe('111000');
    expect(s[3].waitsOn).toBe('the permit being on file');
    const filed = so(rec('repair', d({ ...data, permit: { ...data.permit, number: 'B1' }, doneOn: '2026-11-20' })));
    expect(filed[3].done).toBe(true);
    expect(filed[4].waitsOn).toBe("the permit's final inspection");
  });
  it('needs no permit when every answer is no', () => {
    const s = so(rec('repair', d({ what: 'x', permit: { answered: true, answers: [], number: '', finalInspectionOn: '' }, vendor: 'V', workOrderId: 'WO-1' })));
    expect(s[1].summary).toBe('No permit needed');
    expect(s[3].waitsOn).toBe('');
  });
});

describe('inspection', () => {
  const d = (over: Partial<InspectionData> = {}): InspectionData => ({ ...INSPECTION.blank(), template: 'roof', points: pointsFor('roof'), ...over });
  it('starts from the checklist for what is being inspected', () => {
    expect(templateFor('Roof Inspection')).toBe('roof');
    expect(templateFor('Parking lot walk')).toBe('parking');
    // A test or certification gets its own short list, not a building walk-through.
    expect(templateFor('Fire Alarm System Test')).toBe('test');
    expect(templateFor('Common area check')).toBe('walkthrough');
    expect(pointsFor('roof')[0].label).toBe('Ponding water');
  });
  it('is walked only when every point has a result, and filed only when every finding is dealt with', () => {
    let data = d({ by: 'Apex', bookedFor: '2026-09-26', residentsNotAffected: true });
    expect(ticks(rec('inspection', data))).toBe('11000');
    data = { ...data, points: data.points.map((p, i) => ({ ...p, result: i === 3 ? 'work' as const : i === 1 ? 'watch' as const : 'fine' as const })) };
    const walked = so(rec('inspection', data));
    expect(walked[2]).toMatchObject({ done: true, summary: '7 of 7 points · 1 need work · 1 to watch' });
    expect(walked[3].done).toBe(false);
    expect(walked[4].waitsOn).toBe('the findings being dealt with');
    data = { ...data, points: data.points.map(p => (p.result === 'work' ? { ...p, handling: 'defer' as const, handlingNote: 'Spring budget' } : p)) };
    expect(ticks(rec('inspection', data))).toBe('11110');
    expect(stageOf(rec('inspection', data) as unknown as ActionRecord)).toBe('Step 5 of 5 · File the report');
  });
  it('has nothing to deal with when nothing needs work', () => {
    const data = d({ by: 'A', bookedFor: '2026-09-26', residentsNotAffected: true, points: pointsFor('roof').map(p => ({ ...p, result: 'fine' as const })) });
    expect(so(rec('inspection', data))[3]).toMatchObject({ done: true, summary: 'Nothing needs work' });
  });
});

describe('running record-backed actions', () => {
  const store = () => useActionRecordsStore.getState();
  beforeEach(() => {
    useIssuesStore.setState({ cases: [], nextCaseNum: 1 });
    useActionRecordsStore.setState({ records: [], saveError: null });
    useFinancialStore.setState({ runbooksOff: [], workOrders: [], generalLedger: [], closedThrough: null as never });
  });
  const caseOf = (id: string) => recordCase(useIssuesStore.getState().cases, store().records.find(r => r.id === id)!)!;

  it('starting one opens its action with the kind\'s steps, once', () => {
    const { recordId, caseId } = startAction('repair', 'Parapet flashing', { what: 'Lifted' }, {}, '2026-11-01');
    expect(caseId).toBeTruthy();
    expect(caseOf(recordId).steps!.map(s => s.s)).toEqual(REPAIR.stepTitles.map(([, t]) => t));
    expect(recordIdOf(caseOf(recordId))).toBe(recordId);
    expect(caseOf(recordId).steps![0].done).toBe(true);
    expect(runRecordActions('2026-11-01').opened).toHaveLength(0);
  });

  it('opens nothing for a kind that is switched off, and ignores standing documents', () => {
    useFinancialStore.setState({ runbooksOff: [actionKind('repair')!.runbookId] });
    store().add({ kind: 'repair', title: 'x', unit: '', openedOn: '2026-11-01', dueOn: '', closedOn: '', data: REPAIR.blank() as never });
    store().setDoc('utilities', 'Utilities', { meters: [] }, '2026-11-01');
    expect(runRecordActions('2026-11-01').opened).toHaveLength(0);
  });

  it('a repair learns its bill was paid, and its action closes with the record', () => {
    const { recordId } = startAction('repair', 'Parapet flashing', { what: 'Lifted', permit: { answered: true, answers: [], number: '', finalInspectionOn: '' } }, {}, '2026-11-01');
    useFinancialStore.setState({ workOrders: [{ id: 'WO-9', title: 'x', vendor: 'Apex', description: '', acctNum: '5010', amount: 800, status: 'paid', caseId: null, createdDate: '2026-11-02', approvedDate: null, invoiceNum: 'I', invoiceDate: '2026-11-10', paidDate: '2026-11-12', glEntryId: null, attachments: [] }] as never });
    store().patchData(recordId, { vendor: 'Apex', estimate: 800, workOrderId: 'WO-9', doneOn: '2026-11-08', signedOffOn: '2026-11-09', signedOffBy: 'Ann' });
    runRecordActions('2026-11-13');
    expect((store().records[0].data as unknown as RepairData).paidOn).toBe('2026-11-12');
    expect(caseOf(recordId).steps!.every(s => s.done)).toBe(true);
    store().patch(recordId, { closedOn: '2026-11-13' });
    runRecordActions('2026-11-13');
    expect(caseOf(recordId).status).toBe('closed');
  });

  it('carries a watched point into the next inspection of the same kind', () => {
    const first = startInspection('Roof inspection', {}, '2026-04-03');
    const pts = (store().records[0].data as unknown as InspectionData).points.map((p, i) => ({ ...p, result: i === 1 ? 'watch' as const : 'fine' as const, note: i === 1 ? 'Leaves at the NE drain' : '' }));
    store().patchData(first.recordId, { points: pts, filedOn: '2026-04-03' });
    store().patch(first.recordId, { closedOn: '2026-04-03' });
    const second = startInspection('Roof inspection', {}, '2026-09-26');
    const next = (store().records.find(r => r.id === second.recordId)!.data as unknown as InspectionData).points;
    expect(next.find(p => p.label === 'Debris at drains and scuppers')?.watchedBefore).toBe('Leaves at the NE drain');
    expect(next.filter(p => p.watchedBefore)).toHaveLength(1);
  });
});
