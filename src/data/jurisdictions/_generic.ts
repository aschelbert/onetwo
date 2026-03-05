import type { JurisdictionData } from './types';

/**
 * Creates a generic JurisdictionData for states without specific statute data.
 * All compliance items keep their base/generic values — no item overrides.
 */
export function createGenericJurisdiction(stateName: string): JurisdictionData {
  return {
    name: stateName,
    code: stateName,
    primaryAct: `${stateName} Condo Act`,
    actShortName: `${stateName} Code`,
    filingAgency: `${stateName} Secretary of State`,
    coverage: 'generic',
    regulatoryNotes: [
      `Jurisdiction-specific statutes for ${stateName} are not yet available. Consult local counsel.`,
    ],
    items: {},
  };
}
