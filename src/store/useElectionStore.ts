import { create } from 'zustand';

// ─── Types ───

export type VoteMethod = 'paper' | 'oral' | 'virtual';
export type VoteChoice = 'approve' | 'deny' | 'abstain';
export type ElectionStatus = 'draft' | 'open' | 'closed' | 'certified';
export type ElectionType = 'board_election' | 'budget_approval' | 'special_assessment' | 'bylaw_amendment' | 'rule_change' | 'other';

export interface Candidate {
  id: string;
  name: string;
  unit: string;
  bio: string;
}

export interface BallotItem {
  id: string;
  title: string;           // e.g., "Approve FY 2026 Budget", "Elect Board President"
  description: string;
  type: 'yes_no' | 'multi_candidate' | 'multi_select';  // yes/no motion, pick one candidate, pick N candidates
  candidates?: Candidate[];
  maxSelections?: number;   // for multi_select (e.g., "elect 3 board members")
  requiredThreshold: number; // % needed to pass (e.g., 50.1 for simple majority, 66.7 for supermajority)
  legalRef: string;         // bylaw or statutory reference for this threshold
}

export interface UnitBallot {
  id: string;
  unitNumber: string;
  owner: string;
  votingPct: number;        // from unit record
  method: VoteMethod;
  recordedBy: string;       // who recorded (for paper/oral)
  recordedAt: string;       // ISO datetime
  proxyFor?: string;        // if voting by proxy, who authorized
  votes: Record<string, VoteChoice | string[]>;  // ballotItemId → choice or candidate IDs
}

export interface BallotItemResult {
  ballotItemId: string;
  title: string;
  type: 'yes_no' | 'multi_candidate' | 'multi_select';
  // For yes/no
  approvePct?: number;
  denyPct?: number;
  abstainPct?: number;
  approveCount?: number;
  denyCount?: number;
  abstainCount?: number;
  // For candidate elections
  candidateResults?: Array<{ candidateId: string; name: string; votePct: number; voteCount: number }>;
  // Outcome
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
  quorumRequired: number;      // % of ownership needed to participate
  ballotItems: BallotItem[];
  ballots: UnitBallot[];       // one per unit that voted
  legalRef: string;
  notes: string;
}

interface ElectionState {
  elections: Election[];
  addElection: (e: Omit<Election, 'id' | 'createdAt' | 'ballots'>) => void;
  updateElection: (id: string, updates: Partial<Election>) => void;
  deleteElection: (id: string) => void;
  openElection: (id: string) => void;
  closeElection: (id: string) => void;
  certifyElection: (id: string, certifiedBy: string) => void;
  addBallotItem: (electionId: string, item: Omit<BallotItem, 'id'>) => void;
  removeBallotItem: (electionId: string, itemId: string) => void;
  recordBallot: (electionId: string, ballot: Omit<UnitBallot, 'id' | 'recordedAt'>) => void;
  removeBallot: (electionId: string, ballotId: string) => void;
  getResults: (electionId: string, units: Array<{ number: string; votingPct: number; status: string }>) => {
    totalEligiblePct: number;
    totalVotedPct: number;
    quorumMet: boolean;
    quorumRequired: number;
    unitsBalloted: number;
    unitsEligible: number;
    itemResults: BallotItemResult[];
  } | null;
}

