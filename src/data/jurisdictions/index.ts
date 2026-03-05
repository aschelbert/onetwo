export type { JurisdictionData, JurisdictionItemOverride, JurisdictionCoverage } from './types';

import type { JurisdictionData, JurisdictionCoverage } from './types';
import { dc } from './dc';
import { createGenericJurisdiction } from './_generic';

/**
 * Registry of jurisdictions with verified statute data.
 * To add a new state: create its data file, import it, and add an entry here.
 */
const registry: Record<string, JurisdictionData> = {
  'District of Columbia': dc,
};

/** Returns jurisdiction data for a state, or a generic fallback. */
export function getJurisdictionData(stateName: string): JurisdictionData {
  return registry[stateName] ?? createGenericJurisdiction(stateName);
}

/** Returns how complete the jurisdiction data is for a state. */
export function getJurisdictionCoverage(stateName: string): JurisdictionCoverage {
  return registry[stateName]?.coverage ?? 'generic';
}

/** Returns list of states with specific jurisdiction data. */
export function getSupportedJurisdictions(): string[] {
  return Object.keys(registry);
}
