import { describe, it, expect, beforeEach } from 'vitest';
import { assetStory, costOf, dueDatesIn, inspectionOpens, moveOutDue, onTime, yearGrid, yearSummary, conditionFrom, NEEDS_THIRD_PARTY, type Fix, type Task, type Visit } from '@/lib/upkeep';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { InspectionData } from '@/lib/actions/inspection';
import { markDone, upkeepDoc } from '@/ux2/building/maintenanceActions';
import { runRecordActions } from '@/ux2/boardroom/recordActions';
import { startConditionSurvey, startScheduledInspection, startStormCheck } from '@/ux2/boardroom/upkeep';

const task = (o: Partial<Task>): Task => ({ id: 't', task: 'Roof inspection', category: 'Roof', frequency: 'Twice a year', nextDue: '2026-09-15', notes: '', status: 'on-track', ...o });
const visit = (o: Partial<Visit>): Visit => ({ scheduleId: 't', task: 'Roof inspection', system: 'Roof', due: '2026-03-15', doneOn: '2026-03-12', by: 'Apex', cost: 600, ...o });

describe('upkeep across a year', () => {
  it('reads a cost from free text', () => {
    expect([costOf('$450'), costOf('1,200/visit'), costOf('On call'), costOf(75)]).toEqual([450, 1200, 0, 75]);
  });

  it('lists the dates a task falls due in a year', () => {
    expect(dueDatesIn(task({ nextDue: '2026-03-15', frequency: 'Quarterly' }), 2026)).toEqual(['2026-03-15', '2026-06-15', '2026-09-15', '2026-12-15']);
    expect(dueDatesIn(task({ nextDue: '2025-11-01', frequency: 'Annual' }), 2026)).toEqual(['2026-11-01']);
    expect(dueDatesIn(task({ nextDue: '2026-05-01', frequency: 'One time' }), 2026)).toEqual(['2026-05-01']);
    expect(dueDatesIn(task({ nextDue: '' }), 2026)).toEqual([]);
  });

  it('counts a task as on time up to two weeks after it was due', () => {
    expect(onTime({ due: '2026-03-15', doneOn: '2026-03-29' })).toBe(true);
    expect(onTime({ due: '2026-03-15', doneOn: '2026-03-30' })).toBe(false);
    expect(onTime({ due: '', doneOn: '2026-03-30' })).toBe(true);
  });

  it('draws each system with what was done and what is to come, and shows a system nobody is looking at', () => {
    const tasks = [task({}), task({ id: 'h', task: 'Filter change', category: 'HVAC', frequency: 'Quarterly', nextDue: '2026-05-01' }), task({ id: 'p', task: 'Backflow test', category: 'Plumbing', frequency: 'Annual', nextDue: '2027-02-01' }),
      task({ id: 'g', task: 'Gutter cleaning', category: 'Roof', frequency: 'Annual', nextDue: '2026-11-20', notes: 'Deferred from 2026-10-01 on 2026-09-28: waiting on the lift' })];
    const grid = yearGrid(tasks, [visit({}), visit({ doneOn: '2026-04-20', due: '2026-03-15', cost: 100 })], 2026, '2026-06-10');
    expect(grid.map(r => r.system)).toEqual(['HVAC', 'Plumbing', 'Roof']);
    const roof = grid[2];
    expect(roof.cost).toBe(700);
    expect(roof.marks.map(m => `${m.month}:${m.state}`)).toEqual(['2:done', '3:late', '8:to-come', '10:put-off']);
    // The May filter change is overdue on June 10; August and November are still to come.
    expect(grid[0].marks.map(m => m.state)).toEqual(['overdue', 'to-come', 'to-come']);
    // Plumbing has a task but nothing done and nothing due this year.
    expect(grid[1]).toMatchObject({ tasks: 1, marks: [] });
    const s = yearSummary(tasks, [visit({}), visit({ doneOn: '2026-04-20', cost: 100 })], [{ id: 'f', what: 'Leak', assetId: 'a', on: '2026-02-01', cost: 2100, open: false }], 2026, '2026-06-10');
    expect(s).toMatchObject({ planned: 700, fixing: 2100, plannedPct: 25, done: 2, doneOnTime: 1, asked: 3, overdue: 1, putOff: 1, unwatched: ['Plumbing'] });
    expect(s.oldestPutOff).toEqual({ task: 'Gutter cleaning', from: '2026-10-01' });
    expect(yearSummary([], [], [], 2026, '2026-06-10').plannedPct).toBeNull();
  });

  it("flags an asset whose repairs cost more than twice its upkeep", () => {
    const fixes: Fix[] = [{ id: '1', what: 'Compressor', assetId: 'hvac', on: '2025-07-01', cost: 5200, open: false }, { id: '2', what: 'Fan motor', assetId: 'hvac', on: '2026-01-10', cost: 4280, open: false }, { id: '3', what: 'Old', assetId: 'hvac', on: '2021-01-10', cost: 9999, open: false }];
    const visits = [visit({ scheduleId: 'h', cost: 1350, doneOn: '2025-05-01' }), visit({ scheduleId: 'h', cost: 1350, doneOn: '2026-05-01' }), visit({ scheduleId: 'other', cost: 5000 })];
    expect(assetStory({ id: 'hvac', scheduleIds: ['h'] }, visits, fixes, '2026-06-10')).toEqual({ visits: 2, planned: 2700, breakdowns: 2, repairs: 9480, bringForward: true });
    // One repair is an incident, not a pattern.
    expect(assetStory({ id: 'hvac', scheduleIds: ['h'] }, visits, fixes.slice(0, 1), '2026-06-10').bringForward).toBe(false);
  });

  it('knows when an inspection or a move-out walk should open', () => {
    expect(inspectionOpens({ nextDue: '2026-07-10', status: 'on-track' }, '2026-06-10')).toBe(true);
    expect(inspectionOpens({ nextDue: '2026-07-11', status: 'on-track' }, '2026-06-10')).toBe(false);
    expect(inspectionOpens({ nextDue: '2026-05-01', status: 'overdue' }, '2026-06-10')).toBe(true);
    expect(moveOutDue({ moveType: 'out', scheduledDate: '2026-06-10' }, '2026-06-10')).toBe(true);
    expect(moveOutDue({ moveType: 'out', scheduledDate: '2026-06-11' }, '2026-06-10')).toBe(false);
    expect(moveOutDue({ moveType: 'out', scheduledDate: '2026-05-01' }, '2026-06-10')).toBe(false);
    expect(moveOutDue({ moveType: 'in', scheduledDate: '2026-06-10' }, '2026-06-10')).toBe(false);
    expect([NEEDS_THIRD_PARTY.test('Backflow preventer test'), NEEDS_THIRD_PARTY.test('Roof inspection')]).toEqual([true, false]);
    expect([conditionFrom('fine'), conditionFrom('watch'), conditionFrom('work'), conditionFrom('')]).toEqual(['Good', 'Fair', 'Poor', null]);
  });
});

