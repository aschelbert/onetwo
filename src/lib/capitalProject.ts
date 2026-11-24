/**
 * A capital improvement: one job that replaces or betters part of the
 * building, from the need to the close-out. The record is plain data; the
 * functions here say which of its ten steps are done, which is next, and what
 * is holding a step back. The Board Room action for a project shows these
 * steps and writes to these fields (src/ux2/boardroom/project).
 *
 * The permit questions follow the District's list of work that needs a
 * building permit (DCRA property-manager study guide, rev. 03/2021). They are
 * a prompt, not a ruling: the permit office decides.
 */
export interface ProjectOption {
  id: string;
  name: string;
  cost: number;
  rebate: number;
  /** What it cuts from yearly running costs, if anything. */
  savesPerYear: number;
  notes: string;
}

export interface ProjectBid {
  id: string;
  vendor: string;
  amount: number;
  /** The bid prices the whole scope of work. */
  meetsScope: boolean;
  /** A current certificate of insurance is on file for the bidder. */
  insuranceOk: boolean;
  notes: string;
}

export type FundingSource = 'reserves' | 'operating' | 'special_assessment' | 'loan';

export const FUNDING_LABEL: Record<FundingSource, string> = {
  reserves: 'Reserves',
  operating: 'Operating budget',
  special_assessment: 'Special assessment',
  loan: 'Loan',
};

export const PERMIT_QUESTIONS: { id: string; label: string; also?: string }[] = [
  { id: 'systems', label: 'It alters or repairs wiring, plumbing, gas or the structure' },
  { id: 'layout', label: "It changes a unit's or a common area's layout" },
  { id: 'exterior', label: 'It adds a sign, awning, fence, shed or retaining wall' },
  { id: 'demolition', label: 'It is demolition or new construction' },
  { id: 'tree', label: 'It touches a tree over 55 inches round, or public space', also: 'A building permit does not cover this: ask the District Department of Transportation (urban forestry, public space) as well.' },
  { id: 'use', label: 'It changes the use of the space or how many people it holds', also: 'A new Certificate of Occupancy is needed before the space is used.' },
];

export interface CapitalProject {
  id: string;
  title: string;
  /** Why the job is needed, in a sentence or two. */
  need: string;
  openedOn: string;
  closedOn: string;
  /** The asset and the reserve component it replaces, when it replaces one. */
  assetId: string;
  reserveItemId: string;

  options: ProjectOption[];
  chosenOptionId: string;
  optionReason: string;

  funding: { source: FundingSource | ''; decidedOn: string; vote: string };

  permit: {
    answered: boolean;
    /** Ids of the PERMIT_QUESTIONS answered yes. */
    answers: string[];
    pulledBy: 'contractor' | 'association';
    number: string;
    issuedOn: string;
    finalInspectionOn: string;
  };

  scope: string;
  bids: ProjectBid[];
  awardedBidId: string;
  awardReason: string;
  contractSignedOn: string;

  ownersToldOn: string;
  /** The job does not affect owners (no closure, noise or access), so no notice went out. */
  ownersNotAffected: boolean;

  workStartedOn: string;
  workOrderId: string;
  signedOffOn: string;
  signedOffBy: string;
  paidOn: string;

  warrantyUntil: string;
  /** Useful life of what was installed, in years; resets the reserve component. */
  newLifeYears: number;
}

export function blankProject(title: string, need: string, openedOn: string): Omit<CapitalProject, 'id'> {
  return {
    title, need, openedOn, closedOn: '', assetId: '', reserveItemId: '',
    options: [], chosenOptionId: '', optionReason: '',
    funding: { source: '', decidedOn: '', vote: '' },
    permit: { answered: false, answers: [], pulledBy: 'contractor', number: '', issuedOn: '', finalInspectionOn: '' },
    scope: '', bids: [], awardedBidId: '', awardReason: '', contractSignedOn: '',
    ownersToldOn: '', ownersNotAffected: false,
    workStartedOn: '', workOrderId: '', signedOffOn: '', signedOffBy: '', paidOn: '',
    warrantyUntil: '', newLifeYears: 0,
  };
}

