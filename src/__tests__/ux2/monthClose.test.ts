import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { monthEnd } from '@/lib/ledger';
import { useAuthStore } from '@/store/useAuthStore';
import { useMonthClose } from '@/ux2/boardroom/useMonthClose';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel } from '@/ux2/boardroom/metrics';
import type { BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import {
  markMonthClosePacketSent, monthCloseCase, monthCloseDue, monthClosePeriod, monthCloseSteps, monthCloseTrigger,
  monthCloseTriggerDate, nextMonthCloseStart, runMonthClose, STEP,
} from '@/ux2/boardroom/monthClose';
import type { UnitInvoice } from '@/types/financial';

const duesInvoice = (unitNumber: string, period: string): UnitInvoice => ({
  id: `inv-${unitNumber}-${period}`, unitNumber, type: 'monthly', amount: 450, description: `Dues · ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`,
  status: 'open', createdDate: `${period}-01`, dueDate: `${period}-15`,
} as unknown as UnitInvoice);

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, monthCloseStartDay: 1, monthCloseEnabled: true, closedThrough: null, unitInvoices: [] });
  useRunbookSwitches.setState({ off: [] });
});

describe('the month close calendar', () => {
  it('closes the month just ended once the start day arrives, and the one before until then', () => {
    expect(monthClosePeriod('2026-11-10', 1)).toBe('2026-10');
    expect(monthClosePeriod('2026-11-01', 1)).toBe('2026-10');
    expect(monthClosePeriod('2026-11-10', 15)).toBe('2026-09');
    expect(monthClosePeriod('2026-11-15', 15)).toBe('2026-10');
    expect(monthClosePeriod('2026-01-03', 5)).toBe('2025-11');
  });

  it('starts on the building\'s day of the following month, with the packet owed two weeks later', () => {
    expect(monthCloseTriggerDate('2026-10', 1)).toBe('2026-11-01');
    expect(monthCloseTriggerDate('2026-12', 10)).toBe('2027-01-10');
    expect(monthCloseDue('2026-10', 1)).toBe('2026-11-15');
    expect(monthCloseDue('2026-10', 10)).toBe('2026-11-24');
    expect(nextMonthCloseStart('2026-11-10', 1)).toBe('2026-12-01');
    expect(nextMonthCloseStart('2026-11-10', 10)).toBe('2026-11-10');
    expect(nextMonthCloseStart('2026-11-10', 15)).toBe('2026-11-15');
    expect(monthCloseTrigger(1)).toBe('The 1st of each month');
    expect(monthCloseTrigger(22)).toBe('The 22nd of each month');
    expect(monthCloseTrigger(99)).toBe('The 28th of each month');
  });

  it('writes five steps that name the month, its last day and the packet deadline', () => {
    const steps = monthCloseSteps('2026-10', 1);
    expect(steps.length).toBe(5);
    expect(steps[STEP.posted].s).toBe('Post October 2026 dues, late fees and the reserve transfer');
    expect(steps[STEP.closed].s).toBe('Close the books through 2026-10-31');
    expect(steps[STEP.sent].s).toBe('Send the October 2026 packet to owners by 2026-11-15');
    expect(steps[STEP.reconciled].ck?.length).toBe(3);
  });
});

