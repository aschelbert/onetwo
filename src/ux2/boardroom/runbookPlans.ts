/**
 * Every runbook's steps, and which of them the app does itself.
 *
 * Three sources, in this order:
 *  - Runbooks that build their own case steps: the steps below, written to
 *    match what their module puts on the case, with how the app does each
 *    automated one (the module ticks exactly these).
 *  - Runbooks that run on a case-workflow situation: that situation's steps,
 *    with the ones the runbook ticks itself (matched the way the module does).
 *  - Runbooks that open by hand today: the situation's steps (or the written
 *    plan), all done by people for now; their automated count is the plan.
 */
import { CATS } from '@/store/useIssuesStore';
import type { RunbookDef } from './runbooks';

export interface PlanStep {
  title: string;
  /** The app does this step itself today. */
  auto: boolean;
  /** How it does it, in a line. */
  how?: string;
  /** Meant to be automated, not yet. */
  planned?: boolean;
}

export interface RunbookPlan {
  steps: PlanStep[];
  /** Where the steps come from. */
  source: 'runbook' | 'workflow' | 'plan';
  /** The app starts it and ticks steps today. */
  live: boolean;
}

type Own = [title: string, how?: string][];

/** Runbooks with their own steps; a second entry means the app does that step. */
const OWN: Record<string, Own> = {
  'annual-budget': [
    ['Roll next year’s draft forward from this year’s actuals', 'Done as the action opens: the draft is copied from this year’s actuals'],
    ['Pick the dues option and the reserve line'],
    ['Put next year’s contracts and insurance into the lines'],
    ['Board reviews the draft at a meeting'],
    ['Board votes to adopt the budget'],
    ['Set the new dues on the fee schedule and every unit'],
    ['Tell owners: the adopted budget and the new dues', 'Ticks itself when a budget notice goes out to owners'],
    ['Enter the adopted lines as next year’s budget'],
    ['File the adopted budget with the minutes under Building › Documents'],
  ],
  'resident-request': [
    ['Acknowledge the owner', 'Ticks itself when the request gets a reply or moves past Submitted'],
    ['Decide who handles it and what it needs'],
    ['Do the work, or decide why not'],
    ['Reply to the owner by the deadline and resolve the request', 'Ticks itself when the request is resolved or closed'],
  ],
  'vendor-bids': [
    ['Write one scope of work for every bidder'],
    ['Collect the minimum number of bids', 'Ticks itself when enough bids are on the parent action'],
    ['Verify the license and insurance on every bid', 'Ticks itself when every bid is marked licensed and insured'],
    ['Pick the bid and record why', 'Ticks itself when a bid is selected'],
    ['Carry the choice back to the parent action and move it on', 'Ticks itself when the parent action’s bids step is done'],
  ],
  'insurance-renewal': [
    ['Ask for the renewal quote'],
    ['Get at least two competing quotes'],
    ['Board approves the premium'],
    ['Bind the policy and record it: carrier, coverage, premium, new expiry', 'Ticks itself when the policy’s expiry moves forward'],
    ['Upload the new certificate of insurance to the policy', 'Ticks itself when a new certificate is attached to the renewed policy'],
  ],
  collections: [
    ['Charge the late fee', 'Ticks itself when the late fee invoice is on the unit'],
    ['Send the second notice by certified mail, with the statement of account'],
    ['Send the formal demand letter: total due and lien rights'],
    ['Offer a written payment plan'],
    ['Record the outcome: paid in full, on a plan, or referred for a lien', 'Ticks itself when the unit’s balance is cleared'],
  ],
  'month-close': [
    ['Post the month’s dues, late fees and the reserve transfer', 'Ticks itself when the month’s dues invoices are posted'],
    ['Record every payment and bill, then reconcile the bank'],
    ['Review the month against the budget'],
    ['Close the books through the month’s end', 'Ticks itself when Funds closes the books through the month'],
    ['Send the monthly packet to owners', 'Ticks itself when the packet is sent from Funds'],
  ],
  'special-assessment': [
    ['Compute each unit’s share by percentage interest', 'Done as the action opens, from the units’ shares'],
    ['Board resolution: adopt the assessment, the due date, the payment plan'],
    ['Owner vote, if the bylaws require one at this amount'],
    ['Notice to every owner before the due date', 'Ticks itself when the assessment notice goes out'],
    ['Levy it: a special assessment invoice on every unit', 'Ticks itself when every unit has its invoice'],
    ['Collect it and keep the money in its fund', 'Ticks itself when every assessment invoice is paid'],
  ],
  'amenity-booking': [
    ['Approve or deny the booking', 'Ticks itself when the booking is approved or denied'],
    ['Invoice the fee and deposit', 'Ticks itself when they are invoiced, or there is nothing to charge'],
    ['On the day: access and setup, then check the space afterwards'],
    ['Return the deposit, or charge the damage against it', 'Ticks itself when there is no deposit to return'],
  ],
  'work-order': [
    ['Approve the work order', 'Ticks itself when the work order is approved'],
    ['The vendor does the work; sign it off and note any deficiencies'],
    ['Enter the invoice', 'Ticks itself when the invoice is entered'],
    ['Pay it', 'Ticks itself when the work order is paid'],
  ],
  'spending-request': [
    ['Check the amount against its fund and the bylaws limit', 'Done as the action opens'],
    ['Board votes: approve or deny', 'Ticks itself when the request is approved or denied'],
    ['Record the decision in the minutes'],
    ['Release the money: a work order or the payment', 'Ticks itself when a work order is attached, or the request is denied'],
  ],
  'vendor-onboarding': [
    ['Add the vendor to Building › Contracts: service, contact, terms', 'Ticks itself when the vendor has a record there'],
    ['Collect the vendor’s W-9', 'Ticks itself when the W-9 is marked received'],
    ['Certificate of insurance naming the association, and licenses checked'],
    ['Put the vendor’s contract on file, with its end date', 'Ticks itself when a contract for the vendor is on file'],
  ],
  '1099': [
    ['Confirm the vendors paid $600 or more in the year', 'Done as the action opens, from the year’s payments'],
    ['Collect the W-9 from every vendor on the list', 'Ticks itself when every vendor on the list has a W-9'],
    ['File Form 1099-NEC with the IRS and send each vendor its copy by January 31'],
    ['Keep the filed forms and the W-9s with the year’s records'],
  ],
  'year-end': [
    ['Reconcile every account to the year-end bank statements'],
    ['Post the year-end adjustments: accruals, prepaid dues, bad debt'],
    ['True up the reserve transfer to the adopted amount', 'Ticks itself when the year’s reserve transfers reach the adopted amount'],
    ['Close the books through the fiscal year end', 'Ticks itself when Funds closes the books through year end'],
    ['Send the annual report to owners: year-end statements and the reserve position'],
    ['Hand the year’s figures to the tax filings: Form 1120-H and the DC return'],
  ],
  'owner-disclosure': [
    ['Compile the disclosure: last year’s actuals against budget, the reserve balance', 'Ticks itself when last year’s books are closed'],
    ['Board approves the statement'],
    ['Send it to every owner by March 31 and keep proof of delivery', 'Ticks itself when the disclosure is sent'],
  ],
};

