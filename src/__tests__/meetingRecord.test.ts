import { describe, expect, it } from 'vitest';
import { boardVotesNeeded, channelReach, composeMinutes, decidedText, defaultVote, itemsOf, quorumUnits, readiness, stepOf, tallyBoardVote, tallyOwnerVote, type Ballot, type ItemVote } from '@/ux2/community/meetingRecord';
import { buildReport } from '@/ux2/community/meetingReports';

const units = Array.from({ length: 10 }, (_, i) => ({ number: `${101 + i}`, votingPct: 10, email: i < 8 ? `u${i}@x.com` : '' }));
const ballot = (unit: string, choice: Ballot['choice'], method: Ballot['method'] = 'online'): Ballot => ({ meetingId: 'm', itemId: 'i', unit, choice, method, castAt: '2026-12-01' });

describe('meeting record', () => {
  it('turns a plain agenda into items with stable ids and guessed kinds', () => {
    const items = itemsOf({ id: 'm1', agenda: ['Call to order', 'Treasurer report', 'Adopt the 2027 budget', 'Elect two board members'] });
    expect(items.map(i => [i.id, i.kind])).toEqual([['m1-a1', 'procedure'], ['m1-a2', 'update'], ['m1-a3', 'decision'], ['m1-a4', 'election']]);
    expect(defaultVote('owners', items[3])).toMatchObject({ who: 'owners', candidates: [], secret: true, status: 'draft' });
  });

  it('counts an owner vote by source, adds the room count and applies the rule', () => {
    const vote: ItemVote = { ...defaultVote('owners', { title: 'Adopt the budget', kind: 'decision' }), status: 'open', roomCount: { for: 1, against: 0, abstain: 0 } };
    const b = [ballot('101', 'for'), ballot('102', 'for'), ballot('103', 'against', 'proxy'), ballot('104', 'abstain', 'paper')];
    const r = tallyOwnerVote(vote, b, units, 'Robert', '2026-12-10T20:00');
    expect(r).toMatchObject({ for: 3, against: 1, abstain: 1, notVoted: 5, passed: true, forPct: 30 });
    expect(r.bySource).toMatchObject({ online: { for: 2, units: 2 }, proxy: { against: 1 }, paper: { abstain: 1 }, room: { for: 1, units: 1 } });
    expect(tallyOwnerVote({ ...vote, threshold: 'majority_all' }, b, units, 'R', 't').passed).toBe(false);
  });

  it('elects the top candidates in an election', () => {
    const vote: ItemVote = { ...defaultVote('owners', { title: 'Elect two', kind: 'election' }), candidates: ['Dana', 'Omar', 'Lena'], pick: 2, status: 'open' };
    const r = tallyOwnerVote(vote, [ballot('101', ['Dana', 'Lena']), ballot('102', ['Dana', 'Lena']), ballot('103', ['Omar', 'Dana'])], units, 'R', 't');
    expect(r.candidates).toEqual([{ name: 'Dana', count: 3, elected: true }, { name: 'Lena', count: 2, elected: true }, { name: 'Omar', count: 1, elected: false }]);
    // A tie at the last seat elects nobody at that count.
    const tie = tallyOwnerVote(vote, [ballot('101', ['Dana', 'Lena']), ballot('102', ['Dana', 'Omar'])], units, 'R', 't');
    expect(tie.candidates?.map(c => c.elected)).toEqual([true, false, false]);
  });

  it('counts a board roll call against the majority of the whole board, recusals included', () => {
    const board = ['A', 'B', 'C', 'D', 'E'];
    const vote: ItemVote = { ...defaultVote('board', { title: 'Award the contract', kind: 'decision' }), status: 'open', rollCall: { A: 'for', B: 'for', C: 'against', D: 'recused', E: 'absent' } };
    expect(boardVotesNeeded(vote, board)).toBe(3);
    expect(tallyBoardVote(vote, board, 'A', 't').passed).toBe(false);
    expect(tallyBoardVote({ ...vote, rollCall: { ...vote.rollCall, E: 'for' } }, board, 'A', 't')).toMatchObject({ for: 3, against: 1, passed: true });
    expect(tallyBoardVote({ ...vote, threshold: 'majority_present' }, board, 'A', 't').passed).toBe(true);
  });

  it('knows the step, the quorum, who each channel reaches and what is missing before the notice', () => {
    expect(stepOf({ status: 'SCHEDULED' })).toBe(1);
    expect(stepOf({ status: 'SCHEDULED', noticeSentAt: '2026-11-30' })).toBe(2);
    expect(stepOf({ status: 'IN_PROGRESS', noticeSentAt: 'x', startedAt: 'y' })).toBe(3);
    expect(stepOf({ status: 'COMPLETED', endedAt: 'z' })).toBe(4);
    expect(quorumUnits(42)).toBe(22);
    expect(channelReach(units, ['101'])).toEqual({ app: 10, email: 8, mail: 3, mailUnits: ['101', '109', '110'] });
    const items = itemsOf({ id: 'm', agenda: ['Elect two board members'] });
    items[0].vote = { ...defaultVote('owners', items[0]), pick: 2, candidates: ['Dana'] };
    expect(readiness({ date: '2026-12-10', time: '19:00', location: 'Room', virtualLink: '' }, items).filter(r => !r.ok).map(r => r.label)).toEqual(['Election nominees named']);
  });

  it('writes the minutes and the summary from the recorded items', () => {
    const items = itemsOf({ id: 'm', agenda: ['Call to order', 'Adopt the budget'] });
    items[0].minutes = 'Called to order at 7:02 PM.';
    items[1].vote = { ...defaultVote('owners', items[1]), status: 'closed', result: { for: 24, against: 5, abstain: 2, notVoted: 11, passed: true, closedAt: 't', closedBy: 'R' } };
    expect(composeMinutes(items, 'Annual Meeting')).toContain('2. Adopt the budget\n—\nVote: Passed: 24 for, 5 against, 2 abstaining; 11 didn\'t vote.');
    expect(decidedText(items, 31, 42)).toBe('Adopt the budget: passed, 24 for, 5 against, 2 abstaining.\n31 of 42 units took part.');
  });

  it('builds point-in-time report snapshots', () => {
    const src = {
      units: [{ number: '101', owner: 'Ann', balance: 900, monthlyFee: 450, votingPct: 50 }, { number: '102', owner: 'Bo', balance: 0, monthlyFee: 450, votingPct: 50 }] as never,
      budgetCategories: [{ id: 'c', name: 'Insurance', budgeted: 1000, expenses: [{ id: 'e', date: '2026-03-01', amount: 400, description: '', vendor: '', invoice: '' }, { id: 'f', date: '2026-12-01', amount: 100, description: '', vendor: '', invoice: '' }] }] as never,
      reserveItems: [], chartOfAccounts: [], generalLedger: [], openRequests: [], workOrders: [],
    };
    expect(buildReport('budget_vs_actual', '2026-10-31', src).rows).toEqual([['Insurance', '$1,000', '$400', '40%']]);
    expect(buildReport('delinquency', '2026-10-31', src)).toMatchObject({ rows: [['101', 'Ann', '$900', '2.0']], totals: ['1 units', '', '$900', ''] });
  });
});
