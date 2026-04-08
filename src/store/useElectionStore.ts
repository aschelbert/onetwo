import { create } from 'zustand';
import { isBackendEnabled } from '@/lib/supabase';
import * as electionsSvc from '@/lib/services/elections';

// ─── Types ───

export type VoteMethod = 'paper' | 'oral' | 'virtual';
export type VoteChoice = 'approve' | 'deny' | 'abstain';
export type ElectionStatus = 'draft' | 'open' | 'closed' | 'certified';
export type ElectionType = 'board_election' | 'budget_approval' | 'special_assessment' | 'bylaw_amendment' | 'rule_change' | 'meeting_motion' | 'other';

export interface Candidate {
  id: string;
  name: string;
  unit: string;
  bio: string;
}

export interface BallotAttachment {
  id: string;
  name: string;
  size: string;
  type: string;          // pdf, xlsx, etc
  uploadedAt: string;
  uploadedBy: string;
}

export interface BallotItem {
  id: string;
  title: string;
  description: string;        // short summary
  rationale: string;           // detailed justification / background
  type: 'yes_no' | 'multi_candidate' | 'multi_select';
  candidates?: Candidate[];
  maxSelections?: number;
  requiredThreshold: number;
  legalRef: string;
  attachments: BallotAttachment[];  // supporting documents
  financialImpact?: string;         // cost summary
}

export interface VoterComment {
  id: string;
  unitNumber: string;
  owner: string;
  text: string;
  createdAt: string;
}

export interface UnitBallot {
  id: string;
  unitNumber: string;
  owner: string;
  votingPct: number;
  method: VoteMethod;
  recordedBy: string;
  recordedAt: string;
  isProxy: boolean;
  proxyVoterName?: string;   // who is casting (the proxy holder)
  proxyAuthorizedBy?: string; // the unit owner who authorized the proxy
  votes: Record<string, VoteChoice | string[]>;
  comment?: string;           // optional voter comment/rationale
}

export interface ComplianceCheck {
  id: string;
  rule: string;              // e.g., "Bylaws Art. IV §2: 14-day notice required"
  source: 'bylaws' | 'statute' | 'covenants' | 'best_practice';
  requirement: string;       // what must be true
  status: 'pass' | 'fail' | 'warning' | 'not_checked';
  note: string;
  autoChecked: boolean;
}

export interface TimelineEvent {
  id: string;
  type: 'created' | 'opened' | 'ballot_recorded' | 'closed' | 'certified' | 'comment' | 'compliance_updated' | 'document_added' | 'case_created';
  description: string;
  date: string;
  actor: string;
}

export interface Resolution {
  id: string;
  text: string;                     // formal resolution text
  effectiveDate: string;
  recordedBy: string;
  linkedCaseId?: string;            // case ops tracking
}

export interface BallotItemResult {
  ballotItemId: string;
  title: string;
  type: 'yes_no' | 'multi_candidate' | 'multi_select';
  approvePct?: number;
  denyPct?: number;
  abstainPct?: number;
  approveCount?: number;
  denyCount?: number;
  abstainCount?: number;
  candidateResults?: Array<{ candidateId: string; name: string; votePct: number; voteCount: number }>;
  passed: boolean;
  threshold: number;
  quorumMet: boolean;
}

export interface Election {
  id: string;
  title: string;
  type: ElectionType;
  status: ElectionStatus;
  description: string;
  createdAt: string;
  createdBy: string;
  openedAt: string | null;
  closedAt: string | null;
  certifiedAt: string | null;
  certifiedBy: string | null;
  scheduledCloseDate: string | null;    // deadline for voting
  noticeDate: string | null;            // when notice was sent
  quorumRequired: number;
  ballotItems: BallotItem[];
  ballots: UnitBallot[];
  legalRef: string;
  notes: string;
  complianceChecks: ComplianceCheck[];
  timeline: TimelineEvent[];
  comments: VoterComment[];
  resolution: Resolution | null;
  linkedCaseId: string | null;          // case ops link
  linkedMeetingId: string | null;       // meeting link
}

