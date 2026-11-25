import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_RULES, answered, check, complaintKind, heatMinAt, inSeason, judge, seasonStartFor, type Reading } from '@/lib/comfort';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { addReading, comfortDoc, comfortObligations, complaints, saveRules } from '@/ux2/building/comfort';

const R = DEFAULT_RULES;
const rd = (o: Partial<Reading>): Reading => ({ id: 'r', kind: 'heat', on: '2026-11-20', at: '07:00', where: 'Hallway', temp: 70, by: 'D. Carter', unit: '', note: '', ...o });

describe('heat and hot water rules', () => {
  it("starts from the District's figures", () => {
    expect(R).toMatchObject({ seasonStart: '10-01', seasonEnd: '05-01', dayMin: 68, nightMin: 65, dayFrom: '06:30', dayTo: '23:00', hotWaterMin: 120 });
  });

  it('knows the heating season, which runs across the new year', () => {
    expect([inSeason('2026-10-01', R), inSeason('2026-12-25', R), inSeason('2027-04-30', R), inSeason('2027-05-01', R), inSeason('2026-09-30', R), inSeason('2026-07-04', R)]).toEqual([true, true, true, false, false, false]);
    expect([seasonStartFor('2026-11-20', R), seasonStartFor('2027-02-01', R), seasonStartFor('2026-07-04', R), seasonStartFor('2026-05-01', R)]).toEqual(['2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01']);
  });

  it('asks for the daytime figure by day and the overnight one at night', () => {
    expect([heatMinAt('06:29', R), heatMinAt('06:30', R), heatMinAt('22:59', R), heatMinAt('23:00', R), heatMinAt('02:00', R), heatMinAt('', R)]).toEqual([65, 68, 68, 65, 65, 68]);
    expect(judge(rd({ temp: 66, at: '07:00' }), R)).toEqual({ min: 68, ok: false, short: 2 });
    expect(judge(rd({ temp: 66, at: '02:00' }), R)).toEqual({ min: 65, ok: true, short: 0 });
    expect(judge(rd({ kind: 'hot-water', temp: 118 }), R)).toEqual({ min: 120, ok: false, short: 2 });
    // A building that confirms the lower figure applies can set it.
    expect(judge(rd({ kind: 'hot-water', temp: 118 }), { ...R, hotWaterMin: 110 }).ok).toBe(true);
  });

  it('says where the heat check stands: holding, due, overdue, below, or out of season', () => {
    expect(check('heat', [], R, '2026-11-25')).toMatchObject({ state: 'overdue', line: 'No reading yet this season' });
    expect(check('heat', [rd({ on: '2026-11-20' })], R, '2026-11-25')).toMatchObject({ state: 'fine', due: '2026-11-27' });
    expect(check('heat', [rd({ on: '2026-11-18' })], R, '2026-11-25').state).toBe('due');
    expect(check('heat', [rd({ on: '2026-11-01' })], R, '2026-11-25').state).toBe('overdue');
    // Last season's reading does not count for this one.
    expect(check('heat', [rd({ on: '2026-03-01' })], R, '2026-11-25').state).toBe('overdue');
    expect(check('heat', [rd({ on: '2026-11-24', temp: 64 })], R, '2026-11-25')).toMatchObject({ state: 'below', line: '64°F on 2026-11-24, 4° under the 68°F asked for' });
    // A later reading that meets it clears it.
    expect(check('heat', [rd({ on: '2026-11-24', temp: 64 }), rd({ id: 'r2', on: '2026-11-25', temp: 69 })], R, '2026-11-25').state).toBe('fine');
    expect(check('heat', [rd({})], R, '2026-07-04')).toMatchObject({ state: 'out-of-season', due: '2026-10-01' });
    expect(check('heat', [], { ...R, heat: false }, '2026-11-25').state).toBe('off');
  });

  it('checks hot water all year', () => {
    expect(check('hot-water', [], R, '2026-07-04').state).toBe('overdue');
    expect(check('hot-water', [rd({ kind: 'hot-water', on: '2026-06-20', temp: 121 })], R, '2026-07-04')).toMatchObject({ state: 'fine', due: '2026-07-20' });
    expect(check('hot-water', [rd({ kind: 'hot-water', on: '2026-06-20', temp: 105 })], R, '2026-07-04').state).toBe('below');
  });

  it("reads a resident's request for what it is about, and answers it with a reading for their unit", () => {
    expect([complaintKind('No heat in the bedroom'), complaintKind('Radiator is not working'), complaintKind('bedroom cold overnight'), complaintKind('No hot water since Monday'), complaintKind('Water is lukewarm'), complaintKind('Noise from upstairs'), complaintKind('Heated argument in the lobby')]).toEqual(['heat', 'heat', 'heat', 'hot-water', 'hot-water', null, null]);
    const c = { id: 'i1', unit: '207', on: '2026-11-18', what: 'bedroom cold overnight', kind: 'heat' as const };
    const readings = [rd({ id: 'a', unit: '207', on: '2026-11-18', temp: 64 }), rd({ id: 'b', unit: '207', on: '2026-11-19', temp: 69 }), rd({ id: 'c', unit: '301', on: '2026-11-19', temp: 72 }), rd({ id: 'd', unit: '207', on: '2026-11-10', temp: 71 })];
    const a = answered(c, readings, R);
    expect(a.readings.map(x => x.id)).toEqual(['a', 'b']);
    expect(a.met?.id).toBe('b');
    expect(answered(c, readings.slice(0, 1), R).met).toBeUndefined();
  });
});

