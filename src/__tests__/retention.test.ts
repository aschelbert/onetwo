import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_RULES, missingMonths, onHold, periodLabel, rulesWith, standing, wageRecord, wageRecordLocked, weekOf, weeks, type Hold, type WageFacts } from '@/lib/retention';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { retentionRows, saveRetention, wageFacts } from '@/ux2/building/retention';
import { saveToolDoc } from '@/ux2/boardroom/tools/docs';

const rule = (kind: string) => DEFAULT_RULES.find(r => r.kind === kind)!;
const hold = (o: Partial<Hold>): Hold => ({ id: 'h', what: '', unit: '', why: 'Dispute', placedOn: '2026-01-01', placedBy: 'Ana', releasedOn: '', ...o });

describe('the retention schedule', () => {
  it('starts from a period for each kind of record, and the board can change one down to its floor', () => {
    expect(DEFAULT_RULES.map(r => `${r.kind}:${r.years ?? 'good'}`)).toEqual(['governing:good', 'minutes:good', 'ledger:7', 'bills:7', 'tax:good', 'contracts:7', 'wages:3', 'upkeep:good', 'actions:7', 'unit-documents:3']);
    const changed = rulesWith({ actions: 10, wages: 1, ledger: null });
    expect(changed.find(r => r.kind === 'actions')!.years).toBe(10);
    // Wage records cannot go below the three years the law asks for.
    expect(changed.find(r => r.kind === 'wages')!.years).toBe(3);
    expect(changed.find(r => r.kind === 'ledger')!.years).toBeNull();
    expect([periodLabel(rule('actions')), periodLabel(rule('minutes')), periodLabel(rule('contracts'))]).toEqual(['7 years from closing', 'For good', '7 years after it ends']);
  });

  it('says what is held, the oldest, what has passed its period and when the next does', () => {
    const items = [{ id: 'a', label: 'Leak in 204', date: '2018-03-01' }, { id: 'b', label: 'Fence', date: '2019-11-25' }, { id: 'c', label: 'Lobby', date: '2022-06-01' }, { id: 'd', label: 'Undated', date: '' }];
    const s = standing(rule('actions'), items, [], '2026-11-25');
    expect(s).toMatchObject({ held: 4, oldest: '2018-03-01', nextDue: '2029-06-01' });
    expect(s.due.map(i => i.id)).toEqual(['a', 'b']);
    // The day before seven years is not yet due.
    expect(standing(rule('actions'), items, [], '2026-11-24').due.map(i => i.id)).toEqual(['a']);
    // Kept for good: nothing is ever due.
    expect(standing(rule('minutes'), items, [], '2026-11-25')).toMatchObject({ held: 4, due: [], nextDue: '' });
  });

  it('holds back anything a hold covers, by unit or by words in its name, until the hold is released', () => {
    const items = [{ id: 'a', label: 'Collections · unit 402', date: '2018-03-01', unit: '402' }, { id: 'b', label: 'Apex Roofing claim', date: '2018-05-01' }, { id: 'c', label: 'Fence', date: '2018-06-01' }];
    const holds = [hold({ unit: '402' }), hold({ id: 'h2', what: 'apex roofing' })];
    const s = standing(rule('actions'), items, holds, '2026-11-25');
    expect(s.due.map(i => i.id)).toEqual(['c']);
    expect(s.heldBack.map(i => i.id)).toEqual(['a', 'b']);
    expect(onHold(items[0], [hold({ unit: '402', releasedOn: '2026-10-01' })])).toBe(false);
    // A hold with neither a unit nor words covers nothing.
    expect(onHold(items[2], [hold({})])).toBe(false);
  });

  it('finds the months missing from a monthly record', () => {
    expect(missingMonths(['2026-01', '2026-02', '2026-05'], '2026-06-10')).toEqual(['2026-03', '2026-04', '2026-06']);
    expect(missingMonths([], '2026-06-10')).toEqual([]);
  });
});