interface ElectionState {
  elections: Election[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addElection: (e: Omit<Election, 'id' | 'createdAt' | 'ballots' | 'timeline' | 'comments' | 'resolution' | 'linkedCaseId'>, tenantId?: string) => void;
  updateElection: (id: string, updates: Partial<Election>) => void;
  deleteElection: (id: string) => void;
  openElection: (id: string, actor: string) => void;
  closeElection: (id: string, actor: string) => void;
  certifyElection: (id: string, certifiedBy: string) => void;
  addBallotItem: (electionId: string, item: Omit<BallotItem, 'id' | 'attachments'>) => void;
  updateBallotItem: (electionId: string, itemId: string, updates: Partial<BallotItem>) => void;
  removeBallotItem: (electionId: string, itemId: string) => void;
  addBallotAttachment: (electionId: string, itemId: string, att: Omit<BallotAttachment, 'id'>) => void;
  removeBallotAttachment: (electionId: string, itemId: string, attId: string) => void;
  recordBallot: (electionId: string, ballot: Omit<UnitBallot, 'id' | 'recordedAt'>, actor: string) => void;
  removeBallot: (electionId: string, ballotId: string) => void;
  addComment: (electionId: string, comment: Omit<VoterComment, 'id' | 'createdAt'>) => void;
  addTimelineEvent: (electionId: string, event: Omit<TimelineEvent, 'id'>) => void;
  setComplianceChecks: (electionId: string, checks: ComplianceCheck[]) => void;
  updateComplianceCheck: (electionId: string, checkId: string, updates: Partial<ComplianceCheck>) => void;
  setResolution: (electionId: string, resolution: Omit<Resolution, 'id'>) => void;
  linkCase: (electionId: string, caseId: string) => void;
  getResults: (electionId: string, units: Array<{ number: string; votingPct: number; status: string }>) => {
    totalEligiblePct: number;
    totalVotedPct: number;
    quorumMet: boolean;
    quorumRequired: number;
    unitsBalloted: number;
    unitsEligible: number;
    itemResults: BallotItemResult[];
    participationByMethod: Record<VoteMethod, number>;
    proxyCount: number;
  } | null;
}

const tlId = () => 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

// Helper: sync election updates to DB
function syncElection(id: string, updates: Partial<Election>) {
  if (!isBackendEnabled) return;
  electionsSvc.updateElection(id, updates);
}

const seedElections: Election[] = [
  {
    id: 'elec_seed_1',
    title: '2025 Board of Directors Election',
    type: 'board_election',
    status: 'certified',
    description: 'Annual election of board members at the 2025 Annual General Meeting. Three seats up for election.',
    createdAt: '2025-11-15T10:00:00.000Z',
    createdBy: 'Robert Mitchell',
    openedAt: '2025-12-01T00:00:00.000Z',
    closedAt: '2025-12-10T21:15:00.000Z',
    certifiedAt: '2025-12-11T10:00:00.000Z',
    certifiedBy: 'Robert Mitchell',
    scheduledCloseDate: '2025-12-10',
    noticeDate: '2025-11-15',
    quorumRequired: 40,
    ballotItems: [
      {
        id: 'bi_1',
        title: 'Board Seat — 2-Year Term (3 seats)',
        description: 'Elect three board members for 2-year terms beginning January 2026.',
        rationale: 'Per Bylaws Article III, three board seats are up for election at the 2025 Annual General Meeting.',
        type: 'multi_candidate',
        candidates: [
          { id: 'cand_1', name: 'Robert Mitchell', unit: '401', bio: 'Current President. Served 4 years. Finance background.' },
          { id: 'cand_2', name: 'Jennifer Adams', unit: '202', bio: 'Current VP. Served 2 years. Property management experience.' },
          { id: 'cand_3', name: 'David Chen', unit: '102', bio: 'Current Treasurer. CPA. Served 2 years.' },
          { id: 'cand_4', name: 'Sarah Kim', unit: '305', bio: 'New candidate. Attorney specializing in real estate.' },
        ],
        maxSelections: 3,
        requiredThreshold: 0,
        legalRef: 'Bylaws Art. III §2',
        attachments: [],
      },
    ],
    ballots: [
      { id: 'ub_1', unitNumber: '101', owner: 'Sarah Johnson', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:30:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_2', 'cand_3'] } },
      { id: 'ub_2', unitNumber: '201', owner: 'Lisa Chen', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:32:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_3', 'cand_4'] } },
      { id: 'ub_3', unitNumber: '301', owner: 'John Smith', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:35:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_2', 'cand_3'] } },
      { id: 'ub_4', unitNumber: '401', owner: 'Amy Lee', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:38:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_2', 'cand_3'] } },
      { id: 'ub_5', unitNumber: '501', owner: 'Chris Taylor', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:40:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_2', 'cand_4'] } },
      { id: 'ub_6', unitNumber: '302', owner: 'Rachel Green', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:42:00Z', isProxy: true, proxyVoterName: 'Robert Mitchell', proxyAuthorizedBy: 'Rachel Green', votes: { bi_1: ['cand_1', 'cand_2', 'cand_3'] } },
      { id: 'ub_7', unitNumber: '402', owner: 'James Brown', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:45:00Z', isProxy: false, votes: { bi_1: ['cand_2', 'cand_3', 'cand_4'] } },
      { id: 'ub_8', unitNumber: '502', owner: 'Nicole White', votingPct: 2.5, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:48:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_3', 'cand_4'] } },
      { id: 'ub_9', unitNumber: '102', owner: 'Mike Davis', votingPct: 2.2, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T19:50:00Z', isProxy: false, votes: { bi_1: ['cand_1', 'cand_2', 'cand_3'] } },
    ],
    legalRef: 'Bylaws Art. III; DC Code § 29-1109.02',
    notes: 'All three incumbents re-elected. 42 of 50 units represented (84% quorum).',
    complianceChecks: [
      { id: 'cc_1', rule: 'Bylaws Art. III §2: 30-day notice required', source: 'bylaws', requirement: 'Notice sent at least 30 days before AGM', status: 'pass', note: 'Notice mailed November 10, 2025 — 30 days before meeting.', autoChecked: false },
      { id: 'cc_2', rule: 'DC Code § 29-1109.02: Secret ballot required', source: 'statute', requirement: 'Secret ballot used for board elections', status: 'pass', note: 'Paper ballots used with sealed ballot box.', autoChecked: false },
      { id: 'cc_3', rule: 'Bylaws Art. V §1: 40% quorum required', source: 'bylaws', requirement: 'At least 40% of units represented', status: 'pass', note: '42 of 50 units represented (84%).', autoChecked: false },
    ],
    timeline: [
      { id: 'tl_1', type: 'created', description: 'Election created for 2025 AGM', date: '2025-11-15T10:00:00Z', actor: 'Robert Mitchell' },
      { id: 'tl_2', type: 'opened', description: 'Voting opened at AGM', date: '2025-12-10T19:15:00Z', actor: 'Robert Mitchell' },
      { id: 'tl_3', type: 'closed', description: 'Voting closed — 9 ballots recorded', date: '2025-12-10T21:15:00Z', actor: 'David Chen' },
      { id: 'tl_4', type: 'certified', description: 'Results certified by President', date: '2025-12-11T10:00:00Z', actor: 'Robert Mitchell' },
    ],
    comments: [],
    resolution: {
      id: 'res_1',
      text: 'RESOLVED: Robert Mitchell, Jennifer Adams, and David Chen are hereby elected to the Board of Directors for two-year terms commencing January 1, 2026.',
      effectiveDate: '2026-01-01',
      recordedBy: 'Maria Rodriguez',
    },
    linkedCaseId: null,
    linkedMeetingId: 'mtg3',
  },
  {
    id: 'elec_seed_2',
    title: '2026 Assessment Increase Approval (3%)',
    type: 'budget_approval',
    status: 'certified',
    description: 'Owner vote to approve 3% assessment increase for FY 2026 as part of the annual budget ratification.',
    createdAt: '2025-11-20T10:00:00.000Z',
    createdBy: 'David Chen',
    openedAt: '2025-12-10T20:00:00.000Z',
    closedAt: '2025-12-10T20:30:00.000Z',
    certifiedAt: '2025-12-11T10:00:00.000Z',
    certifiedBy: 'Robert Mitchell',
    scheduledCloseDate: '2025-12-10',
    noticeDate: '2025-11-15',
    quorumRequired: 40,
    ballotItems: [
      {
        id: 'bi_2',
        title: 'Approve 3% Assessment Increase for 2026',
        description: 'Approve a 3% increase to monthly assessments effective January 1, 2026 to cover rising insurance and maintenance costs.',
        rationale: 'Insurance premiums increased 8%. Maintenance contracts up 4%. Reserve study recommends increased contribution. Without increase, reserves will be underfunded by 2028.',
        type: 'yes_no',
        requiredThreshold: 66.7,
        legalRef: 'Bylaws Art. VII §3; DC Code § 29-1135.02',
        attachments: [],
        financialImpact: 'Average increase: $14/month per unit. Annual revenue increase: $8,400.',
      },
    ],
    ballots: [
      { id: 'ub_b1', unitNumber: '101', owner: 'Sarah Johnson', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:05:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b2', unitNumber: '201', owner: 'Lisa Chen', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:06:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b3', unitNumber: '301', owner: 'John Smith', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:07:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b4', unitNumber: '401', owner: 'Amy Lee', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:08:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b5', unitNumber: '501', owner: 'Chris Taylor', votingPct: 2.3, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:09:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b6', unitNumber: '302', owner: 'Rachel Green', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:10:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b7', unitNumber: '402', owner: 'James Brown', votingPct: 2.1, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:11:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b8', unitNumber: '502', owner: 'Nicole White', votingPct: 2.5, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:12:00Z', isProxy: false, votes: { bi_2: 'deny' } },
      { id: 'ub_b9', unitNumber: '102', owner: 'Mike Davis', votingPct: 2.2, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:13:00Z', isProxy: false, votes: { bi_2: 'approve' } },
      { id: 'ub_b10', unitNumber: '203', owner: 'Emma Stone', votingPct: 2.2, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:14:00Z', isProxy: false, votes: { bi_2: 'deny' } },
      { id: 'ub_b11', unitNumber: '303', owner: 'David Park', votingPct: 2.2, method: 'paper', recordedBy: 'Secretary', recordedAt: '2025-12-10T20:15:00Z', isProxy: false, votes: { bi_2: 'abstain' } },
    ],
    legalRef: 'DC Code § 29-1135.02; Bylaws Art. VII §3',
    notes: 'Approved with 75% in favor. Effective January 1, 2026.',
    complianceChecks: [
      { id: 'cc_b1', rule: 'DC Code § 29-1135.02: 30-day notice for budget adoption', source: 'statute', requirement: 'Budget notice sent 30+ days before vote', status: 'pass', note: 'Notice sent November 10, 30 days before AGM.', autoChecked: false },
      { id: 'cc_b2', rule: 'Bylaws Art. VII §3: 2/3 approval for assessment increase >10%', source: 'bylaws', requirement: '3% increase under 10% threshold — board approval sufficient', status: 'pass', note: 'Increase of 3% is under the 10% bylaws cap. Owner vote conducted as best practice.', autoChecked: false },
    ],
    timeline: [
      { id: 'tl_b1', type: 'created', description: 'Budget approval vote created', date: '2025-11-20T10:00:00Z', actor: 'David Chen' },
      { id: 'tl_b2', type: 'opened', description: 'Voting opened at AGM', date: '2025-12-10T20:00:00Z', actor: 'Robert Mitchell' },
      { id: 'tl_b3', type: 'closed', description: 'Voting closed — 11 ballots', date: '2025-12-10T20:30:00Z', actor: 'David Chen' },
      { id: 'tl_b4', type: 'certified', description: 'Results certified', date: '2025-12-11T10:00:00Z', actor: 'Robert Mitchell' },
    ],
    comments: [
      { id: 'vc_1', unitNumber: '502', owner: 'Nicole White', text: 'Insurance increase seems excessive. Has the board shopped for competitive quotes?', createdAt: '2025-12-10T20:20:00Z' },
    ],
    resolution: {
      id: 'res_2',
      text: 'RESOLVED: Monthly assessments shall increase by 3% effective January 1, 2026, as approved by owner vote at the Annual General Meeting.',
      effectiveDate: '2026-01-01',
      recordedBy: 'Maria Rodriguez',
    },
    linkedCaseId: null,
    linkedMeetingId: 'mtg3',
  },
];

export const useElectionStore = create<ElectionState>((set, get) => ({
  elections: seedElections,

  loadFromDb: async (tenantId: string) => {
    const elections = await electionsSvc.fetchElections(tenantId);
    if (elections) set({ elections });
  },

  addElection: (e, tenantId?) => {
    const id = 'elec_' + Date.now();
    const now = new Date().toISOString();
    const election: Election = {
      ...e, id, createdAt: now, ballots: [],
      timeline: [{ id: tlId(), type: 'created', description: `Vote created: ${e.title}`, date: now, actor: e.createdBy }],
      comments: [], resolution: null, linkedCaseId: null,
    };
    set(s => ({ elections: [election, ...s.elections] }));
    if (isBackendEnabled && tenantId) {
      electionsSvc.createElection(tenantId, election).then(dbId => {
        if (dbId) set(s => ({ elections: s.elections.map(x => x.id === id ? { ...x, id: dbId } : x) }));
      });
    }
  },

  updateElection: (id, updates) => {
    set(s => ({ elections: s.elections.map(e => e.id === id ? { ...e, ...updates } : e) }));
    syncElection(id, updates);
  },

  deleteElection: (id) => {
    set(s => ({ elections: s.elections.filter(e => e.id !== id) }));
    if (isBackendEnabled) electionsSvc.deleteElection(id);
  },

  openElection: (id, actor) => {
    const now = new Date().toISOString();
    const tlEvent = { id: tlId(), type: 'opened' as const, description: 'Voting opened', date: now, actor };
    set(s => ({
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'open' as ElectionStatus, openedAt: now,
        timeline: [...e.timeline, tlEvent],
      } : e),
    }));
    syncElection(id, { status: 'open', openedAt: now });
    if (isBackendEnabled) electionsSvc.addTimelineEvent('', id, tlEvent);
  },

  closeElection: (id, actor) => {
    const now = new Date().toISOString();
    const tlEvent = { id: tlId(), type: 'closed' as const, description: 'Voting closed', date: now, actor };
    set(s => ({
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'closed' as ElectionStatus, closedAt: now,
        timeline: [...e.timeline, tlEvent],
      } : e),
    }));
    syncElection(id, { status: 'closed', closedAt: now });
    if (isBackendEnabled) electionsSvc.addTimelineEvent('', id, tlEvent);
  },

  certifyElection: (id, certifiedBy) => {
    const now = new Date().toISOString();
    const tlEvent = { id: tlId(), type: 'certified' as const, description: `Results certified by ${certifiedBy}`, date: now, actor: certifiedBy };
    set(s => ({
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'certified' as ElectionStatus, certifiedAt: now, certifiedBy,
        timeline: [...e.timeline, tlEvent],
      } : e),
    }));
    syncElection(id, { status: 'certified', certifiedAt: now, certifiedBy });
    if (isBackendEnabled) electionsSvc.addTimelineEvent('', id, tlEvent);
  },

  addBallotItem: (electionId, item) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: [...e.ballotItems, { ...item, id: 'bi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), attachments: [] }] }
      : e),
  })),

  updateBallotItem: (electionId, itemId, updates) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: e.ballotItems.map(i => i.id === itemId ? { ...i, ...updates } : i) }
      : e),
  })),

  removeBallotItem: (electionId, itemId) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: e.ballotItems.filter(i => i.id !== itemId) }
      : e),
  })),

  addBallotAttachment: (electionId, itemId, att) => set(s => ({
    elections: s.elections.map(e => e.id === electionId ? {
      ...e,
      ballotItems: e.ballotItems.map(i => i.id === itemId ? { ...i, attachments: [...i.attachments, { ...att, id: 'att_' + Date.now() }] } : i),
      timeline: [...e.timeline, { id: tlId(), type: 'document_added' as const, description: `Document "${att.name}" attached to "${e.ballotItems.find(x => x.id === itemId)?.title || ''}"`, date: new Date().toISOString(), actor: att.uploadedBy }],
    } : e),
  })),

  removeBallotAttachment: (electionId, itemId, attId) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: e.ballotItems.map(i => i.id === itemId ? { ...i, attachments: i.attachments.filter(a => a.id !== attId) } : i) }
      : e),
  })),

  recordBallot: (electionId, ballot, actor) => {
    const now = new Date().toISOString();
    const newBallot = { ...ballot, id: 'bal_' + Date.now(), recordedAt: now };
    const desc = ballot.isProxy
      ? `Proxy vote recorded: Unit ${ballot.unitNumber} (by ${ballot.proxyVoterName || actor})`
      : `Ballot recorded: Unit ${ballot.unitNumber} via ${ballot.method}`;
    const tlEvent = { id: tlId(), type: 'ballot_recorded' as const, description: desc, date: now, actor };
    set(s => ({
      elections: s.elections.map(e => {
        if (e.id !== electionId) return e;
        const existing = e.ballots.filter(b => b.unitNumber !== ballot.unitNumber);
        return { ...e, ballots: [...existing, newBallot], timeline: [...e.timeline, tlEvent] };
      }),
    }));
    if (isBackendEnabled) {
      electionsSvc.recordBallot('', electionId, newBallot);
      electionsSvc.addTimelineEvent('', electionId, tlEvent);
    }
  },

  removeBallot: (electionId, ballotId) => {
    set(s => ({
      elections: s.elections.map(e => e.id === electionId
        ? { ...e, ballots: e.ballots.filter(b => b.id !== ballotId) }
        : e),
    }));
    if (isBackendEnabled) electionsSvc.removeBallot(electionId, ballotId);
  },

  addComment: (electionId, comment) => {
    const now = new Date().toISOString();
    const newComment = { ...comment, id: 'vc_' + Date.now(), createdAt: now };
    const tlEvent = { id: tlId(), type: 'comment' as const, description: `Comment by Unit ${comment.unitNumber}`, date: now, actor: comment.owner };
    set(s => ({
      elections: s.elections.map(e => e.id === electionId ? {
        ...e,
        comments: [...e.comments, newComment],
        timeline: [...e.timeline, tlEvent],
      } : e),
    }));
    if (isBackendEnabled) {
      electionsSvc.addElectionComment('', electionId, newComment);
      electionsSvc.addTimelineEvent('', electionId, tlEvent);
    }
  },

  addTimelineEvent: (electionId, event) => {
    const fullEvent = { ...event, id: tlId() };
    set(s => ({
      elections: s.elections.map(e => e.id === electionId
        ? { ...e, timeline: [...e.timeline, fullEvent] }
        : e),
    }));
    if (isBackendEnabled) electionsSvc.addTimelineEvent('', electionId, fullEvent);
  },

  setComplianceChecks: (electionId, checks) => {
    set(s => ({
      elections: s.elections.map(e => e.id === electionId ? { ...e, complianceChecks: checks } : e),
    }));
    syncElection(electionId, { complianceChecks: checks });
  },

  updateComplianceCheck: (electionId, checkId, updates) => {
    set(s => ({
      elections: s.elections.map(e => e.id === electionId
        ? { ...e, complianceChecks: e.complianceChecks.map(c => c.id === checkId ? { ...c, ...updates } : c) }
        : e),
    }));
    const e = get().elections.find(x => x.id === electionId);
    if (e) syncElection(electionId, { complianceChecks: e.complianceChecks });
  },

  setResolution: (electionId, resolution) => {
    const full = { ...resolution, id: 'res_' + Date.now() };
    set(s => ({
      elections: s.elections.map(e => e.id === electionId
        ? { ...e, resolution: full }
        : e),
    }));
    syncElection(electionId, { resolution: full });
  },

  linkCase: (electionId, caseId) => {
    const now = new Date().toISOString();
    const tlEvent = { id: tlId(), type: 'case_created' as const, description: `Compliance case linked: ${caseId}`, date: now, actor: 'System' };
    set(s => ({
      elections: s.elections.map(e => e.id === electionId ? {
        ...e, linkedCaseId: caseId,
        timeline: [...e.timeline, tlEvent],
      } : e),
    }));
    syncElection(electionId, { linkedCaseId: caseId });
    if (isBackendEnabled) electionsSvc.addTimelineEvent('', electionId, tlEvent);
  },

  getResults: (electionId, units) => {
    const election = get().elections.find(e => e.id === electionId);
    if (!election) return null;

    const eligibleUnits = units;
    const totalEligiblePct = eligibleUnits.reduce((s, u) => s + u.votingPct, 0);
    const totalVotedPct = election.ballots.reduce((s, b) => s + b.votingPct, 0);
    const quorumMet = totalVotedPct >= (totalEligiblePct * election.quorumRequired / 100);

    const participationByMethod: Record<VoteMethod, number> = { paper: 0, oral: 0, virtual: 0 };
    let proxyCount = 0;
    election.ballots.forEach(b => { participationByMethod[b.method]++; if (b.isProxy) proxyCount++; });

    const itemResults: BallotItemResult[] = election.ballotItems.map(item => {
      if (item.type === 'yes_no') {
        let approvePct = 0, denyPct = 0, abstainPct = 0;
        let approveCount = 0, denyCount = 0, abstainCount = 0;
        election.ballots.forEach(ballot => {
          const choice = ballot.votes[item.id] as VoteChoice;
          if (choice === 'approve') { approvePct += ballot.votingPct; approveCount++; }
          else if (choice === 'deny') { denyPct += ballot.votingPct; denyCount++; }
          else if (choice === 'abstain') { abstainPct += ballot.votingPct; abstainCount++; }
        });
        const votingTotal = approvePct + denyPct;
        const approveOfVoting = votingTotal > 0 ? (approvePct / votingTotal) * 100 : 0;
        return {
          ballotItemId: item.id, title: item.title, type: item.type,
          approvePct: Math.round(approvePct * 100) / 100, denyPct: Math.round(denyPct * 100) / 100, abstainPct: Math.round(abstainPct * 100) / 100,
          approveCount, denyCount, abstainCount,
          passed: approveOfVoting >= item.requiredThreshold && quorumMet, threshold: item.requiredThreshold, quorumMet,
        };
      } else {
        const candidateTotals: Record<string, { pct: number; count: number }> = {};
        (item.candidates || []).forEach(c => { candidateTotals[c.id] = { pct: 0, count: 0 }; });
        election.ballots.forEach(ballot => {
          const selections = ballot.votes[item.id];
          if (Array.isArray(selections)) {
            selections.forEach(cid => { if (candidateTotals[cid]) { candidateTotals[cid].pct += ballot.votingPct; candidateTotals[cid].count++; } });
          }
        });
        const candidateResults = (item.candidates || []).map(c => ({
          candidateId: c.id, name: c.name,
          votePct: Math.round((candidateTotals[c.id]?.pct || 0) * 100) / 100,
          voteCount: candidateTotals[c.id]?.count || 0,
        })).sort((a, b) => b.votePct - a.votePct);
        return { ballotItemId: item.id, title: item.title, type: item.type, candidateResults, passed: quorumMet && candidateResults.length > 0, threshold: item.requiredThreshold, quorumMet };
      }
    });

    return { totalEligiblePct: Math.round(totalEligiblePct * 100) / 100, totalVotedPct: Math.round(totalVotedPct * 100) / 100, quorumMet, quorumRequired: election.quorumRequired, unitsBalloted: election.ballots.length, unitsEligible: eligibleUnits.length, itemResults, participationByMethod, proxyCount };
  },
}));

