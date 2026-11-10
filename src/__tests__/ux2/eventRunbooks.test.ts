import { beforeEach, describe, expect, it } from 'vitest';
import { useAmenitiesStore, type Reservation } from '@/store/useAmenitiesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';
import { inboxRows, runbookStatuses, situationLabel, type BoardRoomSnapshot } from '@/ux2/boardroom/metrics';
import { requestSteps, runResidentRequest, STEP as R } from '@/ux2/boardroom/residentRequest';
import { moveDue, runMoves } from '@/ux2/boardroom/moves';
import { bookingSteps, runAmenityBooking, STEP as B } from '@/ux2/boardroom/amenityBooking';
import type { Issue } from '@/types/issues';
import type { MoveEvent } from '@/types/financial';

const issue = (id: string, title: string, over: Partial<Issue> = {}): Issue => ({ id, category: 'maintenance', priority: 'MEDIUM', status: 'SUBMITTED', title, description: 'Please look at this.', reporterName: 'Ana Ortiz', reporterEmail: '', unitNumber: '4B', submittedDate: '2026-11-03', upvotes: [], viewCount: 0, comments: [], reviewNotes: [], comms: [], ...over } as unknown as Issue);
const move = (id: string, scheduledDate: string, over: Partial<MoveEvent> = {}): MoveEvent => ({ id, unitNumber: '2A', moveType: 'in', scheduledDate, timeWindow: null, elevatorSlot: null, depositAmount: 500, depositStatus: 'pending', accessStatus: 'pending', insuranceConfirmed: false, inspectionStatus: 'pending', residentName: 'Ben Lee', moverName: null, caseId: null, notes: null, createdAt: '2026-11-01T00:00:00Z', ...over });
const booking = (id: string, over: Partial<Reservation> = {}): Reservation => ({ id, amenityId: 'am1', amenityName: 'Rooftop Deck', date: '2026-11-28', startTime: '18:00', endTime: '22:00', reservedBy: 'u9', reservedByName: 'Cy Park', reservedByUnit: '7C', status: 'pending_approval', createdAt: '2026-11-10T00:00:00Z', notes: 'Birthday', fee: 75, deposit: 200, invoiceId: null, depositInvoiceId: null, approvedBy: null, approvedByName: null, approvedAt: null, denialReason: null, recurringGroupId: null, recurringPattern: null, ...over });
const cases = () => useIssuesStore.getState().cases;

beforeEach(() => {
  useIssuesStore.setState({ cases: [], issues: [], nextCaseNum: 1, casesLoaded: true });
  useFinancialStore.setState({ tenantId: null, runbooksOff: [], moveEvents: [] });
  useAmenitiesStore.setState({ reservations: [] });
  useBuildingStore.setState(s => ({ management: { ...s.management, company: 'Premier Property Management' } }));
  useRunbookSwitches.setState({ off: [] });
});

