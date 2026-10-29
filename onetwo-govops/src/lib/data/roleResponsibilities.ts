// ============================================================================
// roleResponsibilities.ts
// High-level responsibility definitions for each board role and unit owners.
// This is NOT the task-level runbook — it defines what each role is
// accountable for (fiduciary duties, decision authority, governance).
// ============================================================================

export type FiduciaryDuty = 'care' | 'loyalty' | 'obedience'

export interface ResponsibilityGroup {
  category: string
  fiduciaryDuty?: FiduciaryDuty
  items: string[]
}

export interface RoleResponsibility {
  roleKey: string
  title: string
  fiduciaryFocus: FiduciaryDuty
  responsibilities: ResponsibilityGroup[]
}

export interface OwnerResponsibilityGroup {
  category: string
  items: string[]
}

// ─── Board Role Responsibilities ────────────────────────────────────────────

export const BOARD_ROLE_RESPONSIBILITIES: RoleResponsibility[] = [
  {
    roleKey: 'President',
    title: 'President',
    fiduciaryFocus: 'care',
    responsibilities: [
      {
        category: 'Overall Governance',
        fiduciaryDuty: 'care',
        items: [
          'Set board meeting agendas and preside over all board and annual meetings',
          'Ensure the board fulfills its fiduciary obligations to the association',
          'Coordinate with legal counsel on governance matters',
          'Serve as primary signatory on association contracts and filings',
        ],
      },
      {
        category: 'Legal Compliance',
        fiduciaryDuty: 'obedience',
        items: [
          'Ensure timely state filings and corporate registrations',
          'Oversee Fair Housing compliance across all association operations',
          'Maintain D&O and general liability insurance coverage',
          'Coordinate annual fiduciary training for board members',
        ],
      },
      {
        category: 'Emergency & Risk',
        fiduciaryDuty: 'care',
        items: [
          'Oversee emergency preparedness planning and updates',
          'Authorize emergency expenditures within board-approved limits',
          'Serve as primary liaison with legal counsel during disputes or litigation',
        ],
      },
    ],
  },
  {
    roleKey: 'Vice President',
    title: 'Vice President',
    fiduciaryFocus: 'care',
    responsibilities: [
      {
        category: 'Maintenance & Safety',
        fiduciaryDuty: 'care',
        items: [
          'Oversee building maintenance programs and vendor performance',
          'Monitor fire safety, elevator, and ADA compliance inspections',
          'Review and approve vendor contracts and certificates of insurance',
          'Coordinate capital improvement projects approved by the board',
        ],
      },
      {
        category: 'Owner Relations',
        fiduciaryDuty: 'loyalty',
        items: [
          'Ensure timely response to owner requests and complaints',
          'Oversee CC&R enforcement and violation notification process',
          'Act as liaison between owners and the board on operational matters',
        ],
      },
      {
        category: 'Operations',
        fiduciaryDuty: 'care',
        items: [
          'Assume presidential duties in the president\'s absence',
          'Oversee day-to-day operations when no management company is retained',
          'Monitor service contracts for renewal dates and performance standards',
        ],
      },
    ],
  },
  {
    roleKey: 'Treasurer',
    title: 'Treasurer',
    fiduciaryFocus: 'loyalty',
    responsibilities: [
      {
        category: 'Financial Oversight',
        fiduciaryDuty: 'loyalty',
        items: [
          'Prepare and present the annual operating budget to the board',
          'Monitor reserve fund adequacy and commission reserve studies',
          'Oversee annual financial audit or review engagement',
          'Ensure timely filing of tax returns (Form 1120-H or 1120)',
        ],
      },
      {
        category: 'Banking & Controls',
        fiduciaryDuty: 'loyalty',
        items: [
          'Maintain fidelity bond coverage per governing documents',
          'Perform or oversee monthly bank reconciliations',
          'Manage assessment collection and delinquency follow-up',
          'Authorize expenditures within board-approved budget limits',
        ],
      },
      {
        category: 'Reporting',
        fiduciaryDuty: 'care',
        items: [
          'Present monthly financial statements to the board',
          'Provide annual financial disclosures to all owners',
          'Report reserve fund status and investment performance quarterly',
        ],
      },
    ],
  },
  {
    roleKey: 'Secretary',
    title: 'Secretary',
    fiduciaryFocus: 'obedience',
    responsibilities: [
      {
        category: 'Records & Minutes',
        fiduciaryDuty: 'obedience',
        items: [
          'Record and distribute minutes for all board and membership meetings',
          'Maintain the official record of all board resolutions and votes',
          'Administer document retention policy per state requirements',
          'Manage association correspondence and official notices',
        ],
      },
      {
        category: 'Elections & Compliance',
        fiduciaryDuty: 'obedience',
        items: [
          'Oversee board election and annual meeting notice procedures',
          'Track and file board member conflict-of-interest disclosures',
          'Ensure meeting notice timelines comply with governing documents',
          'Issue annual disclosures required by state statute',
        ],
      },
      {
        category: 'Owner Records',
        fiduciaryDuty: 'loyalty',
        items: [
          'Maintain current owner roster and contact information',
          'Process resale certificate and status letter requests',
          'Manage owner access to association records per state law',
        ],
      },
    ],
  },
  {
    roleKey: 'Member',
    title: 'Member at Large',
    fiduciaryFocus: 'care',
    responsibilities: [
      {
        category: 'Governance Participation',
        fiduciaryDuty: 'care',
        items: [
          'Attend all regular and special board meetings',
          'Review meeting materials, financial reports, and proposals before votes',
          'Vote on all matters with informed, independent judgment',
        ],
      },
      {
        category: 'Fiduciary Obligations',
        fiduciaryDuty: 'loyalty',
        items: [
          'Disclose any conflicts of interest before board discussions',
          'Represent the interests of all owners, not personal interests',
          'Maintain confidentiality of executive session discussions',
        ],
      },
      {
        category: 'Community Engagement',
        fiduciaryDuty: 'care',
        items: [
          'Bring the owner perspective to board deliberations',
          'Serve on committees as appointed by the board president',
          'Support board decisions publicly once voted upon',
        ],
      },
    ],
  },
]

