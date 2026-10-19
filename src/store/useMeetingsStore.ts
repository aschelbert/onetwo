import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as meetingsSvc from '@/lib/services/meetings';
import { generateLocalId } from '@/lib/generateId';

export interface MeetingDocument {
  id: string; name: string; size: string; type: string; uploadedAt: string; uploadedBy: string;
}

export interface MeetingVote {
  id: string; motion: string; type: 'board' | 'owner'; status: 'passed' | 'failed'; date: string;
  results: Array<{ name: string; vote: string }>; tally: { approve: number; deny: number; abstain: number };
}

export interface MinutesApproval {
  name: string; role: string; date: string;
}

export type AgendaSourceType = 'manual' | 'standing' | 'runbook' | 'case' | 'approval' | 'vote' | 'season';

export type AgendaOutcome = 'passed' | 'failed' | 'tabled' | 'noted' | 'discussed';

export interface AgendaTally {
  [memberName: string]: 'yes' | 'no' | 'abstain';
}

export interface AgendaItem {
  id: string;
  position: number;
  title: string;
  sourceType: AgendaSourceType;
  sourceId: string | null;
  requiresVote: boolean;
  locked: boolean;
  motionText?: string;
  movedBy?: string;
  secondedBy?: string;
  tally?: AgendaTally;
  outcome?: AgendaOutcome;
  notes?: string;
  conflictsDeclared?: string[];
  completedAt?: string | null;
}

export interface MeetingAttendance {
  name: string;
  present: boolean;
  byVideo: boolean;
}

export interface MinutesDoc {
  html: string;
  text: string;
}

export interface Meeting {
  id: string; title: string; type: string; status: string; date: string; time: string;
  location: string; virtualLink: string; agenda: string[]; notes: string;
  attendees: { board: string[]; owners: string[]; guests: string[] };
  minutes: string; votes: MeetingVote[];
  linkedCaseIds: string[];
  linkedVoteIds: string[];
  documents: MeetingDocument[];
  minutesApprovals: MinutesApproval[];
  agendaItems?: AgendaItem[];
  noticeSentAt?: string | null;
  reminderScheduledFor?: string | null;
  packetReady?: boolean;
  conflictCheckStatus?: unknown[];
  calledToOrderAt?: string | null;
  adjournedAt?: string | null;
  quorumMet?: boolean;
  minutesGeneratedAt?: string | null;
  minutesApprovedAt?: string | null;
  minutesDoc?: MinutesDoc | null;
  boardAttendance?: MeetingAttendance[];
  ownersPresent?: number;
}

