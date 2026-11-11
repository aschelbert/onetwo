import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { currentFiscalYear, fiscalLabel, lastFiscalYear, nextFiscalYear } from '@/ux2/boardroom/fiscal';
import { runYearEndClose, yearEndSteps, STEP as YE } from '@/ux2/boardroom/yearEndClose';
import { budgetSteps, runAnnualBudget, STEP as AB } from '@/ux2/boardroom/annualBudget';
import type { GLEntry } from '@/types/financial';

const entry = (id: string, date: string, over: Partial<GLEntry> = {}): GLEntry => ({ id, date, memo: 'Paid a vendor', debitAcct: '6100', creditAcct: '1010', amount: 100, source: 'expense', sourceId: null, unitNumber: null, status: 'posted', ...over } as unknown as GLEntry);
const transfer = (id: string, date: string, amount: number) => entry(id, date, { memo: `Reserve transfer · ${date}`, source: 'transfer', amount });

const setFye = (fiscalYearEnd: string) => useBuildingStore.setState(s => ({ details: { ...(s.details ?? {}), fiscalYearEnd } as typeof s.details }));

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], closedThrough: null, annualReserveContribution: 12000, generalLedger: [entry('e1', '2026-03-10'), entry('e2', '2026-11-02')] });
  useComplianceStore.setState({ announcements: [] });
  useRunbookSwitches.setState({ off: [] });
  setFye('12-31');
});