export const chosenOption = (p: CapitalProject) => p.options.find(o => o.id === p.chosenOptionId);
export const awardedBid = (p: CapitalProject) => p.bids.find(b => b.id === p.awardedBidId);
export const permitNeeded = (p: CapitalProject) => p.permit.answered && p.permit.answers.length > 0;
/** What the job is expected to cost: the contract once awarded, the chosen option before that. */
export const projectCost = (p: CapitalProject) => awardedBid(p)?.amount ?? chosenOption(p)?.cost ?? 0;

/** Bids the bylaws ask for: three over the spending limit, one otherwise. */
export const bidsNeeded = (p: CapitalProject, spendingLimit: number) => ((chosenOption(p)?.cost ?? 0) > spendingLimit ? 3 : 1);

/** Years for an option to pay for itself, from what it saves; null when it saves nothing. */
export function paybackYears(o: Pick<ProjectOption, 'cost' | 'rebate' | 'savesPerYear'>): number | null {
  if (!(o.savesPerYear > 0)) return null;
  return Math.round((Math.max(0, o.cost - o.rebate) / o.savesPerYear) * 10) / 10;
}

/**
 * Years for the extra cost of a dearer option to pay for itself against the
 * cheapest one on the list, from the extra it saves; null when it is the
 * cheapest or saves no more.
 */
export function extraPaybackYears(o: ProjectOption, all: ProjectOption[]): number | null {
  const net = (x: ProjectOption) => Math.max(0, x.cost - x.rebate);
  const base = [...all].sort((a, b) => net(a) - net(b))[0];
  if (!base || base.id === o.id) return null;
  const extraCost = net(o) - net(base);
  const extraSaving = o.savesPerYear - base.savesPerYear;
  if (extraCost <= 0 || extraSaving <= 0) return null;
  return Math.round((extraCost / extraSaving) * 10) / 10;
}

export interface FundingContext {
  units: number;
  reserveCash: number;
  operatingCash: number;
  /** Percent funded today and once the job is paid from reserves, as the reserve plan measures it (the balance against what should be set aside by now); null when the plan has no components. */
  reservePct: number | null;
  reservePctAfter: number | null;
  /** The first year the 30-year plan runs short once the job is paid from reserves, when it does. */
  shortAfter: number | null;
}

export interface FundingEffect { source: FundingSource; effect: string; decides: 'Board' | "Owners' vote"; possible: boolean }