describe('resident request', () => {
  it('opens a case for every open request that has none, with the reply clock as its due date, linked the way the Inbox links', () => {
    useIssuesStore.setState({ issues: [issue('i1', 'Hallway light out'), issue('i2', 'Noise upstairs', { status: 'IN_PROGRESS', priority: 'HIGH', unitNumber: '5A' }), issue('i3', 'Old one', { status: 'RESOLVED' })] });
    const r = runResidentRequest('2026-11-10');
    expect(r.opened.length).toBe(2);
    const c = cases().find(x => x.sourceId === 'i1')!;
    expect(c).toMatchObject({ title: 'Hallway light out', catId: 'governance', sitId: 'runbook-resident-request', source: 'issue', unit: '4B', owner: 'Ana Ortiz', dueDate: '2026-11-17', priority: 'medium' });
    expect(c.steps?.length).toBe(4);
    expect(c.steps![R.ack].done).toBe(false);
    expect(cases().find(x => x.sourceId === 'i2')).toMatchObject({ priority: 'high', unit: '5A' });
    expect(cases().find(x => x.sourceId === 'i2')!.steps![R.ack].done).toBe(true);
    expect(runResidentRequest('2026-11-11').opened.length).toBe(0);
    expect(requestSteps(issue('i1', 'x'))[R.reply].s).toBe('Reply to Ana Ortiz by 2026-11-17 and resolve the request');
    // The Inbox sees the case on its row.
    const snap = { today: '2026-11-10', cases: cases(), issues: useIssuesStore.getState().issues, runbooksOff: [], viewer: { id: 'u', name: 'A', email: '', linkedUnits: [], isBoard: true, role: 'President' }, letters: [], templates: [], mailRecords: [], categories: [] } as unknown as BoardRoomSnapshot;
    expect(inboxRows(snap).find(x => x.issue.id === 'i1')?.linkedCase?.id).toBe(c.id);
    const by = Object.fromEntries(runbookStatuses(snap).map(x => [x.def.id, x]));
    expect(by['resident-request'].openCases.map(x => x.sourceId).sort()).toEqual(['i1', 'i2']);
    expect(situationLabel(snap, c)).toBe('Resident request');
  });

  it('ticks the acknowledgement when the request is in progress or answered, and the reply when it is resolved; respects the Assign button and the switch', () => {
    useIssuesStore.setState({ issues: [issue('i1', 'Hallway light out')] });
    const [id] = runResidentRequest('2026-11-10').opened;
    const steps = () => cases().find(x => x.id === id)!.steps!;
    useIssuesStore.setState(s => ({ issues: s.issues.map(i => ({ ...i, comments: [{ id: 'c1', author: 'Board', date: '2026-11-11', text: 'On it' }] } as unknown as Issue)) }));
    runResidentRequest('2026-11-11');
    expect(steps()[R.ack].done).toBe(true);
    expect(steps()[R.reply].done).toBe(false);
    useIssuesStore.getState().updateIssueStatus('i1', 'RESOLVED');
    runResidentRequest('2026-11-12');
    expect(steps()[R.reply].done).toBe(true);
    expect(steps()[R.assign].done).toBe(false);
    useIssuesStore.setState({ cases: [], issues: [issue('i5', 'Leak')] });
    useIssuesStore.getState().createCase({ catId: 'governance', sitId: 'board-action-item', approach: 'self', title: 'Leak', unit: '4B', owner: 'Ana', priority: 'medium', notes: '', source: 'issue', sourceId: 'i5' });
    expect(runResidentRequest('2026-11-10').opened.length).toBe(0);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('resident-request', false);
    expect(runResidentRequest('2026-11-10').opened.length).toBe(0);
  });
});

describe('move in or out', () => {
  it('opens one case per scheduled move, links the move to it, and ignores moves older than a month', () => {
    useFinancialStore.setState({ moveEvents: [move('m1', '2026-11-20'), move('m2', '2026-09-01', { moveType: 'out' }), move('m3', '2026-10-15', { moveType: 'out', unitNumber: '9D', residentName: null })] });
    expect(moveDue(move('x', '2026-10-11'), '2026-11-10')).toBe(true);
    expect(moveDue(move('x', '2026-10-10'), '2026-11-10')).toBe(false);
    const r = runMoves('2026-11-10');
    expect(r.opened.length).toBe(2);
    const c = cases().find(x => x.sourceId === 'move:m1')!;
    expect(c).toMatchObject({ title: 'Move in · Unit 2A · 2026-11-20', catId: 'admin', sitId: 'scheduled-move', unit: '2A', owner: 'Ben Lee', assignedRole: 'Property Manager', dueDate: '2026-11-20' });
    expect(c.steps?.length).toBe(6);
    expect(cases().find(x => x.sourceId === 'move:m3')).toMatchObject({ title: 'Move out · Unit 9D · 2026-10-15', owner: '' });
    expect(useFinancialStore.getState().moveEvents.find(e => e.id === 'm1')?.caseId).toBe(c.id);
    expect(runMoves('2026-11-11').opened.length).toBe(0);
    useBuildingStore.setState(s => ({ management: { ...s.management, company: '' } }));
    useFinancialStore.setState(s => ({ moveEvents: [...s.moveEvents, move('m4', '2026-12-01')] }));
    runMoves('2026-11-11');
    expect(cases().find(x => x.sourceId === 'move:m4')?.assignedRole).toBe('Vice President');
  });

  it('ticks every step as the move record is filled in, and respects the switch', () => {
    useFinancialStore.setState({ moveEvents: [move('m1', '2026-11-20')] });
    const [id] = runMoves('2026-11-10').opened;
    const steps = () => cases().find(x => x.id === id)!.steps!;
    const done = (re: RegExp) => steps().find(s => re.test(s.s))!.done;
    expect(steps().every(s => !s.done)).toBe(true);
    const upd = (u: Partial<MoveEvent>) => useFinancialStore.setState(s => ({ moveEvents: s.moveEvents.map(e => e.id === 'm1' ? { ...e, ...u } : e) }));
    upd({ elevatorSlot: '9-11am' }); runMoves('2026-11-11');
    expect(done(/^schedule elevator/i)).toBe(true);
    upd({ depositStatus: 'collected', insuranceConfirmed: true, accessStatus: 'issued' }); runMoves('2026-11-12');
    expect(done(/^collect move deposit/i)).toBe(true);
    expect(done(/^confirm mover insurance/i)).toBe(true);
    expect(done(/^issue or revoke/i)).toBe(true);
    expect(done(/^complete pre\/post/i)).toBe(false);
    upd({ inspectionStatus: 'passed' }); runMoves('2026-11-21');
    expect(done(/^complete pre\/post/i)).toBe(true);
    expect(done(/^record move event/i)).toBe(false);
    upd({ depositStatus: 'refunded' }); runMoves('2026-11-22');
    expect(done(/^record move event/i)).toBe(true);
    useIssuesStore.setState({ cases: [] });
    useRunbookSwitches.getState().setOn('move', false);
    expect(runMoves('2026-11-10').opened.length).toBe(0);
  });
});

