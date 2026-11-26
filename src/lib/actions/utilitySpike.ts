import type { Utility } from '@/lib/utilities';
import { stepsFrom, type ActionKind } from './types';

/** A utility bill far above usual: confirm it, find the cause, fix it, and check the next bill. */
export interface UtilitySpikeData {
  meterId: string;
  meterName: string;
  utility: Utility;
  unit: string;
  month: string;
  use: number;
  usual: number;
  cost: number;
  extraCost: number;
  /** Whether the bill itself is right: an actual read, a normal billing period, the right meter. */
  billRight: '' | 'yes' | 'no';
  billNote: string;
  checks: { label: string; note: string; done: boolean }[];
  cause: string;
  outcome: '' | 'repair' | 'expected';
  /** The maintenance repair opened for it. */
  repairId: string;
  expectedWhy: string;
  /** The next bill for the meter, once it is entered. */
  nextMonth: string;
  nextUse: number;
}

export const UTILITY_SPIKE: ActionKind<UtilitySpikeData> = {
  kind: 'utility-spike', runbookId: 'utility-spike', name: 'Utility spike',
  trigger: "A utility bill more than half again above the same month's usual", blurb: 'A bill far above usual: confirm the reading, find the cause, fix it and check the next bill.',
  catId: 'maintenance', role: 'Vice President', visibility: 'board',
  stepTitles: [['confirm', 'Confirm the bill is right'], ['cause', 'Find the cause'], ['fix', 'Fix it, or record why it was expected'], ['next', 'Check the next bill']],
  how: {
    confirm: 'Ticks itself when someone says whether the bill is right; a wrong bill closes the action here',
    cause: 'Ticks itself when what was found is written down',
    fix: 'Ticks itself when a repair is opened for it, or the reason it was expected is recorded',
    next: "Ticks itself when the meter's next bill is entered under Building › Care › Utilities",
  },
  blank: () => ({ meterId: '', meterName: '', utility: 'water', unit: 'gallons', month: '', use: 0, usual: 0, cost: 0, extraCost: 0, billRight: '', billNote: '', checks: [], cause: '', outcome: '', repairId: '', expectedWhy: '', nextMonth: '', nextUse: 0 }),
  steps: (r) => {
    const d = r.data;
    if (d.billRight === 'no') return stepsFrom(UTILITY_SPIKE, { confirm: [true, `The bill was wrong${d.billNote ? `: ${d.billNote}` : ''}`], cause: [true, 'Nothing to find'], fix: [true, 'Nothing to fix'], next: [true, 'Not needed'] });
    const back = d.nextMonth ? d.nextUse <= d.usual * 1.5 : false;
    return stepsFrom(UTILITY_SPIKE, {
      confirm: [d.billRight === 'yes', d.billRight ? 'An actual read for a normal period' : ''],
      cause: [!!d.cause.trim(), d.cause.trim(), !d.billRight ? 'the bill being confirmed' : ''],
      fix: [!!d.outcome, d.outcome === 'repair' ? 'A repair was opened for it' : d.outcome === 'expected' ? `Expected: ${d.expectedWhy}` : '', !d.cause.trim() ? 'the cause being found' : ''],
      next: [!!d.nextMonth, d.nextMonth ? `${d.nextMonth}: ${d.nextUse.toLocaleString('en-US')} ${d.unit} · ${back ? 'back in range' : 'still high'}` : '', !d.outcome ? 'the fix' : "the meter's next bill"],
    });
  },
};
