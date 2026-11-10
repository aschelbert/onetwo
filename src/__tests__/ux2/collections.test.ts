import { beforeEach, describe, expect, it } from 'vitest';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { collectionsSteps, openCollectionsCase, overdueInvoice, runCollections, STEP } from '@/ux2/boardroom/collections';
import type { Unit, UnitInvoice } from '@/types/financial';

const unit = (number: string, balance: number, owner = `Owner ${number}`): Unit => ({
  number, owner, email: '', phone: '', monthlyFee: 450, votingPct: 25, status: 'ACTIVE', balance, moveIn: null, sqft: 0, bedrooms: 0, parking: null,
  payments: [], lateFees: [], specialAssessments: [],
} as unknown as Unit);
const inv = (id: string, unitNumber: string, dueDate: string, over: Partial<UnitInvoice> = {}): UnitInvoice => ({
  id, unitNumber, type: 'monthly', description: 'Dues · October 2026', amount: 450, status: 'sent', createdDate: '2026-10-01', dueDate, paidDate: null, paidAmount: null, paymentMethod: null, stripePaymentLink: null, glEntryId: null, paymentGlEntryId: null, ...over,
});

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], units: [unit('1A', 900), unit('2B', 450), unit('3C', 0)], unitInvoices: [] });
  useRunbookSwitches.setState({ off: [] });
});

describe('what counts as 30 days past due', () => {
  it('is the oldest unpaid dues or assessment invoice at least 30 days past its due date; fees never start it', () => {
    const list = [inv('i1', '1A', '2026-10-15'), inv('i2', '1A', '2026-09-15', { type: 'special_assessment' }), inv('f1', '1A', '2026-08-01', { type: 'fee' }), inv('p1', '1A', '2026-08-15', { status: 'paid', paidAmount: 450 })];
    expect(overdueInvoice('1A', list, '2026-11-10')?.id).toBe('i2');
    expect(overdueInvoice('1A', list, '2026-10-10')).toBeUndefined();
    expect(overdueInvoice('1A', [inv('i3', '1A', '2026-10-11')], '2026-11-10')?.id).toBe('i3');
    expect(overdueInvoice('1A', [inv('i3', '1A', '2026-10-12')], '2026-11-10')).toBeUndefined();
    expect(overdueInvoice('1A', [inv('i4', '1A', '2026-09-01', { paidAmount: 450 })], '2026-11-10')).toBeUndefined();
  });

  it('writes five steps that name the unit, the amount and the demand deadline', () => {
    const steps = collectionsSteps('2B', 900, '2026-10-15');
    expect(steps.length).toBe(5);
    expect(steps[STEP.fee].s).toBe("Charge the late fee on Unit 2B's overdue dues");
    expect(steps[STEP.demand].s).toContain('by 2026-12-14');
    expect(steps[STEP.outcome].detail).toContain('$900');
  });
});

describe('running the runbook', () => {
  it('opens one case per unit past due, keyed by the oldest invoice, and leaves units that are current alone', () => {
    useFinancialStore.setState({ unitInvoices: [inv('i1', '1A', '2026-09-15'), inv('i2', '1A', '2026-10-15'), inv('i3', '2B', '2026-10-15'), inv('i4', '3C', '2026-10-15', { status: 'paid', paidAmount: 450 })] });
    const r = runCollections('2026-11-10');
    expect(r.opened.length).toBe(1);
    const c = useIssuesStore.getState().cases[0];
    expect(c).toMatchObject({ title: 'Collections · Unit 1A · $900 past due', unit: '1A', owner: 'Owner 1A', catId: 'financial', sitId: 'runbook-collections', source: 'runbook', sourceId: 'collections:1A:i1', assignedRole: 'Treasurer', dueDate: '2026-11-14', priority: 'medium' });
    expect(c.steps?.length).toBe(5);
    expect(runCollections('2026-11-12').opened.length).toBe(0);
    expect(useIssuesStore.getState().cases.length).toBe(1);
    // 2B crosses 30 days on Nov 14, at 90 days the case is high priority.
    expect(runCollections('2026-11-14').opened.length).toBe(1);
    expect(useIssuesStore.getState().cases.find(c => c.unit === '2B')?.priority).toBe('medium');
  });

  it('never doubles a collections case the board opened by hand, and respects the switch', () => {
    useFinancialStore.setState({ unitInvoices: [inv('i1', '1A', '2026-09-15')] });
    useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'delinquent-accounts', approach: 'pre', title: 'Unit 1A arrears', unit: '1A', owner: 'Owner 1A', priority: 'medium', notes: '' });
    expect(openCollectionsCase(useIssuesStore.getState().cases, '1A')).toBeTruthy();
    expect(runCollections('2026-11-10').opened.length).toBe(0);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('collections', false);
    expect(useFinancialStore.getState().runbooksOff).toEqual(['collections']);
    expect(runCollections('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('collections', true);
    expect(runCollections('2026-11-10').opened.length).toBe(1);
  });

  it('ticks the late fee when billing charges it and the outcome when the unit is clear', () => {
    useFinancialStore.setState({ unitInvoices: [inv('i1', '1A', '2026-09-15')] });
    const [id] = runCollections('2026-11-10').opened;
    const steps = () => useIssuesStore.getState().cases.find(c => c.id === id)!.steps!;
    expect(steps()[STEP.fee].done).toBe(false);
    useFinancialStore.setState(s => ({ unitInvoices: [...s.unitInvoices, inv('f1', '1A', '2026-11-10', { type: 'fee', forInvoiceId: 'i1', amount: 25 })] }));
    runCollections('2026-11-11');
    expect(steps()[STEP.fee].done).toBe(true);
    expect(steps()[STEP.outcome].done).toBe(false);
    useFinancialStore.setState(s => ({ units: s.units.map(u => u.number === '1A' ? { ...u, balance: 0 } : u), unitInvoices: s.unitInvoices.map(i => ({ ...i, status: 'paid' as const, paidAmount: i.amount })) }));
    runCollections('2026-11-20');
    expect(steps()[STEP.outcome].done).toBe(true);
    expect(steps()[STEP.notice].done).toBe(false);
  });

  it('shows as the Collections runbook\'s own case on the Runbooks tab', () => {
    useFinancialStore.setState({ unitInvoices: [inv('i1', '1A', '2026-09-15')] });
    const [id] = runCollections('2026-11-10').opened;
    const snap = { today: '2026-11-10', cases: useIssuesStore.getState().cases, runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'Treasurer' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['collections'].openCases.map(c => c.id)).toEqual([id]);
    expect(situationLabel(snap, useIssuesStore.getState().cases[0])).toBe('Collections');
  });
});
