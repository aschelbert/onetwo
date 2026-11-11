import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore, type RegulatoryFiling } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore, type Meeting } from '@/store/useMeetingsStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { filingCase, filingDue, runFilings } from '@/ux2/boardroom/filings';
import { addMonths, annualDeadline, boardCadenceDays, nextBoardTrigger, runAnnualMeeting, runBoardMeeting } from '@/ux2/boardroom/meetings';
import { completeFromCase } from '@/ux2/runbook/obligationCases';

const filing = (id: string, name: string, dueDate: string, over: Partial<RegulatoryFiling> = {}): RegulatoryFiling => ({ id, name, category: 'government', dueDate, status: 'pending', filedDate: null, confirmationNum: '', notes: 'File online.', responsible: 'President', recurrence: 'annual', legalRef: 'DC Code § 29-102.11', attachments: [], ...over } as RegulatoryFiling);
const meeting = (id: string, type: string, date: string, over: Partial<Meeting> = {}): Meeting => ({ id, title: `${type === 'ANNUAL' ? 'Annual' : 'Board'} meeting`, type, status: 'SCHEDULED', date, time: '19:00', location: 'Community Room', virtualLink: '', agenda: [], notes: '', attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [], ...over });
const setDetails = (d: Partial<{ boardMeetingEveryDays: number }>) => useBuildingStore.setState(s => ({ details: { ...s.details, ...d } }));
const cases = () => useIssuesStore.getState().cases;

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [] });
  useComplianceStore.setState({ filings: [], communications: [], completions: {} });
  useMeetingsStore.setState({ meetings: [] });
  useRunbookSwitches.setState({ off: [] });
  setDetails({ boardMeetingEveryDays: 61 });
});