describe('the fiscal calendar', () => {
  it('knows the current, last and next fiscal year for a calendar year and an off-cycle one', () => {
    expect(currentFiscalYear('2026-11-10', '12-31')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(lastFiscalYear('2026-11-10', '12-31')).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(nextFiscalYear('2026-11-10', '12-31')).toEqual({ start: '2027-01-01', end: '2027-12-31' });
    expect(currentFiscalYear('2026-11-10', '06-30')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(lastFiscalYear('2026-07-01', '06-30')).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(nextFiscalYear('2026-05-01', '06-30')).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(currentFiscalYear('2026-11-10', 'garbage')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalLabel({ start: '2026-01-01', end: '2026-12-31' })).toBe('2026');
    expect(fiscalLabel({ start: '2026-07-01', end: '2027-06-30' })).toBe('2026–27');
  });
});

describe('year-end close', () => {
  it('opens the day after the year ends, once, for a year with entries, and not for a year already closed', () => {
    expect(runYearEndClose('2026-12-31')).toMatchObject({ fyEnd: '2025-12-31', opened: false, caseId: null });
    expect(runYearEndClose('2027-01-01')).toMatchObject({ fyEnd: '2026-12-31', opened: true });
    const c = useIssuesStore.getState().cases[0];
    expect(c).toMatchObject({ title: 'Year-end close · 2026', catId: 'financial', sitId: 'runbook-year-end', source: 'runbook', sourceId: 'year-end:2026-12-31', assignedRole: 'Treasurer', dueDate: '2027-03-01', priority: 'high' });
    expect(c.steps?.length).toBe(6);
    expect(runYearEndClose('2027-01-15')).toMatchObject({ opened: false, caseId: c.id });
    expect(useIssuesStore.getState().cases.length).toBe(1);
    useIssuesStore.setState({ cases: [] });
    useFinancialStore.setState({ closedThrough: '2026-12-31' });
    expect(runYearEndClose('2027-01-02').opened).toBe(false);
  });

  it('follows an off-cycle year end and respects the switch', () => {
    setFye('06-30');
    useFinancialStore.setState({ generalLedger: [entry('e1', '2026-03-10')] });
    expect(runYearEndClose('2026-07-01')).toMatchObject({ fyEnd: '2026-06-30', opened: true });
    expect(useIssuesStore.getState().cases[0].title).toBe('Year-end close · 2025–26');
    expect(yearEndSteps({ start: '2025-07-01', end: '2026-06-30' }, 12000)[YE.taxes].s).toContain('2026-10-15');
    expect(yearEndSteps({ start: '2026-01-01', end: '2026-12-31' }, 12000)[YE.taxes].s).toContain('2027-04-15');
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('year-end', false);
    expect(runYearEndClose('2026-07-01').opened).toBe(false);
  });

  it('ticks the reserve step once the year\'s transfers reach the contribution and the close step when the books close', () => {
    const { caseId } = runYearEndClose('2027-01-01');
    const steps = () => useIssuesStore.getState().cases.find(c => c.id === caseId)!.steps!;
    expect(steps()[YE.reserve].done).toBe(false);
    useFinancialStore.setState(s => ({ generalLedger: [...s.generalLedger, ...Array.from({ length: 11 }, (_, i) => transfer(`t${i}`, `2026-${String(i + 1).padStart(2, '0')}-01`, 1000))] }));
    runYearEndClose('2027-01-02');
    expect(steps()[YE.reserve].done).toBe(false);
    useFinancialStore.setState(s => ({ generalLedger: [...s.generalLedger, transfer('t12', '2026-12-01', 1000), transfer('t13', '2027-01-01', 1000)] }));
    runYearEndClose('2027-01-03');
    expect(steps()[YE.reserve].done).toBe(true);
    useFinancialStore.setState({ closedThrough: '2026-11-30' });
    runYearEndClose('2027-01-04');
    expect(steps()[YE.close].done).toBe(false);
    useFinancialStore.setState({ closedThrough: '2026-12-31' });
    runYearEndClose('2027-01-05');
    expect(steps()[YE.close].done).toBe(true);
    expect(steps()[YE.reconcile].done).toBe(false);
  });
});

describe('annual budget', () => {
  it('opens 90 days before the year starts, once, due 30 days before, with the draft step already ticked', () => {
    expect(runAnnualBudget('2026-10-02')).toMatchObject({ fyStart: '2027-01-01', opened: false, caseId: null });
    expect(runAnnualBudget('2026-10-03')).toMatchObject({ fyStart: '2027-01-01', opened: true });
    const c = useIssuesStore.getState().cases[0];
    expect(c).toMatchObject({ title: 'Annual budget · 2027', sitId: 'runbook-annual-budget', source: 'runbook', sourceId: 'annual-budget:2027-01-01', assignedRole: 'Treasurer', dueDate: '2026-12-02', priority: 'high' });
    expect(c.steps?.length).toBe(9);
    expect(c.steps![AB.draft].done).toBe(true);
    expect(c.steps![AB.notify].done).toBe(false);
    expect(runAnnualBudget('2026-11-10')).toMatchObject({ opened: false, caseId: c.id });
    expect(useIssuesStore.getState().cases.length).toBe(1);
    expect(budgetSteps({ start: '2027-01-01', end: '2027-12-31' })[AB.notify].s).toBe('Tell owners by 2026-12-02: the adopted budget and the 2027 dues');
  });

  it('defers to a budget case the board already has, from the Home obligation or the wizard, and respects the switch', () => {
    useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'annual-budgeting', approach: 'pre', title: 'Annual budget approved and distributed to owners', unit: '', owner: 'Treasurer', priority: 'high', notes: '', source: 'obligation', sourceId: 'f1' });
    const r = runAnnualBudget('2026-11-10');
    expect(r.opened).toBe(false);
    expect(r.caseId).toBe(useIssuesStore.getState().cases[0].id);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('annual-budget', false);
    expect(runAnnualBudget('2026-11-10').opened).toBe(false);
    useRunbookSwitches.getState().setOn('annual-budget', true);
    expect(runAnnualBudget('2026-11-10').opened).toBe(true);
  });

  it('ticks the notice step once a budget notice is posted after the case opened', () => {
    useComplianceStore.setState({ announcements: [{ id: 'a0', title: '2026 budget adopted', body: '', category: 'financial', postedBy: 'Treasurer', postedDate: '2025-12-01', pinned: false }] });
    const { caseId } = runAnnualBudget('2026-11-10');
    const steps = () => useIssuesStore.getState().cases.find(c => c.id === caseId)!.steps!;
    expect(steps()[AB.notify].done).toBe(false);
    useComplianceStore.setState(s => ({ announcements: [...s.announcements, { id: 'a1', title: '2027 budget and dues', body: '', category: 'financial', postedBy: 'Treasurer', postedDate: new Date().toISOString().slice(0, 10), pinned: false }] }));
    runAnnualBudget('2026-11-11');
    expect(steps()[AB.notify].done).toBe(true);
    expect(steps()[AB.adopt].done).toBe(false);
  });

  it('shows as its own runbook\'s case on the Runbooks tab, for both', () => {
    const ye = runYearEndClose('2027-01-01').caseId;
    const ab = runAnnualBudget('2027-10-10').caseId;
    const snap = { today: '2027-10-10', cases: useIssuesStore.getState().cases, runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'Treasurer' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['year-end'].openCases.map(c => c.id)).toEqual([ye]);
    expect(by['annual-budget'].openCases.map(c => c.id)).toEqual([ab]);
    expect(by['financial-review'].openCases.length).toBe(0);
    expect(situationLabel(snap, useIssuesStore.getState().cases.find(c => c.id === ye)!)).toBe('Year-end close');
    expect(situationLabel(snap, useIssuesStore.getState().cases.find(c => c.id === ab)!)).toBe('Annual budget');
  });
});
