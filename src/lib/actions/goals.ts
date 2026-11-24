import { stepsFrom, type ActionKind } from './types';

/** Setting the year's goals: look back, look at where the building stands, pick goals and targets, adopt them by vote, tell owners. */
export interface GoalsData {
  /** The fiscal year the goals are for, by its first day. */
  year: string;
  reviewedLastOn: string;
  stoodOn: string;
  /** How many goals are drafted for the year, kept up to date from the goals themselves. */
  goalCount: number;
  sentOn: string;
  vote: { on: string; inFavor: number; against: number };
  publishedOn: string;
}

export const goalsPassed = (d: GoalsData) => !!d.vote.on && d.vote.inFavor > d.vote.against;
export const goalsFailed = (d: GoalsData) => !!d.vote.on && d.vote.inFavor <= d.vote.against;

export const GOALS: ActionKind<GoalsData> = {
  kind: 'goals', runbookId: 'year-goals', name: "Set the year's goals",
  trigger: 'With the annual budget, 90 days before the fiscal year, or when the board starts one',
  blurb: 'Decide what the board is trying to do next year, with a target for each, before the money is set.',
  catId: 'governance', role: 'President', visibility: 'owners',
  stepTitles: [['last', 'Look at how last year went'], ['stand', 'See where the building stands'], ['pick', 'Pick the goals and their targets'], ['vote', 'The board adopts them'], ['tell', 'Tell owners']],
  how: {
    last: "Ticks itself when someone has read last year's outcome",
    stand: "Ticks itself when someone has read the building's current figures",
    pick: 'Ticks itself when at least one goal has a target and the list is sent to the board',
    vote: "Ticks itself when the board's vote is closed",
    tell: 'Does itself when the vote carries: the goals show on Building › Goals for every owner',
  },
  blank: () => ({ year: '', reviewedLastOn: '', stoodOn: '', goalCount: 0, sentOn: '', vote: { on: '', inFavor: 0, against: 0 }, publishedOn: '' }),
  steps: (r) => {
    const d = r.data;
    return stepsFrom(GOALS, {
      last: [!!d.reviewedLastOn, d.reviewedLastOn ? `Read ${d.reviewedLastOn}` : ''],
      stand: [!!d.stoodOn, d.stoodOn ? `Read ${d.stoodOn}` : ''],
      pick: [!!d.sentOn && d.goalCount > 0, d.goalCount ? `${d.goalCount} goal${d.goalCount === 1 ? '' : 's'}${d.sentOn ? ` · sent to the board ${d.sentOn}` : ' drafted'}` : ''],
      vote: [!!d.vote.on, d.vote.on ? `${goalsPassed(d) ? 'Adopted' : 'Not adopted'} ${d.vote.inFavor} to ${d.vote.against} on ${d.vote.on}` : '', !d.sentOn ? 'the goals being sent to the board' : ''],
      tell: [!!d.publishedOn || goalsFailed(d), d.publishedOn ? `On Building › Goals since ${d.publishedOn}` : goalsFailed(d) ? 'Nothing to publish: not adopted' : '', !d.vote.on ? 'the vote' : ''],
    });
  },
};
