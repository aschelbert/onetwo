import { stepsFrom, usd, type ActionKind } from './types';

/** Moving money between budget lines after the budget is adopted. */
export interface BudgetAmendmentData {
  /** The line that needs more. */
  lineId: string;
  lineName: string;
  why: string;
  moves: BudgetMove[];
  /** Decided not to move anything: the line stays over, with the reason. */
  leaveOver: boolean;
  motion: string;
  vote: { on: string; inFavor: number; against: number };
  /** Whether owners have to be told, under the bylaws. */
  ownersNotice: '' | 'not-needed' | 'sent';
  ownersNoticeOn: string;
  appliedOn: string;
}
export interface BudgetMove { fromId: string; fromName: string; amount: number }

export const moved = (d: BudgetAmendmentData) => Math.round(d.moves.reduce((t, m) => t + m.amount, 0) * 100) / 100;
export const passed = (d: BudgetAmendmentData) => !!d.vote.on && d.vote.inFavor > d.vote.against;
export const failed = (d: BudgetAmendmentData) => !!d.vote.on && d.vote.inFavor <= d.vote.against;

/** The motion as it goes on the agenda. */
export const motionText = (d: BudgetAmendmentData) =>
  `Resolved, that the adopted budget is amended to move ${d.moves.map(m => `${usd(m.amount)} from ${m.fromName}`).join(' and ')} to ${d.lineName}${d.why.trim() ? `, because ${d.why.trim().replace(/\.$/, '')}` : ''}.`;

/** The budget lines after the amendment: each source line goes down, the target goes up by the total. */
export function amended<T extends { id: string; budgeted: number }>(lines: T[], d: BudgetAmendmentData): T[] {
  return lines.map(l => {
    const out = d.moves.filter(m => m.fromId === l.id).reduce((t, m) => t + m.amount, 0);
    const inn = l.id === d.lineId ? moved(d) : 0;
    return out || inn ? { ...l, budgeted: Math.round((l.budgeted - out + inn) * 100) / 100 } : l;
  });
}

export const BUDGET_AMENDMENT: ActionKind<BudgetAmendmentData> = {
  kind: 'budget-amendment', runbookId: 'budget-amendment', name: 'Budget amendment',
  trigger: 'A budget line is running over, or the board wants to move money', blurb: 'Move money between budget lines by a board vote, with the reason on record.',
  catId: 'financial', role: 'Treasurer', visibility: 'board',
  stepTitles: [['say', 'Say what moves, and why'], ['vote', 'Board votes'], ['tell', 'Tell owners, if the bylaws ask'], ['apply', 'The budget changes']],
  how: {
    say: 'Ticks itself when the line, the reason and where the money comes from are entered',
    vote: "Ticks itself when the board's vote is recorded",
    tell: 'Ticks itself when owners are told, or it is marked as not needed',
    apply: 'Does itself when the vote passes: the budget lines change and the amendment is kept',
  },
  blank: () => ({ lineId: '', lineName: '', why: '', moves: [], leaveOver: false, motion: '', vote: { on: '', inFavor: 0, against: 0 }, ownersNotice: '', ownersNoticeOn: '', appliedOn: '' }),
  steps: (r) => {
    const d = r.data, said = !!d.lineId && !!d.why.trim() && (d.leaveOver || moved(d) > 0);
    if (d.leaveOver) return stepsFrom(BUDGET_AMENDMENT, { say: [said, `${d.lineName} left over · ${d.why}`], vote: [said, 'Nothing to vote on'], tell: [said, 'Nothing to tell'], apply: [said, 'No change to the budget'] });
    return stepsFrom(BUDGET_AMENDMENT, {
      say: [said, said ? `${usd(moved(d))} to ${d.lineName}` : ''],
      vote: [!!d.vote.on, d.vote.on ? `${passed(d) ? 'Passed' : 'Failed'} ${d.vote.inFavor} to ${d.vote.against} on ${d.vote.on}` : '', !said ? 'what moves and why' : ''],
      tell: [!!d.ownersNotice || failed(d), failed(d) ? 'Nothing to tell' : d.ownersNotice === 'sent' ? `Owners told ${d.ownersNoticeOn}` : d.ownersNotice ? 'Not needed' : '', !d.vote.on ? 'the vote' : ''],
      apply: [!!d.appliedOn || failed(d), d.appliedOn ? `Budget changed ${d.appliedOn}` : failed(d) ? 'No change: the motion failed' : '', !d.vote.on ? 'the vote' : ''],
    });
  },
};