/** Runbooks on a workflow situation that tick some of its steps; matched the way the module matches them. */
const TICKS: Record<string, [RegExp, string][]> = {
  'board-meeting': [
    [/^prepare agenda and distribute meeting notice/i, 'Ticks itself when the meeting has an agenda and its notice is sent'],
    [/^conduct meeting/i, 'Ticks itself when the meeting is marked held'],
    [/^record detailed minutes/i, 'Ticks itself when the meeting has minutes'],
  ],
  'annual-meeting': [
    [/^set annual meeting date/i, 'Done as the action opens, from the meeting on the calendar'],
    [/^send formal annual meeting notice/i, 'Ticks itself when the meeting’s notice is sent'],
    [/^conduct annual meeting/i, 'Ticks itself when the meeting is marked held'],
  ],
  move: [
    [/^schedule elevator reservation/i, 'Ticks itself when the move has an elevator slot or time window'],
    [/^collect move deposit/i, 'Ticks itself when the deposit is collected, or there is none'],
    [/^confirm mover insurance/i, 'Ticks itself when the mover’s insurance is confirmed'],
    [/^issue or revoke building access/i, 'Ticks itself when access is issued or revoked'],
    [/^complete pre\/post-move inspection/i, 'Ticks itself when the inspection passes or fails'],
    [/^record move event/i, 'Ticks itself when the deposit is settled after the inspection'],
  ],
  'reserve-study': [
    [/^commission or update professional reserve study/i, 'Ticks itself when a newer study is on file'],
    [/^disclose reserve health/i, 'Ticks itself when a reserve notice goes out to owners'],
  ],
  'elevator-inspection': [
    [/^identify all required inspections/i, 'Done as the action opens, from the maintenance schedule'],
    [/^engage qualified/i, 'Ticks itself when the schedule names a vendor'],
    [/^schedule inspection date/i, 'Ticks itself when the inspection is recorded as done'],
    [/^attend inspection/i, 'Ticks itself when the inspection is recorded as done'],
  ],
  'boiler-fire': [
    [/^identify all required inspections/i, 'Done as the action opens, from the maintenance schedule'],
    [/^engage qualified/i, 'Ticks itself when the schedule names a vendor'],
    [/^schedule inspection date/i, 'Ticks itself when the inspection is recorded as done'],
    [/^attend inspection/i, 'Ticks itself when the inspection is recorded as done'],
  ],
  filings: [],
};

