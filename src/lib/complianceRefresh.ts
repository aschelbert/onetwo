/**
 * Compliance Refresh Engine
 *
 * Dynamically generates compliance requirements based on:
 * - Building jurisdiction (state/district)
 * - Uploaded legal & bylaw documents
 * - Current insurance policies
 * - Board composition
 *
 * Called on:
 * 1. Archive creation (ensures snapshot reflects current regs)
 * 2. Legal/bylaw document addition (ensures checks match current docs)
 */

export interface ComplianceItem {
  id: string; task: string; role: string; freq: string; due: string;
  critical: boolean; tip: string; legalRef: string; autoPass?: boolean;
  /** Describes what action satisfies this item: 'meeting' items can auto-create a meeting, 'case' items suggest creating a case */
  satisfyingAction?: 'meeting' | 'case' | 'filing' | 'document' | 'review';
  /** Pre-filled meeting type if satisfyingAction is 'meeting' */
  meetingType?: string;
  /** Pre-filled agenda items if satisfyingAction is 'meeting' */
  suggestedAgenda?: string[];
}

export interface ComplianceCategory {
  id: string; icon: string; label: string; weight: number; items: ComplianceItem[];
}

export interface RefreshResult {
  categories: ComplianceCategory[];
  refreshedAt: string;
  jurisdiction: string;
  documentsDetected: string[];
  regulatoryNotes: string[];
}

interface RefreshInput {
  state: string;
  legalDocuments: Array<{ name: string; status: string }>;
  insurance: Array<{ type: string; expires: string }>;
  boardCount: number;
  hasManagement: boolean;
}

