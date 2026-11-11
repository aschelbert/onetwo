import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { budgetForMeeting, budgetStepIndex, runAnnualBudget, switchToBudget, syncBudgetCase } from '@/ux2/boardroom/annualBudget';
import { annualFromText, budgetStepKey, capFromClauses, draftDone, draftTotals, duesByUnit, needsOwnerVote, noticeText, projectYear, seedDraft, type BudgetDraft } from '@/ux2/boardroom/budgetDraft';
import { BudgetGuide } from '@/ux2/boardroom/budget/BudgetGuide';
import { syncAnnualCase, ANNUAL_MEETING_SIT } from '@/ux2/boardroom/meetings';
import { itemsOf } from '@/ux2/community/meetingRecord';
import type { CaseTrackerCase } from '@/types/issues';

const FY = { start: '2027-01-01', end: '2027-12-31' };
const units = [
  { number: '101', monthlyFee: 400, votingPct: 40 },
  { number: '102', monthlyFee: 300, votingPct: 30 },
  { number: '103', monthlyFee: 300, votingPct: 30 },
];

const exp = (amount: number, date = '2026-06-01') => ({ id: `x${amount}${date}`, date, description: 'Paid', amount, vendor: '', invoice: '' });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useBudgetDraftStore.setState({ drafts: {} });
  useComplianceStore.setState({ announcements: [] });
  useRunbookSwitches.setState({ off: [] });
  useMeetingsStore.setState({ meetings: [] });
  useFinancialStore.setState(s => ({
    tenantId: null, runbooksOff: [], chartOfAccounts: [], generalLedger: [], annualReserveContribution: 12000, reserveItems: [],
    units: units.map(u => ({ ...s.units[0], ...u, balance: 0, fees: [] })) as typeof s.units,
    budgetCategories: [
      { id: 'c1', name: 'Landscaping', budgeted: 6000, expenses: [exp(5800)] },
      { id: 'c2', name: 'Insurance', budgeted: 9000, expenses: [exp(9000)] },
      { id: 'c3', name: 'Utilities', budgeted: 12000, expenses: [] },
    ],
  }));
  useBuildingStore.setState(s => ({
    details: { ...(s.details ?? {}), fiscalYearEnd: '12-31' } as typeof s.details,
    vendors: [{ id: 'v1', name: 'Green Thumb Landscaping', service: 'Landscaping', contact: '', phone: '', email: '', contract: 'Monthly, $650/mo', status: 'active' }],
    insurance: [{ id: 'p1', type: 'Master policy', carrier: 'Acme', coverage: '', premium: '$9,600/yr', expires: '2027-03-01', policyNum: '', attachments: [] }],
    governingClauses: [],
    legalDocuments: [],
  }));
});