describe('in the app', () => {
  const records = () => useActionRecordsStore.getState().records;
  const inspections = () => records().filter(r => r.kind === 'inspection');
  const data = (id: string) => records().find(r => r.id === id)!.data as unknown as InspectionData;
  const sched = (o: object) => ({ id: 's1', task: 'Roof inspection', category: 'Roof and envelope', frequency: 'Twice a year', vendor: 'Apex Roofing', lastCompleted: '', nextDue: '2026-06-30', estimatedCost: '$600', notes: '', status: 'on-track', ...o });
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useIssuesStore.setState({ cases: [], issues: [] } as never);
    useBuildingStore.setState({ maintenanceSchedules: [], assets: [], legalDocuments: [] } as never);
    useFinancialStore.setState({ moveEvents: [], runbooksOff: [], reserveItems: [], reserveStudyDate: null } as never);
  });

  it('marking a task done keeps the visit, with what was due and what it cost, and rolls the schedule', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched({ task: 'Gutter cleaning', nextDue: '2026-06-01', frequency: 'Annual' })] } as never);
    markDone('s1', { doneOn: '2026-06-20', by: 'Apex Roofing', result: 'Cleared', cost: 450 });
    expect(upkeepDoc().visits).toEqual([{ scheduleId: 's1', task: 'Gutter cleaning', system: 'Roof and envelope', due: '2026-06-01', doneOn: '2026-06-20', by: 'Apex Roofing', cost: 450 }]);
    expect(useBuildingStore.getState().maintenanceSchedules[0].nextDue).toBe('2027-06-20');
    // No cost typed: the task's usual cost stands in.
    markDone('s1', { doneOn: '2027-06-10', by: '', result: '' });
    expect(upkeepDoc().visits[1]).toMatchObject({ cost: 600, by: 'Apex Roofing', due: '2027-06-20' });
  });

  it('opens a scheduled inspection 30 days ahead, once for each due date', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched({}), sched({ id: 's2', task: 'Elevator inspection', category: 'Elevator' }), sched({ id: 's3', task: 'Gutter cleaning' }), sched({ id: 's4', task: 'Facade inspection', nextDue: '2026-09-01' })] } as never);
    runRecordActions('2026-05-20', true);
    expect(inspections()).toHaveLength(0);
    runRecordActions('2026-06-05', true);
    runRecordActions('2026-06-06', true);
    // Only the roof: the elevator has its own runbook, gutter cleaning is not an inspection, the facade is months off.
    expect(inspections().map(r => r.title)).toEqual(['Roof inspection']);
    expect(data(inspections()[0].id)).toMatchObject({ scheduleId: 's1', dueFor: '2026-06-30', by: 'Apex Roofing', template: 'roof', thirdParty: false });
    expect(useIssuesStore.getState().cases.filter(c => /Roof inspection/.test(c.title))).toHaveLength(1);
    // Asking for it by hand finds the open one.
    expect(startScheduledInspection('s1', '2026-06-07').recordId).toBe(inspections()[0].id);
    // A facade inspection needs a certified outsider.
    const facade = startScheduledInspection('s4', '2026-06-07');
    expect(data(facade.recordId).thirdParty).toBe(true);
  });

  it('does not open inspections when the runbook is switched off', () => {
    useBuildingStore.setState({ maintenanceSchedules: [sched({})] } as never);
    useFinancialStore.setState({ runbooksOff: ['inspection'] } as never);
    runRecordActions('2026-06-05', true);
    expect(inspections()).toHaveLength(0);
  });

  it("walks the common areas when a unit's move-out day arrives", () => {
    useFinancialStore.setState({ moveEvents: [{ id: 'm1', unitNumber: '304', moveType: 'out', scheduledDate: '2026-06-05', inspectionStatus: 'pending' }, { id: 'm2', unitNumber: '101', moveType: 'in', scheduledDate: '2026-06-05', inspectionStatus: 'pending' }] } as never);
    runRecordActions('2026-06-04', true);
    expect(inspections()).toHaveLength(0);
    runRecordActions('2026-06-05', true); runRecordActions('2026-06-06', true);
    expect(inspections()).toHaveLength(1);
    expect(inspections()[0]).toMatchObject({ title: 'Unit 304 move-out', unit: '304' });
    expect(data(inspections()[0].id)).toMatchObject({ template: 'moveout', moveId: 'm1', bookedFor: '2026-06-05' });
  });

  it('a storm check starts from the short list', () => {
    const { recordId, caseId } = startStormCheck('freeze on Friday', '2026-01-05');
    expect(caseId).toBeTruthy();
    expect(records().find(r => r.id === recordId)!.title).toBe('Before the freeze on Friday');
    expect(data(recordId).points.map(p => p.label)).toContain('Exposed pipes and hose bibs protected');
  });

  it('a condition survey lists every asset once for a study, and filing it rates them', () => {
    const asset = (id: string, name: string) => ({ id, name, condition: 'Good', conditionHistory: [], maintenanceScheduleIds: [], warranties: [] });
    useBuildingStore.setState({ assets: [asset('a1', 'Boiler'), asset('a2', 'Roof'), asset('a3', 'Lobby')] } as never);
    const { recordId } = startConditionSurvey('2027-03-01', '2026-12-10');
    expect(startConditionSurvey('2027-03-01', '2026-12-11').recordId).toBe(recordId);
    expect(data(recordId).points.map(p => [p.id, p.label, p.watchedBefore])).toEqual([['asset:a1', 'Boiler', 'Rated good last time'], ['asset:a2', 'Roof', 'Rated good last time'], ['asset:a3', 'Lobby', 'Rated good last time']]);
    const points = data(recordId).points.map((p, i) => ({ ...p, result: (['watch', 'work', ''] as const)[i], note: i === 1 ? 'Membrane splitting' : '' }));
    useActionRecordsStore.getState().patchData(recordId, { points, by: 'J. Adams', bookedFor: '2026-12-15', filedOn: '2026-12-16' });
    runRecordActions('2026-12-16'); runRecordActions('2026-12-17');
    const assets = useBuildingStore.getState().assets;
    expect(assets.map(a => a.condition)).toEqual(['Fair', 'Poor', 'Good']);
    expect(assets[1].conditionHistory).toEqual([{ date: '2026-12-15', condition: 'Poor', assessedBy: 'J. Adams', notes: 'Membrane splitting' }]);
    expect(assets[0].conditionHistory).toHaveLength(1);
    expect(assets[2].conditionHistory).toHaveLength(0);
  });
});