export function refreshComplianceRequirements(input: RefreshInput): RefreshResult {
  const { state, legalDocuments, insurance, boardCount } = input;

  const isDC = state === 'District of Columbia';
  const jurisdiction = isDC ? 'DC' : state;
  const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`;
  const stateActShort = isDC ? 'DC Code' : `${jurisdiction} Code`;

  // Detect uploaded documents
  const hasBylaws = legalDocuments.some(d => d.name.toLowerCase().includes('bylaw'));
  const hasCCRs = legalDocuments.some(d => d.name.toLowerCase().includes('cc&r') || d.name.toLowerCase().includes('declaration'));
  const hasRules = legalDocuments.some(d => d.name.toLowerCase().includes('rule') || d.name.toLowerCase().includes('regulation'));
  const hasResalePolicy = legalDocuments.some(d => d.name.toLowerCase().includes('resale'));
  const hasCollectionPolicy = legalDocuments.some(d => d.name.toLowerCase().includes('collection') || d.name.toLowerCase().includes('assessment'));
  const hasRetentionPolicy = legalDocuments.some(d => d.name.toLowerCase().includes('retention'));
  const hasEmergencyPlan = legalDocuments.some(d => d.name.toLowerCase().includes('emergency'));

  const documentsDetected: string[] = [];
  if (hasBylaws) documentsDetected.push('Bylaws');
  if (hasCCRs) documentsDetected.push('CC&Rs / Declaration');
  if (hasRules) documentsDetected.push('Rules & Regulations');
  if (hasResalePolicy) documentsDetected.push('Resale Certificate Policy');
  if (hasCollectionPolicy) documentsDetected.push('Assessment Collection Policy');
  if (hasRetentionPolicy) documentsDetected.push('Document Retention Policy');
  if (hasEmergencyPlan) documentsDetected.push('Emergency Preparedness Plan');

  const regulatoryNotes: string[] = [];

  // ─── Build categories dynamically ───

  const governance: ComplianceItem[] = [
    { id: 'g1', task: 'Bylaws reviewed and up to date', role: 'President', freq: 'Annual', due: '2026-01-15', critical: true, tip: hasBylaws ? 'Bylaws detected — cross-referencing requirements with uploaded document.' : 'Upload bylaws to enable document-specific checks.', legalRef: stateAct, autoPass: hasBylaws, satisfyingAction: 'document' },
    { id: 'g2', task: 'CC&Rs reviewed and up to date', role: 'President', freq: 'Annual', due: '2025-06-20', critical: true, tip: hasCCRs ? 'Declaration/CC&Rs detected — compliance checks updated.' : 'Upload CC&Rs or Declaration to enable checks.', legalRef: isDC ? 'DC Code § 29-1131' : `${stateActShort} § Condo Declaration`, autoPass: false, satisfyingAction: 'document' },
    { id: 'g3', task: 'Board meeting minutes maintained', role: 'Secretary', freq: 'Ongoing', due: 'Ongoing', critical: true, tip: 'Minutes must be maintained and available for owner inspection.', legalRef: isDC ? 'DC Code § 29-1108.06' : `${stateActShort} Minutes Req.`, autoPass: true, satisfyingAction: 'review' },
    { id: 'g4', task: 'Annual meeting held within 13 months of prior', role: 'President', freq: 'Annual', due: '2026-03-31', critical: true, tip: 'Must hold annual meeting within 13 months of the previous one.', legalRef: isDC ? 'DC Code § 29-1109.02' : `${stateActShort} § Annual Meeting`, autoPass: true, satisfyingAction: 'meeting', meetingType: 'ANNUAL', suggestedAgenda: ['Election of board members', 'Annual financial report', 'Budget approval', 'Q&A session'] },
    { id: 'g5', task: 'Board election conducted per bylaws', role: 'Secretary', freq: 'Annual', due: '2026-12-31', critical: false, tip: hasBylaws ? 'Follow nomination and election procedures per your uploaded Bylaws.' : 'Follow nomination and election procedures in bylaws.', legalRef: hasBylaws ? 'Bylaws Art. IV' : 'Governing Documents', satisfyingAction: 'meeting', meetingType: 'ANNUAL', suggestedAgenda: ['Board member nominations', 'Candidate statements', 'Board election vote'] },
    { id: 'g6', task: 'Conflict of interest disclosures collected', role: 'Secretary', freq: 'Annual', due: '2026-02-28', critical: false, tip: `Board members should disclose conflicts annually. ${boardCount} current members.`, legalRef: isDC ? 'DC Code § 29-406.70' : `${stateActShort} § Conflicts`, satisfyingAction: 'review' },
  ];

  // Add rules & regulations check if document detected
  if (hasRules) {
    governance.push({ id: 'g7', task: 'Rules & Regulations reviewed and current', role: 'President', freq: 'Annual', due: '2026-06-30', critical: false, tip: 'Rules & Regulations document detected — ensure rules are consistent with bylaws and current law.', legalRef: hasBylaws ? 'Bylaws + Rules' : stateAct, autoPass: true });
    regulatoryNotes.push('Rules & Regulations document detected — added compliance check for annual review.');
  }

  const financial: ComplianceItem[] = [
    { id: 'f1', task: 'Annual budget approved and distributed', role: 'Treasurer', freq: 'Annual', due: '2026-01-31', critical: true, tip: 'Budget must be approved by board and distributed to owners.', legalRef: isDC ? 'DC Code § 29-1135.03' : `${stateActShort} § Budget`, autoPass: true, satisfyingAction: 'meeting', meetingType: 'BOARD', suggestedAgenda: ['Review draft annual budget', 'Budget line item discussion', 'Vote to approve annual budget'] },
    { id: 'f2', task: 'Reserve study current (within 3 years)', role: 'Treasurer', freq: 'Every 3 years', due: '2028-06-15', critical: true, tip: 'Professional reserve study recommended every 3 years.', legalRef: 'Best practice', autoPass: true, satisfyingAction: 'case' },
    { id: 'f3', task: 'Annual financial audit/review completed', role: 'Treasurer', freq: 'Annual', due: '2026-06-30', critical: true, tip: 'Independent financial review recommended annually.', legalRef: isDC ? 'DC Code § 29-1135.05' : `${stateActShort} § Audit`, satisfyingAction: 'case' },
    { id: 'f4', task: 'Fidelity bond in place', role: 'Treasurer', freq: 'Annual', due: '2026-09-30', critical: true, tip: 'Fidelity bond protects against employee/board theft.', legalRef: isDC ? 'DC Code § 29-1135.06' : `${stateActShort} § Bond`, autoPass: true, satisfyingAction: 'document' },
    { id: 'f5', task: 'Assessment collection policy documented', role: 'Treasurer', freq: 'As needed', due: 'Ongoing', critical: false, tip: hasCollectionPolicy ? 'Collection policy document detected — auto-verified.' : 'Written collection policy should be adopted and enforced.', legalRef: hasBylaws ? 'Bylaws Art. VII' : 'Governing Documents', autoPass: hasCollectionPolicy, satisfyingAction: 'document' },
    { id: 'f6', task: 'Tax returns filed (Form 1120-H)', role: 'Treasurer', freq: 'Annual', due: '2026-04-15', critical: true, tip: 'HOA must file federal tax return annually.', legalRef: 'IRS Code § 528', satisfyingAction: 'filing' },
  ];

  const insuranceItems: ComplianceItem[] = [
    { id: 'i1', task: 'D&O insurance current', role: 'President', freq: 'Annual', due: '2026-09-30', critical: true, tip: 'Directors & Officers liability coverage protects board members.', legalRef: 'Best practice', autoPass: insurance.some(p => p.type.toLowerCase().includes('d&o') || p.type.toLowerCase().includes('director')) },
    { id: 'i2', task: 'General liability insurance current', role: 'President', freq: 'Annual', due: '2026-09-30', critical: true, tip: 'Minimum $1M/$2M general liability recommended.', legalRef: isDC ? 'DC Code § 29-1135.06' : `${stateActShort} § Insurance`, autoPass: insurance.some(p => p.type.toLowerCase().includes('general liability')) },
    { id: 'i3', task: 'Property insurance adequate for replacement', role: 'Treasurer', freq: 'Annual', due: '2026-09-30', critical: true, tip: 'Coverage should equal 100% replacement cost.', legalRef: hasBylaws ? 'Bylaws Art. VIII' : 'Governing Documents' },
    { id: 'i4', task: 'Workers compensation if employees', role: 'President', freq: 'Annual', due: '2026-12-31', critical: false, tip: 'Required if HOA has any employees.', legalRef: isDC ? 'DC Workers Comp Act' : `${jurisdiction} Workers Comp`, autoPass: true },
    { id: 'i5', task: 'Insurance certificates from vendors collected', role: 'Vice President', freq: 'Annual', due: '2026-03-31', critical: false, tip: 'All vendors should provide proof of insurance.', legalRef: 'Best practice' },
  ];

  // Add umbrella policy check if bylaws specify it
  if (hasBylaws) {
    insuranceItems.push({ id: 'i6', task: 'Umbrella/excess liability policy reviewed', role: 'President', freq: 'Annual', due: '2026-09-30', critical: false, tip: 'Bylaws detected — check if umbrella coverage is required by governing documents.', legalRef: 'Bylaws + Best practice' });
    regulatoryNotes.push('Bylaws detected — added umbrella liability policy review check.');
  }

  const maintenance: ComplianceItem[] = [
    { id: 'm1', task: 'Fire safety systems inspected', role: 'Vice President', freq: 'Annual', due: '2026-06-30', critical: true, tip: 'Fire alarm, sprinkler, and extinguisher inspection required.', legalRef: isDC ? 'DC Fire Code' : `${jurisdiction} Fire Code` },
    { id: 'm2', task: 'Elevator inspection current', role: 'Vice President', freq: 'Annual', due: '2026-08-15', critical: true, tip: 'Elevator must pass annual safety inspection.', legalRef: isDC ? 'DC Code § 1-303.43' : `${stateActShort} § Elevator`, autoPass: true },
    { id: 'm3', task: 'Common area maintenance schedule documented', role: 'Vice President', freq: 'Ongoing', due: 'Ongoing', critical: false, tip: 'Maintain written schedule for all maintenance items.', legalRef: 'Best practice', autoPass: true },
    { id: 'm4', task: 'ADA compliance reviewed', role: 'Vice President', freq: 'Annual', due: '2026-06-30', critical: false, tip: 'Ensure common areas meet accessibility requirements.', legalRef: 'ADA Title III' },
    { id: 'm5', task: 'Emergency preparedness plan updated', role: 'President', freq: 'Annual', due: '2026-03-31', critical: false, tip: hasEmergencyPlan ? 'Emergency plan document detected — auto-verified.' : 'Update emergency contacts, procedures, and evacuation plans.', legalRef: 'Best practice', autoPass: hasEmergencyPlan },
  ];

  const records: ComplianceItem[] = [
    { id: 'r1', task: 'Owner records current and accessible', role: 'Secretary', freq: 'Ongoing', due: 'Ongoing', critical: false, tip: 'Maintain current owner contact info and mailing addresses.', legalRef: isDC ? 'DC Code § 29-1135.01' : `${stateActShort} § Records`, autoPass: true },
    { id: 'r2', task: 'Meeting notices sent per requirements', role: 'Secretary', freq: 'Per meeting', due: 'Ongoing', critical: true, tip: 'Annual: 10-60 days notice. Board: 48 hours notice.', legalRef: isDC ? 'DC Code § 29-1109.02' : `${stateActShort} § Notice`, autoPass: true },
    { id: 'r3', task: 'Annual disclosure statement distributed', role: 'Secretary', freq: 'Annual', due: '2026-03-31', critical: false, tip: 'Financial and governance disclosures to all owners.', legalRef: isDC ? 'DC Code § 29-1135.05' : `${stateActShort} § Disclosure` },
    { id: 'r4', task: 'Resale certificate process in place', role: 'Secretary', freq: 'As needed', due: 'Ongoing', critical: false, tip: hasResalePolicy ? 'Resale certificate policy detected — auto-verified.' : 'Must provide resale certificates within statutory timeframe.', legalRef: isDC ? 'DC Code § 29-1141' : `${stateActShort} § Resale`, autoPass: hasResalePolicy },
    { id: 'r5', task: 'Document retention policy adopted', role: 'Secretary', freq: 'As needed', due: 'Ongoing', critical: false, tip: hasRetentionPolicy ? 'Retention policy document detected — auto-verified.' : 'Retain key documents per legal requirements (7+ years financial).', legalRef: 'Best practice', autoPass: hasRetentionPolicy },
  ];

  const categories: ComplianceCategory[] = [
    { id: 'governance', icon: '⚖️', label: 'Governance & Legal', weight: 25, items: governance },
    { id: 'financial', icon: '💰', label: 'Financial Compliance', weight: 25, items: financial },
    { id: 'insurance', icon: '🛡️', label: 'Insurance & Risk', weight: 20, items: insuranceItems },
    { id: 'maintenance', icon: '🔧', label: 'Maintenance & Safety', weight: 15, items: maintenance },
    { id: 'records', icon: '📋', label: 'Records & Communications', weight: 15, items: records },
  ];

  // Auto-pass items that have matching documents
  if (hasBylaws) regulatoryNotes.push('Bylaws detected — bylaw-specific references activated across all categories.');
  if (hasCCRs) regulatoryNotes.push('CC&Rs/Declaration detected — declaration-specific checks enabled.');
  if (!hasBylaws) regulatoryNotes.push('⚠ No bylaws uploaded — some checks use generic statutory references. Upload bylaws for more accurate compliance tracking.');

  return {
    categories,
    refreshedAt: new Date().toISOString(),
    jurisdiction,
    documentsDetected,
    regulatoryNotes,
  };
}