describe('the budget draft', () => {
  it('reads a year of a contract or premium, and projects this year from what it has spent', () => {
    expect(annualFromText('Monthly, $650/mo')).toBe(7800);
    expect(annualFromText('Annual, $3,200/yr')).toBe(3200);
    expect(annualFromText('$9,600')).toBe(9600);
    expect(annualFromText('On-call')).toBe(0);
    expect(projectYear(5000, 6000, 0.5)).toBe(10000);
    expect(projectYear(500, 6000, 0.1)).toBe(6000);
    expect(projectYear(0, 6000, 0.8)).toBe(6000);
  });

  it('starts from this year: a suggestion per line with its reason, the contracts and policies matched to their lines', () => {
    const d = seedDraft({ fy: FY, label: '2027', today: '2026-10-01', thisYear: { start: '2026-01-01', end: '2026-12-31' }, lines: [{ id: 'c1', name: 'Landscaping', budgeted: 6000, actual: 5800 }, { id: 'c2', name: 'Insurance', budgeted: 9000, actual: 9000 }], vendors: [{ id: 'v1', name: 'Green Thumb', service: 'Landscaping', contract: '$650/mo', status: 'active' }], insurance: [{ id: 'p1', type: 'Master', carrier: 'Acme', premium: '$9,600/yr', expires: '' }], reserveAnnual: 12000, recommendedReserve: 15000, units });
    const land = d.lines.find(l => l.id === 'c1')!;
    expect(land.projected).toBeGreaterThan(6000);
    expect(land.why).toMatch(/heading to .* over its budget/);
    expect(land.reviewed).toBe(false);
    expect(d.costs.map(c => [c.id, c.annual, c.lineId])).toEqual([['vendor:v1', 7800, 'c1'], ['policy:p1', 9600, 'c2']]);
    expect(d.base).toEqual({ reserveAnnual: 12000, recommendedReserve: 15000, monthlyDues: 1000 });
    expect(draftDone(d)).toMatchObject({ start: true, costs: false, lines: false, reserve: false, dues: false });
  });

  it('adds the lines, the cushion and the reserves, and splits the dues by each unit\'s share', () => {
    const d = { ...seedDraft({ fy: FY, label: '2027', today: '2026-10-01', thisYear: { start: '2026-01-01', end: '2026-12-31' }, lines: [], vendors: [], insurance: [], reserveAnnual: 12000, recommendedReserve: 12000, units }), lines: [{ id: 'a', name: 'A', budgeted: 0, actual: 0, projected: 0, suggested: 0, why: '', amount: 10000, reviewed: true }] } as BudgetDraft;
    const t = draftTotals({ ...d, contingencyPct: 5, reserve: { choice: 'keep', annual: 2000 }, dues: { option: 'needed', monthlyTotal: 0 } });
    expect(t).toMatchObject({ operating: 10000, contingency: 500, reserve: 2000, needed: 12500, neededMonthly: 1042, monthly: 1042 });
    expect(duesByUnit(units, 1000).map(u => u.next)).toEqual([400, 300, 300]);
    expect(needsOwnerVote({ ...d, contingencyPct: 5, reserve: { choice: 'keep', annual: 2000 }, dues: { option: 'needed', monthlyTotal: 0 }, capPct: 3 })).toBe(true);
    expect(needsOwnerVote({ ...d, contingencyPct: 5, reserve: { choice: 'keep', annual: 2000 }, dues: { option: 'needed', monthlyTotal: 0 }, capPct: 10 })).toBe(false);
    expect(capFromClauses([{ heading: 'Assessments', text: 'The board may not increase the annual assessment by more than 15% without a vote of the owners.', ref: 'Art. V §3' }])).toEqual({ pct: 15, ref: 'Art. V §3' });
    expect(capFromClauses([{ heading: 'Pets', text: 'Up to 2 pets, 50% of units', ref: 'R1' }])).toBeNull();
    expect(noticeText({ ...d, contingencyPct: 5, reserve: { choice: 'keep', annual: 2000 }, dues: { option: 'needed', monthlyTotal: 0 } }, units).body).toMatch(/Dues go up 4\.2%/);
  });

  it('knows each step by its title, the new ones and the ones written before', () => {
    expect(['Start the 2027 draft from this year\'s numbers', "Check next year's contracts and insurance", 'Set every line for 2027', 'Set the reserve contribution and a cushion', 'Pick the 2027 dues', "Put the draft on a board meeting's agenda", 'Board votes to adopt the budget', 'Tell owners by 2026-12-02: the adopted budget and the new dues', 'Switch Funds to the 2027 budget and dues on 2027-01-01', 'File the adopted budget under Building › Documents'].map(budgetStepKey))
      .toEqual(['start', 'costs', 'lines', 'reserve', 'dues', 'review', 'adopt', 'notify', 'switch', 'file']);
    expect(['Roll the 2027 draft forward from this year\'s actuals', 'Pick the dues option and the reserve line', "Put next year's contracts and insurance into the lines", 'Board reviews the draft at a meeting', 'Set the 2027 dues on the fee schedule and every unit', 'Enter the adopted lines as the 2027 budget'].map(budgetStepKey))
      .toEqual(['start', 'dues', 'costs', 'review', 'switch', 'switch']);
  });
});

