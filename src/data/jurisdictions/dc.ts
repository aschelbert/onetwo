import type { JurisdictionData } from './types';

/**
 * District of Columbia — verified statute references
 *
 * Primary act: DC Condominium Act (DC Code § 29-1101 et seq.)
 * Filing agency: DCRA (Department of Consumer and Regulatory Affairs)
 *
 * Sources: DC Code Title 29 (Condominiums), Title 42 (Real Property),
 *          DC Municipal Regulations, NFPA codes as adopted by DC
 */
export const dc: JurisdictionData = {
  name: 'District of Columbia',
  code: 'DC',
  primaryAct: 'DC Code § 29-1101 et seq.',
  actShortName: 'DC Code',
  filingAgency: 'DCRA',
  coverage: 'full',
  regulatoryNotes: [],
  items: {
    // ═══ GOVERNANCE & LEGAL ═══
    g2: {
      legalRef: 'DC Code § 29-1131',
    },
    g3: {
      legalRef: 'DC Code § 29-1108.06',
      tip: 'Prepare within 10 business days. Board majority approval required.',
    },
    g4: {
      legalRef: 'DC Code § 29-1109.02',
    },
    g6: {
      legalRef: '{bylawRef} Art. IV-V; DC Code § 29-1108.06',
      tip: 'Bylaws require bi-monthly (6/year). DC minimum quarterly (4/year). 48-hour notice.',
    },
    g7: {
      legalRef: 'DC Code § 29-406.70',
    },
    g8: {
      legalRef: 'DC Code § 29-102.11',
      tip: 'Biennial report to DCRA. $80 filing fee. Update officers.',
    },

    // ═══ FINANCIAL ═══
    f1: {
      legalRef: 'DC Code § 29-1135.03',
      tip: 'Distribute to owners 30 days before fiscal year.',
    },
    f2: {
      legalRef: 'DC Code § 29-1135.04',
    },
    f3: {
      legalRef: 'DC Code § 29-1135.05',
      tip: 'Required for associations with assessments >$150K.',
    },
    f4: {
      legalRef: 'DC Code § 29-1135.06',
    },
    f5: {
      legalRef: 'IRS § 528; DC Code § 47-1807.02',
      tip: 'Federal 1120-H and DC franchise tax (D-20, $250 minimum).',
    },
    f7: {
      legalRef: 'DC Code § 42-1903.13',
      tip: 'Late fee after 15 days. Lien notice after 60 days.',
    },

    // ═══ INSURANCE & RISK ═══
    i1: {
      legalRef: 'DC Code § 42-1903.10',
    },
    i2: {
      legalRef: 'DC Code § 29-1135.06',
    },
    i4: {
      legalRef: 'DC Workers Comp Act',
      tip: 'Required for ALL DC employers, including part-time.',
    },

    // ═══ MAINTENANCE & SAFETY ═══
    m1: {
      legalRef: 'DC Fire Code; NFPA 72',
    },
    m2: {
      legalRef: 'DC Code § 1-303.43',
      tip: 'DC-licensed inspector. Certificate posted in car.',
    },

    // ═══ RECORDS & COMMUNICATIONS ═══
    r1: {
      legalRef: 'DC Code § 29-1135.01',
      tip: 'Update within 30 days. Available for inspection upon 5 days notice.',
    },
    r2: {
      legalRef: 'DC Code § 29-1109.02(a)',
      tip: 'Annual: 10-60 days. Board: 48hrs. Special: 10 days. Emergency: reasonable.',
    },
    r3: {
      legalRef: 'DC Code § 29-1135.05',
      tip: 'Include: budget, reserves, insurance, pending litigation.',
    },
    r4: {
      legalRef: 'DC Code § 29-1141',
      tip: '10 business days. Fee ≤ statutory max.',
    },

    // ═══ OWNER RELATIONS ═══
    o2: {
      legalRef: 'DC Code § 42-1903.14',
    },
    o4: {
      legalRef: 'DC Code § 42-1903.14(c)',
    },

    // ═══ ETHICS & FIDUCIARY ═══
    e1: {
      legalRef: 'DC Code § 29-406.30',
    },
    e2: {
      legalRef: 'DC Code § 29-406.31',
    },
    e3: {
      legalRef: 'DC Code § 29-406.70',
    },

    // ═══ LEGAL & REGULATORY ═══
    l1: {
      legalRef: 'FHA; DC Human Rights Act',
      tip: 'DC HRA broader than FHA — includes source of income, personal appearance.',
    },
  },
};