describe('filings', () => {
  it('opens a pending filing\'s case 45 days out, or at once when late, with the filings playbook, once per cycle', () => {
    useComplianceStore.setState({ filings: [filing('rf1', 'DC Biennial Report', '2026-12-26'), filing('rf2', 'Form 1120-H', '2026-12-25'), filing('rf3', 'Elevator certificate', '2026-10-01', { status: 'filed', filedDate: '2026-09-20' }), filing('rf4', 'Fire inspection', '2026-11-01')] });
    expect(filingDue(filing('x', 'x', '2026-12-25'), '2026-11-10')).toBe(true);
    expect(filingDue(filing('x', 'x', '2026-12-26'), '2026-11-10')).toBe(false);
    const r = runFilings('2026-11-10');
    expect(r.opened.length).toBe(2);
    const late = cases().find(c => c.title === 'Fire inspection')!;
    expect(late).toMatchObject({ catId: 'admin', sitId: 'compliance-filing', source: 'filing', sourceId: 'rf4', assignedRole: 'President', dueDate: '2026-11-01', priority: 'urgent' });
    expect(late.notes).toMatch(/^Opened by the Filings runbook on 2026-11-10/);
    expect(late.steps?.length).toBe(7);
    expect(cases().find(c => c.title === 'Form 1120-H')?.priority).toBe('high');
    expect(runFilings('2026-11-11').opened.length).toBe(1);
    expect(runFilings('2026-11-12').opened.length).toBe(0);
    expect(cases().length).toBe(3);
  });

  it('closing the case as Resolved marks the filing filed; an unresolved close is not reopened this cycle', () => {
    useComplianceStore.setState({ filings: [filing('rf4', 'Fire inspection', '2026-11-01')] });
    const [id] = runFilings('2026-11-10').opened;
    const c = { ...cases().find(x => x.id === id)!, status: 'closed' as const, closeReason: 'Resolved', completedAt: '2026-11-12' };
    completeFromCase(c);
    expect(useComplianceStore.getState().filings[0].status).toBe('filed');
    useComplianceStore.setState({ filings: [filing('rf5', 'D-20', '2026-11-20')] });
    const [id2] = runFilings('2026-11-10').opened;
    useIssuesStore.setState(s => ({ cases: s.cases.map(x => x.id === id2 ? { ...x, status: 'closed' as const, closeReason: 'Withdrawn' } : x) }));
    expect(filingCase(cases(), { id: 'rf5', dueDate: '2026-11-20' })).toBeTruthy();
    expect(runFilings('2026-11-11').opened.length).toBe(0);
  });

  it('defers to a case the board started from Home and respects the switch', () => {
    useComplianceStore.setState({ filings: [filing('rf4', 'Fire inspection', '2026-11-20')] });
    useIssuesStore.getState().createCase({ catId: 'admin', sitId: 'compliance-filing', approach: 'pre', title: 'Fire inspection', unit: '', owner: 'President', priority: 'high', notes: '', source: 'filing', sourceId: 'rf4' });
    expect(runFilings('2026-11-10').opened.length).toBe(0);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('filings', false);
    expect(runFilings('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('filings', true);
    expect(runFilings('2026-11-10').opened.length).toBe(1);
  });
});

describe('annual meeting', () => {
  it('is due 13 months after the last one and opens 90 days before, once, with the planning playbook', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-28', 13)).toBe('2027-04-28');
    useMeetingsStore.setState({ meetings: [meeting('m1', 'ANNUAL', '2026-03-28', { status: 'COMPLETED' }), meeting('m0', 'ANNUAL', '2025-03-20', { status: 'COMPLETED' })] });
    expect(annualDeadline(useMeetingsStore.getState().meetings, '2026-11-10')).toBe('2027-04-28');
    expect(runAnnualMeeting('2027-01-27')).toMatchObject({ opened: false, caseId: null, key: '2027-04-28' });
    expect(runAnnualMeeting('2027-01-28')).toMatchObject({ opened: true, key: '2027-04-28' });
    const c = cases()[0];
    expect(c).toMatchObject({ title: 'Annual meeting · by 2027-04-28', catId: 'governance', sitId: 'annual-meeting-planning', source: 'runbook', sourceId: 'annual-meeting:2027-04-28', assignedRole: 'President', dueDate: '2027-04-28' });
    expect(c.steps?.length).toBe(13);
    expect(runAnnualMeeting('2027-02-10')).toMatchObject({ opened: false, caseId: c.id });
    expect(cases().length).toBe(1);
  });

  it('with no annual meeting ever, opens now; defers to the Home obligation or a wizard case; respects the switch', () => {
    expect(runAnnualMeeting('2026-11-10')).toMatchObject({ opened: true, key: 'first' });
    expect(cases()[0].dueDate).toBe('2027-03-10');
    expect(runAnnualMeeting('2026-11-11').opened).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useIssuesStore.getState().createCase({ catId: 'governance', sitId: 'annual-meeting-planning', approach: 'pre', title: 'Annual meeting held within 13 months of prior', unit: '', owner: 'President', priority: 'high', notes: '', source: 'obligation', sourceId: 'g4' });
    expect(runAnnualMeeting('2026-11-10').opened).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('annual-meeting', false);
    expect(runAnnualMeeting('2026-11-10').opened).toBe(false);
  });

  it('ticks the date-set, notice-sent and meeting-held steps as the meeting comes together', () => {
    useMeetingsStore.setState({ meetings: [meeting('m1', 'ANNUAL', '2026-03-28', { status: 'COMPLETED' })] });
    const { caseId } = runAnnualMeeting('2027-02-01');
    const steps = () => cases().find(c => c.id === caseId)!.steps!;
    const done = (re: RegExp) => steps().find(s => re.test(s.s))!.done;
    expect(done(/^set annual meeting date/i)).toBe(false);
    useMeetingsStore.setState(s => ({ meetings: [...s.meetings, meeting('m2', 'ANNUAL', '2027-04-10', { title: 'Annual Meeting 2027' })] }));
    runAnnualMeeting('2027-02-02');
    expect(done(/^set annual meeting date/i)).toBe(true);
    expect(done(/^send formal annual meeting notice/i)).toBe(false);
    useComplianceStore.setState({ communications: [{ id: 'n1', type: 'notice', subject: 'Annual Meeting 2027 notice and proxy', date: '2027-03-25', method: 'mail', recipients: 'All owners', respondedBy: null, status: 'sent', notes: '' }] });
    runAnnualMeeting('2027-03-26');
    expect(done(/^send formal annual meeting notice/i)).toBe(true);
    expect(done(/^conduct annual meeting/i)).toBe(false);
    useMeetingsStore.setState(s => ({ meetings: s.meetings.map(m => m.id === 'm2' ? { ...m, status: 'COMPLETED' } : m) }));
    runAnnualMeeting('2027-04-11');
    expect(done(/^conduct annual meeting/i)).toBe(true);
    // One at a time: the next year's case waits until this one closes, then for its own window, 90 days before 2028-05-10.
    expect(runAnnualMeeting('2028-02-10').opened).toBe(false);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, status: 'closed' as const } : c) }));
    expect(runAnnualMeeting('2028-02-09').opened).toBe(false);
    expect(runAnnualMeeting('2028-02-10')).toMatchObject({ opened: true, key: '2028-05-10' });
  });
});

