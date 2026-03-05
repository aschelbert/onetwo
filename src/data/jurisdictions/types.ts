/**
 * Jurisdiction Data Types
 *
 * Defines the shape of jurisdiction-specific statute references and overrides
 * used by the compliance engine. Each supported jurisdiction provides real,
 * verified statute citations rather than generic placeholders.
 */

/** Override fields for a specific compliance item */
export interface JurisdictionItemOverride {
  legalRef: string;
  tip?: string;
  due?: string;
  consequence?: string;
  howTo?: string[];
  freq?: string;
}

/** How complete the jurisdiction data is */
export type JurisdictionCoverage = 'full' | 'partial' | 'generic';

/** Complete jurisdiction data for one state/territory */
export interface JurisdictionData {
  /** Display name (e.g. "District of Columbia") */
  name: string;
  /** Short code (e.g. "DC") */
  code: string;
  /** Primary condo act citation (e.g. "DC Code § 29-1101 et seq.") */
  primaryAct: string;
  /** Short form for inline references (e.g. "DC Code") */
  actShortName: string;
  /** State filing agency (e.g. "DCRA") */
  filingAgency: string;
  /** How complete this data is */
  coverage: JurisdictionCoverage;
  /** Notes about the jurisdiction's regulatory environment */
  regulatoryNotes: string[];
  /** Per-item overrides keyed by compliance item ID (e.g. "g3", "f1") */
  items: Record<string, JurisdictionItemOverride>;
}