describe('the wage record', () => {
  const facts = (o: Partial<WageFacts>): WageFacts => ({ name: 'C. Mendez', address: '12 Elm St NW', occupation: 'Porter', under19: false, dob: '', rate: 22.5, exempt: false, paid: [{ start: '2026-11-01', end: '2026-11-15', gross: 1935 }], days: [{ date: '2026-11-03', hours: 8 }], ...o });
  it('checks each thing the wage law has an employer keep', () => {
    expect(wageRecord(facts({})).every(c => c.ok)).toBe(true);
    const bare = wageRecord(facts({ address: '', under19: null, days: [], paid: [{ start: '2026-11-01', end: '2026-11-15', gross: 1935 }, { start: '2026-11-16', end: '2026-11-30', gross: 900 }] }));
    expect(bare.map(c => c.ok)).toEqual([false, false, true, true, false]);
    expect(bare[0].detail).toBe('no address');
    expect(bare[4].detail).toContain('2 paid periods with no hours recorded');
    // Under 19 needs the date of birth; a salaried, exempt employee needs no daily hours.
    expect(wageRecord(facts({ under19: true }))[1]).toMatchObject({ ok: false, detail: 'Under 19: no date of birth' });
    expect(wageRecord(facts({ under19: true, dob: '2008-04-02' }))[1].ok).toBe(true);
    expect(wageRecord(facts({ exempt: true, days: [] }))[4]).toMatchObject({ ok: true, detail: 'Not required: salaried and exempt' });
  });

  it('adds hours up by workweek, Monday first, with the hours past 40', () => {
    expect(weekOf('2026-11-22')).toBe('2026-11-16');
    expect(weekOf('2026-11-16')).toBe('2026-11-16');
    const w = weeks([{ date: '2026-11-16', hours: 8 }, { date: '2026-11-17', hours: 8 }, { date: '2026-11-18', hours: 9 }, { date: '2026-11-19', hours: 8 }, { date: '2026-11-20', hours: 8 }, { date: '2026-11-21', hours: 3 }, { date: '2026-11-09', hours: 6 }]);
    expect(w).toEqual([{ start: '2026-11-16', days: [8, 8, 9, 8, 8, 3, 0], hours: 44, over40: 4 }, { start: '2026-11-09', days: [6, 0, 0, 0, 0, 0, 0], hours: 6, over40: 0 }]);
  });

  it('locks paid hours for three years: an employee\'s, inside a paid period', () => {
    const paid = [{ start: '2026-01-01', end: '2026-01-31' }];
    expect(wageRecordLocked({ date: '2026-01-06' }, true, paid, '2026-11-25')).toBe(true);
    expect(wageRecordLocked({ date: '2026-02-06' }, true, paid, '2026-11-25')).toBe(false);
    expect(wageRecordLocked({ date: '2026-01-06' }, false, paid, '2026-11-25')).toBe(false);
    expect(wageRecordLocked({ date: '2026-01-06' }, true, paid, '2029-01-06')).toBe(false);
  });
});

