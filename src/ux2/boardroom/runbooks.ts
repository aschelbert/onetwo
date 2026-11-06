/**
 * The runbook catalogue — the 32 runbooks from the design, each waiting for
 * its trigger. A runbook that maps to a production situation (`sitId` in
 * the case wizard's CATS) opens its case through the same wizard and steps;
 * the rest are the automations the plan calls net-new and are listed so
 * the board can see what runs and switch any one off.
 */
export interface RunbookDef {
  id: string;
  name: string;
  /** What starts it. */
  trigger: string;
  steps: number;
  automated: number;
  /** Production situation id in the case wizard, when one exists. */
  sitId?: string;
  /** Production category id. */
  catId?: string;
  /** Who sees the case: everyone, or the board (and the unit it concerns). */
  visibility: 'owners' | 'board';
  defaultOn: boolean;
}

export const RUNBOOKS: RunbookDef[] = [
  { id: 'annual-budget', name: 'Annual budget', trigger: '90 days before the fiscal year', steps: 9, automated: 5, sitId: 'annual-budgeting', catId: 'financial', visibility: 'owners', defaultOn: true },
  { id: 'board-meeting', name: 'Board meeting cycle', trigger: 'Bylaws cadence', steps: 7, automated: 5, sitId: 'board-meetings', catId: 'governance', visibility: 'owners', defaultOn: true },
  { id: 'resident-request', name: 'Resident request', trigger: 'A request arrives', steps: 4, automated: 3, sitId: 'board-action-item', catId: 'governance', visibility: 'board', defaultOn: true },
  { id: 'covenant-violation', name: 'Covenant violation', trigger: 'A request or inspection flags one', steps: 7, automated: 5, sitId: 'covenant-violations', catId: 'enforcement', visibility: 'board', defaultOn: true },
  { id: 'elections', name: 'Elections', trigger: 'Annual meeting scheduled', steps: 8, automated: 4, sitId: 'elections', catId: 'governance', visibility: 'owners', defaultOn: true },
  { id: 'move', name: 'Move in or out', trigger: 'A move is scheduled', steps: 6, automated: 3, sitId: 'scheduled-move', catId: 'admin', visibility: 'board', defaultOn: true },
  { id: 'vendor-bids', name: 'Vendor bids', trigger: 'A case step asks for quotes', steps: 6, automated: 2, sitId: 'vendor-management', catId: 'maintenance', visibility: 'board', defaultOn: false },
  { id: 'filings', name: 'Biennial report, 1120-H, D-20', trigger: 'Filing calendar', steps: 3, automated: 2, sitId: 'compliance-filing', catId: 'admin', visibility: 'owners', defaultOn: true },
  { id: 'insurance-renewal', name: 'Insurance renewal', trigger: '60 days before a policy expires', steps: 5, automated: 3, sitId: 'insurance-claims', catId: 'legal', visibility: 'owners', defaultOn: true },
  { id: 'collections', name: 'Collections', trigger: '30 days past due', steps: 5, automated: 3, sitId: 'delinquent-accounts', catId: 'financial', visibility: 'board', defaultOn: true },
  { id: 'month-close', name: 'Month close', trigger: 'The 1st of each month', steps: 5, automated: 4, sitId: 'financial-review', catId: 'financial', visibility: 'owners', defaultOn: true },
  { id: 'annual-meeting', name: 'Annual meeting', trigger: '13 months after the last one, minus notice', steps: 8, automated: 5, sitId: 'annual-meeting-planning', catId: 'governance', visibility: 'owners', defaultOn: true },
  { id: 'reserve-study', name: 'Reserve study update', trigger: 'Every 3 years, 90 days before due', steps: 4, automated: 2, sitId: 'reserve-management', catId: 'financial', visibility: 'owners', defaultOn: true },
  { id: 'resale-certificate', name: 'Resale certificate', trigger: 'A unit lists for sale', steps: 5, automated: 4, sitId: 'resale-certs', catId: 'admin', visibility: 'board', defaultOn: true },
  { id: 'special-assessment', name: 'Special assessment', trigger: 'Board approves one', steps: 6, automated: 4, sitId: 'special-assessments', catId: 'financial', visibility: 'owners', defaultOn: true },
  { id: 'elevator-inspection', name: 'Elevator inspection', trigger: 'Certificate expiry, 60 days out', steps: 4, automated: 3, sitId: 'inspection-scheduling', catId: 'maintenance', visibility: 'owners', defaultOn: true },
  { id: 'boiler-fire', name: 'Boiler and fire systems', trigger: 'Inspection calendar', steps: 4, automated: 3, sitId: 'preventative-maintenance', catId: 'maintenance', visibility: 'owners', defaultOn: true },
  { id: 'snow', name: 'Snow and ice', trigger: 'First forecast under 32°F', steps: 3, automated: 3, visibility: 'owners', defaultOn: true },
  { id: 'amenity-booking', name: 'Amenity booking', trigger: 'An owner books a room', steps: 4, automated: 4, sitId: 'amenities', catId: 'operations', visibility: 'owners', defaultOn: true },
  { id: 'work-order', name: 'Work order', trigger: 'A case step needs a vendor', steps: 5, automated: 4, sitId: 'common-area-repairs', catId: 'maintenance', visibility: 'board', defaultOn: true },
  { id: 'spending-request', name: 'Spending request', trigger: 'Anything over the bylaws limit or over its line', steps: 4, automated: 3, sitId: 'capital-projects', catId: 'strategic', visibility: 'owners', defaultOn: true },
  { id: 'vendor-onboarding', name: 'Vendor onboarding and W-9', trigger: 'A new vendor is paid for the first time', steps: 4, automated: 3, visibility: 'board', defaultOn: true },
  { id: '1099', name: '1099 filing', trigger: 'January 1', steps: 4, automated: 3, visibility: 'board', defaultOn: true },
  { id: 'year-end', name: 'Year-end close', trigger: 'Fiscal year end', steps: 6, automated: 4, visibility: 'owners', defaultOn: true },
  { id: 'financial-review', name: 'Financial review', trigger: 'After year-end close', steps: 4, automated: 2, visibility: 'owners', defaultOn: true },
  { id: 'owner-disclosure', name: 'Owner disclosure statement', trigger: 'Annually by Mar 31', steps: 3, automated: 3, visibility: 'owners', defaultOn: true },
  { id: 'records-request', name: 'Records request', trigger: 'An owner asks for records', steps: 4, automated: 3, sitId: 'record-requests', catId: 'admin', visibility: 'board', defaultOn: true },
  { id: 'insurance-claim', name: 'Insurance claim', trigger: 'A loss is reported', steps: 6, automated: 3, sitId: 'insurance-claims', catId: 'legal', visibility: 'board', defaultOn: true },
  { id: 'emergency-notice', name: 'Emergency notice', trigger: 'Water, power, fire or elevator out', steps: 3, automated: 3, sitId: 'emergency-situations', catId: 'maintenance', visibility: 'owners', defaultOn: true },
  { id: 'rule-change', name: 'Bylaw or rule change', trigger: 'Board proposes one', steps: 6, automated: 3, sitId: 'bylaw-amendment', catId: 'legal', visibility: 'owners', defaultOn: true },
  { id: 'payroll', name: 'Staff and payroll', trigger: 'Pay period', steps: 4, automated: 3, visibility: 'board', defaultOn: true },
  { id: 'setup', name: 'New building setup', trigger: 'First sign-in', steps: 9, automated: 6, visibility: 'board', defaultOn: true },
];

export function runbookById(id: string): RunbookDef | undefined {
  return RUNBOOKS.find(r => r.id === id);
}
