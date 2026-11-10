import { beforeEach, describe, expect, it } from 'vitest';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { runbookStatuses, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { addYears, lastStudyDate, nextStudy, runReserveStudy } from '@/ux2/boardroom/reserveStudy';

const cases = () => useIssuesStore.getState().cases;
const doc = (name: string, uploadedAt: string) => ({ id: name, name, version: '', size: '', status: 'current' as const, attachments: [{ name: `${name}.pdf`, size: '1 MB', uploadedAt, type: 'application/pdf' }] });

beforeEach(() => {
  useIssuesStore.setState({ cases: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], reserveStudyDate: null, reserveStudyEveryYears: 3 });
  useBuildingStore.setState({ legalDocuments: [] });
  useComplianceStore.setState({ announcements: [], communications: [] });
  useRunbookSwitches.setState({ off: [] });
});

describe('when the next study is due', () => {
  it('reads the setting first, then the newest reserve study file, and adds the years', () => {
    expect(addYears('2024-02-29', 3)).toBe('2027-02-28');
    expect(lastStudyDate()).toBeNull();
    useBuildingStore.setState({ legalDocuments: [doc('Bylaws', '2020-01-01'), doc('Reserve Study (2023)', '2023-06-15'), doc('Reserve Study (2025)', '2025-06-15')] });
    expect(lastStudyDate()).toBe('2025-06-15');
    expect(nextStudy('2026-11-10')).toMatchObject({ last: '2025-06-15', due: '2028-06-15', key: '2028-06-15', years: 3 });
    useFinancialStore.setState({ reserveStudyDate: '2024-03-01', reserveStudyEveryYears: 5 });
    expect(nextStudy('2026-11-10')).toMatchObject({ last: '2024-03-01', due: '2029-03-01', years: 5 });
    useFinancialStore.getState().setReserveStudy('bad date', 99);
    expect(useFinancialStore.getState().reserveStudyDate).toBeNull();
    expect(useFinancialStore.getState().reserveStudyEveryYears).toBe(5);
  });
});

describe('the runbook', () => {
  it('opens 90 days before the study is due, once, with the reserve playbook; at once when none is on record', () => {
    useFinancialStore.setState({ reserveStudyDate: '2024-03-01' });
    expect(runReserveStudy('2026-11-30')).toMatchObject({ opened: false, caseId: null, due: '2027-03-01' });
    expect(runReserveStudy('2026-12-01')).toMatchObject({ opened: true, key: '2027-03-01' });
    const c = cases()[0];
    expect(c).toMatchObject({ title: 'Reserve study update · due 2027-03-01', catId: 'financial', sitId: 'reserve-management', source: 'runbook', sourceId: 'reserve-study:2027-03-01', assignedRole: 'Treasurer', dueDate: '2027-03-01' });
    expect(c.steps?.length).toBe(8);
    expect(runReserveStudy('2026-12-10').opened).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useFinancialStore.setState({ reserveStudyDate: null });
    expect(runReserveStudy('2026-11-10')).toMatchObject({ opened: true, key: 'first', due: '2027-02-08' });
    expect(runReserveStudy('2026-11-11').opened).toBe(false);
  });

  it('ticks the commissioning once a newer study is recorded and the disclosure once a reserve notice goes out; then waits for the next cycle', () => {
    useFinancialStore.setState({ reserveStudyDate: '2024-03-01' });
    const { caseId } = runReserveStudy('2026-12-01');
    const steps = () => cases().find(c => c.id === caseId)!.steps!;
    const done = (re: RegExp) => steps().find(s => re.test(s.s))!.done;
    expect(done(/^commission/i)).toBe(false);
    useFinancialStore.getState().setReserveStudy('2027-02-10');
    runReserveStudy('2027-02-11');
    expect(done(/^commission/i)).toBe(true);
    expect(done(/^disclose reserve health/i)).toBe(false);
    useComplianceStore.setState({ announcements: [{ id: 'a1', title: '2027 reserve study results and funding plan', body: '', category: 'financial', postedBy: 'Treasurer', postedDate: new Date().toISOString().slice(0, 10), pinned: false }] });
    runReserveStudy('2027-02-12');
    expect(done(/^disclose reserve health/i)).toBe(true);
    expect(done(/^adopt funding plan/i)).toBe(false);
    // The next study is due 2030-02-10; nothing opens while this case is open, then not until 90 days before.
    expect(runReserveStudy('2029-11-15').opened).toBe(false);
    useIssuesStore.setState(s => ({ cases: s.cases.map(c => ({ ...c, status: 'closed' as const })) }));
    expect(runReserveStudy('2029-11-11').opened).toBe(false);
    expect(runReserveStudy('2029-11-12')).toMatchObject({ opened: true, key: '2030-02-10' });
  });

  it('defers to the Home obligation or a wizard case, respects the switch, and shows under its row with the years in the trigger', () => {
    useIssuesStore.getState().createCase({ catId: 'financial', sitId: 'reserve-management', approach: 'pre', title: 'Reserve study current (within 3 years)', unit: '', owner: 'Treasurer', priority: 'high', notes: '', source: 'obligation', sourceId: 'f2' });
    expect(runReserveStudy('2026-11-10').opened).toBe(false);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('reserve-study', false);
    expect(runReserveStudy('2026-11-10').opened).toBe(false);
    useRunbookSwitches.getState().setOn('reserve-study', true);
    const { caseId } = runReserveStudy('2026-11-10');
    const snap = { today: '2026-11-10', cases: cases(), runbooksOff: [], reserveStudyEveryYears: 5, viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'Treasurer' }, issues: [], letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    const by = Object.fromEntries(runbookStatuses(snap).map(r => [r.def.id, r]));
    expect(by['reserve-study'].openCases.map(c => c.id)).toEqual([caseId]);
    expect(by['reserve-study'].trigger).toBe('Every 5 years, 90 days before due');
  });
});