export const useElectionStore = create<ElectionState>((set, get) => ({
  elections: [],

  addElection: (e) => set(s => ({
    elections: [{ ...e, id: 'elec_' + Date.now(), createdAt: new Date().toISOString(), ballots: [] }, ...s.elections],
  })),

  updateElection: (id, updates) => set(s => ({
    elections: s.elections.map(e => e.id === id ? { ...e, ...updates } : e),
  })),

  deleteElection: (id) => set(s => ({
    elections: s.elections.filter(e => e.id !== id),
  })),

  openElection: (id) => set(s => ({
    elections: s.elections.map(e => e.id === id ? { ...e, status: 'open', openedAt: new Date().toISOString() } : e),
  })),

  closeElection: (id) => set(s => ({
    elections: s.elections.map(e => e.id === id ? { ...e, status: 'closed', closedAt: new Date().toISOString() } : e),
  })),

  certifyElection: (id, certifiedBy) => set(s => ({
    elections: s.elections.map(e => e.id === id ? { ...e, status: 'certified', certifiedAt: new Date().toISOString(), certifiedBy } : e),
  })),

  addBallotItem: (electionId, item) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: [...e.ballotItems, { ...item, id: 'bi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }] }
      : e),
  })),

  removeBallotItem: (electionId, itemId) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballotItems: e.ballotItems.filter(i => i.id !== itemId) }
      : e),
  })),

  recordBallot: (electionId, ballot) => set(s => ({
    elections: s.elections.map(e => {
      if (e.id !== electionId) return e;
      // Replace existing ballot for same unit
      const existing = e.ballots.filter(b => b.unitNumber !== ballot.unitNumber);
      return { ...e, ballots: [...existing, { ...ballot, id: 'bal_' + Date.now(), recordedAt: new Date().toISOString() }] };
    }),
  })),

  removeBallot: (electionId, ballotId) => set(s => ({
    elections: s.elections.map(e => e.id === electionId
      ? { ...e, ballots: e.ballots.filter(b => b.id !== ballotId) }
      : e),
  })),

  getResults: (electionId, units) => {
    const election = get().elections.find(e => e.id === electionId);
    if (!election) return null;

    const eligibleUnits = units.filter(u => u.status === 'OCCUPIED');
    const totalEligiblePct = eligibleUnits.reduce((s, u) => s + u.votingPct, 0);
    const votedUnits = election.ballots.map(b => b.unitNumber);
    const totalVotedPct = election.ballots.reduce((s, b) => s + b.votingPct, 0);
    const quorumMet = totalVotedPct >= (totalEligiblePct * election.quorumRequired / 100);

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
        const votingTotal = approvePct + denyPct; // abstain doesn't count toward threshold
        const approveOfVoting = votingTotal > 0 ? (approvePct / votingTotal) * 100 : 0;
        return {
          ballotItemId: item.id, title: item.title, type: item.type,
          approvePct: Math.round(approvePct * 100) / 100,
          denyPct: Math.round(denyPct * 100) / 100,
          abstainPct: Math.round(abstainPct * 100) / 100,
          approveCount, denyCount, abstainCount,
          passed: approveOfVoting >= item.requiredThreshold && quorumMet,
          threshold: item.requiredThreshold,
          quorumMet,
        };
      } else {
        // Candidate election: tally by candidate
        const candidateTotals: Record<string, { pct: number; count: number }> = {};
        (item.candidates || []).forEach(c => { candidateTotals[c.id] = { pct: 0, count: 0 }; });
        election.ballots.forEach(ballot => {
          const selections = ballot.votes[item.id];
          if (Array.isArray(selections)) {
            selections.forEach(candidateId => {
              if (candidateTotals[candidateId]) {
                candidateTotals[candidateId].pct += ballot.votingPct;
                candidateTotals[candidateId].count++;
              }
            });
          }
        });
        const candidateResults = (item.candidates || []).map(c => ({
          candidateId: c.id,
          name: c.name,
          votePct: Math.round((candidateTotals[c.id]?.pct || 0) * 100) / 100,
          voteCount: candidateTotals[c.id]?.count || 0,
        })).sort((a, b) => b.votePct - a.votePct);

        return {
          ballotItemId: item.id, title: item.title, type: item.type,
          candidateResults,
          passed: quorumMet && candidateResults.length > 0,
          threshold: item.requiredThreshold,
          quorumMet,
        };
      }
    });

    return {
      totalEligiblePct: Math.round(totalEligiblePct * 100) / 100,
      totalVotedPct: Math.round(totalVotedPct * 100) / 100,
      quorumMet,
      quorumRequired: election.quorumRequired,
      unitsBalloted: election.ballots.length,
      unitsEligible: eligibleUnits.length,
      itemResults,
    };
  },
}));