/** A level monthly loan payment. */
export function loanPayment(amount: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12, n = years * 12;
  return r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** What each way of paying would do to this building. The loan terms are an illustration, to be replaced by a lender's quote. */
export function fundingEffects(amount: number, c: FundingContext, loan = { ratePct: 7, years: 7 }): FundingEffect[] {
  const units = Math.max(1, c.units);
  const funded = c.reservePct == null || c.reservePctAfter == null ? `Leaves ${usd(c.reserveCash - amount)} in reserves` : `Reserves go from ${c.reservePct}% to ${c.reservePctAfter}% funded`;
  const monthly = loanPayment(amount, loan.ratePct, loan.years);
  return [
    { source: 'reserves', decides: 'Board', possible: c.reserveCash >= amount, effect: c.reserveCash >= amount ? `${funded} · ${c.shortAfter ? `the plan then runs short in ${c.shortAfter}` : 'no short year in the plan after it'}` : `Reserves hold ${usd(c.reserveCash)}, ${usd(amount - c.reserveCash)} short` },
    { source: 'operating', decides: 'Board', possible: c.operatingCash >= amount, effect: c.operatingCash >= amount ? `Leaves ${usd(c.operatingCash - amount)} in operating cash` : `Operating holds ${usd(c.operatingCash)}, ${usd(amount - c.operatingCash)} short` },
    { source: 'special_assessment', decides: "Owners' vote", possible: true, effect: `${usd(amount / units)} a unit, once, or ${usd(amount / units / 12)} a month for a year` },
    { source: 'loan', decides: "Owners' vote", possible: true, effect: `${usd(monthly / units)} a unit a month for ${loan.years} years at ${loan.ratePct}% · ${usd(monthly * loan.years * 12 - amount)} interest in all` },
  ];
}

export type StepKey = 'need' | 'options' | 'funding' | 'permit' | 'bids' | 'award' | 'owners' | 'work' | 'pay' | 'closeout';

export interface ProjectStep {
  key: StepKey;
  title: string;
  done: boolean;
  /** Why the step cannot be finished yet, when something outside it is missing. */
  waitsOn: string;
  /** What the record shows for the step, in a line. */
  summary: string;
}

export const STEP_ORDER: StepKey[] = ['need', 'options', 'funding', 'permit', 'bids', 'award', 'owners', 'work', 'pay', 'closeout'];

export const STEP_TITLE: Record<StepKey, string> = {
  need: 'Describe the need',
  options: 'Compare the options',
  funding: 'Decide how to pay',
  permit: 'Permits and approvals',
  bids: 'Scope of work and bids',
  award: 'Award and contract',
  owners: 'Tell owners',
  work: 'Work and inspections',
  pay: 'Sign off and pay',
  closeout: 'Close out',
};

/** The ten steps with where each stands. `spendingLimit` is the bylaws' limit that sets how many bids are needed. */
export function projectSteps(p: CapitalProject, spendingLimit = 5000): ProjectStep[] {
  const opt = chosenOption(p);
  const bid = awardedBid(p);
  const needPermit = permitNeeded(p);
  const wanted = bidsNeeded(p, spendingLimit);
  const also = PERMIT_QUESTIONS.filter(q => q.also && p.permit.answers.includes(q.id)).length;
  const s = (key: StepKey, done: boolean, summary: string, waitsOn = ''): ProjectStep => ({ key, title: STEP_TITLE[key], done, waitsOn: done ? '' : waitsOn, summary });
  return [
    s('need', !!p.need.trim(), p.need.trim()),
    s('options', p.options.length > 0 && !!opt, opt ? `${opt.name} · ${usd(opt.cost)}${p.options.length > 1 ? ` · chosen from ${p.options.length}` : ''}` : p.options.length ? `${p.options.length} option${p.options.length === 1 ? '' : 's'} listed, none chosen` : ''),
    s('funding', !!p.funding.source && !!p.funding.decidedOn, p.funding.source ? `${FUNDING_LABEL[p.funding.source]}${p.funding.decidedOn ? ` · decided ${p.funding.decidedOn}` : ' · not yet voted'}` : '', opt ? '' : 'an option being chosen'),
    s('permit', p.permit.answered, !p.permit.answered ? '' : needPermit ? `Permit needed${p.permit.number ? ` · ${p.permit.number}` : ' · not on file yet'}${also ? ` · ${also} other approval${also === 1 ? '' : 's'}` : ''}` : 'No permit needed'),
    s('bids', !!p.scope.trim() && p.bids.length >= wanted, `${p.scope.trim() ? 'Scope written' : 'No scope yet'} · ${p.bids.length} of ${wanted} bid${wanted === 1 ? '' : 's'}`),
    s('award', !!bid && !!p.contractSignedOn, bid ? `${bid.vendor} · ${usd(bid.amount)}${p.contractSignedOn ? ` · signed ${p.contractSignedOn}` : ''}` : '', bid && !bid.insuranceOk ? `${bid.vendor}'s insurance certificate` : ''),
    s('owners', !!p.ownersToldOn || p.ownersNotAffected, p.ownersToldOn ? `Told ${p.ownersToldOn}` : p.ownersNotAffected ? 'Owners not affected' : ''),
    s('work', !!p.workStartedOn, p.workStartedOn ? `Started ${p.workStartedOn}` : '', needPermit && !p.permit.number.trim() ? 'the permit being on file' : !p.contractSignedOn ? 'the contract being signed' : ''),
    s('pay', !!p.signedOffOn && !!p.paidOn, [p.signedOffOn && `signed off ${p.signedOffOn}${p.signedOffBy ? ` by ${p.signedOffBy}` : ''}`, p.paidOn && `paid ${p.paidOn}`].filter(Boolean).join(' · '), needPermit && !p.permit.finalInspectionOn ? "the permit's final inspection" : ''),
    s('closeout', !!p.closedOn, p.closedOn ? `Closed ${p.closedOn}` : ''),
  ];
}

/** The first step still open, or null when the project is closed out. */
export function currentStep(p: CapitalProject, spendingLimit = 5000): ProjectStep | null {
  return projectSteps(p, spendingLimit).find(s => !s.done) ?? null;
}

export function stageLabel(p: CapitalProject, spendingLimit = 5000): string {
  const steps = projectSteps(p, spendingLimit);
  const cur = steps.find(s => !s.done);
  return cur ? `Step ${steps.indexOf(cur) + 1} of ${steps.length} · ${cur.title}` : `Closed ${p.closedOn}`;
}
