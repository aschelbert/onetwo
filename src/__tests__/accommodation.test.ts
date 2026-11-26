import { describe, it, expect, beforeEach } from 'vitest';
import { ACCOMMODATION, ASK_KIND, askView, clock, decisionLetter, denialHold, dueFor, type AccommodationAsk, type AccommodationData } from '@/lib/actions/accommodation';
import { stepsOf, type ActionRecord } from '@/lib/actions';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { runRecordActions } from '@/ux2/boardroom/recordActions';
import { askForAccommodation, mayHandle, neutralTitle, saveAccommodationSettings, startAccommodation } from '@/ux2/boardroom/accommodation';

const d = (o: Partial<AccommodationData> = {}): AccommodationData => ({ ...ACCOMMODATION.blank(), ...o });
const rec = (data: AccommodationData): ActionRecord => ({ id: 'r1', kind: 'accommodation', title: 'Request 1 of 2026', unit: '', openedOn: '2026-11-20', dueOn: '', closedOn: '', data: data as unknown as Record<string, unknown> });
const ticks = (data: AccommodationData) => stepsOf(rec(data)).map(s => (s.done ? '1' : '0')).join('');
const logged = { what: 'A reserved space by the garage door', kind: 'accommodation' as const, unit: '304', requester: 'Dana Whitfield', receivedOn: '2026-11-20' };

