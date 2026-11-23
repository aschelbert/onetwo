/** How the app ticks each step of a capital improvement: shown on the action's steps and in the runbook's plan. */
import { STEP_ORDER, STEP_TITLE } from '@/lib/capitalProject';

export const CAPITAL_HOW: Record<string, string> = {
  need: 'Done as the action opens, from what was entered when the project was started',
  options: 'Ticks itself when an option is chosen on the action',
  funding: 'Ticks itself when the way of paying and the date it was decided are entered',
  permit: 'Ticks itself when the permit questions are answered',
  bids: 'Ticks itself when the scope is written and enough bids are in',
  award: "Ticks itself when a bid is awarded and the contract's date is entered; raises the work order",
  owners: 'Ticks itself when the notice date is entered, or owners are marked as not affected',
  work: 'Ticks itself when the start date is entered; held until any permit is on file',
  pay: "Ticks itself when the work is signed off and the work order is paid; held until any permit's final inspection",
  closeout: 'Ticks itself at close-out, which resets the reserve component and the asset',
};

/** The runbook's plan rows: every step, and how the app ticks it. */
export const CAPITAL_PLAN: [string, string][] = STEP_ORDER.map(k => [STEP_TITLE[k], CAPITAL_HOW[k]]);