describe('board meeting cycle', () => {
  it('reads the cadence from Building details and falls back to every two months', () => {
    expect(boardCadenceDays({ boardMeetingEveryDays: 30 })).toBe(30);
    expect(boardCadenceDays({ boardMeetingEveryDays: 0 })).toBe(61);
    expect(boardCadenceDays(undefined)).toBe(61);
  });

  it('opens a case for a scheduled board meeting 30 days out, or to schedule one when the cadence is lapsing; one at a time', () => {
    useMeetingsStore.setState({ meetings: [meeting('b1', 'BOARD', '2026-10-10', { status: 'COMPLETED' }), meeting('b2', 'BOARD', '2026-12-15', { title: 'December Board Meeting' })] });
    expect(nextBoardTrigger(useMeetingsStore.getState().meetings, '2026-11-10', 61)).toBeNull();
    expect(runBoardMeeting('2026-11-10').opened).toBe(false);
    expect(runBoardMeeting('2026-11-15')).toMatchObject({ opened: true, key: 'b2' });
    expect(cases()[0]).toMatchObject({ title: 'Board meeting · 2026-12-15 · December Board Meeting', sitId: 'board-meetings', source: 'runbook', sourceId: 'board-meeting:b2', dueDate: '2026-12-15', assignedRole: 'President' });
    expect(cases()[0].steps?.length).toBe(5);
    expect(runBoardMeeting('2026-11-20').opened).toBe(false);
    // Nothing scheduled after the last meeting: the cadence lapses on Dec 10, so the scheduling case opens Nov 10.
    useIssuesStore.setState({ cases: [] });
    useMeetingsStore.setState({ meetings: [meeting('b1', 'BOARD', '2026-10-10', { status: 'COMPLETED' })] });
    expect(runBoardMeeting('2026-11-09').opened).toBe(false);
    expect(runBoardMeeting('2026-11-10')).toMatchObject({ opened: true, key: 'due:2026-12-10' });
    expect(cases()[0].title).toBe('Board meeting · schedule one by 2026-12-10');
    // Monthly bylaws move the deadline in.
    useIssuesStore.setState({ cases: [] });
    setDetails({ boardMeetingEveryDays: 30 });
    expect(runBoardMeeting('2026-10-11')).toMatchObject({ opened: true, key: 'due:2026-11-09' });
  });

  it('ticks agenda-and-notice, the meeting held, and the minutes; respects the switch and a hand-opened case', () => {
    useMeetingsStore.setState({ meetings: [meeting('b2', 'BOARD', '2026-12-01', { title: 'December Board Meeting' })] });
    const { caseId } = runBoardMeeting('2026-11-10');
    const steps = () => cases().find(c => c.id === caseId)!.steps!;
    const done = (re: RegExp) => steps().find(s => re.test(s.s))!.done;
    expect(done(/^prepare agenda/i)).toBe(false);
    useMeetingsStore.setState(s => ({ meetings: s.meetings.map(m => ({ ...m, agenda: ['Financials', 'Elevator'] })) }));
    useComplianceStore.setState({ communications: [{ id: 'n1', type: 'notice', subject: 'December Board Meeting notice', date: '2026-11-20', method: 'email', recipients: 'All', respondedBy: null, status: 'sent', notes: '' }] });
    runBoardMeeting('2026-11-21');
    expect(done(/^prepare agenda/i)).toBe(true);
    expect(done(/^conduct meeting/i)).toBe(false);
    useMeetingsStore.setState(s => ({ meetings: s.meetings.map(m => ({ ...m, status: 'COMPLETED', minutes: 'Quorum present. Financials approved.' })) }));
    runBoardMeeting('2026-12-02');
    expect(done(/^conduct meeting/i)).toBe(true);
    expect(done(/^record detailed minutes/i)).toBe(true);
    expect(done(/^verify quorum/i)).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('board-meeting', false);
    expect(runBoardMeeting('2026-11-10').opened).toBe(false);
    useRunbookSwitches.getState().setOn('board-meeting', true);
    useIssuesStore.getState().createCase({ catId: 'governance', sitId: 'board-meetings', approach: 'pre', title: 'December meeting', unit: '', owner: 'President', priority: 'medium', notes: '' });
    expect(runBoardMeeting('2026-11-10').opened).toBe(false);
  });

  it('shows under its own runbook on the Runbooks tab, with the cadence in the trigger', () => {
    useMeetingsStore.setState({ meetings: [meeting('b2', 'BOARD', '2026-12-01')] });
    const { caseId } = runBoardMeeting('2026-11-10');
    const snap = { today: '2026-11-10', cases: cases(), runbooksOff: [], boardMeetingEveryDays: 45, viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['board-meeting'].openCases.map(c => c.id)).toEqual([caseId]);
    expect(by['board-meeting'].trigger).toBe('Every 45 days per the bylaws, 30 days ahead');
  });
});
