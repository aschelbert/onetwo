import { describe, it, expect } from 'vitest';
import {
  nextRegularMeetingDates,
  earliestLegalDate,
  DEFAULT_SETTINGS,
  type BuildingSettings,
} from '@/lib/buildingSettings';

describe('nextRegularMeetingDates', () => {
  it('monthly cadence returns monthly dates', () => {
    const settings: BuildingSettings = {
      ...DEFAULT_SETTINGS,
      meetingCadence: 'monthly',
      meetingWeekday: 2, // Tuesday
      meetingWeekOfMonth: 3, // 3rd week
    };

    const from = new Date(2026, 0, 1); // Jan 1 local
    const dates = nextRegularMeetingDates(settings, from, 3);

    expect(dates).toHaveLength(3);
    // Each date should be a Tuesday
    for (const d of dates) {
      expect(d.getDay()).toBe(2);
    }
    // Months should be consecutive
    expect(dates[0].getMonth()).toBe(0); // January
    expect(dates[1].getMonth()).toBe(1); // February
    expect(dates[2].getMonth()).toBe(2); // March
  });

  it('quarterly cadence returns every 3 months', () => {
    const settings: BuildingSettings = {
      ...DEFAULT_SETTINGS,
      meetingCadence: 'quarterly',
      meetingWeekday: null,
      meetingWeekOfMonth: null,
    };

    const from = new Date(2026, 0, 15); // Jan 15 local
    const dates = nextRegularMeetingDates(settings, from, 4);

    expect(dates).toHaveLength(4);
    // No weekday specified, so first of month
    expect(dates[1].getMonth() - dates[0].getMonth()).toBe(3);
  });

  it('bimonthly cadence returns every 2 months', () => {
    const settings: BuildingSettings = {
      ...DEFAULT_SETTINGS,
      meetingCadence: 'bimonthly',
      meetingWeekday: null,
      meetingWeekOfMonth: null,
    };

    const from = new Date(2026, 2, 1); // Mar 1 local
    const dates = nextRegularMeetingDates(settings, from, 3);

    expect(dates).toHaveLength(3);
    expect(dates[0].getMonth()).toBe(2); // March
    expect(dates[1].getMonth()).toBe(4); // May
    expect(dates[2].getMonth()).toBe(6); // July
  });

  it('skips past dates when first meeting is before from', () => {
    const settings: BuildingSettings = {
      ...DEFAULT_SETTINGS,
      meetingCadence: 'monthly',
      meetingWeekday: 1, // Monday
      meetingWeekOfMonth: 1, // 1st week
    };

    // If from is Jan 15, the 1st Monday of Jan is before that,
    // so the first result should be in February
    const from = new Date(2026, 0, 15); // Jan 15 local
    const dates = nextRegularMeetingDates(settings, from, 2);

    expect(dates).toHaveLength(2);
    expect(dates[0].getMonth()).toBe(1); // February
  });
});

describe('earliestLegalDate', () => {
  it('board notice adds hours', () => {
    const settings: BuildingSettings = { ...DEFAULT_SETTINGS, boardNoticeHours: 48 };
    const from = new Date('2026-06-01T10:00:00');
    const result = earliestLegalDate(settings, 'board', from);

    const diffHours = (result.getTime() - from.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(48);
  });

  it('annual notice adds minimum days', () => {
    const settings: BuildingSettings = { ...DEFAULT_SETTINGS, annualNoticeMinDays: 10 };
    const from = new Date('2026-06-01');
    const result = earliestLegalDate(settings, 'annual', from);

    const diffDays = (result.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(10);
  });

  it('budget_adoption adds review days', () => {
    const settings: BuildingSettings = { ...DEFAULT_SETTINGS, budgetOwnerReviewDays: 30 };
    const from = new Date('2026-06-01');
    const result = earliestLegalDate(settings, 'budget_adoption', from);

    const diffDays = (result.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(30);
  });

  it('respects custom notice hours', () => {
    const settings: BuildingSettings = { ...DEFAULT_SETTINGS, boardNoticeHours: 72 };
    const from = new Date('2026-06-01T10:00:00');
    const result = earliestLegalDate(settings, 'board', from);

    const diffHours = (result.getTime() - from.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(72);
  });
});