/** Runbooks with no workflow situation and no automation yet: the plan, with the steps meant to be automated. */
const PLANNED: Record<string, [title: string, planned?: boolean][]> = {
  snow: [['Watch the forecast for the first freeze', true], ['Dispatch the snow vendor and salt the walks', true], ['Tell owners the plan and the parking rules', true]],
  'financial-review': [['Gather the year-end statements and ledgers', true], ['Engage the CPA for a review or audit'], ['Answer the reviewer’s questions'], ['Share the reviewed statements with owners', true]],
  payroll: [['Collect hours for the pay period', true], ['Approve the payroll'], ['Pay staff and withhold taxes', true], ['File the payroll taxes', true]],
  setup: [['Upload the governing documents', true], ['Review what the documents say', true], ['Add the units and owners', true], ['Invite the board'], ['Connect the bank and set dues', true], ['Set up email and mail'], ['Check the obligations', true], ['Invite the owners', true], ['Finish and go live']],
};

function situationSteps(sitId?: string): string[] {
  if (!sitId) return [];
  const sit = CATS.flatMap(c => c.sits).find(s => s.id === sitId) as { pre?: { s: string }[] } | undefined;
  return (sit?.pre ?? []).map(p => p.s);
}

export function runbookPlan(def: RunbookDef): RunbookPlan {
  const own = OWN[def.id];
  if (own) return { source: 'runbook', live: !!def.wired, steps: own.map(([title, how]) => ({ title, auto: !!how, how })) };
  const titles = situationSteps(def.sitId);
  if (def.wired && titles.length) {
    const ticks = TICKS[def.id] ?? [];
    return { source: 'workflow', live: true, steps: titles.map(title => { const t = ticks.find(([re]) => re.test(title)); return { title, auto: !!t, how: t?.[1] }; }) };
  }
  if (titles.length) return { source: 'workflow', live: false, steps: titles.map(title => ({ title, auto: false })) };
  const planned = PLANNED[def.id] ?? Array.from({ length: def.steps }, (_, i) => [`Step ${i + 1}`] as [string]);
  return { source: 'plan', live: false, steps: planned.map(([title, p]) => ({ title, auto: false, planned: !!p })) };
}

/** "3 of 5 automated" today, or the planned count for one that opens by hand. */
export function automationLine(def: RunbookDef, plan: RunbookPlan = runbookPlan(def)): { auto: number; total: number; planned: boolean } {
  const auto = plan.steps.filter(s => s.auto).length;
  if (plan.live) return { auto, total: plan.steps.length, planned: false };
  const plannedCount = plan.steps.some(s => s.planned) ? plan.steps.filter(s => s.planned).length : Math.min(def.automated, plan.steps.length);
  return { auto: plannedCount, total: plan.steps.length, planned: true };
}