describe('in the app', () => {
  const emp = { id: 'e1', name: 'Carlos Mendez', type: 'employee', role: 'Porter', rate: 20, email: '', phone: '', taxId: '', startDate: '2025-01-01', status: 'active', stripeAccountId: null, stripeOnboardingComplete: false };
  const con = { ...emp, id: 'c1', name: 'Tony Russo', type: 'contractor', role: 'Handyman' };
  const run = (o: object) => ({ id: 'pr1', staffId: 'e1', periodStart: '2026-01-01', periodEnd: '2026-01-31', hoursWorked: 8, grossPay: 160, deductions: 0, withholdingPct: 0, netPay: 160, status: 'paid', paidDate: '2026-02-01', glEntryId: null, paymentMethod: 'manual', stripeTransferId: null, withholdingGlEntryId: null, ...o });
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    usePayrollStore.setState({ staff: [emp, con], timeEntries: [{ id: 't1', staffId: 'e1', date: '2026-01-06', hours: 8, description: '' }, { id: 't2', staffId: 'e1', date: '2026-02-03', hours: 8, description: '' }, { id: 't3', staffId: 'c1', date: '2026-01-07', hours: 4, description: '' }], payRuns: [run({}), run({ id: 'pr2', staffId: 'c1' })] } as never);
  });

  it('will not delete hours that were paid, and says why; unpaid hours and a contractor\'s can go', () => {
    const del = usePayrollStore.getState().deleteTimeEntry;
    expect(del('t1')).toContain('kept for 3 years');
    expect(usePayrollStore.getState().timeEntries.map(e => e.id)).toEqual(['t1', 't2', 't3']);
    expect(del('t2')).toBe('');
    expect(del('t3')).toBe('');
    expect(usePayrollStore.getState().timeEntries.map(e => e.id)).toEqual(['t1']);
  });

  it('prices an hourly employee\'s hours past 40 in a week at time and a half, unless they are exempt', () => {
    const week = ['16', '17', '18', '19', '20'].map((d, i) => ({ id: `w${i}`, staffId: 'e1', date: `2026-11-${d}`, hours: 9, description: '' }));
    usePayrollStore.setState({ timeEntries: week, payRuns: [] } as never);
    const pr = usePayrollStore.getState().createPayRun('e1', '2026-11-16', '2026-11-30');
    // 45 hours: 40 at $20 and 5 at $30.
    expect(pr).toMatchObject({ hoursWorked: 45, grossPay: 950 });
    // A contractor is paid what was agreed, with no overtime.
    usePayrollStore.setState({ timeEntries: week.map(e => ({ ...e, staffId: 'c1' })) } as never);
    expect(usePayrollStore.getState().createPayRun('c1', '2026-11-16', '2026-11-30').grossPay).toBe(900);
    usePayrollStore.setState({ timeEntries: week } as never);
    saveToolDoc('wage-facts', 'e1', { address: '', under19: null, dob: '', exempt: false }, { exempt: true }, '2026-11-25');
    expect(usePayrollStore.getState().createPayRun('e1', '2026-11-16', '2026-11-30').grossPay).toBe(900);
  });

  it("reads an employee's facts for the record from payroll and what the board entered", () => {
    saveToolDoc<{ address: string; under19: boolean | null; dob: string; exempt: boolean }>('wage-facts', 'e1', { address: '', under19: null, dob: '', exempt: false }, { address: '12 Elm St NW', under19: false }, '2026-11-25');
    const f = wageFacts('e1')!;
    expect(f).toMatchObject({ name: 'Carlos Mendez', occupation: 'Porter', rate: 20, address: '12 Elm St NW', under19: false });
    expect(wageRecord(f).every(c => c.ok)).toBe(true);
    expect(wageFacts('nobody')).toBeNull();
  });

  it('lists every kind with what is held, what is missing and what is due, and respects a changed period and a hold', () => {
    useIssuesStore.setState({ cases: [{ id: 'k1', title: 'Leak · 402', status: 'closed', completedAt: '2018-03-01T10:00:00Z', unit: '402' }, { id: 'k2', title: 'Fence', status: 'closed', completedAt: '2018-06-01T10:00:00Z', unit: '' }, { id: 'k3', title: 'Open one', status: 'open', unit: '' }] } as never);
    useFinancialStore.setState({ workOrders: [{ id: 'WO-1', title: 'Roof', vendor: 'Apex', status: 'paid', paidDate: '2026-03-01', attachments: [], invoiceNum: null, amount: 100 }, { id: 'WO-2', title: 'Lobby', vendor: 'Pro', status: 'paid', paidDate: '2026-04-01', attachments: [], invoiceNum: 'INV-9', amount: 100 }] } as never);
    const rows = retentionRows('2026-11-25');
    const row = (k: string) => rows.find(r => r.rule.kind === k)!;
    expect(rows.map(r => r.rule.kind)).toEqual(DEFAULT_RULES.map(r => r.kind));
    expect(row('actions').due.map(i => i.id)).toEqual(['k1', 'k2']);
    expect(row('bills')).toMatchObject({ held: 2, incomplete: '1 paid bill with no invoice on file' });
    // Carlos has no address on file and was not asked about his age.
    expect(row('wages')).toMatchObject({ held: 1, incomplete: '1 employee with something missing' });
    expect(row('wages').rule.years).toBe(3);
    saveRetention({ periods: { actions: 10 }, holds: [hold({ unit: '402' })] }, '2026-11-25');
    expect(retentionRows('2026-11-25').find(r => r.rule.kind === 'actions')!.due).toEqual([]);
    saveRetention({ periods: {} }, '2026-11-25');
    const held = retentionRows('2026-11-25').find(r => r.rule.kind === 'actions')!;
    expect([held.due.map(i => i.id), held.heldBack.map(i => i.id)]).toEqual([['k2'], ['k1']]);
  });
});