describe('the Annual budget action', () => {
  const open = () => {
    const { caseId } = runAnnualBudget('2026-10-03');
    return () => useIssuesStore.getState().cases.find(c => c.id === caseId)! as CaseTrackerCase;
  };
  const step = (c: CaseTrackerCase, key: Parameters<typeof budgetStepIndex>[1]) => c.steps![budgetStepIndex(c, key)];
  const draft = () => useBudgetDraftStore.getState().drafts[FY.start]!;
  const edit = (fn: (d: BudgetDraft) => BudgetDraft) => useBudgetDraftStore.getState().update(FY.start, fn);

  it('opens with ten steps and a draft started from this year, and ticks each step as the draft shows it decided', () => {
    const c = open();
    expect(c().steps).toHaveLength(10);
    expect(draft().lines.map(l => l.name)).toEqual(['Landscaping', 'Insurance', 'Utilities']);
    expect(step(c(), 'start').done).toBe(true);
    edit(d => ({ ...d, costs: d.costs.map(x => ({ ...x, confirmed: true })), lines: d.lines.map(l => ({ ...l, reviewed: true })), reserve: { choice: 'recommended', annual: 12000 }, contingencyPct: 5, dues: { option: 'needed', monthlyTotal: 0 } }));
    syncBudgetCase(c(), '2026-10-04');
    for (const k of ['costs', 'lines', 'reserve', 'dues'] as const) expect(step(c(), k).done, k).toBe(true);
    expect(step(c(), 'review').done).toBe(false);
  });

  it('ticks the vote when the meeting item passes, and on the first day of the year switches Funds to the budget', () => {
    const c = open();
    edit(d => ({ ...d, lines: d.lines.map(l => ({ ...l, amount: 10000, reviewed: true })), reserve: { choice: 'keep', annual: 6000 }, contingencyPct: 0, dues: { option: 'needed', monthlyTotal: 0 } }));
    useMeetingsStore.setState({ meetings: [{ id: 'm1', title: 'November board meeting', type: 'BOARD', status: 'COMPLETED', date: '2026-11-15', time: '19:00', location: '', virtualLink: '', agenda: [], notes: '', attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [],
      items: [{ id: 'budget-2027-01-01', title: 'Adopt the 2027 budget', kind: 'decision', minutes: '', attachments: [], vote: { who: 'board', question: 'Adopt?', threshold: 'majority_board', status: 'closed', result: { for: 3, against: 0, abstain: 0, notVoted: 0, passed: true, closedAt: '2026-11-15T20:00:00Z', closedBy: 'Secretary' } } }] } as never] });
    edit(d => ({ ...d, review: { meetingId: 'm1', itemId: 'budget-2027-01-01' } }));
    syncBudgetCase(c(), '2026-11-16');
    expect(draft().adoptedAt).toBe('2026-11-15');
    expect(draft().adoptedHow).toMatch(/3 for, 0 against/);
    expect(step(c(), 'review').done && step(c(), 'adopt').done).toBe(true);
    expect(step(c(), 'switch').done).toBe(false);
    // Not before the year starts.
    runAnnualBudget('2026-12-31');
    expect(useFinancialStore.getState().units[0].monthlyFee).toBe(400);
    runAnnualBudget('2027-01-01');
    const fin = useFinancialStore.getState();
    const t = draftTotals(draft());
    expect(t.monthly).toBe(3000);
    expect(fin.units.map(u => u.monthlyFee)).toEqual([1200, 900, 900]);
    expect(fin.budgetCategories.map(x => x.budgeted)).toEqual([10000, 10000, 10000]);
    expect(fin.annualReserveContribution).toBe(6000);
    expect(step(c(), 'switch').done).toBe(true);
    // Once only.
    expect(switchToBudget(FY.start, '2027-01-02')).toBe(false);
  });

  it('marks the annual meeting\'s budget step done once the budget it presents is adopted', () => {
    open();
    const annual = useIssuesStore.getState().createCase({ catId: 'governance', sitId: ANNUAL_MEETING_SIT, approach: 'pre', title: 'Annual meeting · by 2027-03-01', unit: '', owner: 'President', priority: 'high', notes: '', dueDate: '2027-03-01', source: 'runbook', sourceId: 'annual-meeting:2027-03-01' });
    const ac = () => useIssuesStore.getState().cases.find(x => x.id === annual)!;
    const idx = ac().steps!.findIndex(s => /^present the adopted budget/i.test(s.s));
    expect(idx).toBeGreaterThan(0);
    expect(budgetForMeeting('2027-03-01').fy.start).toBe('2027-01-01');
    syncAnnualCase(ac());
    expect(ac().steps![idx].done).toBe(false);
    edit(d => ({ ...d, adoptedAt: '2026-11-15' }));
    syncAnnualCase(ac());
    expect(ac().steps![idx].done).toBe(true);
  });
});