describe('an accommodation request', () => {
  it('moves through its five steps as the record fills in', () => {
    expect(ticks(d())).toBe('00000');
    expect(ticks(d(logged))).toBe('10000');
    // Nothing more is asked when the need is apparent; when it is not, the step waits for what was asked for.
    expect(ticks(d({ ...logged, need: 'apparent' }))).toBe('11000');
    expect(ticks(d({ ...logged, need: 'ask', askedOn: '2026-11-21' }))).toBe('10000');
    expect(ticks(d({ ...logged, need: 'ask', askedOn: '2026-11-21', infoReceivedOn: '2026-11-24' }))).toBe('11000');
    const granted = { ...logged, need: 'apparent' as const, decision: 'grant' as const, decidedOn: '2026-11-25' };
    expect(ticks(d(granted))).toBe('11100');
    expect(ticks(d({ ...granted, toldOn: '2026-11-26' }))).toBe('11110');
    expect(ticks(d({ ...granted, toldOn: '2026-11-26', inPlaceOn: '2026-12-01' }))).toBe('11111');
    // Something different has to say what was agreed.
    expect(ticks(d({ ...granted, decision: 'alternative' }))).toBe('11000');
    expect(ticks(d({ ...granted, decision: 'alternative', conditions: 'Space 16' }))).toBe('11100');
  });

  it("holds a denial for its ground, the board's reasons, a discussion of alternatives and the lawyer", () => {
    const base = d({ ...logged, need: 'apparent', decision: 'deny', decidedOn: '2026-11-25' });
    expect(denialHold(base)).toBe('the ground it rests on');
    expect(denialHold({ ...base, denyGround: 'burden' })).toBe("the board's reasons, in its own words");
    expect(denialHold({ ...base, denyGround: 'burden', denyWhy: 'The garage has no spare space' })).toBe('something else being discussed with them first');
    expect(denialHold({ ...base, denyGround: 'burden', denyWhy: 'x', alternativeDiscussed: true })).toBe("the lawyer's review");
    const full = { ...base, denyGround: 'burden', denyWhy: 'The garage has no spare space', alternativeDiscussed: true, lawyerOn: '2026-11-25', lawyerBy: 'M. Ortiz' };
    expect(denialHold(full)).toBe('');
    expect(ticks(base)).toBe('11000');
    expect(ticks(full)).toBe('11100');
    // A denial has nothing to put in place: it finishes once they are told.
    expect(ticks({ ...full, toldOn: '2026-11-26' })).toBe('11111');
    expect(denialHold(d({ decision: 'grant' }))).toBe('');
  });

  it("counts the days against the board's own target", () => {
    expect(dueFor('2026-11-20', 10)).toBe('2026-11-30');
    expect(clock(d({ receivedOn: '2026-11-20' }), 10, '2026-11-25')).toEqual({ day: 5, over: false, line: "Day 5 of the board's 10" });
    expect(clock(d({ receivedOn: '2026-11-20' }), 10, '2026-12-05')).toMatchObject({ day: 15, over: true });
    expect(clock(d({ receivedOn: '2026-11-20', decidedOn: '2026-11-25' }), 10, '2026-12-30')).toEqual({ day: 5, over: false, line: 'Decided in 5 days' });
    expect(clock(d(), 10, '2026-11-25')).toBeNull();
  });

  it('writes a letter that says what was decided and never why it was asked', () => {
    const letter = decisionLetter(d({ ...logged, need: 'ask', infoNote: 'a letter from her physical therapist', decision: 'grant', decidedOn: '2026-11-25', conditions: 'Space 14 for as long as you live in unit 304' }), 'Sunny Acres', 'John Smith');
    expect(letter).toContain('The board has granted your request as asked. Space 14 for as long as you live in unit 304.');
    expect(letter).toContain('There is no fee or deposit for this.');
    expect(letter).not.toMatch(/therapist|disab|condition/i);
    const no = decisionLetter(d({ ...logged, decision: 'deny', decidedOn: '2026-11-25', denyWhy: 'Every space is deeded to a unit' }), 'Sunny Acres', 'John Smith');
    expect(no).toContain('The board is not able to grant this request. Every space is deeded to a unit.');
    expect(no).not.toContain('no fee');
    // A physical change is usually paid for by the person asking, so the letter makes no promise about cost.
    expect(decisionLetter(d({ ...logged, kind: 'modification', decision: 'grant', decidedOn: '2026-11-25' }), 'Sunny Acres', 'J').includes('no fee')).toBe(false);
  });

  it('shows the person who asked the stage, and the decision only once they have been told', () => {
    expect(askView(d(logged))).toEqual({ stage: 'received', decision: '', decidedOn: '', conditions: '' });
    expect(askView(d({ ...logged, need: 'ask', askedOn: '2026-11-21' })).stage).toBe('more-needed');
    expect(askView(d({ ...logged, need: 'apparent' })).stage).toBe('deciding');
    const decided = d({ ...logged, need: 'apparent', decision: 'grant', decidedOn: '2026-11-25', conditions: 'Space 14' });
    expect(askView(decided)).toEqual({ stage: 'deciding', decision: '', decidedOn: '', conditions: '' });
    expect(askView({ ...decided, toldOn: '2026-11-26' })).toEqual({ stage: 'decided', decision: 'grant', decidedOn: '2026-11-25', conditions: 'Space 14' });
    expect(askView({ ...decided, toldOn: '2026-11-26', inPlaceOn: '2026-12-01' }).stage).toBe('in-place');
  });
});

