import { describe, it, expect } from 'vitest';
import { actionForLateUnit, type LateUnitInput } from '@/lib/collections';

function makeInput(overrides: Partial<LateUnitInput> = {}): LateUnitInput {
  return {
    daysPastDue: 15,
    balance: 500,
    remindersSent: 0,
    waiverPending: false,
    priorLateCount: 0,
    ...overrides,
  };
}

describe('actionForLateUnit', () => {
  it('returns friendly_reminder for < 30 days past due', () => {
    expect(actionForLateUnit(makeInput({ daysPastDue: 10 }))).toBe('friendly_reminder');
    expect(actionForLateUnit(makeInput({ daysPastDue: 1 }))).toBe('friendly_reminder');
    expect(actionForLateUnit(makeInput({ daysPastDue: 29 }))).toBe('friendly_reminder');
  });

  it('returns friendly_reminder for first-time offender with no reminders', () => {
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 5, priorLateCount: 0, remindersSent: 0 })),
    ).toBe('friendly_reminder');
  });

  it('returns hold_vote_pending when a waiver is pending', () => {
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 45, waiverPending: true })),
    ).toBe('hold_vote_pending');
  });

  it('returns hold_vote_pending even at 90+ days if waiver pending', () => {
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 100, waiverPending: true })),
    ).toBe('hold_vote_pending');
  });

  it('returns second_notice for 30-59 days past due', () => {
    expect(actionForLateUnit(makeInput({ daysPastDue: 30 }))).toBe('second_notice');
    expect(actionForLateUnit(makeInput({ daysPastDue: 45 }))).toBe('second_notice');
    expect(actionForLateUnit(makeInput({ daysPastDue: 59 }))).toBe('second_notice');
  });

  it('returns late_fee_and_demand for 60-89 days past due', () => {
    expect(actionForLateUnit(makeInput({ daysPastDue: 60 }))).toBe('late_fee_and_demand');
    expect(actionForLateUnit(makeInput({ daysPastDue: 75 }))).toBe('late_fee_and_demand');
    expect(actionForLateUnit(makeInput({ daysPastDue: 89 }))).toBe('late_fee_and_demand');
  });

  it('returns refer_to_collections_case for 90+ days past due', () => {
    expect(actionForLateUnit(makeInput({ daysPastDue: 90 }))).toBe('refer_to_collections_case');
    expect(actionForLateUnit(makeInput({ daysPastDue: 180 }))).toBe('refer_to_collections_case');
  });

  it('waiver pending takes priority over all day-based rules', () => {
    // Under 30
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 10, waiverPending: true })),
    ).toBe('hold_vote_pending');
    // 30-59
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 45, waiverPending: true })),
    ).toBe('hold_vote_pending');
    // 60-89
    expect(
      actionForLateUnit(makeInput({ daysPastDue: 70, waiverPending: true })),
    ).toBe('hold_vote_pending');
  });
});