describe('the guide on each step', () => {
  const at = (key: Parameters<typeof budgetStepIndex>[1]) => {
    const { caseId } = runAnnualBudget('2026-10-03');
    const c = () => useIssuesStore.getState().cases.find(x => x.id === caseId)!;
    const i = budgetStepIndex(c(), key);
    render(<MemoryRouter><BudgetGuide c={c()} step={c().steps![i]} stepIndex={i} /></MemoryRouter>);
    return { c, i, guide: document.querySelector(`[data-budget-guide="${key}"]`) as HTMLElement };
  };

  it('every line: shows this year and a suggestion, and accepting them all ticks the step', () => {
    const { c, i, guide } = at('lines');
    expect(guide.querySelectorAll('tr[data-line]')).toHaveLength(3);
    expect(within(guide).getAllByText(/over its budget/).length).toBeGreaterThan(0);
    fireEvent.click(within(guide).getByRole('button', { name: /^Accept the 3 suggestions left$/ }));
    expect(useBudgetDraftStore.getState().drafts[FY.start].lines.every(l => l.reviewed)).toBe(true);
    expect(c().steps![i].done).toBe(true);
  });

  it('contracts and insurance: each one\'s year and its line, confirmed in place, with the way to the record', () => {
    const { guide } = at('costs');
    expect(guide.querySelectorAll('[data-cost]')).toHaveLength(2);
    expect(within(guide).getByRole('button', { name: 'Change a contract in Building › Contracts ↗' })).toBeTruthy();
    fireEvent.click(within(guide).getByRole('button', { name: 'All 2 look right' }));
    const d = useBudgetDraftStore.getState().drafts[FY.start];
    expect(d.costs.every(x => x.confirmed)).toBe(true);
    // A line is at least what its contracts cost.
    expect(d.lines.find(l => l.name === 'Insurance')!.amount).toBeGreaterThanOrEqual(9600);
  });

  it('dues: the year adds up, each unit\'s new amount, and an owner vote flagged over the bylaws\' limit', () => {
    useBuildingStore.setState({ governingClauses: [{ id: 'g1', topic: 'owners', role: null, ref: 'Art. V', heading: 'Assessments', text: 'No increase in assessments over 5% without owner approval.', source: '' }] });
    useBudgetDraftStore.setState({ drafts: {} });
    const { guide } = at('dues');
    expect(within(guide).getByText(/Your bylaws \(Art\. V\) allow an increase up to 5%/)).toBeTruthy();
    fireEvent.click(within(guide).getAllByRole('radio')[0]);
    expect(useBudgetDraftStore.getState().drafts[FY.start].dues.option).toBe('needed');
    expect(within(guide).getByText(/owners have to approve it/)).toBeTruthy();
    expect(within(guide).getByText('Unit 101')).toBeTruthy();
  });

  it('the meeting: puts the budget on a board meeting with the vote set up and the draft attached', () => {
    useMeetingsStore.setState({ meetings: [{ id: 'm2', title: 'December board meeting', type: 'BOARD', status: 'SCHEDULED', date: '2099-12-01', time: '19:00', location: '', virtualLink: '', agenda: [], notes: '', attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [] } as never] });
    const { guide } = at('review');
    fireEvent.click(within(guide).getByRole('button', { name: 'Put it on this agenda' }));
    const m = useMeetingsStore.getState().meetings[0];
    const item = itemsOf(m).find(x => x.id === 'budget-2027-01-01')!;
    expect(item).toMatchObject({ title: 'Adopt the 2027 budget', kind: 'decision' });
    expect(item.vote).toMatchObject({ who: 'board', status: 'draft' });
    expect(item.attachments[0]).toMatchObject({ report: 'proposed_budget', mode: 'frozen' });
    expect(useBudgetDraftStore.getState().drafts[FY.start].review).toEqual({ meetingId: 'm2', itemId: 'budget-2027-01-01' });
    expect(screen.getByText(/On the agenda of the December board meeting/)).toBeTruthy();
  });

  it('tell owners: the notice is written from the budget and waits for the vote', () => {
    const { guide } = at('notify');
    expect((within(guide).getByRole('button', { name: 'Post it to every owner' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => useBudgetDraftStore.getState().update(FY.start, d => ({ ...d, adoptedAt: '2026-11-15' })));
    fireEvent.click(within(document.querySelector('[data-budget-guide="notify"]') as HTMLElement).getByRole('button', { name: 'Post it to every owner' }));
    expect(useComplianceStore.getState().announcements[0]).toMatchObject({ title: 'The 2027 budget and dues', category: 'financial' });
  });
});
