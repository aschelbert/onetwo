import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export interface Meeting {
  id: string; title: string; type: string; status: string; date: string; time: string;
  location: string; virtualLink: string; agenda: string[]; notes: string;
  attendees: { board: string[]; owners: string[]; guests: string[] };
  minutes: string; votes: MeetingVote[];
  linkedCaseIds: string[];
  linkedVoteIds: string[];
  documents: MeetingDocument[];
  minutesApprovals: MinutesApproval[];
}

interface MeetingsState {
  meetings: Meeting[];
  addMeeting: (m: Omit<Meeting, 'id' | 'votes' | 'minutes' | 'attendees' | 'linkedCaseIds' | 'linkedVoteIds' | 'documents' | 'minutesApprovals'> & { attendees?: Meeting['attendees'] }) => void;
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
}

export const useMeetingsStore = create<MeetingsState>()(persist((set) => ({
  meetings: [
    { id:'mtg1', title:'February Board Meeting', type:'BOARD', status:'SCHEDULED', date:'2026-02-20', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Review January financials','Elevator maintenance proposal','Bicycle storage request','Visitor parking enforcement','Q1 landscaping contract'], notes:'', attendees:{board:[],owners:[],guests:[]}, minutes:'', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[] },
    { id:'mtg5', title:'April Board Meeting', type:'BOARD', status:'SCHEDULED', date:'2026-04-15', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Q1 financial review','Reserve fund update','Insurance renewal','Summer maintenance planning'], notes:'', attendees:{board:[],owners:[],guests:[]}, minutes:'', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[] },
    { id:'mtg4', title:'January Board Meeting', type:'BOARD', status:'COMPLETED', date:'2026-01-10', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Welcome new board members','Assign committee roles','Review outstanding issues','Approve meeting schedule for 2026'], notes:'First meeting of new board.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:[],guests:[]}, minutes:'Meeting called to order at 7:00 PM. All board members present.\n\n1. Welcome new board member Sarah Kim.\n2. Role assignments: Robert Mitchell (President), Jennifer Adams (VP), David Chen (Treasurer).\n3. 2026 meeting schedule approved.\n4. Outstanding issues reviewed.\n\nMeeting adjourned at 8:00 PM.', votes:[], linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[{name:'Robert Mitchell',role:'President',date:'2026-01-12'},{name:'Jennifer Adams',role:'Vice President',date:'2026-01-12'},{name:'David Chen',role:'Treasurer',date:'2026-01-13'}] },
    { id:'mtg2', title:'Q1 Quarterly Review', type:'QUARTERLY', status:'COMPLETED', date:'2026-01-15', time:'18:30', location:'Virtual', virtualLink:'https://zoom.us/j/example123', agenda:['Q4 2025 financial review','Reserve fund assessment','Maintenance schedule for 2026'], notes:'All board members present. Approved 2026 maintenance budget of $25,500.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:['Unit 201 — Karen Liu','Unit 305 — James Park'],guests:['PremierProperty — Diane Carter']}, minutes:'Meeting called to order at 6:30 PM.\n\n1. Q4 Financial Review — Operating expenses $2,100 under budget.\n2. Reserve Fund — Current $245K vs recommended $280K. Increase contribution by $500/month.\n3. 2026 Maintenance — Approved budget of $25,500.\n\nAdjourned at 7:45 PM.', linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[], votes:[{id:'v1',motion:'Approve 2026 maintenance budget of $25,500',type:'board',status:'passed',date:'2026-01-15',results:[{name:'Robert Mitchell',vote:'approve'},{name:'Jennifer Adams',vote:'approve'},{name:'David Chen',vote:'approve'},{name:'Maria Rodriguez',vote:'approve'},{name:'Thomas Baker',vote:'approve'}],tally:{approve:5,deny:0,abstain:0}},{id:'v2',motion:'Increase monthly reserve contribution by $500',type:'board',status:'passed',date:'2026-01-15',results:[{name:'Robert Mitchell',vote:'approve'},{name:'Jennifer Adams',vote:'approve'},{name:'David Chen',vote:'approve'},{name:'Maria Rodriguez',vote:'approve'},{name:'Thomas Baker',vote:'abstain'}],tally:{approve:4,deny:0,abstain:1}}] },
    { id:'mtg3', title:'Annual General Meeting 2025', type:'ANNUAL', status:'COMPLETED', date:'2025-12-10', time:'19:00', location:'Community Room', virtualLink:'', agenda:['Election of board members','Annual financial report','Major projects review','Fee structure for 2026','Q&A session'], notes:'Strong attendance (42 units). Fee increase approved.', attendees:{board:['Robert Mitchell','Jennifer Adams','David Chen','Maria Rodriguez','Thomas Baker'],owners:['Unit 101 — Tom Harris','Unit 201 — Karen Liu','Unit 301 — Alan Park','Unit 401 — Priya Patel','Unit 502 — Lisa Chen'],guests:['PremierProperty — Diane Carter']}, minutes:'Annual General Meeting called to order at 7:00 PM. 42 of 50 units represented (84%).\n\n1. Annual Financial Report — Revenue $425K, Expenses $310K, Surplus $15K to reserves.\n2. Board Election — Three seats filled by acclamation.\n3. Fee Structure — 3% increase approved for 2026.\n\nAdjourned at 9:15 PM.', linkedCaseIds:[], linkedVoteIds:[], documents:[], minutesApprovals:[{name:'Robert Mitchell',role:'President',date:'2025-12-15'},{name:'Jennifer Adams',role:'Vice President',date:'2025-12-15'},{name:'David Chen',role:'Treasurer',date:'2025-12-16'},{name:'Maria Rodriguez',role:'Secretary',date:'2025-12-16'},{name:'Thomas Baker',role:'Member at Large',date:'2025-12-17'}], votes:[{id:'v3',motion:'Approve 3% assessment increase for 2026',type:'owner',status:'passed',date:'2025-12-10',results:[{name:'Unit 101',vote:'approve'},{name:'Unit 201',vote:'approve'},{name:'Unit 301',vote:'approve'},{name:'Unit 401',vote:'approve'},{name:'Unit 502',vote:'abstain'}],tally:{approve:9,deny:2,abstain:1}}] },
  ],

  addMeeting: (m) => { const id = 'mtg' + Date.now(); set(s => ({ meetings: [...s.meetings, { id, title: m.title, type: m.type, status: m.status, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda, notes: m.notes, votes: [], minutes: '', attendees: m.attendees || { board: [], owners: [], guests: [] }, linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [] }] })); },
  updateMeeting: (id, m) => set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, ...m } : x) })),
  deleteMeeting: (id) => set(s => ({ meetings: s.meetings.filter(x => x.id !== id) })),
  updateAttendees: (id, attendees) => set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, attendees } : x) })),
  updateMinutes: (id, minutes) => set(s => ({ meetings: s.meetings.map(x => x.id === id ? { ...x, minutes, minutesApprovals: [] } : x) })),
  addVote: (meetingId, vote) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, votes: [...x.votes, { id: 'v' + Date.now(), ...vote }] } : x) })),
  deleteVote: (meetingId, voteId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, votes: x.votes.filter(v => v.id !== voteId) } : x) })),
  linkCase: (meetingId, caseId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedCaseIds: [...new Set([...x.linkedCaseIds, caseId])] } : x) })),
  unlinkCase: (meetingId, caseId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedCaseIds: x.linkedCaseIds.filter(c => c !== caseId) } : x) })),
  linkVote: (meetingId, voteId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedVoteIds: [...new Set([...(x.linkedVoteIds || []), voteId])] } : x) })),
  unlinkVote: (meetingId, voteId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, linkedVoteIds: (x.linkedVoteIds || []).filter(v => v !== voteId) } : x) })),
  addDocument: (meetingId, doc) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, documents: [...(x.documents || []), { id: 'doc_' + Date.now(), ...doc }] } : x) })),
  removeDocument: (meetingId, docId) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, documents: (x.documents || []).filter(d => d.id !== docId) } : x) })),
  approveMinutes: (meetingId, approval) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, minutesApprovals: [...(x.minutesApprovals || []).filter(a => a.name !== approval.name), approval] } : x) })),
  revokeMinutesApproval: (meetingId, name) => set(s => ({ meetings: s.meetings.map(x => x.id === meetingId ? { ...x, minutesApprovals: (x.minutesApprovals || []).filter(a => a.name !== name) } : x) })),
}), { name: 'onetwo-meetings' }));
