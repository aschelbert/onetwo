export type { JurisdictionData, JurisdictionItemOverride, JurisdictionCoverage } from './types';

import type { JurisdictionData, JurisdictionCoverage } from './types';
import { dc } from './dc';
import { createGenericJurisdiction } from './_generic';
import { toStateCode } from '@/lib/usStates';

/**
 * Registry of jurisdictions with verified statute data.
 * To add a new state: create its data file, import it, and add an entry here.
 */
const registry: Record<string, JurisdictionData> = {
  DC: dc,
};

/**
 * The building's state is free text ("DC", "District of Columbia", "Washington, DC"),
 * so every lookup goes through the two-letter code.
 */
const lookup = (state: string): JurisdictionData | undefined => registry[toStateCode(state)];

/** Returns jurisdiction data for a state (name or code), or a generic fallback. */
export function getJurisdictionData(stateName: string): JurisdictionData {
  return lookup(stateName) ?? createGenericJurisdiction(stateName);
}

/** Returns how complete the jurisdiction data is for a state. */
export function getJurisdictionCoverage(stateName: string): JurisdictionCoverage {
  return lookup(stateName)?.coverage ?? 'generic';
}

/** Returns list of states with specific jurisdiction data. */
export function getSupportedJurisdictions(): string[] {
  return Object.values(registry).map(j => j.name);
}

/** The bylaws' usual notice period, used when neither the meeting type nor the state asks for more. */
export const BYLAWS_NOTICE_DAYS = 10;

/**
 * Days of notice a meeting needs: the longer of the bylaws' period and what the
 * state requires for that kind of meeting. Only an annual meeting is treated as
 * the statute's "annual or regularly scheduled" owner meeting; board meetings
 * follow the bylaws.
 */
export function noticeLeadDays(meetingType: string, state: string = ''): number {
  const rule = lookup(state)?.meetingNotice;
  if (!rule) return BYLAWS_NOTICE_DAYS;
  if (meetingType === 'ANNUAL') return Math.max(BYLAWS_NOTICE_DAYS, rule.annualOrRegularDays);
  if (meetingType === 'SPECIAL') return Math.max(BYLAWS_NOTICE_DAYS, rule.otherOwnerDays);
  return BYLAWS_NOTICE_DAYS;
}
