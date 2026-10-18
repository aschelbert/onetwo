/**
 * Building Settings -- bylaws facts stored in financial_settings.
 */

import { supabase, logDbError } from '@/lib/supabase';

export interface BuildingSettings {
  spendingLimit: number;
  quorumPct: number;
  fiscalYearStartMonth: number;
  annualMeetingMonth: number;
  meetingCadence: 'monthly' | 'bimonthly' | 'quarterly';
  meetingWeekday: number | null;
  meetingWeekOfMonth: number | null;
  meetingTime: string;
  boardNoticeHours: number;
  annualNoticeMinDays: number;
  annualNoticeMaxDays: number;
  budgetOwnerReviewDays: number;
}

export const DEFAULT_SETTINGS: BuildingSettings = {
  spendingLimit: 5000,
  quorumPct: 25,
  fiscalYearStartMonth: 1,
  annualMeetingMonth: 4,
  meetingCadence: 'monthly',
  meetingWeekday: null,
  meetingWeekOfMonth: null,
  meetingTime: '19:00',
  boardNoticeHours: 48,
  annualNoticeMinDays: 10,
  annualNoticeMaxDays: 60,
  budgetOwnerReviewDays: 30,
};

export async function fetchBuildingSettings(tenantId: string): Promise<BuildingSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('financial_settings')
    .select('spending_limit, quorum_pct, fiscal_year_start_month, annual_meeting_month, meeting_cadence, meeting_weekday, meeting_week_of_month, meeting_time, board_notice_hours, annual_notice_min_days, annual_notice_max_days, budget_owner_review_days')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logDbError('fetchBuildingSettings error:', error);
    return null;
  }
  if (!data) return null;

  return {
    spendingLimit: data.spending_limit ?? DEFAULT_SETTINGS.spendingLimit,
    quorumPct: data.quorum_pct ?? DEFAULT_SETTINGS.quorumPct,
    fiscalYearStartMonth: data.fiscal_year_start_month ?? DEFAULT_SETTINGS.fiscalYearStartMonth,
    annualMeetingMonth: data.annual_meeting_month ?? DEFAULT_SETTINGS.annualMeetingMonth,
    meetingCadence: data.meeting_cadence ?? DEFAULT_SETTINGS.meetingCadence,
    meetingWeekday: data.meeting_weekday ?? null,
    meetingWeekOfMonth: data.meeting_week_of_month ?? null,
    meetingTime: data.meeting_time ?? DEFAULT_SETTINGS.meetingTime,
    boardNoticeHours: data.board_notice_hours ?? DEFAULT_SETTINGS.boardNoticeHours,
    annualNoticeMinDays: data.annual_notice_min_days ?? DEFAULT_SETTINGS.annualNoticeMinDays,
    annualNoticeMaxDays: data.annual_notice_max_days ?? DEFAULT_SETTINGS.annualNoticeMaxDays,
    budgetOwnerReviewDays: data.budget_owner_review_days ?? DEFAULT_SETTINGS.budgetOwnerReviewDays,
  };
}

export async function upsertBuildingSettings(tenantId: string, partial: Partial<BuildingSettings>): Promise<boolean> {
  if (!supabase) return false;

  const row: Record<string, unknown> = { tenant_id: tenantId };
  if (partial.spendingLimit !== undefined) row.spending_limit = partial.spendingLimit;
  if (partial.quorumPct !== undefined) row.quorum_pct = partial.quorumPct;
  if (partial.fiscalYearStartMonth !== undefined) row.fiscal_year_start_month = partial.fiscalYearStartMonth;
  if (partial.annualMeetingMonth !== undefined) row.annual_meeting_month = partial.annualMeetingMonth;
  if (partial.meetingCadence !== undefined) row.meeting_cadence = partial.meetingCadence;
  if (partial.meetingWeekday !== undefined) row.meeting_weekday = partial.meetingWeekday;
  if (partial.meetingWeekOfMonth !== undefined) row.meeting_week_of_month = partial.meetingWeekOfMonth;
  if (partial.meetingTime !== undefined) row.meeting_time = partial.meetingTime;
  if (partial.boardNoticeHours !== undefined) row.board_notice_hours = partial.boardNoticeHours;
  if (partial.annualNoticeMinDays !== undefined) row.annual_notice_min_days = partial.annualNoticeMinDays;
  if (partial.annualNoticeMaxDays !== undefined) row.annual_notice_max_days = partial.annualNoticeMaxDays;
  if (partial.budgetOwnerReviewDays !== undefined) row.budget_owner_review_days = partial.budgetOwnerReviewDays;

  const { error } = await supabase
    .from('financial_settings')
    .upsert(row, { onConflict: 'tenant_id' });

  if (error) {
    logDbError('upsertBuildingSettings error:', error);
    return false;
  }
  return true;
}

/**
 * Next N regular meeting dates from a given start date, based on cadence settings.
 */
export function nextRegularMeetingDates(
  settings: BuildingSettings,
  from: Date,
  count: number
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(from);

  const monthIncrement = settings.meetingCadence === 'monthly' ? 1
    : settings.meetingCadence === 'bimonthly' ? 2
    : 3; // quarterly

  for (let n = 0; n < count; n++) {
    // Find the next meeting month
    if (n > 0) {
      cursor = new Date(cursor);
      cursor.setDate(1); // Prevent day overflow when advancing months
      cursor.setMonth(cursor.getMonth() + monthIncrement);
    }

    let meetingDate: Date;

    if (settings.meetingWeekday != null && settings.meetingWeekOfMonth != null) {
      // Specific weekday and week of month
      meetingDate = nthWeekdayOfMonth(
        cursor.getFullYear(),
        cursor.getMonth(),
        settings.meetingWeekday,
        settings.meetingWeekOfMonth
      );
    } else {
      // Default to first day of the month
      meetingDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    }

    // If the computed date is before "from", move to the next period
    if (meetingDate < from && n === 0) {
      cursor.setDate(1); // Prevent day overflow when advancing months
      cursor.setMonth(cursor.getMonth() + monthIncrement);
      if (settings.meetingWeekday != null && settings.meetingWeekOfMonth != null) {
        meetingDate = nthWeekdayOfMonth(
          cursor.getFullYear(),
          cursor.getMonth(),
          settings.meetingWeekday,
          settings.meetingWeekOfMonth
        );
      } else {
        meetingDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      }
    }

    dates.push(meetingDate);
  }

  return dates;
}

/**
 * Earliest legal date for a notice type.
 */
export function earliestLegalDate(
  settings: BuildingSettings,
  kind: 'board' | 'annual' | 'budget_adoption',
  from: Date
): Date {
  const result = new Date(from);

  switch (kind) {
    case 'board':
      // board_notice_hours ahead
      result.setTime(result.getTime() + settings.boardNoticeHours * 60 * 60 * 1000);
      break;
    case 'annual':
      // annual_notice_min_days ahead
      result.setDate(result.getDate() + settings.annualNoticeMinDays);
      break;
    case 'budget_adoption':
      // budget_owner_review_days ahead
      result.setDate(result.getDate() + settings.budgetOwnerReviewDays);
      break;
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function nthWeekdayOfMonth(year: number, month: number, weekday: number, weekNum: number): Date {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  let day = 1 + ((weekday - firstDay + 7) % 7);
  day += (weekNum - 1) * 7;

  // Clamp to the month
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day > lastDay) day = lastDay;

  return new Date(year, month, day);
}
