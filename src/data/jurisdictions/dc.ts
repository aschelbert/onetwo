import type { JurisdictionData } from './types';

/**
 * District of Columbia — statute references
 *
 * Primary act: Condominium Act of 1976, DC Code § 42-1901.01 et seq.
 *   (Title 42, Chapter 19. Note: DC Code § 29-1101 et seq. is the Uniform
 *   Unincorporated Nonprofit Association Act, not the Condominium Act.)
 * Corporate filings: DC Code Title 29 (biennial report § 29-102.11; nonprofit
 *   director duties §§ 29-406.30, 29-406.31, 29-406.70, which apply only when the
 *   association is incorporated as a DC nonprofit corporation).
 * Filing agency: DLCP (Department of Licensing and Consumer Protection), which
 *   took over corporate filings from DCRA on October 1, 2022.
 *
 * Where DC law sets no rule (reserve studies, fidelity bonds, annual disclosure
 * statements, an annual owner-rights notice), the reference points to the
 * association's own documents and says so, rather than citing a statute.
 *
 * Reviewed 2026-11-14 against code.dccouncil.gov. Have association counsel
 * confirm before relying on any of this as legal advice.
 */
export const dc: JurisdictionData = {
  name: 'District of Columbia',
  code: 'DC',
  primaryAct: 'DC Code § 42-1901.01 et seq.',
  actShortName: 'DC Code',
  filingAgency: 'DLCP',
  coverage: 'full',
  regulatoryNotes: [],
  items: {
    // ═══ GOVERNANCE & LEGAL ═══
    g2: {
      legalRef: 'Declaration and {bylawRef}; DC Code § 42-1901.01 et seq.',
    },
    g3: {
      legalRef: 'DC Code § 42-1903.03(b)',
      tip: 'Minutes must be recorded and available for owners in good standing to examine and copy. The board approves them at its next meeting.',
    },
    g4: {
      legalRef: 'DC Code § 42-1903.03(a)',
      tip: 'Owners must meet at least once a year. Send notice at least 21 days before an annual or regularly scheduled meeting.',
    },
    g6: {
      legalRef: '{bylawRef}; DC Code § 42-1903.03',
      tip: 'The bylaws set how often the board meets. Board meetings are open to owners in good standing, with time for owner comment; executive session only for the reasons the statute lists.',
    },
    g7: {
      legalRef: 'DC Code § 29-406.70 (if incorporated as a DC nonprofit)',
    },
    g8: {
      legalRef: 'DC Code § 29-102.11',
      tip: 'Biennial report to DLCP, due April 1. Update officers and registered agent.',
    },

    // ═══ FINANCIAL ═══
    f1: {
      legalRef: 'DC Code § 42-1903.08(a)(2); {bylawRef}',
      tip: 'The board adopts the budget for revenues, expenditures and reserves. When it goes to owners is set by the bylaws.',
    },
    f2: {
      legalRef: '{bylawRef}; DC Code § 42-1903.08 (no statutory study requirement)',
      tip: 'DC law does not require a reserve study; check the declaration and bylaws. Reserves are disclosed on every resale certificate (§ 42-1904.11).',
    },
    f3: {
      legalRef: 'DC Code § 42-1903.14; {bylawRef}',
      tip: 'Owners holding 33⅓% of the votes (or less, if the instruments say so) can require an independent audit. Otherwise follow the bylaws.',
    },
    f4: {
      legalRef: '{bylawRef} (no DC statutory requirement)',
      tip: 'No DC statute requires a fidelity bond. Check the declaration, bylaws and any mortgage lender requirements.',
    },
    f5: {
      legalRef: 'IRS § 528; DC Code § 47-1807.02',
      tip: 'Federal 1120-H and DC franchise tax (D-20, $250 minimum).',
    },
    f7: {
      legalRef: 'DC Code §§ 42-1903.12(e), 42-1903.13',
      tip: 'Unless the instruments say otherwise, an assessment is past due on the 15th day and bears interest up to 10% a year. Unpaid assessments are a lien; enforcement must start within 3 years.',
    },

    // ═══ INSURANCE & RISK ═══
    i1: {
      legalRef: 'Best practice; {bylawRef}',
    },
    i2: {
      legalRef: 'DC Code § 42-1903.10(b)',
      tip: 'Unless the instruments say otherwise: property insurance on the common elements (at least 90% of replacement cost after deductibles) and liability insurance at a limit the board sets, not below any minimum in the instruments.',
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
      legalRef: 'DC Construction Codes; inspector licensing DC Code § 47-2853.95 et seq.',
      tip: 'Use a DC-licensed elevator inspector and keep the current inspection certificate on file.',
    },

    // ═══ RECORDS & COMMUNICATIONS ═══
    r1: {
      legalRef: 'DC Code § 42-1903.14',
      tip: 'The association must keep detailed records of receipts and expenditures. Books and records are open to owners in good standing for a proper purpose.',
    },
    r2: {
      legalRef: 'DC Code § 42-1903.03',
      tip: 'Owner meetings: notice of time, place and purpose at least 21 days before annual or regular meetings, 7 days before others. Board meetings: publish the time and place and make the agenda available.',
    },
    r3: {
      legalRef: '{bylawRef} (no DC statutory annual disclosure)',
      tip: 'DC law has no annual disclosure statement requirement; follow the bylaws. Budget and reserve figures are disclosed on resale (§ 42-1904.11).',
    },
    r4: {
      legalRef: 'DC Code § 42-1904.11',
      tip: 'Provide the resale certificate within 10 days of the request; the seller must deliver it to the buyer by the 10th business day after the contract. A reasonable fee may be charged.',
    },

    // ═══ OWNER RELATIONS ═══
    o2: {
      legalRef: 'DC Code § 42-1903.14',
      tip: 'Open to owners in good standing for a proper purpose, during reasonable hours on business days. Some records may be withheld (§ 42-1903.14(c)). Copies at actual cost.',
      due: 'Per request',
    },
    o4: {
      legalRef: 'D.C. Law 21-241 (Owner Bill of Rights); no annual notice required',
      tip: 'DC law lists owner rights but does not require an annual notice. Sending one is good practice.',
    },

    // ═══ ETHICS & FIDUCIARY ═══
    e1: {
      legalRef: 'DC Code §§ 42-1903.08, 29-406.30',
    },
    e2: {
      legalRef: 'DC Code § 29-406.31 (if incorporated as a DC nonprofit)',
    },
    e3: {
      legalRef: 'DC Code § 29-406.70 (if incorporated as a DC nonprofit)',
    },

    // ═══ LEGAL & REGULATORY ═══
    l1: {
      legalRef: 'FHA; DC Human Rights Act',
      tip: 'DC HRA broader than FHA — includes source of income, personal appearance.',
    },
  },
};
