/**
 * Milestones — static mapping of every runbook item and filing category
 * into season milestones.
 *
 * Each of the ~45 runbook items and each filing category appears in exactly
 * one milestone.  Items are grouped by due-month and compliance category,
 * targeting 3-5 milestones per season.
 *
 * With default settings (FY start Jan, annual meeting Apr):
 *   Filing   = Jan-Mar
 *   Annual Meeting = Apr-Jun
 *   Maintenance = Jul-Sep
 *   Budget   = Oct-Dec
 */

import type { BoardRoleKey } from '@/types/auth';

export type SeasonId = 'setup' | 'filing' | 'annual_meeting' | 'maintenance' | 'budget';

export type FlowId = 'runbook' | 'meeting' | 'vote' | 'budget' | 'close' | 'setup';

export interface MilestoneDef {
  id: string;
  seasonId: SeasonId;
  title: string;
  /** Runbook item ids that belong to this milestone */
  itemIds: string[];
  /** Filing categories that belong to this milestone */
  filingCategories?: string[];
  flowId: FlowId;
  order: number;
  dueRule: 'earliest_item' | 'latest_item' | 'fixed';
  fixedMonthDay?: string; // e.g. "03-15" for March 15
  ownerRole: BoardRoleKey;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILING SEASON (Q1 with defaults: Jan-Mar)
//
// Milestones:
//   1. New Year Governance Reset (Jan)
//   2. Tax & Regulatory Filings (Feb-Mar)
//   3. Owner Transparency & Disclosures (Jan-Mar)
//   4. Q1 Risk & Vendor Review (Mar)
// ═══════════════════════════════════════════════════════════════════════════

const filingMilestones: MilestoneDef[] = [
  {
    id: 'filing-governance-reset',
    seasonId: 'filing',
    title: 'New Year Governance Reset',
    itemIds: [
      'g1',  // Bylaws reviewed — due Jan 15
      'f1',  // Annual budget approved — due Jan 31
      'g7',  // Conflict of interest disclosures — due Feb 28
      'e1',  // Board fiduciary duties training — due Jan 31
      'l2',  // Legal counsel retained — due Jan 31
      'o4',  // Annual notice of owner rights — due Jan 31
    ],
    flowId: 'runbook',
    order: 1,
    dueRule: 'latest_item',
    ownerRole: 'president',
  },
  {
    id: 'filing-tax-regulatory',
    seasonId: 'filing',
    title: 'Tax & Regulatory Filings',
    itemIds: [
      'f5',  // Tax returns (1120-H) — due Apr 15 but prep in Q1
      'g8',  // Biennial report with DCRA — due Apr 1, prep in Q1
    ],
    filingCategories: ['tax', 'government'],
    flowId: 'runbook',
    order: 2,
    dueRule: 'earliest_item',
    ownerRole: 'treasurer',
  },
  {
    id: 'filing-owner-transparency',
    seasonId: 'filing',
    title: 'Owner Transparency & Disclosures',
    itemIds: [
      'r3',  // Annual disclosure statement — due Mar 31
      'r1',  // Owner records current — per transfer (ongoing)
      'r2',  // Meeting notices per statute — per meeting (ongoing)
    ],
    flowId: 'runbook',
    order: 3,
    dueRule: 'fixed',
    fixedMonthDay: '03-31',
    ownerRole: 'secretary',
  },
  {
    id: 'filing-q1-risk',
    seasonId: 'filing',
    title: 'Q1 Risk & Vendor Review',
    itemIds: [
      'i5',  // Vendor insurance certificates — due Mar 31
      'm5',  // Emergency preparedness plan — due Mar 31
    ],
    flowId: 'runbook',
    order: 4,
    dueRule: 'fixed',
    fixedMonthDay: '03-31',
    ownerRole: 'vice_president',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ANNUAL MEETING SEASON (Q2 with defaults: Apr-Jun)
//
// Milestones:
//   1. Annual Meeting Preparation (Apr)
//   2. Financial Review & Audit (May-Jun)
//   3. Safety & Compliance Inspections (Jun)
//   4. Mid-Year Legal & Policy Review (Jun)
// ═══════════════════════════════════════════════════════════════════════════

const annualMeetingMilestones: MilestoneDef[] = [
  {
    id: 'annual-meeting-prep',
    seasonId: 'annual_meeting',
    title: 'Annual Meeting Preparation',
    itemIds: [
      'g4',  // Annual meeting held — due Mar 31
      'g5',  // Board election conducted — due Dec 31, but election at annual meeting
    ],
    flowId: 'meeting',
    order: 1,
    dueRule: 'fixed',
    fixedMonthDay: '04-30',
    ownerRole: 'president',
  },
  {
    id: 'annual-financial-review',
    seasonId: 'annual_meeting',
    title: 'Financial Review & Audit',
    itemIds: [
      'f3',  // Annual financial audit — due Jun 30
      'f2',  // Reserve study current — due Jun 15
      'f6',  // Bank account reconciliation — monthly ongoing
      'f7',  // Assessment collection policy — as needed
    ],
    filingCategories: ['financial'],
    flowId: 'runbook',
    order: 2,
    dueRule: 'latest_item',
    ownerRole: 'treasurer',
  },
  {
    id: 'annual-safety-inspections',
    seasonId: 'annual_meeting',
    title: 'Safety & Compliance Inspections',
    itemIds: [
      'm1',  // Fire safety inspection — due Jun 30
      'm6',  // ADA compliance — due Jun 30
    ],
    filingCategories: ['inspection'],
    flowId: 'runbook',
    order: 3,
    dueRule: 'fixed',
    fixedMonthDay: '06-30',
    ownerRole: 'vice_president',
  },
  {
    id: 'annual-legal-policy',
    seasonId: 'annual_meeting',
    title: 'Mid-Year Legal & Policy Review',
    itemIds: [
      'g2',  // CC&Rs reviewed — due Jun 20
      'g9',  // Rules & Regulations reviewed — due Jun 30 (conditional)
      'l1',  // Fair Housing compliance — due Jun 30
      'r5',  // Document retention policy — due Jun 30
    ],
    flowId: 'runbook',
    order: 4,
    dueRule: 'latest_item',
    ownerRole: 'president',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE SEASON (Q3 with defaults: Jul-Sep)
//
// Milestones:
//   1. Elevator & Building Systems (Jul-Aug)
//   2. Insurance Renewals (Sep)
//   3. Vendor & Maintenance Management (Jul-Sep)
// ═══════════════════════════════════════════════════════════════════════════

const maintenanceMilestones: MilestoneDef[] = [
  {
    id: 'maint-building-systems',
    seasonId: 'maintenance',
    title: 'Elevator & Building Systems',
    itemIds: [
      'm2',  // Elevator inspection — due Aug 15
      'm3',  // Common area maintenance schedule — quarterly
    ],
    flowId: 'runbook',
    order: 1,
    dueRule: 'fixed',
    fixedMonthDay: '08-15',
    ownerRole: 'vice_president',
  },
  {
    id: 'maint-insurance-renewals',
    seasonId: 'maintenance',
    title: 'Insurance Renewals',
    itemIds: [
      'i1',  // D&O insurance — due Sep 30
      'i2',  // General liability — due Sep 30
      'i3',  // Property insurance — due Sep 30
      'i6',  // Umbrella/excess liability — due Sep 30 (conditional)
      'f4',  // Fidelity bond — due Sep 30
    ],
    flowId: 'runbook',
    order: 2,
    dueRule: 'fixed',
    fixedMonthDay: '09-30',
    ownerRole: 'treasurer',
  },
  {
    id: 'maint-vendor-contracts',
    seasonId: 'maintenance',
    title: 'Vendor & Maintenance Management',
    itemIds: [
      'm4',  // Vendor contracts verified — annual
      'o1',  // Respond to owner requests — per request (ongoing)
      'o2',  // Records available for inspection — as requested (ongoing)
      'o3',  // Enforce CC&Rs uniformly — ongoing
    ],
    flowId: 'runbook',
    order: 3,
    dueRule: 'fixed',
    fixedMonthDay: '09-30',
    ownerRole: 'vice_president',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET SEASON (Q4 with defaults: Oct-Dec)
//
// Milestones:
//   1. Budget Preparation & Approval (Oct-Nov)
//   2. Year-End Governance (Nov-Dec)
//   3. Year-End Compliance & Wrap-Up (Dec)
// ═══════════════════════════════════════════════════════════════════════════

const budgetMilestones: MilestoneDef[] = [
  {
    id: 'budget-preparation',
    seasonId: 'budget',
    title: 'Budget Preparation & Approval',
    itemIds: [
      'e2',  // Business judgment compliance — ongoing
      'e3',  // No self-dealing — ongoing
    ],
    flowId: 'budget',
    order: 1,
    dueRule: 'fixed',
    fixedMonthDay: '11-30',
    ownerRole: 'president',
  },
  {
    id: 'budget-year-end-governance',
    seasonId: 'budget',
    title: 'Year-End Governance',
    itemIds: [
      'g3',  // Minutes recorded & approved — per meeting (ongoing)
      'g6',  // Minimum board meetings held — ongoing
      'r4',  // Resale certificate process — per request (ongoing)
    ],
    flowId: 'runbook',
    order: 2,
    dueRule: 'fixed',
    fixedMonthDay: '12-31',
    ownerRole: 'secretary',
  },
  {
    id: 'budget-year-end-compliance',
    seasonId: 'budget',
    title: 'Year-End Compliance & Wrap-Up',
    itemIds: [
      'i4',  // Workers comp — due Dec 31
    ],
    flowId: 'close',
    order: 3,
    dueRule: 'fixed',
    fixedMonthDay: '12-31',
    ownerRole: 'president',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SETUP SEASON (only during onboarding)
// ═══════════════════════════════════════════════════════════════════════════

const setupMilestones: MilestoneDef[] = [
  {
    id: 'setup-building',
    seasonId: 'setup',
    title: 'Building Setup',
    itemIds: [],
    flowId: 'setup',
    order: 1,
    dueRule: 'fixed',
    ownerRole: 'president',
  },
];

/**
 * All milestone definitions. The setup milestone is always included;
 * seasons.ts filters it out when tenantStatus !== 'onboarding'.
 */
export const ALL_MILESTONES: MilestoneDef[] = [
  ...setupMilestones,
  ...filingMilestones,
  ...annualMeetingMilestones,
  ...maintenanceMilestones,
  ...budgetMilestones,
];

/**
 * Collect every itemId that appears in at least one milestone.
 * Used for verification: every id from refreshComplianceRequirements
 * should appear here.
 */
export function allMilestoneItemIds(): string[] {
  const ids = new Set<string>();
  for (const m of ALL_MILESTONES) {
    for (const id of m.itemIds) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Collect every filing category that appears in at least one milestone.
 */
export function allMilestoneFilingCategories(): string[] {
  const cats = new Set<string>();
  for (const m of ALL_MILESTONES) {
    if (m.filingCategories) {
      for (const c of m.filingCategories) {
        cats.add(c);
      }
    }
  }
  return [...cats];
}