describe('amenity booking', () => {
  it('opens a case only for a booking that needs the board, once, with the fee and deposit in the steps', () => {
    useAmenitiesStore.setState({ reservations: [booking('r1'), booking('r2', { status: 'active', fee: 0, deposit: 0 }), booking('r3', { status: 'pending_approval', fee: 0, deposit: 0, amenityName: 'Community Room', date: '2026-12-02' })] });
    const r = runAmenityBooking('2026-11-10');
    expect(r.opened.length).toBe(2);
    const c = cases().find(x => x.sourceId === 'amenity-booking:r1')!;
    expect(c).toMatchObject({ title: 'Amenity booking · Rooftop Deck · 2026-11-28 · Unit 7C', catId: 'operations', sitId: 'runbook-amenity-booking', unit: '7C', owner: 'Cy Park', assignedRole: 'Secretary', dueDate: '2026-11-28' });
    expect(c.steps?.length).toBe(4);
    expect(bookingSteps(booking('r1'))[B.invoice].s).toBe('Invoice Cy Park (Unit 7C): the $75 fee and the $200 deposit');
    expect(c.steps![B.deposit].done).toBe(false);
    const free = cases().find(x => x.sourceId === 'amenity-booking:r3')!;
    expect(free.steps![B.deposit].done).toBe(true);
    expect(runAmenityBooking('2026-11-11').opened.length).toBe(0);
  });

  it('ticks the decision and the invoices as the amenities page does them; a denial clears the rest; respects the switch', () => {
    useAmenitiesStore.setState({ reservations: [booking('r1'), booking('r4', { date: '2026-12-05' })] });
    const ids = runAmenityBooking('2026-11-10').opened;
    const steps = (sid: string) => cases().find(x => x.sourceId === sid)!.steps!;
    useAmenitiesStore.setState(s => ({ reservations: s.reservations.map(x => x.id === 'r1' ? { ...x, status: 'active' as const, invoiceId: 'inv1' } : x) }));
    runAmenityBooking('2026-11-11');
    expect(steps('amenity-booking:r1')[B.decide].done).toBe(true);
    expect(steps('amenity-booking:r1')[B.invoice].done).toBe(false);
    useAmenitiesStore.setState(s => ({ reservations: s.reservations.map(x => x.id === 'r1' ? { ...x, depositInvoiceId: 'inv2' } : x) }));
    runAmenityBooking('2026-11-12');
    expect(steps('amenity-booking:r1')[B.invoice].done).toBe(true);
    expect(steps('amenity-booking:r1')[B.deposit].done).toBe(false);
    useAmenitiesStore.setState(s => ({ reservations: s.reservations.map(x => x.id === 'r4' ? { ...x, status: 'denied' as const, denialReason: 'Too late' } : x) }));
    runAmenityBooking('2026-11-12');
    expect(steps('amenity-booking:r4').filter(s => s.done).length).toBe(3);
    expect(ids.length).toBe(2);
    useIssuesStore.setState({ cases: [] });
    useAmenitiesStore.setState({ reservations: [booking('r5')] });
    useRunbookSwitches.getState().setOn('amenity-booking', false);
    expect(runAmenityBooking('2026-11-10').opened.length).toBe(0);
    useRunbookSwitches.getState().setOn('amenity-booking', true);
    expect(runAmenityBooking('2026-11-10').opened.length).toBe(1);
  });
});