// ─── Compliance Engine ───

export function generateComplianceChecks(opts: {
  election: Election;
  jurisdiction: string;
  bylawDocs: Array<{ name: string; status: string }>;
  totalUnits: number;
}): ComplianceCheck[] {
  const { election, jurisdiction, bylawDocs, totalUnits } = opts;
  const checks: ComplianceCheck[] = [];
  const isDC = jurisdiction === 'DC';
  const hasBylaws = bylawDocs.some(d => d.name.toLowerCase().includes('bylaw'));
  const hasCCRs = bylawDocs.some(d => d.name.toLowerCase().includes('cc&r') || d.name.toLowerCase().includes('declaration'));

  // Notice requirements
  const noticeDays = election.noticeDate && election.openedAt
    ? Math.floor((new Date(election.openedAt).getTime() - new Date(election.noticeDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  checks.push({
    id: 'cc_notice', rule: isDC ? 'DC Code § 29-1135.08: Written notice required 10+ days before vote' : 'Bylaws: Adequate notice required before vote',
    source: isDC ? 'statute' : 'bylaws', requirement: 'Written notice must be provided at least 10 days before the vote',
    status: election.noticeDate ? (noticeDays >= 10 ? 'pass' : noticeDays >= 7 ? 'warning' : 'fail') : 'not_checked',
    note: election.noticeDate ? `${noticeDays} days notice provided` : 'Set a notice date to validate', autoChecked: true,
  });

  // Quorum
  checks.push({
    id: 'cc_quorum', rule: isDC ? 'DC Code § 29-1135.03: Quorum required for valid vote' : 'Bylaws: Quorum requirement',
    source: isDC ? 'statute' : 'bylaws', requirement: `Quorum of ${election.quorumRequired}% of ownership must participate`,
    status: 'not_checked', note: 'Will be validated when voting closes', autoChecked: false,
  });

  // Ballot item thresholds
  election.ballotItems.forEach(bi => {
    const thresholdType = bi.requiredThreshold > 60 ? 'supermajority' : 'simple majority';
    const isAmendment = election.type === 'bylaw_amendment';
    checks.push({
      id: `cc_threshold_${bi.id}`, rule: bi.legalRef || `${thresholdType} required for "${bi.title}"`,
      source: isAmendment ? 'bylaws' : 'best_practice',
      requirement: `${bi.requiredThreshold}% approval required`,
      status: isAmendment && bi.requiredThreshold < 66.7 ? 'warning' : 'pass',
      note: isAmendment && bi.requiredThreshold < 66.7 ? 'Bylaw amendments typically require supermajority (66.7%)' : `${thresholdType} threshold set`,
      autoChecked: true,
    });
  });

  // Governing documents
  checks.push({
    id: 'cc_bylaws', rule: 'Governing documents must be on file',
    source: 'best_practice', requirement: 'Current bylaws available for voter reference',
    status: hasBylaws ? 'pass' : 'fail', note: hasBylaws ? 'Bylaws on file' : 'Upload current bylaws to Building > Legal', autoChecked: true,
  });

  if (election.type === 'bylaw_amendment' || election.type === 'rule_change') {
    checks.push({
      id: 'cc_ccr', rule: 'CC&Rs/Declaration must be referenced for amendments',
      source: 'covenants', requirement: 'Current declaration/CC&Rs available',
      status: hasCCRs ? 'pass' : 'warning', note: hasCCRs ? 'CC&Rs on file' : 'Consider uploading CC&Rs for reference', autoChecked: true,
    });
  }

  // Proxy compliance
  const hasProxyBallots = election.ballots.some(b => b.isProxy);
  if (hasProxyBallots) {
    checks.push({
      id: 'cc_proxy', rule: isDC ? 'DC Code § 29-1135.10: Proxy voting requirements' : 'Bylaws: Proxy authorization requirements',
      source: isDC ? 'statute' : 'bylaws', requirement: 'Written proxy authorization must be on file for each proxy vote',
      status: 'warning', note: 'Verify proxy authorization forms are collected and filed', autoChecked: false,
    });
  }

  // Record keeping
  checks.push({
    id: 'cc_records', rule: isDC ? 'DC Code § 29-1135.13: Records retention' : 'Best practice: Retain vote records',
    source: isDC ? 'statute' : 'best_practice', requirement: 'Vote records must be retained for at least 7 years',
    status: 'pass', note: 'Records stored in system with full audit trail', autoChecked: true,
  });

  // Financial impact disclosure
  if (election.type === 'budget_approval' || election.type === 'special_assessment') {
    const hasFinImpact = election.ballotItems.some(bi => bi.financialImpact);
    checks.push({
      id: 'cc_financial', rule: 'Financial impact must be disclosed to voters',
      source: 'best_practice', requirement: 'Cost/budget impact documented on ballot items',
      status: hasFinImpact ? 'pass' : 'warning', note: hasFinImpact ? 'Financial impact documented' : 'Add financial impact to ballot items for transparency', autoChecked: true,
    });
  }

  // Secret ballot for elections
  if (election.type === 'board_election') {
    checks.push({
      id: 'cc_secret', rule: isDC ? 'DC Code § 29-1135.09: Secret ballot for board elections' : 'Best practice: Secret ballot',
      source: isDC ? 'statute' : 'best_practice', requirement: 'Board member elections should use secret ballot',
      status: 'pass', note: 'Individual votes are not disclosed to other voters in the system', autoChecked: true,
    });
  }

  return checks;
}