describe('in the app', () => {
  const records = () => useActionRecordsStore.getState().records;
  const board = () => records().filter(r => r.kind === 'accommodation');
  const asks = () => records().filter(r => r.kind === ASK_KIND);
  const as = (role: string, id = 'u1', name = 'Dana Whitfield') => useAuthStore.setState({ currentUser: { ...useAuthStore.getState().currentUser, id, name, role } } as never);
  beforeEach(() => {
    useActionRecordsStore.setState({ records: [] });
    useIssuesStore.setState({ cases: [], issues: [] } as never);
    useFinancialStore.setState({ runbooksOff: [] } as never);
    as('BOARD_MEMBER', 'b1', 'John Smith');
  });

  it('lets board members handle these, the manager only if the board says so, and owners never', () => {
    expect([mayHandle('BOARD_MEMBER'), mayHandle('PROPERTY_MANAGER'), mayHandle('RESIDENT'), mayHandle(undefined)]).toEqual([true, false, false, false]);
    saveAccommodationSettings({ managerSees: true }, '2026-11-20');
    expect([mayHandle('PROPERTY_MANAGER'), mayHandle('RESIDENT')]).toEqual([true, false]);
  });

  it("keeps the board's record free of the unit and the person: a neutral title, no unit on the record, a neutral action", () => {
    expect(neutralTitle('2026-11-20')).toBe('Request 1 of 2026');
    const { recordId, caseId } = startAccommodation({ ...logged, how: 'phone' }, '2026-11-20');
    const r = records().find(x => x.id === recordId)!;
    expect(r).toMatchObject({ title: 'Request 1 of 2026', unit: '', dueOn: '2026-11-30' });
    expect((r.data as unknown as AccommodationData).unit).toBe('304');
    const c = useIssuesStore.getState().cases.find(x => x.id === caseId)!;
    expect(c.title).toBe('Accommodation request · Request 1 of 2026');
    expect(JSON.stringify([c.title, c.unit, c.notes])).not.toMatch(/304|Dana|garage/);
    expect(neutralTitle('2026-11-21')).toBe('Request 2 of 2026');
  });

  it("a request made in the app is the resident's own record; the board's private one is opened only when someone who may handle it is signed in", () => {
    as('RESIDENT');
    const askId = askForAccommodation({ what: 'A reserved space by the garage door', kind: 'accommodation', unit: '304', onBehalfOf: '' }, '2026-11-20');
    expect(asks()[0]).toMatchObject({ id: askId, unit: '304', title: 'Your request' });
    runRecordActions('2026-11-20', true);
    expect(board()).toHaveLength(0);
    as('PROPERTY_MANAGER', 'm1', 'Pat Manager');
    runRecordActions('2026-11-20', true);
    expect(board()).toHaveLength(0);
    as('BOARD_MEMBER', 'b1', 'John Smith');
    runRecordActions('2026-11-21', true); runRecordActions('2026-11-22', true);
    expect(board()).toHaveLength(1);
    expect(board()[0].data).toMatchObject({ what: 'A reserved space by the garage door', unit: '304', requester: 'Dana Whitfield', how: 'app', receivedOn: '2026-11-20', askId });
    // The clock runs from the day they asked, not the day the board saw it.
    expect(board()[0].dueOn).toBe('2026-11-30');
    expect((asks()[0].data as unknown as AccommodationAsk).recordId).toBe(board()[0].id);
  });

  it('tells the resident where it stands as the board works it, and closes both when it is in place', () => {
    as('RESIDENT');
    askForAccommodation({ what: 'A ramp at the side door', kind: 'modification', unit: '110', onBehalfOf: 'Sam Whitfield' }, '2026-11-20');
    as('BOARD_MEMBER', 'b1', 'John Smith');
    runRecordActions('2026-11-21', true);
    const id = board()[0].id;
    // Asked for someone else: the record is about them, and notes who asked.
    expect(board()[0].data).toMatchObject({ requester: 'Sam Whitfield', onBehalfBy: 'Dana Whitfield' });
    const ask = () => asks()[0].data as unknown as AccommodationAsk;
    const patch = (c: Partial<AccommodationData>, day: string) => { useActionRecordsStore.getState().patchData(id, c as Record<string, unknown>); runRecordActions(day); };
    patch({ need: 'ask', askedOn: '2026-11-21' }, '2026-11-21');
    expect(ask().stage).toBe('more-needed');
    patch({ infoReceivedOn: '2026-11-24', decision: 'grant', decidedOn: '2026-11-25', conditions: 'At your cost, by a licensed contractor' }, '2026-11-25');
    expect(ask()).toMatchObject({ stage: 'deciding', decision: '' });
    patch({ toldOn: '2026-11-26' }, '2026-11-26');
    expect(ask()).toMatchObject({ stage: 'decided', decision: 'grant', conditions: 'At your cost, by a licensed contractor' });
    expect(board()[0].closedOn).toBe('');
    patch({ inPlaceOn: '2026-12-15' }, '2026-12-15'); runRecordActions('2026-12-16');
    expect(ask().stage).toBe('in-place');
    expect(board()[0].closedOn).toBe('2026-12-15');
    expect(asks()[0].closedOn).toBe('2026-12-15');
    expect(useIssuesStore.getState().cases.find(c => c.sourceId?.endsWith(id))!.status).toBe('closed');
  });
});