// ─── Unit Owner Responsibilities ────────────────────────────────────────────

export const UNIT_OWNER_RESPONSIBILITIES: OwnerResponsibilityGroup[] = [
  {
    category: 'Financial',
    items: [
      'Pay assessments on time per the collection policy',
      'Review annual budget and financial disclosures',
      'Vote on special assessments when presented',
    ],
  },
  {
    category: 'Governance',
    items: [
      'Attend the annual meeting or submit a proxy',
      'Vote in board elections',
      'Consider running for the board when able',
      'Review meeting minutes and board communications',
    ],
  },
  {
    category: 'Property',
    items: [
      'Maintain unit interior per governing documents',
      'Report common-area maintenance issues promptly',
      'Follow the alteration approval process for modifications',
    ],
  },
  {
    category: 'Community',
    items: [
      'Follow rules & regulations adopted by the board',
      'Respect quiet hours and common-area guidelines',
      'Communicate with the board through proper channels',
    ],
  },
  {
    category: 'Insurance',
    items: [
      'Maintain an HO-6 unit owner insurance policy',
      'Understand master policy coverage and personal gaps',
    ],
  },
]

// ─── Fiduciary Duty Labels ──────────────────────────────────────────────────

export const FIDUCIARY_LABELS: Record<FiduciaryDuty, { label: string; color: string; bg: string }> = {
  care: { label: 'Duty of Care', color: '#047857', bg: '#ecfdf5' },
  loyalty: { label: 'Duty of Loyalty', color: '#a16207', bg: '#fefce8' },
  obedience: { label: 'Duty of Obedience', color: '#6d28d9', bg: '#f5f3ff' },
}