describe('in the app', () => {
  const repairs = () => useActionRecordsStore.getState().records.filter(r => r.kind === 'repair');
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useIssuesStore.setState({ cases: [], issues: [] } as never);
    useFinancialStore.setState({ runbooksOff: [] } as never);
  });

  it('keeps each reading, and opens one repair for a reading under the minimum', () => {
    const fine = addReading({ kind: 'heat', on: '2026-11-20', at: '07:00', where: 'Hallway', temp: 70, by: 'D. Carter', unit: '', note: '' }, '2026-11-20');
    expect(fine.reading.repairId).toBeUndefined();
    expect(repairs()).toHaveLength(0);
    const low = addReading({ kind: 'hot-water', on: '2026-11-21', at: '09:00', where: 'Farthest tap, unit 502', temp: 104, by: 'D. Carter', unit: '502', note: '' }, '2026-11-21');
    expect(low.repairCaseId).toBeTruthy();
    expect(repairs()).toHaveLength(1);
    expect(repairs()[0]).toMatchObject({ title: 'Hot water under the minimum · unit 502', unit: '502' });
    expect((repairs()[0].data as { what: string }).what).toBe('Hot water is under the minimum: 104°F, and 120°F is asked for');
    // A second low reading while that repair is open joins it.
    const again = addReading({ kind: 'hot-water', on: '2026-11-22', at: '09:00', where: 'Farthest tap', temp: 106, by: 'D. Carter', unit: '', note: '' }, '2026-11-22');
    expect(again.repairCaseId).toBeNull();
    expect(again.reading.repairId).toBe(low.reading.repairId);
    expect(repairs()).toHaveLength(1);
    expect(comfortDoc().readings.map(x => x.temp)).toEqual([106, 104, 70]);
  });

  it('lets the board set the figures, and judges against them', () => {
    saveRules({ hotWaterMin: 110 }, '2026-11-20');
    const r = addReading({ kind: 'hot-water', on: '2026-11-21', at: '09:00', where: 'Tap', temp: 115, by: 'x', unit: '', note: '' }, '2026-11-21');
    expect(r.reading.repairId).toBeUndefined();
    expect(comfortDoc().rules).toMatchObject({ hotWaterMin: 110, dayMin: 68 });
  });

  it('lists the two checks as ongoing obligations, and drops one the building does not supply', () => {
    const rows = comfortObligations(comfortDoc(), '2026-11-25');
    expect(rows.map(r => [r.id, r.rhythm, r.role, r.state])).toEqual([['comfort-heat', 'ongoing', 'Vice President', 'overdue'], ['comfort-hot-water', 'ongoing', 'Vice President', 'overdue']]);
    expect(rows[0].task).toBe('Keep the heat at 68°F by day and 65°F overnight');
    addReading({ kind: 'heat', on: '2026-11-24', at: '07:00', where: 'Hallway', temp: 70, by: 'x', unit: '', note: '' }, '2026-11-24');
    expect(comfortObligations(comfortDoc(), '2026-11-25')[0].state).toBe('ongoing');
    // Out of season the heat check has a date: the day the season starts.
    expect(comfortObligations(comfortDoc(), '2026-07-04')[0]).toMatchObject({ state: 'upcoming', due: '2026-10-01', dated: true });
    saveRules({ heat: false }, '2026-11-25');
    expect(comfortObligations(comfortDoc(), '2026-11-25').map(r => r.id)).toEqual(['comfort-hot-water']);
  });

  it("finds residents' open requests about heat or hot water", () => {
    useIssuesStore.setState({ issues: [
      { id: 'i1', title: 'Bedroom cold overnight', description: '', category: 'maintenance', status: 'SUBMITTED', unitNumber: '207', submittedDate: '2026-11-18T08:00:00Z' },
      { id: 'i2', title: 'No hot water', description: 'since Monday', category: 'maintenance', status: 'RESOLVED', unitNumber: '301', submittedDate: '2026-11-10T08:00:00Z' },
      { id: 'i3', title: 'Loud music', description: '', category: 'noise', status: 'SUBMITTED', unitNumber: '402', submittedDate: '2026-11-19T08:00:00Z' },
    ] } as never);
    expect(complaints()).toEqual([{ id: 'i1', unit: '207', on: '2026-11-18', what: 'Bedroom cold overnight', kind: 'heat' }]);
  });
});
