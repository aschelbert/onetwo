/**
 * Collections logic -- determines the recommended action for a late unit
 * based on days past due, balance, prior reminders, waiver status, and
 * prior late-payment history.
 */

export type CollectionAction =
  | 'friendly_reminder'
  | 'hold_vote_pending'
  | 'second_notice'
  | 'late_fee_and_demand'
  | 'refer_to_collections_case';

export interface LateUnitInput {
  daysPastDue: number;
  balance: number;
  remindersSent: number;
  waiverPending: boolean;
  priorLateCount: number;
}

export interface CollectionSettings {
  lateFeeAmount?: number;
}

/**
 * Given a late unit's status, return the single best action to take.
 *
 * Rules (in priority order):
 * 1. If a waiver is pending board vote -> hold_vote_pending
 * 2. < 30 days OR first-time late with 0 reminders -> friendly_reminder
 * 3. 30-59 days -> second_notice
 * 4. 60-89 days -> late_fee_and_demand
 * 5. 90+ days with no existing collections case -> refer_to_collections_case
 */
export function actionForLateUnit(
  input: LateUnitInput,
  _settings?: CollectionSettings,
): CollectionAction {
  const { daysPastDue, remindersSent, waiverPending, priorLateCount } = input;

  // If a waiver vote is pending, hold until the board decides
  if (waiverPending) {
    return 'hold_vote_pending';
  }

  // 90+ days: escalate to collections
  if (daysPastDue >= 90) {
    return 'refer_to_collections_case';
  }

  // 60-89 days: late fee and formal demand
  if (daysPastDue >= 60) {
    return 'late_fee_and_demand';
  }

  // 30-59 days: second notice
  if (daysPastDue >= 30) {
    return 'second_notice';
  }

  // Under 30 days or first offender with no reminders yet
  if (daysPastDue < 30 || (priorLateCount === 0 && remindersSent === 0)) {
    return 'friendly_reminder';
  }

  return 'friendly_reminder';
}

/** Human-readable label for each action */
export const ACTION_LABELS: Record<CollectionAction, string> = {
  friendly_reminder: 'Friendly reminder',
  hold_vote_pending: 'Hold -- vote pending',
  second_notice: 'Second notice',
  late_fee_and_demand: 'Late fee + demand letter',
  refer_to_collections_case: 'Refer to collections',
};