interface MeetingsState {
  meetings: Meeting[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addMeeting: (m: Omit<Meeting, 'id' | 'votes' | 'minutes' | 'attendees' | 'linkedCaseIds' | 'linkedVoteIds' | 'documents' | 'minutesApprovals'> & { attendees?: Meeting['attendees'] }, tenantId?: string) => void;
  updateMeeting: (id: string, m: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  updateAttendees: (id: string, attendees: Meeting['attendees']) => void;
  updateMinutes: (id: string, minutes: string) => void;
  addVote: (meetingId: string, vote: Omit<MeetingVote, 'id'>) => void;
  deleteVote: (meetingId: string, voteId: string) => void;
  linkCase: (meetingId: string, caseId: string) => void;
  unlinkCase: (meetingId: string, caseId: string) => void;
  linkVote: (meetingId: string, voteId: string) => void;
  unlinkVote: (meetingId: string, voteId: string) => void;
  addDocument: (meetingId: string, doc: Omit<MeetingDocument, 'id'>) => void;
  removeDocument: (meetingId: string, docId: string) => void;
  approveMinutes: (meetingId: string, approval: MinutesApproval) => void;
  revokeMinutesApproval: (meetingId: string, name: string) => void;
  addMeetingWithAgenda: (m: Omit<Meeting, 'id' | 'votes' | 'minutes' | 'attendees' | 'linkedCaseIds' | 'linkedVoteIds' | 'documents' | 'minutesApprovals'> & { attendees?: Meeting['attendees'] }, items: Omit<AgendaItem, 'id'>[], tenantId?: string) => string;
  updateAgendaItems: (meetingId: string, items: AgendaItem[]) => void;
  setNoticeSent: (meetingId: string, at: string) => void;
  callToOrder: (meetingId: string) => void;
  adjourn: (meetingId: string) => void;
  recordAgendaItem: (meetingId: string, itemId: string, updates: Partial<AgendaItem>) => void;
  setMinutesDoc: (meetingId: string, doc: MinutesDoc) => void;
  setMinutesApprovedAt: (meetingId: string, at: string) => void;
  setBoardAttendance: (meetingId: string, attendance: MeetingAttendance[]) => void;
  setOwnersPresent: (meetingId: string, count: number) => void;
  setQuorumMet: (meetingId: string, met: boolean) => void;
}

// Helper: sync full meeting to DB after local mutation
function syncMeeting(id: string) {
  if (!isBackendEnabled) return;
  const m = useMeetingsStore.getState().meetings.find(x => x.id === id);
  if (m) meetingsSvc.updateMeeting(id, m);
}

export const useMeetingsStore = create<MeetingsState>()(persist((set) => ({
  meetings: [
    { id:'mtg1', title:'February Board Meeting', type:'BOARD', status:'SCHEDULED', date:'2026-02-20', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Review January financials','Elevator maintenance proposal','Bicycle storage request','Visitor parking enforcement','Q1 landscaping contract'], notes:'', attendees:{board:[],owners:[],guests:[]}, minutes:'', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[], agendaItems:[], noticeSentAt:null, reminderScheduledFor:null, packetReady:false, conflictCheckStatus:[] },
    { id:'mtg5', title:'April Board Meeting', type:'BOARD', status:'SCHEDULED', date:'2026-04-15', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Q1 financial review','Reserve fund update','Insurance renewal','Summer maintenance planning'], notes:'', attendees:{board:[],owners:[],guests:[]}, minutes:'', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[], agendaItems:[], noticeSentAt:null, reminderScheduledFor:null, packetReady:false, conflictCheckStatus:[] },
    { id:'mtg4', title:'January Board Meeting', type:'BOARD', status:'COMPLETED', date:'2026-01-10', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Welcome new board members','Assign committee roles','Review outstanding issues','Approve meeting schedule for 2026'], notes:'First meeting of new board.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:[],guests:[]}, minutes:'Meeting called to order at 7:00 PM. All board members present.\n\n1. Welcome new board member Sarah Kim.\n2. Role assignments: Robert Mitchell (President), Jennifer Adams (VP), David Chen (Treasurer).\n3. 2026 meeting schedule approved.\n4. Outstanding issues reviewed.\n\nMeeting adjourned at 8:00 PM.', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[{name:'Robert Mitchell',role:'President',date:'2026-01-12'},{name:'Jennifer Adams',role:'Vice President',date:'2026-01-12'},{name:'David Chen',role:'Treasurer',date:'2026-01-13'}], agendaItems:[], noticeSentAt:null, reminderScheduledFor:null, packetReady:false, conflictCheckStatus:[] },
    { id:'mtg2', title:'Q1 Quarterly Review', type:'QUARTERLY', status:'COMPLETED', date:'2026-01-15', time:'18:30', location:'Virtual', virtualLink:'https://zoom.us/j/example123', agenda:['Q4 2025 financial review','Reserve fund assessment','Maintenance schedule for 2026'], notes:'All board members present. Approved 2026 maintenance budget of $25,500.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:['Unit 201 — Karen Liu','Unit 305 — James Park'],guests:['PremierProperty — Diane Carter']}, minutes:'Meeting called to order at 6:30 PM.\n\n1. Q4 Financial Review — Operating expenses $2,100 under budget.\n2. Reserve Fund — Current $245K vs recommended $280K. Increase contribution by $500/month.\n3. 2026 Maintenance — Approved budget of $25,500.\n\nAdjourned at 7:45 PM.', linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[], agendaItems:[], noticeSentAt:null, reminderScheduledFor:null, packetReady:false, conflictCheckStatus:[], votes:[{id:'v1',motion:'Approve 2026 maintenance budget of $25,500',type:'board',status:'passed',date:'2026-01-15',results:[{name:'Robert Mitchell',vote:'approve'},{name:'Jennifer Adams',vote:'approve'},{name:'David Chen',vote:'approve'},{name:'Maria Rodriguez',vote:'approve'},{name:'Thomas Baker',vote:'approve'}],tally:{approve:5,deny:0,abstain:0}},{id:'v2',motion:'Increase monthly reserve contribution by $500',type:'board',status:'passed',date:'2026-01-15',results:[{name:'Robert Mitchell',vote:'approve'},{name:'Jennifer Adams',vote:'approve'},{name:'David Chen',vote:'approve'},{name:'Maria Rodriguez',vote:'approve'},{name:'Thomas Baker',vote:'abstain'}],tally:{approve:4,deny:0,abstain:1}}] },
    { id:'mtg3', title:'Annual General Meeting 2025', type:'ANNUAL', status:'COMPLETED', date:'2025-12-10', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Election of board members','Annual financial report','Major projects review','Fee structure for 2026','Q&A session'], notes:'Strong attendance (42 units). Fee increase approved.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:['Unit 101 — Tom Harris','Unit 201 — Karen Liu','Unit 301 — Alan Park','Unit 401 — Priya Patel','Unit 502 — Lisa Chen'],guests:['PremierProperty — Diane Carter']}, minutes:'Annual General Meeting called to order at 7:00 PM. 42 of 50 units represented (84%).\n\n1. Annual Financial Report — Revenue $425K, Expenses $310K, Surplus $15K to reserves.\n2. Board Election — Three seats filled by acclamation.\n3. Fee Structure — 3% increase approved for 2026.\n\nAdjourned at 9:15 PM.', linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[{name:'Robert Mitchell',role:'President',date:'2025-12-15'},{name:'Jennifer Adams',role:'Vice President',date:'2025-12-15'},{name:'David Chen',role:'Treasurer',date:'2025-12-16'},{name:'Maria Rodriguez',role:'Secretary',date:'2025-12-16'},{name:'Thomas Baker',role:'Member at Large',date:'2025-12-17'}], agendaItems:[], noticeSentAt:null, reminderScheduledFor:null, packetReady:false, conflictCheckStatus:[], votes:[{id:'v3',motion:'Approve 3% assessment increase for 2026',type:'owner',status:'passed',date:'2025-12-10',results:[{name:'Unit 101',vote:'approve'},{name:'Unit 201',vote:'approve'},{name:'Unit 301',vote:'approve'},{name:'Unit 401',vote:'approve'},{name:'Unit 502',vote:'abstain'}],tally:{approve:9,deny:2,abstain:1}}] },
  ],

  loadFromDb: async (tenantId: string) => {
    const meetings = await meetingsSvc.fetchMeetings(tenantId);
    if (meetings) set({ meetings });
  },

  addMeeting: (m, tenantId?) => {
    const id = generateLocalId('mtg');
    const meeting: Meeting = { id, title: m.title, type: m.type, status: m.status, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda, notes: m.notes, votes: [], minutes: '', attendees: m.attendees || { board: [], owners: [], guests: [] }, linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [], agendaItems: m.agendaItems || [], noticeSentAt: m.noticeSentAt || null, reminderScheduledFor: m.reminderScheduledFor || null, packetReady: m.packetReady || false, conflictCheckStatus: m.conflictCheckStatus || [] };
    set(s => ({ meetings: [...s.meetings, meeting] }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      meetingsSvc.createMeeting(tid, meeting).then(dbRow => {
        if (dbRow) set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      }).catch(err => {
        console.error('[syncWrite] createMeeting failed:', err);
        set(s => ({ meetings: s.meetings.filter(x => x.id !== id) }));
      });
    }
  },
  updateMeeting: (id, m) => { set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, ...m } : x) })); syncMeeting(id); },
  deleteMeeting: (id) => { set(s => ({ meetings: s.meetings.filter(x => x.id !== id) })); if (isBackendEnabled) meetingsSvc.deleteMeeting(id); },
  updateAttendees: (id, attendees) => { set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, attendees } : x) })); syncMeeting(id); },
  updateMinutes: (id, minutes) => { set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, minutes, minutesApprovals: [] } : x) })); syncMeeting(id); },
  addVote: (meetingId, vote) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, votes: [...x.votes, { id: generateLocalId('v'), ...vote }] } : x) })); syncMeeting(meetingId); },
  deleteVote: (meetingId, voteId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, votes: x.votes.filter(v => v.id !== voteId) } : x) })); syncMeeting(meetingId); },
  linkCase: (meetingId, caseId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedCaseIds: [...new Set([...x.linkedCaseIds, caseId])] } : x) })); syncMeeting(meetingId); },
  unlinkCase: (meetingId, caseId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedCaseIds: x.linkedCaseIds.filter(c => c !== caseId) } : x) })); syncMeeting(meetingId); },
  linkVote: (meetingId, voteId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedVoteIds: [...new Set([...(x.linkedVoteIds || []), voteId])] } : x) })); syncMeeting(meetingId); },
  unlinkVote: (meetingId, voteId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedVoteIds: (x.linkedVoteIds || []).filter(v => v !== voteId) } : x) })); syncMeeting(meetingId); },
  addDocument: (meetingId, doc) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, documents: [...(x.documents || []), { id: generateLocalId('doc_'), ...doc }] } : x) })); syncMeeting(meetingId); },
  removeDocument: (meetingId, docId) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, documents: (x.documents || []).filter(d => d.id !== docId) } : x) })); syncMeeting(meetingId); },
  approveMinutes: (meetingId, approval) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, minutesApprovals: [...(x.minutesApprovals || []).filter(a => a.name !== approval.name), approval] } : x) })); syncMeeting(meetingId); },
  revokeMinutesApproval: (meetingId, name) => { set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, minutesApprovals: (x.minutesApprovals || []).filter(a => a.name !== name) } : x) })); syncMeeting(meetingId); },

  addMeetingWithAgenda: (m, items, tenantId?) => {
    const id = generateLocalId('mtg');
    const agendaItems: AgendaItem[] = items.map(item => ({ ...item, id: generateLocalId('ai') }));
    const agenda = agendaItems.map(ai => ai.title);
    const meeting: Meeting = {
      id, title: m.title, type: m.type, status: m.status, date: m.date, time: m.time,
      location: m.location, virtualLink: m.virtualLink, agenda, notes: m.notes,
      votes: [], minutes: '',
      attendees: m.attendees || { board: [], owners: [], guests: [] },
      linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [],
      agendaItems, noticeSentAt: m.noticeSentAt || null,
      reminderScheduledFor: m.reminderScheduledFor || null,
      packetReady: m.packetReady || false,
      conflictCheckStatus: m.conflictCheckStatus || [],
    };
    set(s => ({ meetings: [...s.meetings, meeting] }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      meetingsSvc.createMeetingWithAgenda(tid, meeting, agendaItems).then(dbRow => {
        if (dbRow) set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      }).catch(err => {
        console.error('[syncWrite] createMeetingWithAgenda failed:', err);
        set(s => ({ meetings: s.meetings.filter(x => x.id !== id) }));
      });
    }
    return id;
  },

  updateAgendaItems: (meetingId, items) => {
    const agenda = items.map(ai => ai.title);
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, agendaItems: items, agenda } : x) }));
    syncMeeting(meetingId);
    if (isBackendEnabled) {
      meetingsSvc.upsertAgendaItems(meetingId, items);
    }
  },

  setNoticeSent: (meetingId, at) => {
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, noticeSentAt: at } : x) }));
    syncMeeting(meetingId);
  },

  callToOrder: (meetingId) => {
    const now = new Date().toISOString();
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, calledToOrderAt: now, status: 'IN_PROGRESS' } : x) }));
    syncMeeting(meetingId);
  },

  adjourn: (meetingId) => {
    const now = new Date().toISOString();
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, adjournedAt: now, status: 'COMPLETED' } : x) }));
    syncMeeting(meetingId);
  },

  recordAgendaItem: (meetingId, itemId, updates) => {
    set(s => ({
      meetings: s.meetings.map(x => {
        if (x.id !== meetingId) return x;
        const agendaItems = (x.agendaItems || []).map(ai =>
          ai.id === itemId ? { ...ai, ...updates } : ai
        );
        // Also derive the legacy votes array from any vote items
        const newVotes: MeetingVote[] = [];
        for (const ai of agendaItems) {
          if (ai.requiresVote && ai.tally && ai.outcome) {
            const results = Object.entries(ai.tally).map(([name, vote]) => ({
              name,
              vote: vote === 'yes' ? 'approve' : vote === 'no' ? 'deny' : 'abstain',
            }));
            const tally = {
              approve: results.filter(r => r.vote === 'approve').length,
              deny: results.filter(r => r.vote === 'deny').length,
              abstain: results.filter(r => r.vote === 'abstain').length,
            };
            newVotes.push({
              id: ai.id,
              motion: ai.motionText || ai.title,
              type: 'board',
              status: ai.outcome === 'passed' ? 'passed' : 'failed',
              date: x.date,
              results,
              tally,
            });
          }
        }
        return { ...x, agendaItems, votes: newVotes.length > 0 ? newVotes : x.votes };
      }),
    }));
    syncMeeting(meetingId);
  },

  setMinutesDoc: (meetingId, doc) => {
    const now = new Date().toISOString();
    set(s => ({
      meetings: s.meetings.map(x => x.id === meetingId
        ? { ...x, minutesDoc: doc, minutesGeneratedAt: now, minutes: doc.text }
        : x),
    }));
    syncMeeting(meetingId);
  },

  setMinutesApprovedAt: (meetingId, at) => {
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, minutesApprovedAt: at } : x) }));
    syncMeeting(meetingId);
  },

  setBoardAttendance: (meetingId, attendance) => {
    const presentNames = attendance.filter(a => a.present).map(a => a.name);
    set(s => ({
      meetings: s.meetings.map(x => x.id === meetingId
        ? { ...x, boardAttendance: attendance, attendees: { ...x.attendees, board: presentNames } }
        : x),
    }));
    syncMeeting(meetingId);
  },

  setOwnersPresent: (meetingId, count) => {
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, ownersPresent: count } : x) }));
    syncMeeting(meetingId);
  },

  setQuorumMet: (meetingId, met) => {
    set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, quorumMet: met } : x) }));
    syncMeeting(meetingId);
  },
}), {
  name: 'onetwo-meetings',
  version: 5,
  migrate: () => ({}),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    meetings: persisted?.meetings?.length
      ? persisted.meetings.map((m: any) => ({
          ...m,
          agendaItems: m.agendaItems || [],
          noticeSentAt: m.noticeSentAt ?? null,
          reminderScheduledFor: m.reminderScheduledFor ?? null,
          packetReady: m.packetReady ?? false,
          conflictCheckStatus: m.conflictCheckStatus ?? [],
          calledToOrderAt: m.calledToOrderAt ?? null,
          adjournedAt: m.adjournedAt ?? null,
          quorumMet: m.quorumMet ?? undefined,
          minutesGeneratedAt: m.minutesGeneratedAt ?? null,
          minutesApprovedAt: m.minutesApprovedAt ?? null,
          minutesDoc: m.minutesDoc ?? null,
          boardAttendance: m.boardAttendance ?? [],
          ownersPresent: m.ownersPresent ?? 0,
        }))
      : current.meetings,
  }),
}));
