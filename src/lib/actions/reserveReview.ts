import type { ComponentChange, LevelId, PlanAssumptions } from '@/lib/reservePlan';
import { stepsFrom, usd, type ActionKind } from './types';

/** A reserve funding review: bring the components up to date, check the assumptions, pick a contribution level, and have the board vote it. */
export interface ReserveReviewData {
  /** What opened it, in words. */
  reason: string;
  /** Changes to components made while it was open, from the action or from Funds › Planning › Reserves. */
  changes: ComponentChange[];
  componentsOn: string;
  assumptions: PlanAssumptions | null;
  assumptionsOn: string;
  level: '' | LevelId | 'other';
  monthly: number;
  /** Takes effect now, by changing this year's transfer, or with next year's budget. */
  effective: 'now' | 'next-year';
  recommendation: string;
  vote: { on: string; inFavor: number; against: number };
  appliedOn: string;
}

export const reviewPassed = (d: ReserveReviewData) => !!d.vote.on && d.vote.inFavor > d.vote.against;
export const reviewFailed = (d: ReserveReviewData) => !!d.vote.on && d.vote.inFavor <= d.vote.against;

export const RESERVE_REVIEW: ActionKind<ReserveReviewData> = {
  kind: 'reserve-review', runbookId: 'reserve-funding-review', name: 'Reserve funding review',
  trigger: 'A reserve study is filed, the plan first shows a short year, a capital project closes, or the board starts one',
  blurb: 'Bring the reserve components up to date and have the board set the contribution.',
  catId: 'financial', role: 'Treasurer', visibility: 'board',
  stepTitles: [['components', 'Bring the components up to date'], ['assumptions', 'Check the assumptions'], ['level', 'Read the plan and pick a level'], ['vote', 'The board votes'], ['effect', 'It takes effect']],
  how: {
    components: 'Ticks itself when someone confirms the components are right; changes made on Funds › Planning › Reserves are recorded here',
    assumptions: 'Ticks itself when the inflation, interest and growth rates are confirmed',
    level: 'Ticks itself when a contribution level is recommended to the board',
    vote: "Ticks itself when the board's vote is closed",
    effect: 'Does itself when the vote carries: the contribution changes now, or is written into next year\'s draft',
  },
  blank: () => ({ reason: '', changes: [], componentsOn: '', assumptions: null, assumptionsOn: '', level: '', monthly: 0, effective: 'next-year', recommendation: '', vote: { on: '', inFavor: 0, against: 0 }, appliedOn: '' }),
  steps: (r) => {
    const d = r.data;
    return stepsFrom(RESERVE_REVIEW, {
      components: [!!d.componentsOn, d.componentsOn ? `Confirmed ${d.componentsOn} · ${d.changes.length} change${d.changes.length === 1 ? '' : 's'}` : d.changes.length ? `${d.changes.length} change${d.changes.length === 1 ? '' : 's'} so far` : ''],
      assumptions: [!!d.assumptionsOn, d.assumptions && d.assumptionsOn ? `Costs +${d.assumptions.inflationPct}% · reserves earn ${d.assumptions.interestPct}%` : '', !d.componentsOn ? 'the components being confirmed' : ''],
      level: [!!d.level && !!d.recommendation.trim(), d.level ? `${usd(d.monthly)} a month · ${d.effective === 'now' ? 'from now' : "with next year's budget"}` : '', !d.assumptionsOn ? 'the assumptions being confirmed' : ''],
      vote: [!!d.vote.on, d.vote.on ? `${reviewPassed(d) ? 'Carried' : 'Failed'} ${d.vote.inFavor} to ${d.vote.against} on ${d.vote.on}` : '', !d.level ? 'a level being recommended' : ''],
      effect: [!!d.appliedOn || reviewFailed(d), d.appliedOn ? `In effect ${d.appliedOn}` : reviewFailed(d) ? 'No change: the motion failed' : '', !d.vote.on ? 'the vote' : ''],
    });
  },
};
