import { create } from 'zustand';

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
  addElection: (e: Omit<Election, 'id' | 'createdAt' | 'ballots' | 'timeline' | 'comments' | 'resolution' | 'linkedCaseId'>) => void;
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

export const useElectionStore = create<ElectionState>((set, get) => ({
  elections: [],

  addElection: (e) => set(s => {
    const id = 'elec_' + Date.now();
    const now = new Date().toISOString();
    return {
      elections: [{
        ...e, id, createdAt: now, ballots: [],
        timeline: [{ id: tlId(), type: 'created', description: `Vote created: ${e.title}`, date: now, actor: e.createdBy }],
        comments: [], resolution: null, linkedCaseId: null,
      }, ...s.elections],
    };
  }),

  updateElection: (id, updates) => set(s => ({
    elections: s.elections.map(e => e.id === id ? { ...e, ...updates } : e),
  })),

  deleteElection: (id) => set(s => ({
    elections: s.elections.filter(e => e.id !== id),
  })),

  openElection: (id, actor) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'open' as ElectionStatus, openedAt: now,
        timeline: [...e.timeline, { id: tlId(), type: 'opened' as const, description: 'Voting opened', date: now, actor }],
      } : e),
    };
  }),

  closeElection: (id, actor) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'closed' as ElectionStatus, closedAt: now,
        timeline: [...e.timeline, { id: tlId(), type: 'closed' as const, description: 'Voting closed', date: now, actor }],
      } : e),
    };
  }),

  certifyElection: (id, certifiedBy) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => e.id === id ? {
        ...e, status: 'certified' as ElectionStatus, certifiedAt: now, certifiedBy,
        timeline: [...e.timeline, { id: tlId(), type: 'certified' as const, description: `Results certified by ${certifiedBy}`, date: now, actor: certifiedBy }],
      } : e),
    };
  }),

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

  recordBallot: (electionId, ballot, actor) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => {
        if (e.id !== electionId) return e;
        const existing = e.ballots.filter(b => b.unitNumber !== ballot.unitNumber);
        const desc = ballot.isProxy
          ? `Proxy vote recorded: Unit ${ballot.unitNumber} (by ${ballot.proxyVoterName || actor})`
          : `Ballot recorded: Unit ${ballot.unitNumber} via ${ballot.method}`;
        return {
          ...e,
          ballots: [...existing, { ...ballot, id: 'bal_' + Date.now(), recordedAt: now }],
          timeline: [...e.timeline, { id: tlId(), type: 'ballot_recorded' as const, description: desc, date: now, actor }],
        };
      }),
    };
  }),

  removeBallot: (electionId, ballotId) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballots: e.ballots.filter(b => b.id !== ballotId) }
      : e),
  })),

  addComment: (electionId, comment) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => e.id === electionId ? {
        ...e,
        comments: [...e.comments, { ...comment, id: 'vc_' + Date.now(), createdAt: now }],
        timeline: [...e.timeline, { id: tlId(), type: 'comment' as const, description: `Comment by Unit ${comment.unitNumber}`, date: now, actor: comment.owner }],
      } : e),
    };
  }),

  addTimelineEvent: (electionId, event) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, timeline: [...e.timeline, { ...event, id: tlId() }] }
      : e),
  })),

  setComplianceChecks: (electionId, checks) => set(s => ({
    elections: s.elections.map(e => e.id === electionId ? { ...e, complianceChecks: checks } : e),
  })),

  updateComplianceCheck: (electionId, checkId, updates) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, complianceChecks: e.complianceChecks.map(c => c.id === checkId ? { ...c, ...updates } : c) }
      : e),
  })),

  setResolution: (electionId, resolution) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, resolution: { ...resolution, id: 'res_' + Date.now() } }
      : e),
  })),

  linkCase: (electionId, caseId) => set(s => {
    const now = new Date().toISOString();
    return {
      elections: s.elections.map(e => e.id === electionId ? {
        ...e, linkedCaseId: caseId,
        timeline: [...e.timeline, { id: tlId(), type: 'case_created' as const, description: `Compliance case linked: ${caseId}`, date: now, actor: 'System' }],
      } : e),
    };
  }),

  getResults: (electionId, units) => {
    const election = get().elections.find(e => e.id === electionId);
    if (!election) return null;

    const eligibleUnits = units.filter(u => u.status === 'OCCUPIED');
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

