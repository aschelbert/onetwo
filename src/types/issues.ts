export type IssuePriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IssueStatus = 'SUBMITTED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type IssueType = 'BUILDING_PUBLIC' | 'UNIT_PRIVATE';

export interface Issue {
  id: string;
  type: IssueType;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  title: string;
  description: string;
  reportedBy: string;
  reporterName: string;
  reporterEmail: string;
  unitNumber?: string;
  submittedDate: string;
  upvotes: Array<{ userId: string; userName: string; unitNumber: string }>;
  viewCount: number;
  comments: Array<{
    id: string;
    author: string;
    text: string;
    date: string;
  }>;
  reviewNotes: Array<{
    id: string;
    author: string;
    text: string;
    date: string;
  }>;
  comms: CaseComm[];
}

export type CasePriority = 'urgent' | 'high' | 'medium' | 'low';
export type CaseApproach = 'pre' | 'self' | 'legal';
export type CaseStatus = 'open' | 'on-hold' | 'closed';

export interface CaseCheckItemAttachment {
  name: string;
  type: string;
  date: string;
  size: string;
  source: 'generated' | 'uploaded';
  reportType?: string;
  dataUrl?: string;
}

export interface CaseCheckItem {
  id: string;
  label: string;
  checked: boolean;
  checkedDate: string | null;
  attachment?: CaseCheckItemAttachment;
}

// Spending Decision (stored on CaseStep)
export interface SpendingDecision {
  amount: number;
  fundingSource: 'operating' | 'reserves' | 'special_assessment' | 'insurance' | 'loan';
  fundingStrategyId?: string;
  rationale: string;
  recordedDate: string | null;
  recordedBy: string;
  linkedWorkOrderId?: string;
}

// Bid Collection (stored on CaseStep)
export interface Bid {
  id: string;
  vendorName: string;
  amount: number;
  scope: string;
  timeline: string;
  warranty: string;
  insuranceVerified: boolean;
  licenseVerified: boolean;
  submittedDate: string;
  notes: string;
}

export interface BidCollection {
  minimumBids: number;
  bids: Bid[];
  selectedBidId: string | null;
  selectionRationale: string;
  completedDate: string | null;
}

// Conflict of Interest Check (stored on CaseTrackerCase)
export interface ConflictDeclaration {
  memberId: string;
  memberName: string;
  memberRole: string;
  hasConflict: boolean | null;  // null = not yet declared
  conflictDescription: string;
  recused: boolean;
  declaredDate: string | null;
}

export interface ConflictCheck {
  id: string;
  stepId: string;
  declarations: ConflictDeclaration[];
  quorumRequired: number;
  quorumMet: boolean;
  completedDate: string | null;
}

// Decision Audit Trail (stored on CaseTrackerCase)
export type TrailEntryType =
  | 'case_created' | 'step_completed' | 'board_vote'
  | 'spending_decision' | 'bid_uploaded' | 'bid_selected'
  | 'conflict_check' | 'communication_sent' | 'document_attached'
  | 'case_held' | 'case_resumed' | 'case_closed' | 'work_order_linked'
  | 'note_added' | 'approach_added'
  | 'notice_sent' | 'notice_delivered';

export interface DecisionTrailEntry {
  id: string;
  type: TrailEntryType;
  date: string;
  actor: string;
  summary: string;
  details?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

// Fiduciary Alert (computed, not stored)
export type FiduciaryDuty = 'care' | 'loyalty' | 'obedience';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface FiduciaryAlert {
  id: string;
  duty: FiduciaryDuty;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionLabel: string;
  actionPath: string;
}

// Budget Financials (annual-budgeting step 1 enrichment)
export interface BudgetFinancials {
  accounts: { num: string; name: string; budget: number; actual: number }[];
  budgetLines: { label: string; amount: number }[];
  reserveComponents: { name: string; balance: number; funded: number }[];
  delinquent: { units: number; total: number; aging: { bucket: string; amount: number }[] };
  collectionRates: { month: string; rate: number }[];
  totalUnits: number;
  currentMonthly: number;
}

// Budget Alert (computed from financial data)
export type BudgetAlertLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface BudgetAlert {
  categoryName: string;
  level: BudgetAlertLevel;
  percentUsed: number;
  budgeted: number;
  spent: number;
  remaining: number;
}

export type ActionType = 'check' | 'report' | 'link' | 'upload' | 'comm' | 'vote' | 'meeting';

export interface Action {
  id: string;
  type: ActionType;
  label: string;
  reportType?: string;
  reportDesc?: string;
  linkTarget?: string;
  linkLabel?: string;
  done: boolean;
  doneDate: string | null;
}

export interface PersistentAction {
  type: 'link' | 'upload';
  label: string;
  target?: string;
}

export interface CaseStep {
  id: string;
  s: string;
  t?: string;
  d?: string | null;
  detail?: string | null;
  w?: string;
  action?: { type: 'navigate' | 'modal' | 'inline'; target: string; label: string; destination?: string };
  done: boolean;
  doneDate: string | null;
  userNotes: string;
  desc?: string;
  actions?: Action[];
  persistent?: PersistentAction[];
  stepAttachments?: CaseAttachment[];
  phaseId?: string;
  checks?: CaseCheckItem[];
  isSpendingDecision?: boolean;
  spendingDecision?: SpendingDecision;
  requiresBids?: boolean;
  minimumBids?: number;
  bidCollection?: BidCollection;
  requiresConflictCheck?: boolean;
  budgetDraft?: {
    proposedCategories: Array<{ categoryId: string; name: string; current: number; proposed: number }>;
    proposedReserveContribution: number;
    contingencyPct: number;
    contingencyAmount: number;
    totalProposed: number;
    perUnitAnnual: number;
    perUnitMonthly: number;
    savedDate: string | null;
  };
}

export interface AdditionalApproach {
  approach: CaseApproach;
  addedDate: string;
  steps: CaseStep[];
}

export interface CaseComm {
  id: string;
  type: string;
  subject: string;
  date: string;
  method: string;
  recipient: string;
  sentBy: string;
  notes: string;
  status: string;
}

export interface CaseAttachment {
  name: string;
  type: string;
  date: string;
  size: string;
}

export interface BoardVote {
  motion: string;
  date: string;
  votes: Array<{ name: string; role: string; vote: string }>;
}

export interface CaseTrackerCase {
  id: string;
  catId: string;
  sitId: string;
  title: string;
  unit: string;
  owner: string;
  approach: CaseApproach;
  status: CaseStatus;
  priority: CasePriority;
  created: string;
  notes: string;
  steps: CaseStep[] | null;
  linkedWOs: string[];
  linkedLetterIds: string[];
  linkedInvoiceIds: string[];
  linkedMeetingIds: string[];
  attachments: CaseAttachment[];
  boardVotes: BoardVote | null;
  additionalApproaches: AdditionalApproach[];
  comms: CaseComm[];
  assignedTo?: string;
  assignedRole?: string;
  dueDate?: string;
  source?: string;
  sourceId?: string;
  completedAt?: string;
  holdReason?: string;
  closeReason?: string;
  closeNotes?: string;
  budgetBaseline?: {
    totalBudget: number;
    spent: number;
    committed: number;
    remaining: number;
  };
  financials?: BudgetFinancials;
  conflictChecks?: ConflictCheck[];
  decisionTrail?: DecisionTrailEntry[];
}