describe('running the runbook', () => {
  it('opens one case for the month due, assigned to the treasurer, and never a second one', () => {
    const first = runMonthClose('2026-11-10');
    expect(first).toMatchObject({ period: '2026-10', opened: true });
    const c = monthCloseCase(useIssuesStore.getState().cases, '2026-10')!;
    expect(c).toMatchObject({ title: 'Month close · October 2026', catId: 'financial', sitId: 'runbook-month-close', source: 'runbook', sourceId: 'month-close:2026-10', assignedRole: 'Treasurer', dueDate: '2026-11-15', status: 'open' });
    expect(c.steps?.length).toBe(5);
    expect(c.steps?.every(s => !s.done)).toBe(true);
    const again = runMonthClose('2026-11-20');
    expect(again).toMatchObject({ period: '2026-10', caseId: c.id, opened: false });
    expect(useIssuesStore.getState().cases.length).toBe(1);
  });

  it('follows the building\'s start day', () => {
    useFinancialStore.setState({ monthCloseStartDay: 15 });
    expect(runMonthClose('2026-11-10').period).toBe('2026-09');
    expect(runMonthClose('2026-11-15').period).toBe('2026-10');
    expect(useIssuesStore.getState().cases.map(c => c.sourceId).sort()).toEqual(['month-close:2026-09', 'month-close:2026-10']);
  });

  it('does nothing when the runbook is off or the month is already closed', () => {
    useRunbookSwitches.getState().setOn('month-close', false);
    expect(useFinancialStore.getState().monthCloseEnabled).toBe(false);
    expect(runMonthClose('2026-11-10')).toMatchObject({ caseId: null, opened: false });
    useRunbookSwitches.getState().setOn('month-close', true);
    expect(useFinancialStore.getState().monthCloseEnabled).toBe(true);
    useFinancialStore.setState({ closedThrough: '2026-10-31' });
    expect(runMonthClose('2026-11-10')).toMatchObject({ caseId: null, opened: false });
    expect(useIssuesStore.getState().cases.length).toBe(0);
  });

  it('ticks the steps the app can see: dues posted, books closed, packet sent', () => {
    useFinancialStore.setState({ unitInvoices: [duesInvoice('1A', '2026-10')] });
    const { caseId } = runMonthClose('2026-11-10');
    const steps = () => useIssuesStore.getState().cases.find(c => c.id === caseId)!.steps!;
    expect(steps()[STEP.posted].done).toBe(true);
    expect(steps()[STEP.closed].done).toBe(false);
    useFinancialStore.setState({ closedThrough: '2026-10-31' });
    runMonthClose('2026-11-12');
    expect(steps()[STEP.closed].done).toBe(true);
    markMonthClosePacketSent('2026-10');
    expect(steps()[STEP.sent].done).toBe(true);
    expect(steps()[STEP.reconciled].done).toBe(false);
    const trail = useIssuesStore.getState().cases.find(c => c.id === caseId)!.decisionTrail!;
    expect(trail.filter(t => t.type === 'step_completed' && t.actor === 'App').length).toBe(3);
    markMonthClosePacketSent('2026-10');
    expect(useIssuesStore.getState().cases.find(c => c.id === caseId)!.decisionTrail!.length).toBe(trail.length);
  });

  it('shows up on the Runbooks tab as the Month close runbook\'s own case, not another runbook\'s', () => {
    const { caseId } = runMonthClose('2026-11-10');
    const snap = { today: '2026-11-10', cases: useIssuesStore.getState().cases, runbooksOff: [], monthCloseStartDay: 1, viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'Treasurer' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['month-close'].openCases.map(c => c.id)).toEqual([caseId]);
    expect(by['month-close'].trigger).toBe('The 1st of each month');
    expect(by['financial-review'].openCases.length).toBe(0);
    expect(situationLabel(snap, useIssuesStore.getState().cases[0])).toBe('Month close');
    expect(runbookStatuses({ ...snap, monthCloseStartDay: 20 }).find(r => r.def.id === 'month-close')!.trigger).toBe('The 20th of each month');
  });
});

describe('the shell hook', () => {
  it('opens the case for a board member once cases are loaded, and not for a resident, before they load, or when off', () => {
    const mount = (enabled: boolean) => { const h = renderHook(() => useMonthClose(enabled)); h.unmount(); };
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    mount(true);
    expect(useIssuesStore.getState().cases.length).toBe(0);
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    useIssuesStore.setState({ casesLoaded: false });
    mount(true);
    expect(useIssuesStore.getState().cases.length).toBe(0);
    useIssuesStore.setState({ casesLoaded: true });
    mount(false);
    expect(useIssuesStore.getState().cases.length).toBe(0);
    mount(true);
    const cases = useIssuesStore.getState().cases;
    expect(cases.length).toBe(1);
    expect(cases[0].sourceId).toMatch(/^month-close:\d{4}-\d{2}$/);
  });

  it('ticks the closed-books step as soon as the books close while the app is open', () => {
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    const h = renderHook(() => useMonthClose(true));
    const c = () => useIssuesStore.getState().cases[0];
    expect(c().steps![STEP.closed].done).toBe(false);
    const period = c().sourceId!.slice('month-close:'.length);
    act(() => { useFinancialStore.getState().closeBooksThrough(`${period}-28`); });
    expect(c().steps![STEP.closed].done).toBe(false);
    act(() => { useFinancialStore.getState().closeBooksThrough(monthEnd(`${period}-01`)); });
    expect(c().steps![STEP.closed].done).toBe(true);
    h.unmount();
  });
});
