import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore, type Meeting } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useLetterStore } from '@/store/useLetterStore';
import { supabase } from '@/lib/supabase';
import { refreshComplianceRequirements, type ComplianceCategory } from '@/lib/complianceRefresh';
import VotingPage from '@/features/elections/ElectionsPage';
import IssuesPage from '@/features/issues/IssuesPage';
import LetterEngineTab from './tabs/LetterEngineTab';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';

const ROLE_COLORS: Record<string, string> = { President:'accent', 'Vice President':'mist', Treasurer:'sage', Secretary:'yellow', 'Member at Large':'purple' };
const DUTY_LABELS: Record<string, string> = { care:'Duty of Care', loyalty:'Duty of Loyalty', obedience:'Duty of Obedience' };
const DUTY_COLORS: Record<string, string> = { care:'accent', loyalty:'violet', obedience:'amber' };
const COMM_TYPES: Record<string, string> = { notice:'bg-accent-100 text-accent-700', minutes:'bg-sage-100 text-sage-700', financial:'bg-yellow-100 text-yellow-700', response:'bg-mist-100 text-ink-600', resale:'bg-ink-100 text-ink-600', violation:'bg-red-100 text-red-700', other:'bg-ink-100 text-ink-500' };
const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

type TabId = 'duties' | 'runbook' | 'meetings' | 'votes' | 'communications' | 'dailyops' | 'letters';
type ModalType = null | 'addFiling' | 'markFiled' | 'addComm' | 'addMeeting' | 'editMeeting' | 'attendees' | 'minutes' | 'addFilingAtt' | 'linkCaseToMeeting' | 'createCaseForMeeting' | 'addRunbookAtt' | 'runbookLinkOrCreate' | 'addDocument' | 'addAnnouncement';

function RunbookActionMenu({ itemId, itemTask, onAttach, onComm, onCase, onMeeting }: {
  itemId: string; itemTask: string; onAttach: () => void; onComm: () => void; onCase: () => void; onMeeting: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} className="p-1.5 hover:bg-ink-100 rounded-lg transition-colors">
        <svg className="w-4 h-4 text-ink-400" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-ink-200 rounded-lg shadow-lg py-1 w-48">
          {[{ label: '📎 Attach Document', action: onAttach }, { label: '✉️ Send Communication', action: onComm }, { label: '📋 Add Case', action: onCase }, { label: '📅 Schedule Meeting', action: onMeeting }].map(item => (
            <button key={item.label} onClick={() => { item.action(); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-mist-50">{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardRoomPage() {
  const comp = useComplianceStore();
  const mtg = useMeetingsStore();
  const { board, address, legalDocuments, insurance, management } = useBuildingStore();
  const issues = useIssuesStore();
  const elections = useElectionStore();
  const { currentRole, currentUser, buildingMembers } = useAuthStore();
  const letterStore = useLetterStore();
  const navigate = useNavigate();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const refreshResult = refreshComplianceRequirements({ state: address.state, legalDocuments: legalDocuments.map(d => ({ name: d.name, status: d.status })), insurance: insurance.map(p => ({ type: p.type, expires: p.expires })), boardCount: board.length, hasManagement: !!management.company });
  const categories = refreshResult.categories;

  const [tab, setTab] = useState<TabId>('duties');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState<ModalType>(null);
  const [targetId, setTargetId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const [mForm, setMForm] = useState({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED', requiresVote: false, voteScope: 'board' as 'board' | 'owner', voteItems: [] as number[], sendNotice: false });
  const [attForm, setAttForm] = useState({ board: [] as string[], owners: '' as string, guests: '' as string });
  const [minText, setMinText] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedRunbook, setExpandedRunbook] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<Record<string, boolean[]>>({});
  const [pendingFile, setPendingFile] = useState<{ name: string; size: string; type: string } | null>(null);
  const [linkCaseId, setLinkCaseId] = useState('');
  const [newCaseForm, setNewCaseForm] = useState({ catId: 'governance', sitId: 'board-meetings', title: '', priority: 'medium' as string });
  const [runbookAction, setRunbookAction] = useState<'case' | 'meeting'>('case');
  const [runbookSort, setRunbookSort] = useState<'date' | 'category'>('date');
  const [runbookItemForMeeting, setRunbookItemForMeeting] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Completion = all workflow steps checked
  const isItemComplete = (itemId: string, howToLength: number): boolean => {
    const steps = workflowSteps[itemId];
    if (!steps || steps.length === 0) return false;
    return steps.length >= howToLength && steps.every(Boolean);
  };

  // Compliance scores (driven by workflow completion)
  const catScores = categories.map(c => { const filtered = roleFilter === 'all' ? c.items : c.items.filter(i => i.role === roleFilter); const passed = filtered.filter(i => isItemComplete(i.id, i.howTo.length)).length; const pct = filtered.length > 0 ? Math.round((passed / filtered.length) * 100) : 100; return { ...c, items: filtered, passed, total: filtered.length, pct }; });
  const totalWeight = catScores.reduce((s, c) => s + c.weight, 0);
  const healthIndex = Math.round(catScores.reduce((s, c) => s + (c.pct * c.weight) / totalWeight, 0));
  const grade = healthIndex >= 90 ? 'A' : healthIndex >= 80 ? 'B' : healthIndex >= 70 ? 'C' : healthIndex >= 60 ? 'D' : 'F';
  const allRoles: string[] = [...new Set(categories.flatMap(c => c.items.map(i => i.role)))];

  // Meeting data
  const { meetings } = mtg;
  const isDC = address.state === 'District of Columbia';
  const jurisdiction = isDC ? 'DC' : address.state;
  const hasBylaws = legalDocuments.some(d => d.name.toLowerCase().includes('bylaw'));
  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
  const openElections = elections.elections.filter(e => e.status === 'open').length;

  // Filing counts for runbook badge
  const overdueFilings = comp.filings.filter(fi => fi.status === 'pending' && new Date(fi.dueDate) < new Date()).length;

  // Vote defaults
  const getVoteDefaults = (meetingType: string): { requiresVote: boolean; voteScope: 'board' | 'owner'; reason: string } => {
    const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`;
    switch (meetingType) {
      case 'ANNUAL': return { requiresVote: true, voteScope: 'owner', reason: `Required: Board elections & budget approval (${stateAct})` };
      case 'SPECIAL': return { requiresVote: true, voteScope: 'owner', reason: `Typically required: Special meetings called for owner vote (${stateAct})` };
      case 'BOARD': return { requiresVote: false, voteScope: 'board', reason: 'Board meetings may include motions but votes are not always required' };
      case 'QUARTERLY': return { requiresVote: false, voteScope: 'board', reason: 'Quarterly reviews typically informational; toggle on if motions planned' };
      case 'EMERGENCY': return { requiresVote: true, voteScope: 'board', reason: 'Emergency actions often require board ratification vote' };
      default: return { requiresVote: false, voteScope: 'board', reason: '' };
    }
  };

  // Meeting handlers
  const openAddMeeting = () => { const d = getVoteDefaults('BOARD'); setRunbookItemForMeeting(null); setMForm({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED', requiresVote: d.requiresVote, voteScope: d.voteScope, voteItems: [], sendNotice: false }); setModal('addMeeting'); };
  const openEditMeeting = (m: Meeting) => { setTargetId(m.id); setMForm({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda.join('\n'), notes: m.notes, status: m.status, requiresVote: false, voteScope: 'board', voteItems: [], sendNotice: false }); setModal('editMeeting'); };
  const openAttendees = (m: Meeting) => { setTargetId(m.id); setAttForm({ board: [...m.attendees.board], owners: m.attendees.owners.join('\n'), guests: m.attendees.guests.join('\n') }); setModal('attendees'); };
  const openMinutes = (m: Meeting) => { setTargetId(m.id); setMinText(m.minutes); setModal('minutes'); };

  const sendMeetingNotice = async (meeting: { title: string; date: string; time: string; location: string; virtualLink: string; agenda: string[] }) => {
    setSendingEmail(true);
    try {
      const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      if (!sbUrl || !sbKey) { alert('Meeting saved! Email not sent — Supabase not configured.'); return; }
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const recipients = buildingMembers.filter(m => m.email && m.status === 'active').map(m => ({ email: m.email, name: m.name }));
      const res = await fetch(`${sbUrl}/functions/v1/send-meeting-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`, 'apikey': sbKey },
        body: JSON.stringify({ title: meeting.title, date: meeting.date, time: meeting.time, location: meeting.location, virtualLink: meeting.virtualLink, agenda: meeting.agenda, recipients }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sent > 0) alert(`Meeting notice emailed to ${data.sent} member${data.sent !== 1 ? 's' : ''}.`);
        else alert('Meeting saved. No recipients to email.');
      } else { alert('Meeting saved but email failed to send.'); }
    } catch { alert('Meeting saved but email failed to send.'); }
    finally { setSendingEmail(false); }
  };

  const saveMeeting = () => {
    if (!mForm.title || !mForm.date) { alert('Title and date required'); return; }
    const agenda = mForm.agenda.split('\n').map(s => s.trim()).filter(Boolean);
    if (agenda.length === 0) { alert('At least one agenda item is required'); return; }
    if (modal === 'addMeeting') {
      mtg.addMeeting({ title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
      const freshMeetings = useMeetingsStore.getState().meetings;
      const newMeetingId = freshMeetings[freshMeetings.length - 1]?.id;
      if (mForm.requiresVote && newMeetingId) {
        // Use explicitly selected items, or fall back to auto-detected
        const voteKeywordsRe = /\b(approv|adopt|ratif|elect|amend|authori|resolv|vote|budget|assess|special assessment|terminat|contract|remov|waiv)\w*/i;
        const autoDetectedIdx = agenda.map((a, i) => voteKeywordsRe.test(a) ? i : -1).filter(i => i >= 0);
        const effectiveItems = mForm.voteItems.length > 0 ? mForm.voteItems : autoDetectedIdx;
        const selectedAgenda = effectiveItems.map(i => agenda[i]).filter(Boolean);
        if (selectedAgenda.length > 0) {
        const typeMap: Record<string, string> = { ANNUAL: 'budget_approval', SPECIAL: 'special_assessment', BOARD: 'meeting_motion', QUARTERLY: 'meeting_motion', EMERGENCY: 'meeting_motion' };
        const elType = (typeMap[mForm.type] || 'meeting_motion') as any;
        const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`;
        elections.addElection({
          title: `${mForm.title} — Vote`, type: elType, status: 'draft',
          description: `Vote items for ${mForm.title} on ${mForm.date}. ${mForm.voteScope === 'owner' ? 'Owner vote' : 'Board vote'}.`,
          createdBy: 'Board', openedAt: null, closedAt: null, certifiedAt: null, certifiedBy: null,
          scheduledCloseDate: mForm.date, noticeDate: null,
          quorumRequired: mForm.voteScope === 'owner' ? 25 : 50.1,
          ballotItems: selectedAgenda.map((item, i) => ({ id: 'bi_auto_' + Date.now() + '_' + i, title: item, description: `Agenda item from ${mForm.title}`, rationale: '', type: 'yes_no' as const, requiredThreshold: 50.1, legalRef: stateAct, attachments: [] })),
          legalRef: stateAct, notes: `Auto-created from meeting: ${mForm.title}. Scope: ${mForm.voteScope} vote.`,
          complianceChecks: [], linkedMeetingId: newMeetingId,
        });
        const freshElections = useElectionStore.getState().elections;
        const newElectionId = freshElections[0]?.id;
        if (newElectionId) useMeetingsStore.getState().linkVote(newMeetingId, newElectionId);
        }
      }
    } else {
      mtg.updateMeeting(targetId, { title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
    }
    // Send meeting notice email if checkbox was checked
    if (mForm.sendNotice && (mForm.status === 'SCHEDULED' || mForm.status === 'RESCHEDULED')) {
      sendMeetingNotice({ title: mForm.title, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda });
    }
    setModal(null);
    // If this meeting was created from a runbook item, complete the "schedule meeting" workflow step
    if (runbookItemForMeeting && modal === 'addMeeting') {
      const item = categories.flatMap(c => c.items).find(i => i.id === runbookItemForMeeting);
      if (item) {
        setWorkflowSteps(prev => ({ ...prev, [runbookItemForMeeting!]: item.howTo.map(() => true) }));
      }
      setRunbookItemForMeeting(null);
    }
  };
  const saveAttendees = () => { mtg.updateAttendees(targetId, { board: attForm.board, owners: attForm.owners.split('\n').map(s => s.trim()).filter(Boolean), guests: attForm.guests.split('\n').map(s => s.trim()).filter(Boolean) }); setModal(null); };
  const handleCreateCase = () => { if (!newCaseForm.title) { alert('Title required'); return; } const caseId = issues.createCase({ catId: newCaseForm.catId, sitId: newCaseForm.sitId, approach: 'self', title: newCaseForm.title, unit: 'N/A', owner: 'Board', priority: newCaseForm.priority as any, notes: `Linked from Board Room` }); setModal(null); };

  const GOV_SITS = [
    { id: 'board-meetings', label: 'Board Meetings' }, { id: 'elections', label: 'Elections' },
    { id: 'bylaw-amendment', label: 'Bylaw / CC&R Amendment' }, { id: 'annual-budgeting', label: 'Annual Budgeting' },
    { id: 'special-assessments', label: 'Special Assessments' }, { id: 'covenant-violations', label: 'Covenant Violations' },
  ];

  // ─── Meeting card renderer ───
  const renderMeeting = (m: Meeting, isUpcoming: boolean) => {
    const linkedCases = issues.cases.filter(c => (m.linkedCaseIds || []).includes(c.id));
    const linkedVotes = elections.elections.filter(v => (m.linkedVoteIds || []).includes(v.id));
    return (
      <div key={m.id} className={`bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all ${isUpcoming ? 'border-2 border-accent-200' : 'border-ink-100'}`}>
        <div className="p-5 cursor-pointer" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${TYPE_BADGE[m.type] || 'bg-ink-100 text-ink-600'}`}>{m.type}</span>
              <h3 className="font-bold text-ink-900">{m.title}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[m.status] || 'bg-ink-100 text-ink-600'}`}>{m.status}</span>
              {linkedVotes.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">🗳 {linkedVotes.length} vote{linkedVotes.length !== 1 ? 's' : ''}</span>}
              {m.status === 'COMPLETED' && m.minutes && (() => { const approvals = (m.minutesApprovals || []); const total = m.attendees.board.length > 0 ? m.attendees.board.length : board.length; const isMaj = approvals.length > total / 2; return m.minutes ? <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isMaj ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>{isMaj ? '✍️ Minutes approved' : `✍️ ${approvals.length}/${total} approvals`}</span> : null; })()}
              {m.status === 'COMPLETED' && !m.minutes && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">⚠ No minutes</span>}
            </div>
            <div className="flex items-center gap-3"><span className="text-sm text-ink-500">{m.date} · {m.time}</span><span className={`text-sm transition-transform ${expanded === m.id ? 'rotate-180' : ''}`}>▼</span></div>
          </div>
        </div>
        {expanded === m.id && (
          <div className="border-t border-ink-100 p-5 space-y-4">
            {isBoard && <div className="flex flex-wrap gap-2">
              <button onClick={() => openEditMeeting(m)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">Edit</button>
              <button onClick={() => openAttendees(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">Attendees</button>
              <button onClick={() => openMinutes(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">{m.minutes ? 'Edit Minutes' : 'Add Minutes'}</button>
              <button onClick={() => { setTargetId(m.id); setPendingFile(null); setModal('addDocument'); }} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">📎 Documents</button>
              {(m.status === 'SCHEDULED' || m.status === 'RESCHEDULED') && <button onClick={() => { if (confirm(`Send meeting notice for "${m.title}" to all building members?`)) sendMeetingNotice({ title: m.title, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda }); }} disabled={sendingEmail} className="px-3 py-1.5 border border-accent-200 text-accent-700 rounded-lg text-xs font-medium hover:bg-accent-50 disabled:opacity-50">{sendingEmail ? 'Sending...' : '📧 Send Notice'}</button>}
              <button onClick={() => { setTargetId(m.id); setNewCaseForm({ catId: 'governance', sitId: 'board-meetings', title: `${m.title} — `, priority: 'medium' }); setModal('createCaseForMeeting'); }} className="px-3 py-1.5 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50">+ Case</button>
              <button onClick={() => { setTargetId(m.id); setLinkCaseId(''); setModal('linkCaseToMeeting'); }} className="px-3 py-1.5 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50">🔗 Link Case</button>
              <button onClick={() => { if (confirm('Delete?')) mtg.deleteMeeting(m.id); }} className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700">Delete</button>
            </div>}
            {m.notes && <div className="bg-mist-50 rounded-lg p-3 text-sm text-ink-600">{m.notes}</div>}
            {m.agenda.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Agenda</p><div className="bg-mist-50 rounded-lg p-4 space-y-2">{m.agenda.map((item, i) => (<div key={i} className="flex items-start gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span><span className="text-ink-700">{item}</span></div>))}</div></div>)}
            {(m.documents || []).length > 0 && (<div><p className="font-bold text-ink-900 mb-2">📎 Documents ({m.documents.length})</p><div className="flex flex-wrap gap-2">{m.documents.map(d => (<span key={d.id} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1.5"><span className="text-[11px] text-accent-600 font-medium">📄 {d.name}</span><span className="text-[10px] text-ink-400">{d.size}</span>{isBoard && <button onClick={() => mtg.removeDocument(m.id, d.id)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>}</span>))}</div></div>)}
            {linkedCases.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">📋 Linked Cases ({linkedCases.length})</p><div className="space-y-2">{linkedCases.map(c => (<div key={c.id} className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-center justify-between"><div><p className="text-sm font-medium text-violet-900">{c.id}: {c.title}</p><p className="text-[10px] text-violet-600">{c.status} · {c.priority}</p></div><div className="flex gap-2"><button onClick={() => navigate('/issues')} className="text-[10px] text-accent-600 hover:underline">Open in Case Ops →</button>{isBoard && <button onClick={() => mtg.unlinkCase(m.id, c.id)} className="text-xs text-red-400">×</button>}</div></div>))}</div></div>)}
            {linkedVotes.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">🗳 Linked Votes ({linkedVotes.length})</p><div className="space-y-2">{linkedVotes.map(v => (<div key={v.id} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between"><div><p className="text-sm font-medium text-green-900">{v.title}</p><p className="text-[10px] text-green-600">{v.status} · {v.ballotItems.length} items · {v.ballots.length} ballots</p></div><div className="flex gap-2"><button onClick={() => setTab('votes')} className="text-[10px] text-accent-600 hover:underline">View in Votes →</button>{isBoard && <button onClick={() => mtg.unlinkVote(m.id, v.id)} className="text-xs text-red-400">×</button>}</div></div>))}</div></div>)}
            {(m.attendees.board.length > 0 || m.attendees.owners.length > 0) && (<div><p className="font-bold text-ink-900 mb-2">Attendance</p><div className="bg-mist-50 rounded-lg p-3 space-y-2 text-sm">{m.attendees.board.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Board</span><p className="text-ink-700">{m.attendees.board.join(', ')}</p></div>}{m.attendees.owners.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Owners ({m.attendees.owners.length})</span><p className="text-ink-700">{m.attendees.owners.join(', ')}</p></div>}{m.attendees.guests.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Guests</span><p className="text-ink-700">{m.attendees.guests.join(', ')}</p></div>}</div></div>)}
            {m.minutes && (<div><p className="font-bold text-ink-900 mb-2">Meeting Minutes</p><div className="bg-mist-50 rounded-lg p-4 text-sm text-ink-700 whitespace-pre-wrap max-h-48 overflow-y-auto border border-mist-100">{m.minutes}</div></div>)}
            {/* Minutes Approval */}
            {m.status === 'COMPLETED' && m.minutes && (() => {
              const approvals = m.minutesApprovals || [];
              const approvedNames = approvals.map(a => a.name);
              const boardAttendees = m.attendees.board.length > 0 ? m.attendees.board : board.map(b => b.name);
              const totalBoard = boardAttendees.length;
              const approvedCount = approvals.length;
              const isMajority = approvedCount > totalBoard / 2;
              const currentUserName = currentUser?.name || '';
              const currentBoardMember = board.find(b => b.name === currentUserName);
              const alreadyApproved = approvedNames.includes(currentUserName);
              return (
                <div className={`rounded-xl border p-4 ${isMajority ? 'bg-sage-50 border-sage-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink-900 text-sm">✍️ Minutes Approval</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isMajority ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isMajority ? '✓ APPROVED' : `${approvedCount}/${totalBoard} — needs majority`}
                      </span>
                    </div>
                    {isBoard && currentBoardMember && !alreadyApproved && (
                      <button onClick={() => {
                        mtg.approveMinutes(m.id, { name: currentUserName, role: currentBoardMember.role, date: new Date().toISOString().split('T')[0] });
                        // Check if this approval reaches majority
                        const newCount = approvedCount + 1;
                        const newMajority = newCount > totalBoard / 2;
                        if (newMajority && !isMajority) {
                          comp.addCommunication({ type: 'minutes', subject: `${m.title} — Minutes Approved & Distributed`, date: new Date().toISOString().split('T')[0], method: 'email+portal', recipients: 'All owners (50 units)', respondedBy: 'Secretary', status: 'sent', notes: `Minutes approved by board majority (${newCount}/${totalBoard}). Auto-distributed per DC Code § 29-1108.06.` });
                          // Prompt: Post meeting recap as community announcement
                          const agendaSummary = m.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n');
                          const minutesSummary = m.minutes ? `\n\nMinutes Summary:\n${m.minutes.slice(0, 500)}${m.minutes.length > 500 ? '...' : ''}` : '';
                          const recapBody = `The ${m.title} was held on ${new Date(m.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Minutes have been approved by the board.\n\nAgenda items discussed:\n${agendaSummary}${minutesSummary}`;
                          setTimeout(() => {
                            if (confirm(`Minutes approved! Would you like to post a meeting recap to the Community Room?`)) {
                              setForm({ annTitle: `${m.title} — Recap & Approved Minutes`, annBody: recapBody, annCategory: 'meeting', annPinned: 'false', annSendEmail: 'false' });
                              setModal('addAnnouncement');
                            }
                          }, 300);
                        }
                      }}
                        className="px-4 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-semibold hover:bg-sage-700 transition-colors">
                        ✓ Approve Minutes
                      </button>
                    )}
                    {isBoard && alreadyApproved && (
                      <button onClick={() => mtg.revokeMinutesApproval(m.id, currentUserName)}
                        className="px-3 py-1.5 border border-ink-200 text-ink-500 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                        Revoke My Approval
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {boardAttendees.map(name => {
                      const approval = approvals.find(a => a.name === name);
                      const memberRole = board.find(b => b.name === name)?.role || '';
                      return (
                        <div key={name} className="flex items-center gap-2 text-sm">
                          {approval ? (
                            <span className="w-5 h-5 rounded-full bg-sage-500 text-white flex items-center justify-center shrink-0 text-[10px]">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-ink-200 shrink-0" />
                          )}
                          <span className={`${approval ? 'text-ink-700' : 'text-ink-400'}`}>{name}</span>
                          {memberRole && <span className="text-[10px] text-ink-400">({memberRole})</span>}
                          {approval && <span className="text-[10px] text-sage-600 ml-auto">{approval.date}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-ink-400 mt-3">{isDC ? 'DC Code § 29-1108.06 — Minutes must be approved by board majority and made available for owner inspection.' : 'Bylaws require board approval of meeting minutes at or before the next regular meeting.'}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // ─── Tab definitions ───
  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'duties', label: 'Duties & Roles' },
    { id: 'runbook', label: 'Governance Calendar', badge: (overdueFilings + catScores.flatMap(c => c.items).filter(i => i.scope === 'governance' && !isItemComplete(i.id, i.howTo.length)).length) || undefined },
    { id: 'dailyops', label: 'Daily Operations', badge: issues.cases.filter(c => c.status === 'open').length || undefined },
    { id: 'meetings', label: 'Meetings', badge: upcoming.length || undefined },
    { id: 'votes', label: 'Votes & Resolutions', badge: openElections || undefined },
    { id: 'communications', label: 'Communications', badge: comp.communications.filter(c => c.status === 'pending').length || undefined },
    { id: 'letters', label: 'Letter Engine' },
  ];

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <div><h2 className="font-display text-2xl font-bold">🏛 Board Room</h2><p className="text-accent-200 text-sm mt-1">Governance calendar, meetings, votes & communications · {isDC ? 'District of Columbia' : jurisdiction} jurisdiction</p></div>
        </div>
        {(() => {
          const openCases = issues.cases.filter(c => c.status === 'open').length;
          const overdueCases = issues.cases.filter(c => c.status === 'open' && c.dueDate && new Date(c.dueDate) < new Date()).length;
          const nextMeeting = upcoming[0];
          const pendingComms = comp.communications.filter(c => c.status === 'pending').length;
          const lettersSent = letterStore.letters.filter(l => l.status === 'sent').length;
          const metrics = [
            { label: 'Compliance', value: grade, sub: `${healthIndex}%`, color: healthIndex >= 80 ? 'text-emerald-300' : healthIndex >= 60 ? 'text-yellow-300' : 'text-red-300', onClick: () => setTab('runbook') },
            { label: 'Next Meeting', value: nextMeeting ? new Date(nextMeeting.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—', sub: nextMeeting ? nextMeeting.title : 'None scheduled', color: 'text-white', onClick: () => setTab('meetings') },
            { label: 'Open Cases', value: String(openCases), sub: overdueCases > 0 ? `${overdueCases} overdue` : 'On track', color: overdueCases > 0 ? 'text-red-300' : 'text-emerald-300', onClick: () => setTab('dailyops') },
            { label: 'Elections', value: String(openElections), sub: openElections > 0 ? 'Active' : 'None active', color: openElections > 0 ? 'text-yellow-300' : 'text-white', onClick: () => setTab('votes') },
            { label: 'Pending Notices', value: String(pendingComms), sub: pendingComms > 0 ? 'Needs attention' : 'All sent', color: pendingComms > 0 ? 'text-yellow-300' : 'text-emerald-300', onClick: () => setTab('communications') },
            { label: 'Letters Sent', value: String(lettersSent), sub: `${letterStore.templates.length} templates`, color: 'text-white', onClick: () => setTab('letters') },
          ];
          return (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {metrics.map(m => (
                <div key={m.label} onClick={m.onClick} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg px-3 py-2.5 text-center cursor-pointer hover:bg-opacity-20 transition-colors">
                  <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[11px] text-accent-100 mt-0.5 leading-tight truncate">{m.sub}</p>
                  <p className="text-[10px] text-accent-200 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Tabs */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto"><div className="flex min-w-max px-4">{TABS.map(t => (<button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${tab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>{t.label}{t.badge && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span>}</button>))}</div></div>

      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {/* ═══ DUTIES & ROLES TAB ═══ */}
        {tab === 'duties' && (() => {
          const allItemsUnfiltered = categories.flatMap(c => c.items);
          const ongoingItems = allItemsUnfiltered.filter(i => i.perMeeting || i.due === 'Ongoing' || i.due === 'Per meeting' || i.due === 'Per transfer' || i.due === 'Per request' || i.due === 'Quarterly' || i.due === 'As needed' || i.due === 'Monthly');
          return (<div className="space-y-6">

            {/* Three Fiduciary Duties */}
            <div className="bg-gradient-to-r from-mist-50 to-accent-50 border border-accent-200 rounded-xl p-5">
              <h3 className="font-bold text-ink-900 text-sm mb-1">⚖️ The Three Fiduciary Duties</h3>
              <p className="text-xs text-ink-500 mb-4">Every board decision is measured against these three legal obligations. Understanding them is the foundation of competent service and your primary legal defense.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-lg border border-accent-200 p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔍</span><h4 className="font-bold text-accent-800 text-sm">Duty of Care</h4></div>
                  <p className="text-xs text-ink-600 leading-relaxed">Act as a reasonably prudent person would in a similar position. This means attending meetings, reading materials before voting, asking questions, and making informed decisions.</p>
                  <p className="text-[10px] text-accent-600 mt-2 font-semibold">{allItemsUnfiltered.filter(i => i.fiduciaryDuty === 'care').length} runbook items</p>
                </div>
                <div className="bg-white rounded-lg border border-violet-200 p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">🤝</span><h4 className="font-bold text-violet-800 text-sm">Duty of Loyalty</h4></div>
                  <p className="text-xs text-ink-600 leading-relaxed">Put the association's interests above personal interests. Disclose all conflicts, recuse yourself from related votes, and never engage in self-dealing transactions.</p>
                  <p className="text-[10px] text-violet-600 mt-2 font-semibold">{allItemsUnfiltered.filter(i => i.fiduciaryDuty === 'loyalty').length} runbook items</p>
                </div>
                <div className="bg-white rounded-lg border border-amber-200 p-4">
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">📜</span><h4 className="font-bold text-amber-800 text-sm">Duty of Obedience</h4></div>
                  <p className="text-xs text-ink-600 leading-relaxed">Follow the governing documents and the law in every decision. Board authority is limited to what bylaws, CC&Rs, and statute grant. Actions beyond that authority are void.</p>
                  <p className="text-[10px] text-amber-600 mt-2 font-semibold">{allItemsUnfiltered.filter(i => i.fiduciaryDuty === 'obedience').length} runbook items</p>
                </div>
              </div>
            </div>

            {/* Role Responsibility Matrix */}
            <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
              <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">👤</span><h3 className="font-bold text-ink-900 text-sm">Role Responsibility Matrix</h3></div>
                <p className="text-[10px] text-ink-400">Click a role to see their obligations below</p>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-ink-50"><tr><th className="text-left p-3 font-semibold text-ink-600 text-xs">Role</th><th className="text-left p-3 font-semibold text-ink-600 text-xs">Member</th><th className="text-center p-3 font-semibold text-ink-600 text-xs">Total Items</th><th className="text-center p-3 font-semibold text-ink-600 text-xs">Critical</th><th className="text-center p-3 font-semibold text-ink-600 text-xs">Ongoing</th><th className="text-center p-3 font-semibold text-ink-600 text-xs">Deadline</th></tr></thead>
              <tbody className="divide-y divide-ink-50">{allRoles.map(role => {
                const roleItems = allItemsUnfiltered.filter(i => i.role === role);
                const roleCritical = roleItems.filter(i => i.critical);
                const roleOngoing = roleItems.filter(i => ongoingItems.includes(i));
                const roleDeadline = roleItems.filter(i => !ongoingItems.includes(i));
                const rc = ROLE_COLORS[role] || 'ink';
                const member = board.find(b => b.role === role);
                return (<tr key={role} className={`cursor-pointer hover:bg-ink-50 transition-colors ${roleFilter === role ? 'bg-accent-50' : ''}`} onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}>
                  <td className="p-3"><span className={`text-xs font-semibold px-2 py-1 rounded bg-${rc}-100 text-${rc}-700`}>{role}</span></td>
                  <td className="p-3 text-xs text-ink-700">{member?.name || '—'}</td>
                  <td className="p-3 text-center text-xs font-medium">{roleItems.length}</td>
                  <td className="p-3 text-center">{roleCritical.length > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">{roleCritical.length}</span> : <span className="text-ink-300 text-xs">—</span>}</td>
                  <td className="p-3 text-center text-xs text-ink-500">{roleOngoing.length}</td>
                  <td className="p-3 text-center text-xs text-ink-500">{roleDeadline.length}</td>
                </tr>);
              })}</tbody></table></div>
            </div>

            {/* Ongoing & Per-Meeting Obligations */}
            <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
              <div className="p-4 border-b border-ink-100 bg-amber-50 flex items-center gap-2"><span className="text-lg">🔄</span><h3 className="font-bold text-ink-900 text-sm">Ongoing & Per-Meeting Obligations</h3><span className="text-[10px] text-ink-400 ml-1">Continuous requirements — no fixed deadline</span></div>
              {roleFilter !== 'all' && <div className="px-4 pt-3 flex items-center gap-2"><span className="text-[10px] px-2 py-0.5 rounded bg-accent-100 text-accent-700 font-semibold">Filtered: {roleFilter}</span><button onClick={() => setRoleFilter('all')} className="text-[10px] text-ink-400 hover:text-red-500">✕ Clear</button></div>}
              <div className="divide-y divide-ink-50">{ongoingItems.filter(i => roleFilter === 'all' || i.role === roleFilter).map(item => {
                const done = isItemComplete(item.id, item.howTo.length); const rc = ROLE_COLORS[item.role] || 'ink'; const dc = DUTY_COLORS[item.fiduciaryDuty] || 'ink';
                const isExp = expandedRunbook === item.id;
                return (<div key={item.id} className={`${done ? 'bg-sage-50 bg-opacity-40' : ''}`}>
                  <div className="p-4 flex items-start gap-4">
                    <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">🔄</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setExpandedRunbook(isExp ? null : item.id)} className="text-sm font-medium text-left hover:underline text-ink-900">{item.task}</button>
                        {item.critical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">CRITICAL</span>}
                        {item.perMeeting && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 font-medium border border-accent-200">🔄 Per Meeting</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${dc}-50 text-${dc}-700 font-medium border border-${dc}-200`}>{DUTY_LABELS[item.fiduciaryDuty]}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{item.role}</span>
                      </div>
                      <p className="text-xs text-ink-400 mt-1">{item.tip}</p>
                      <div className="flex items-center gap-3 mt-1.5"><span className="text-[10px] font-mono text-accent-600">{item.legalRef}</span><span className="text-[10px] text-ink-400">{item.freq}</span><span className="text-[10px] font-medium text-ink-500">Due: {item.due}</span>
                        <button onClick={() => setExpandedRunbook(isExp ? null : item.id)} className="text-[10px] text-accent-600 font-medium hover:underline ml-auto">{isExp ? '▲ Less' : '▼ Details'}</button>
                      </div>
                    </div>
                  </div>
                  {isExp && (<div className="px-4 pb-4 ml-10 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">⚠ Why This Matters</p><p className="text-xs text-amber-900 leading-relaxed">{item.whyItMatters}</p></div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">🚨 If Not Completed</p><p className="text-xs text-red-900 leading-relaxed">{item.consequence}</p></div>
                    </div>
                    <div className="bg-sage-50 border border-sage-200 rounded-lg p-3"><p className="text-[10px] font-bold text-sage-800 uppercase tracking-wider mb-2">✅ How To Complete</p>
                      <ol className="space-y-1.5">{item.howTo.map((step, si) => (<li key={si} className="flex items-start gap-2 text-xs text-sage-900"><span className="bg-sage-200 text-sage-700 rounded-full w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">{si + 1}</span><span>{step}</span></li>))}</ol>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-ink-400"><span>📖 {item.legalRef}</span><span className={`px-2 py-0.5 rounded bg-${dc}-50 text-${dc}-700 border border-${dc}-200 font-medium`}>{DUTY_LABELS[item.fiduciaryDuty]}: {item.fiduciaryDuty === 'care' ? 'Make informed, prudent decisions' : item.fiduciaryDuty === 'loyalty' ? 'Put association interests first' : 'Follow governing docs and law'}</span></div>
                  </div>)}
                </div>);
              })}</div>
              {ongoingItems.filter(i => roleFilter === 'all' || i.role === roleFilter).length === 0 && <p className="p-6 text-center text-sm text-ink-400">No ongoing items for this role</p>}
            </div>
          </div>);
        })()}

        {/* ═══ RUNBOOK TAB (with filings integrated) ═══ */}
        {tab === 'runbook' && (() => {
          const allItems = catScores.flatMap(c => c.items).filter(i => i.scope === 'governance');
          const completedCount = allItems.filter(i => isItemComplete(i.id, i.howTo.length)).length;
          const inProgressCount = allItems.filter(i => { const s = workflowSteps[i.id]; return s && s.some(Boolean) && !s.every(Boolean); }).length;
          const needsActionCount = allItems.length - completedCount - inProgressCount;
          const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condominium Act`;
          const missingDocs: string[] = [];
          const hasCCRs = legalDocuments.some(d => d.name.toLowerCase().includes('cc&r') || d.name.toLowerCase().includes('declaration'));
          if (!hasBylaws) missingDocs.push('Bylaws');
          if (!hasCCRs) missingDocs.push('CC&Rs / Declaration');
          return (<div className="space-y-6">
            {/* Explainer */}
            <div className="bg-gradient-to-r from-mist-50 to-accent-50 border border-accent-200 rounded-xl p-5">
              <h3 className="font-bold text-ink-900 text-sm">📅 Governance Calendar</h3>
              <p className="text-xs text-ink-500 mt-1">Annual and scheduled obligations with step-by-step workflows. Click any item to expand its workflow. Day-to-day operational items are in Daily Operations.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-[10px] px-2 py-1 rounded-lg bg-accent-100 text-accent-700 font-semibold">📍 {isDC ? 'District of Columbia' : jurisdiction}</span>
                <span className="text-[10px] px-2 py-1 rounded-lg bg-ink-100 text-ink-600 font-semibold">{stateAct}</span>
                {refreshResult.documentsDetected.map(d => <span key={d} className="text-[10px] px-2 py-1 rounded-lg bg-sage-100 text-sage-700 font-medium">✓ {d}</span>)}
                {missingDocs.map(d => <button key={d} onClick={() => navigate('/building')} className="text-[10px] px-2 py-1 rounded-lg bg-white border border-dashed border-ink-300 text-ink-500 hover:border-accent-400 hover:text-accent-700">+ {d}</button>)}
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-sage-700"><span className="w-2 h-2 rounded-full bg-sage-400"></span>{completedCount} completed</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-accent-700"><span className="w-2 h-2 rounded-full bg-accent-400"></span>{inProgressCount} in progress</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-400"></span>{needsActionCount > 0 ? needsActionCount : 0} not started</span>
              </div>
            </div>

            {/* Sort toggle + Role filter + Add Filing */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex bg-ink-50 rounded-lg p-0.5">
                  <button onClick={() => setRunbookSort('date')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${runbookSort === 'date' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>By Due Date</button>
                  <button onClick={() => setRunbookSort('category')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${runbookSort === 'category' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>By Category</button>
                </div>
                <span className="text-ink-200">|</span>
                <button onClick={() => setRoleFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${roleFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>All Roles</button>
                {allRoles.map(r => (<button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${roleFilter === r ? 'bg-accent-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>{r}</button>))}
              </div>
              <button onClick={() => { setForm({ name: '', category: 'tax', dueDate: '', responsible: 'President', recurrence: 'annual', legalRef: '', notes: '' }); setModal('addFiling'); }} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">+ Add Filing</button>
            </div>

            {/* ── DATE-SORTED VIEW ── */}
            {runbookSort === 'date' && (() => {
              type UnifiedItem = { kind: 'runbook'; item: typeof allItems[0]; catLabel: string; catIcon: string } | { kind: 'filing'; filing: typeof comp.filings[0] };
              const unified: UnifiedItem[] = [
                ...allItems.map(item => {
                  const cat = catScores.find(c => c.items.includes(item));
                  return { kind: 'runbook' as const, item, catLabel: cat?.label || '', catIcon: cat?.icon || '📋' };
                }),
                ...comp.filings.filter(fi => roleFilter === 'all' || fi.responsible === roleFilter).map(fi => ({ kind: 'filing' as const, filing: fi })),
              ];

              // Split: dated items vs ongoing/per-meeting items
              const isOngoing = (u: UnifiedItem) => {
                if (u.kind === 'filing') return false; // filings always have dates
                const due = u.item.due;
                return due === 'Ongoing' || due === 'Per meeting' || due === 'Per transfer' || due === 'Per request' || due === 'Quarterly' || due === 'As needed' || due === 'Monthly' || due === 'Annual';
              };
              const datedItems = unified.filter(u => !isOngoing(u));
              const ongoingItems = unified.filter(u => isOngoing(u));

              const isDone = (u: UnifiedItem) => u.kind === 'runbook' ? isItemComplete(u.item.id, u.item.howTo.length) : u.filing.status === 'filed';
              // Sort: incomplete first, then soonest due date first
              datedItems.sort((a, b) => {
                const aDone = isDone(a); const bDone = isDone(b);
                if (aDone !== bDone) return aDone ? 1 : -1;
                const aDate = a.kind === 'runbook' ? a.item.due : a.filing.dueDate;
                const bDate = b.kind === 'runbook' ? b.item.due : b.filing.dueDate;
                // Parse as dates for reliable comparison
                const aT = Date.parse(aDate) || 99999999999999;
                const bT = Date.parse(bDate) || 99999999999999;
                return aT - bT;
              });

              // Render a unified item row
              const renderUnifiedItem = (u: UnifiedItem) => {
                if (u.kind === 'filing') {
                  const fi = u.filing;
                  const isPast = fi.status === 'pending' && new Date(fi.dueDate) < new Date();
                  const rc = ROLE_COLORS[fi.responsible] || 'ink';
                  return (<div key={`fi-${fi.id}`} className={`rounded-xl border p-4 flex items-start gap-4 ${fi.status === 'filed' ? 'border-sage-200 bg-sage-50 bg-opacity-40' : isPast ? 'border-red-200 bg-red-50 bg-opacity-40' : 'border-ink-100 bg-white'}`}>
                    {fi.status === 'filed' ? (
                      <div className="w-6 h-6 rounded-lg bg-sage-100 border-2 border-sage-300 flex items-center justify-center shrink-0 mt-0.5"><svg className="w-3.5 h-3.5 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>
                    ) : (
                      <button onClick={() => { setTargetId(fi.id); setForm({ filedDate: new Date().toISOString().split('T')[0], confirmationNum: '' }); setModal('markFiled'); }} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 ${isPast ? 'border-red-300 hover:border-red-500' : 'border-ink-200 hover:border-accent-400'}`} title="Mark as filed" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${fi.status === 'filed' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{fi.name}</p>
                        {fi.status === 'filed' ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold">✓ FILED</span>
                          : isPast ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">OVERDUE</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">PENDING</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 font-medium border border-yellow-200">📁 Filing</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{fi.responsible}</span>
                      </div>
                      <p className="text-xs text-ink-500 mt-1">Due: {fi.dueDate}{fi.filedDate ? ` · Filed: ${fi.filedDate}` : ''}{fi.confirmationNum ? ` · Ref: ${fi.confirmationNum}` : ''}</p>
                      {fi.legalRef && <span className="text-[10px] font-mono text-accent-600">{fi.legalRef}</span>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {fi.attachments.map(att => (<span key={att.name} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1"><span className="text-[11px] text-accent-600 font-medium">📎 {att.name}</span><span className="text-[10px] text-ink-400">{att.size}</span><button onClick={() => comp.removeFilingAttachment(fi.id, att.name)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button></span>))}
                        <button onClick={() => { setTargetId(fi.id); setPendingFile(null); setModal('addFilingAtt'); }} className="text-[11px] text-accent-600 font-medium hover:text-accent-700 border border-dashed border-accent-300 rounded-lg px-2.5 py-1 hover:bg-accent-50">+ Attach proof</button>
                        {fi.status === 'pending' && <button onClick={() => { setTargetId(fi.id); setForm({ filedDate: new Date().toISOString().split('T')[0], confirmationNum: '' }); setModal('markFiled'); }} className="px-3 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Filed</button>}
                      </div>
                    </div>
                    <button onClick={() => { if (confirm('Remove?')) comp.deleteFiling(fi.id); }} className="text-xs text-red-400 hover:text-red-600 shrink-0">Remove</button>
                  </div>);
                }
                const { item, catLabel, catIcon } = u;
                const done = isItemComplete(item.id, item.howTo.length); const rc = ROLE_COLORS[item.role] || 'ink'; const itemAtts = comp.itemAttachments[item.id] || [];
                const isExpanded = expandedRunbook === item.id;
                const dc = DUTY_COLORS[item.fiduciaryDuty] || 'ink';
                const wSteps = workflowSteps[item.id] || [];
                const wDone = wSteps.filter(Boolean).length;
                const wTotal = item.howTo?.length || 0;
                const wStarted = wDone > 0;
                const wComplete = wDone === wTotal && wTotal > 0;
                return (<div key={item.id} className={`rounded-xl border transition-all ${isExpanded ? 'border-accent-300 shadow-sm bg-white' : done ? 'border-sage-200 bg-sage-50 bg-opacity-30' : wStarted ? 'border-accent-200 bg-white' : 'border-ink-100 bg-white hover:border-accent-200 hover:shadow-sm'}`}>
                  <div className={`p-4 flex items-start gap-4 cursor-pointer`} onClick={() => setExpandedRunbook(isExpanded ? null : item.id)}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-sage-500 text-white' : wStarted ? 'bg-accent-100 text-accent-600' : 'bg-ink-50 text-ink-300'}`}>
                      {done ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      : wStarted ? <span className="text-[10px] font-bold">{wDone}/{wTotal}</span>
                      : <span className="text-[10px] font-bold">—</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${done ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{item.task}</span>
                        {item.critical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">CRITICAL</span>}
                        {done && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold border border-sage-200">✅ COMPLETE</span>}
                        {!done && wStarted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 font-semibold border border-accent-200">IN PROGRESS</span>}
                        {!done && !wStarted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">NEEDS ACTION</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{item.role}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-500">{catIcon} {catLabel}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-mono text-accent-600">{item.legalRef}</span>
                        <span className="text-[10px] text-ink-400">{item.freq}</span>
                        <span className="text-[10px] font-medium text-ink-500">Due: {item.due}</span>
                      </div>
                      {/* Workflow progress bar — always visible when not complete */}
                      {!done && wTotal > 0 && (
                        <div className="mt-2.5 flex items-center gap-2.5">
                          <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${wComplete ? 'bg-sage-500' : wStarted ? 'bg-accent-500' : 'bg-ink-200'}`} style={{ width: `${wTotal > 0 ? (wDone / wTotal) * 100 : 0}%` }} /></div>
                          <span className={`text-[10px] font-semibold shrink-0 ${wComplete ? 'text-sage-600' : wStarted ? 'text-accent-600' : 'text-ink-400'}`}>{wDone}/{wTotal} steps</span>
                          <span className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold shrink-0 ${wStarted ? 'bg-accent-100 text-accent-700' : 'bg-ink-100 text-ink-600'}`} onClick={e => { e.stopPropagation(); setExpandedRunbook(isExpanded ? null : item.id); }}>
                            {wStarted ? '▶ Continue' : '▶ Start workflow'}
                          </span>
                        </div>
                      )}
                      {done && wTotal > 0 && (
                        <div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-sage-500">✅ All {wTotal} steps completed</span><span className="text-[10px] text-ink-400">· View details ›</span></div>
                      )}
                      {itemAtts.length > 0 && (<div className="mt-2 flex flex-wrap gap-1.5">{itemAtts.map(att => (<span key={att.name} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1"><span className="text-[11px] text-accent-600 font-medium">📎 {att.name}</span><span className="text-[10px] text-ink-400">{att.size}</span><button onClick={e => { e.stopPropagation(); comp.removeItemAttachment(item.id, att.name); }} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button></span>))}</div>)}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div onClick={e => e.stopPropagation()}>
                        <RunbookActionMenu itemId={item.id} itemTask={item.task} onAttach={() => { setTargetId(item.id); setPendingFile(null); setModal('addRunbookAtt'); }} onComm={() => { setTargetId(item.id); setForm({ type: 'notice', subject: `Re: ${item.task}`, date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners', status: 'sent', notes: '' }); setModal('addComm'); }} onCase={() => { setTargetId(item.id); setRunbookAction('case'); setModal('runbookLinkOrCreate'); }} onMeeting={() => {
                          const mType = item.meetingType || 'BOARD';
                          const agenda = item.suggestedAgenda || [item.task];
                          const d = getVoteDefaults(mType);
                          setRunbookItemForMeeting(item.id);
                          setMForm({ title: item.task, type: mType, date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: agenda.join('\n'), notes: `From Runbook: ${item.task}. ${item.legalRef || ''}`, status: 'SCHEDULED', requiresVote: d.requiresVote, voteScope: d.voteScope, voteItems: [], sendNotice: false });
                          setModal('addMeeting');
                        }} />
                      </div>
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''} text-ink-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                  {/* Workflow panel */}
                  {isExpanded && (() => {
                    const steps = workflowSteps[item.id] || item.howTo.map(() => false);
                    const completedSteps = steps.filter(Boolean).length;
                    const allDone = completedSteps === item.howTo.length;
                    // Check if completing this item should trigger a communication
                    const commKeywords = ['notice', 'distribute', 'mail', 'notify', 'send', 'disclose', 'financial statement', 'minutes'];
                    const requiresComm = commKeywords.some(kw => item.task.toLowerCase().includes(kw));
                    const promptComm = (itemTask: string) => {
                      if (!requiresComm) return;
                      setTimeout(() => {
                        if (confirm(`"${itemTask}" is complete. This item may require owner notification. Would you like to draft a communication?`)) {
                          sf('commType', 'notice');
                          sf('commSubject', itemTask);
                          sf('commDate', new Date().toISOString().split('T')[0]);
                          sf('commMethod', 'email');
                          sf('commRecipients', 'All owners (50 units)');
                          sf('commRespondedBy', currentUser?.name || '');
                          sf('commNotes', `Auto-generated from compliance runbook: ${itemTask}`);
                          setModal('addComm');
                        }
                      }, 200);
                    };
                    const toggleStep = (si: number) => {
                      const ns = [...steps]; ns[si] = !ns[si];
                      setWorkflowSteps({ ...workflowSteps, [item.id]: ns });
                      // If this step made all steps done, prompt for communication
                      if (ns.every(Boolean) && !allDone) promptComm(item.task);
                    };
                    return (
                    <div className="px-4 pb-4 ml-10 space-y-3">
                      {/* Context row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">⚠ Why This Matters</p><p className="text-xs text-amber-900 leading-relaxed">{item.whyItMatters}</p></div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">🚨 If Not Completed</p><p className="text-xs text-red-900 leading-relaxed">{item.consequence}</p></div>
                      </div>
                      {/* Workflow steps */}
                      <div className={`border rounded-xl overflow-hidden ${allDone ? 'border-sage-300 bg-sage-50' : 'border-ink-200 bg-white'}`}>
                        <div className="p-3 border-b border-ink-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-ink-900">📝 Workflow Steps</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${allDone ? 'bg-sage-200 text-sage-700' : 'bg-ink-100 text-ink-600'}`}>{completedSteps}/{item.howTo.length}</span>
                          </div>
                          <div className="flex gap-2">
                            {!allDone && <button onClick={() => { setWorkflowSteps({ ...workflowSteps, [item.id]: item.howTo.map(() => true) }); if (!allDone) promptComm(item.task); }} className="text-[10px] text-accent-600 font-medium hover:underline">Complete all</button>}
                            {completedSteps > 0 && <button onClick={() => setWorkflowSteps({ ...workflowSteps, [item.id]: item.howTo.map(() => false) })} className="text-[10px] text-ink-400 font-medium hover:underline">Reset</button>}
                          </div>
                        </div>
                        <div className="divide-y divide-ink-50">
                          {item.howTo.map((step, si) => (
                            <label key={si} className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${steps[si] ? 'bg-sage-50' : 'hover:bg-ink-50'}`}>
                              <input type="checkbox" checked={steps[si] || false} onChange={() => toggleStep(si)} className="h-4 w-4 mt-0.5 shrink-0 accent-sage-600 rounded" />
                              <div className="flex-1">
                                <span className={`text-xs ${steps[si] ? 'text-sage-600 line-through' : 'text-ink-800'}`}>{step}</span>
                              </div>
                              <span className={`text-[10px] font-bold shrink-0 ${steps[si] ? 'text-sage-500' : 'text-ink-300'}`}>{si + 1}</span>
                            </label>
                          ))}
                        </div>
                        {allDone && (
                          <div className="p-3 border-t border-sage-200 bg-sage-100 flex items-center justify-center gap-2">
                            <svg className="w-4 h-4 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-xs text-sage-700 font-semibold">All workflow steps complete — item fulfilled</span>
                          </div>
                        )}
                      </div>
                      {/* Legal & duty footer */}
                      <div className="flex items-center gap-4 text-[10px] text-ink-400">
                        <span>📖 {item.legalRef}</span>
                        <span className={`px-2 py-0.5 rounded bg-${dc}-50 text-${dc}-700 border border-${dc}-200 font-medium`}>{DUTY_LABELS[item.fiduciaryDuty]}: {item.fiduciaryDuty === 'care' ? 'Make informed, prudent decisions' : item.fiduciaryDuty === 'loyalty' ? 'Put association interests first' : 'Follow governing docs and law'}</span>
                      </div>
                    </div>);
                  })()}
                </div>);
              };

              return (<div className="space-y-6">
                {/* Scheduled Deadlines */}
                <div>
                  <div className="flex items-center gap-2 mb-3"><span className="text-lg">📅</span><h3 className="font-bold text-ink-900 text-sm">Scheduled Deadlines</h3><span className="text-[10px] text-ink-400 ml-1">{datedItems.filter(u => !isDone(u)).length} remaining</span></div>
                  <div className="space-y-2">{datedItems.map(renderUnifiedItem)}</div>
                  {datedItems.length === 0 && <p className="p-6 text-center text-sm text-ink-400 bg-white rounded-xl border border-ink-100">All deadlines met</p>}
                </div>

                {/* Link to ongoing items in Duties tab */}
                {ongoingItems.length > 0 && (
                  <button onClick={() => setTab('duties')} className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between hover:bg-amber-100 transition-colors">
                    <div className="flex items-center gap-2"><span className="text-lg">🔄</span><span className="text-sm font-medium text-amber-800">{ongoingItems.length} ongoing obligations</span><span className="text-xs text-amber-600">— per-meeting, monthly, and continuous duties</span></div>
                    <span className="text-xs text-amber-600 font-medium">View in Duties tab →</span>
                  </button>
                )}
              </div>);
            })()}

            {/* ── CATEGORY-GROUPED VIEW ── */}
            {runbookSort === 'category' && (<>
              {/* Filings card */}
              {comp.filings.length > 0 && (
                <div className="bg-white rounded-xl border border-ink-100 overflow-hidden" id="comp-filings">
                  <div className="p-5 border-b border-ink-100 flex items-center justify-between">
                    <div className="flex items-center gap-3"><span className="text-2xl">📅</span><div><h3 className="font-bold text-ink-900">Filings & Deadlines</h3><p className="text-xs text-ink-400">{comp.filings.filter(fi => fi.status === 'filed').length}/{comp.filings.length} filed · {overdueFilings} overdue</p></div></div>
                  </div>
                  <div className="divide-y divide-ink-50">
                    {comp.filings.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(fi => {
                      const isPast = fi.status === 'pending' && new Date(fi.dueDate) < new Date();
                      const rc = ROLE_COLORS[fi.responsible] || 'ink';
                      return (<div key={fi.id} className={`p-4 flex items-start gap-4 ${fi.status === 'filed' ? 'bg-sage-50 bg-opacity-40' : isPast ? 'bg-red-50 bg-opacity-40' : ''}`}>
                        {fi.status === 'filed' ? (
                          <div className="w-6 h-6 rounded-lg bg-sage-100 border-2 border-sage-300 flex items-center justify-center shrink-0 mt-0.5"><svg className="w-3.5 h-3.5 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>
                        ) : (
                          <button onClick={() => { setTargetId(fi.id); setForm({ filedDate: new Date().toISOString().split('T')[0], confirmationNum: '' }); setModal('markFiled'); }} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 ${isPast ? 'border-red-300 hover:border-red-500' : 'border-ink-200 hover:border-accent-400'}`} title="Mark as filed" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${fi.status === 'filed' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{fi.name}</p>
                            {fi.status === 'filed' ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold">✓ FILED</span>
                              : isPast ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">OVERDUE</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">PENDING</span>}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 font-medium border border-yellow-200">📁 Filing</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{fi.responsible}</span>
                            <span className="text-xs text-ink-400">{fi.category} · {fi.recurrence}</span>
                          </div>
                          <p className="text-xs text-ink-500 mt-1">Due: {fi.dueDate}{fi.filedDate ? ` · Filed: ${fi.filedDate}` : ''}{fi.confirmationNum ? ` · Ref: ${fi.confirmationNum}` : ''}</p>
                          {fi.legalRef && <span className="text-[10px] font-mono text-accent-600">{fi.legalRef}</span>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {fi.attachments.map(att => (<span key={att.name} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1"><span className="text-[11px] text-accent-600 font-medium">📎 {att.name}</span><span className="text-[10px] text-ink-400">{att.size}</span><button onClick={() => comp.removeFilingAttachment(fi.id, att.name)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button></span>))}
                            <button onClick={() => { setTargetId(fi.id); setPendingFile(null); setModal('addFilingAtt'); }} className="text-[11px] text-accent-600 font-medium hover:text-accent-700 border border-dashed border-accent-300 rounded-lg px-2.5 py-1 hover:bg-accent-50">+ Attach proof</button>
                            {fi.status === 'pending' && <button onClick={() => { setTargetId(fi.id); setForm({ filedDate: new Date().toISOString().split('T')[0], confirmationNum: '' }); setModal('markFiled'); }} className="px-3 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Filed</button>}
                          </div>
                        </div>
                        <button onClick={() => { if (confirm('Remove?')) comp.deleteFiling(fi.id); }} className="text-xs text-red-400 hover:text-red-600 shrink-0">Remove</button>
                      </div>);
                    })}
                  </div>
                </div>
              )}

              {/* Category cards */}
              {catScores.filter(c => c.items.length > 0).map(cat => { const pc = cat.pct >= 80 ? 'sage' : cat.pct >= 50 ? 'yellow' : 'red'; return (<div key={cat.id} id={`comp-${cat.id}`} className="bg-white rounded-xl border border-ink-100 overflow-hidden"><div className="p-5 border-b border-ink-100 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-2xl">{cat.icon}</span><div><h3 className="font-bold text-ink-900">{cat.label}</h3><p className="text-xs text-ink-400">{cat.passed}/{cat.total} complete · Weight: {cat.weight}%</p></div></div><div className="flex items-center gap-3"><div className="w-24 h-2 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full bg-${pc}-500 rounded-full`} style={{ width: `${cat.pct}%` }} /></div><span className={`text-lg font-bold text-${pc}-600`}>{cat.pct}%</span></div></div>
              <div className="space-y-2 p-4">{cat.items.map(item => { const done = isItemComplete(item.id, item.howTo.length); const rc = ROLE_COLORS[item.role] || 'ink'; const itemAtts = comp.itemAttachments[item.id] || []; const isExp = expandedRunbook === item.id; const dc = DUTY_COLORS[item.fiduciaryDuty] || 'ink';
                const wSteps = workflowSteps[item.id] || [];
                const wDone = wSteps.filter(Boolean).length;
                const wTotal = item.howTo?.length || 0;
                const wStarted = wDone > 0;
                const wComplete = wDone === wTotal && wTotal > 0;
                return (<div key={item.id} className={`rounded-xl border transition-all ${isExp ? 'border-accent-300 shadow-sm bg-white' : done ? 'border-sage-200 bg-sage-50 bg-opacity-30' : wStarted ? 'border-accent-200 bg-white' : 'border-ink-100 bg-white hover:border-accent-200 hover:shadow-sm'}`}>
                <div className="p-4 flex items-start gap-4 cursor-pointer" onClick={() => setExpandedRunbook(isExp ? null : item.id)}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-sage-500 text-white' : wStarted ? 'bg-accent-100 text-accent-600' : 'bg-ink-50 text-ink-300'}`}>
                  {done ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : wStarted ? <span className="text-[10px] font-bold">{wDone}/{wTotal}</span>
                  : <span className="text-[10px] font-bold">—</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${done ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{item.task}</span>
                    {item.critical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">CRITICAL</span>}
                    {done && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold border border-sage-200">✅ COMPLETE</span>}
                    {!done && wStarted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 font-semibold border border-accent-200">IN PROGRESS</span>}
                    {!done && !wStarted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">NEEDS ACTION</span>}
                    {item.perMeeting && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 font-medium border border-accent-200">🔄 Per Meeting</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{item.role}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5"><span className="text-[10px] font-mono text-accent-600">{item.legalRef}</span><span className="text-[10px] text-ink-400">{item.freq}</span><span className="text-[10px] font-medium text-ink-500">Due: {item.due}</span></div>
                  {!done && wTotal > 0 && (
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${wComplete ? 'bg-sage-500' : wStarted ? 'bg-accent-500' : 'bg-ink-200'}`} style={{ width: `${wTotal > 0 ? (wDone / wTotal) * 100 : 0}%` }} /></div>
                      <span className={`text-[10px] font-semibold shrink-0 ${wComplete ? 'text-sage-600' : wStarted ? 'text-accent-600' : 'text-ink-400'}`}>{wDone}/{wTotal} steps</span>
                      <span className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold shrink-0 ${wStarted ? 'bg-accent-100 text-accent-700' : 'bg-ink-100 text-ink-600'}`}>{wStarted ? '▶ Continue' : '▶ Start workflow'}</span>
                    </div>
                  )}
                  {done && wTotal > 0 && (<div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-sage-500">✅ All {wTotal} steps completed</span><span className="text-[10px] text-ink-400">· View details ›</span></div>)}
                  {itemAtts.length > 0 && (<div className="mt-2 flex flex-wrap gap-1.5">{itemAtts.map(att => (<span key={att.name} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1"><span className="text-[11px] text-accent-600 font-medium">📎 {att.name}</span><span className="text-[10px] text-ink-400">{att.size}</span><button onClick={e => { e.stopPropagation(); comp.removeItemAttachment(item.id, att.name); }} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button></span>))}</div>)}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div onClick={e => e.stopPropagation()}>
                    <RunbookActionMenu itemId={item.id} itemTask={item.task} onAttach={() => { setTargetId(item.id); setPendingFile(null); setModal('addRunbookAtt'); }} onComm={() => { setTargetId(item.id); setForm({ type: 'notice', subject: `Re: ${item.task}`, date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners', status: 'sent', notes: '' }); setModal('addComm'); }} onCase={() => { setTargetId(item.id); setRunbookAction('case'); setModal('runbookLinkOrCreate'); }} onMeeting={() => {
                  const mType = item.meetingType || 'BOARD';
                  const agenda = item.suggestedAgenda || [item.task];
                  const d = getVoteDefaults(mType);
                  setRunbookItemForMeeting(item.id);
                  setMForm({ title: item.task, type: mType, date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: agenda.join('\n'), notes: `From Runbook: ${item.task}. ${item.legalRef || ''}`, status: 'SCHEDULED', requiresVote: d.requiresVote, voteScope: d.voteScope, voteItems: [], sendNotice: false });
                  setModal('addMeeting');
                }} />
                  </div>
                  <svg className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''} text-ink-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
                </div>
                {isExp && (() => {
                    const steps = workflowSteps[item.id] || item.howTo.map(() => false);
                    const completedSteps = steps.filter(Boolean).length;
                    const allStepsDone = completedSteps === item.howTo.length;
                    const toggleStep = (si: number) => { const ns = [...steps]; ns[si] = !ns[si]; setWorkflowSteps({ ...workflowSteps, [item.id]: ns }); };
                    return (<div className="px-4 pb-4 ml-10 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">⚠ Why This Matters</p><p className="text-xs text-amber-900 leading-relaxed">{item.whyItMatters}</p></div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">🚨 If Not Completed</p><p className="text-xs text-red-900 leading-relaxed">{item.consequence}</p></div>
                      </div>
                      <div className={`border rounded-xl overflow-hidden ${allStepsDone ? 'border-sage-300 bg-sage-50' : 'border-ink-200 bg-white'}`}>
                        <div className="p-3 border-b border-ink-100 flex items-center justify-between">
                          <div className="flex items-center gap-2"><p className="text-xs font-bold text-ink-900">📝 Workflow Steps</p><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${allStepsDone ? 'bg-sage-200 text-sage-700' : 'bg-ink-100 text-ink-600'}`}>{completedSteps}/{item.howTo.length}</span></div>
                          <div className="flex gap-2">{!allStepsDone && <button onClick={() => setWorkflowSteps({ ...workflowSteps, [item.id]: item.howTo.map(() => true) })} className="text-[10px] text-accent-600 font-medium hover:underline">Complete all</button>}{completedSteps > 0 && <button onClick={() => setWorkflowSteps({ ...workflowSteps, [item.id]: item.howTo.map(() => false) })} className="text-[10px] text-ink-400 font-medium hover:underline">Reset</button>}</div>
                        </div>
                        <div className="divide-y divide-ink-50">{item.howTo.map((step, si) => (<label key={si} className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${steps[si] ? 'bg-sage-50' : 'hover:bg-ink-50'}`}><input type="checkbox" checked={steps[si] || false} onChange={() => toggleStep(si)} className="h-4 w-4 mt-0.5 shrink-0 accent-sage-600 rounded" /><div className="flex-1"><span className={`text-xs ${steps[si] ? 'text-sage-600 line-through' : 'text-ink-800'}`}>{step}</span></div><span className={`text-[10px] font-bold shrink-0 ${steps[si] ? 'text-sage-500' : 'text-ink-300'}`}>{si + 1}</span></label>))}</div>
                        {allStepsDone && (<div className="p-3 border-t border-sage-200 bg-sage-100 flex items-center justify-center gap-2"><svg className="w-4 h-4 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span className="text-xs text-sage-700 font-semibold">All workflow steps complete — item fulfilled</span></div>)}
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-ink-400"><span>📖 {item.legalRef}</span><span className={`px-2 py-0.5 rounded bg-${dc}-50 text-${dc}-700 border border-${dc}-200 font-medium`}>{DUTY_LABELS[item.fiduciaryDuty]}: {item.fiduciaryDuty === 'care' ? 'Make informed, prudent decisions' : item.fiduciaryDuty === 'loyalty' ? 'Put association interests first' : 'Follow governing docs and law'}</span></div>
                    </div>);
                  })()}
              </div>); })}</div></div>); })}
            </>)}
          </div>);
        })()}

        {/* ═══ MEETINGS TAB ═══ */}
        {tab === 'meetings' && (() => {
          const bylawRef = hasBylaws ? 'Bylaws Art. IV-V' : 'Governing Documents';
          const meetingsThisYear = meetings.filter(m => m.date.startsWith('2026')).length;
          const meetingsRequired = 6; // bi-monthly per bylaws
          const cadencePct = Math.min(100, Math.round((meetingsThisYear / meetingsRequired) * 100));
          const minutesPending = past.filter(m => !m.minutesApprovals || m.minutesApprovals.length === 0).length;
          return (<div className="space-y-6">
          {/* Compliance context */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`rounded-xl border p-4 ${cadencePct >= 80 ? 'border-sage-200 bg-sage-50' : cadencePct >= 50 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-[10px] font-bold text-ink-600 uppercase tracking-wider">Meeting Cadence</p>
              <p className="text-lg font-bold text-ink-900 mt-1">{meetingsThisYear}/{meetingsRequired} <span className="text-xs font-normal text-ink-400">this year</span></p>
              <div className="w-full h-1.5 bg-ink-100 rounded-full mt-2 overflow-hidden"><div className={`h-full rounded-full ${cadencePct >= 80 ? 'bg-sage-500' : cadencePct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${cadencePct}%` }} /></div>
              <p className="text-[10px] text-ink-400 mt-1.5">📖 {bylawRef} — bi-monthly required</p>
            </div>
            <div className={`rounded-xl border p-4 ${minutesPending === 0 ? 'border-sage-200 bg-sage-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-[10px] font-bold text-ink-600 uppercase tracking-wider">Minutes Status</p>
              <p className="text-lg font-bold text-ink-900 mt-1">{minutesPending === 0 ? '✅ All approved' : `⚠ ${minutesPending} pending`}</p>
              <p className="text-[10px] text-ink-400 mt-1.5">📖 {isDC ? 'DC Code § 29-1108.06' : 'State statute'} — record, approve, distribute</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <p className="text-[10px] font-bold text-ink-600 uppercase tracking-wider">Notice Requirements</p>
              <p className="text-xs text-ink-700 mt-1.5">{isDC ? '48-hour notice for board meetings. 10–60 day window for annual meeting.' : 'Follow bylaws notice requirements.'}</p>
              <p className="text-[10px] text-ink-400 mt-1.5">📖 {isDC ? 'DC Code § 29-1109.04' : bylawRef}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div><h3 className="font-display text-lg font-bold text-ink-900">📅 Meetings</h3><p className="text-xs text-ink-400">{upcoming.length} upcoming · {past.length} completed</p></div>
            {isBoard && <button onClick={openAddMeeting} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Schedule Meeting</button>}
          </div>
          {upcoming.length > 0 && (<div><p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Upcoming</p><div className="space-y-3">{upcoming.map(m => renderMeeting(m, true))}</div></div>)}
          {past.length > 0 && (<div><p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Past</p><div className="space-y-3">{past.map(m => renderMeeting(m, false))}</div></div>)}
          {meetings.length === 0 && <p className="text-center text-ink-400 py-8">No meetings scheduled yet.</p>}
        </div>); })()}

        {/* ═══ VOTES TAB ═══ */}
        {tab === 'votes' && <VotingPage />}

        {/* ═══ COMMUNICATIONS TAB ═══ */}
        {tab === 'communications' && (<div className="space-y-6">
          {/* Announcements section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h3 className="font-display text-lg font-bold text-ink-900">📢 Community Announcements</h3><p className="text-xs text-ink-400">Post updates visible to all residents in the Community Room</p></div>
              <button onClick={() => { setForm({ annTitle: '', annBody: '', annCategory: 'general', annPinned: 'false', annSendEmail: 'false' }); setModal('addAnnouncement'); }} className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">+ Post Announcement</button>
            </div>
            {(comp.announcements || []).length === 0 && <p className="text-sm text-ink-400 text-center py-4">No announcements yet.</p>}
            <div className="space-y-2">
              {[...(comp.announcements || [])].sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return b.postedDate.localeCompare(a.postedDate); }).map(a => {
                const catStyles: Record<string, string> = { general:'bg-ink-100 text-ink-600', maintenance:'bg-amber-100 text-amber-700', financial:'bg-sage-100 text-sage-700', safety:'bg-red-100 text-red-700', rules:'bg-violet-100 text-violet-700', meeting:'bg-accent-100 text-accent-700' };
                return (
                  <div key={a.id} className={`rounded-xl border p-4 ${a.pinned ? 'border-accent-300 bg-accent-50 bg-opacity-30' : 'border-ink-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 font-bold">📌 PINNED</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catStyles[a.category] || catStyles.general}`}>{a.category}</span>
                          <span className="text-sm font-semibold text-ink-900">{a.title}</span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1 line-clamp-2">{a.body}</p>
                        <p className="text-[10px] text-ink-400 mt-1.5">Posted by {a.postedBy} · {a.postedDate}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => comp.togglePinAnnouncement(a.id)} className={`text-[10px] px-2 py-1 rounded font-medium ${a.pinned ? 'bg-accent-100 text-accent-700' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'}`}>{a.pinned ? 'Unpin' : 'Pin'}</button>
                        <button onClick={() => { if (confirm('Delete this announcement?')) comp.deleteAnnouncement(a.id); }} className="text-[10px] text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-ink-200" />

          {/* Communications log */}
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-bold text-ink-900">✉ Owner Communications Log</h3><p className="text-xs text-ink-400">Notices, minutes distribution, disclosure statements</p></div><button onClick={() => { setForm({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' }); setModal('addComm'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Log Communication</button></div>
            <div className="bg-white rounded-xl border border-ink-100 overflow-hidden divide-y divide-ink-50">{comp.communications.sort((a, b) => b.date.localeCompare(a.date)).map(c => (<div key={c.id} className="p-4 hover:bg-mist-50 transition-colors"><div className="flex items-start justify-between gap-3"><div className="flex-1"><div className="flex items-center gap-2 flex-wrap mb-1"><span className={`pill px-1.5 py-0.5 rounded text-xs ${COMM_TYPES[c.type] || COMM_TYPES.other}`}>{c.type}</span><p className="text-sm font-medium text-ink-900">{c.subject}</p><span className={`pill px-1.5 py-0.5 rounded text-xs ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : c.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-ink-100 text-ink-500'}`}>{c.status}</span></div><p className="text-xs text-ink-500">{c.date} · {c.method} · To: {c.recipients}</p>{c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}</div><button onClick={() => { if (confirm('Remove?')) comp.deleteCommunication(c.id); }} className="text-xs text-red-400 shrink-0">Remove</button></div></div>))}</div>
          </div>
        </div>)}

        {/* ═══ DAILY OPERATIONS TAB ═══ */}
        {tab === 'dailyops' && <IssuesPage embedded />}

        {/* ═══ LETTER ENGINE TAB ═══ */}
        {tab === 'letters' && <LetterEngineTab />}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal === 'addFiling' && (<Modal title="Add Regulatory Filing" onClose={() => setModal(null)} onSave={() => { if (!f('name') || !f('dueDate')) { alert('Name and due date required'); return; } comp.addFiling({ name: f('name'), category: f('category'), dueDate: f('dueDate'), responsible: f('responsible'), recurrence: f('recurrence'), legalRef: f('legalRef'), notes: f('notes') }); setModal(null); }}><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Filing Name *</label><input value={f('name')} onChange={e => sf('name', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Annual Fire Safety Inspection" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Category</label><select value={f('category')} onChange={e => sf('category', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['tax','government','inspection','financial','governance','other'].map(c => <option key={c}>{c}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Recurrence</label><select value={f('recurrence')} onChange={e => sf('recurrence', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['annual','biennial','quarterly','one-time'].map(r => <option key={r}>{r}</option>)}</select></div></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Due Date *</label><input type="date" value={f('dueDate')} onChange={e => sf('dueDate', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Responsible</label><select value={f('responsible')} onChange={e => sf('responsible', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['President','Vice President','Treasurer','Secretary','Member at Large'].map(r => <option key={r}>{r}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={f('legalRef')} onChange={e => sf('legalRef', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="DC Code § 29-102.11" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div></div></Modal>)}
      {modal === 'markFiled' && (<Modal title="Mark as Filed" onClose={() => setModal(null)} onSave={() => { const filing = comp.filings.find(fi => fi.id === targetId); comp.markFilingComplete(targetId, f('filedDate'), f('confirmationNum')); if (filing) { comp.addCommunication({ type: 'notice', subject: `Filing Complete: ${filing.name}`, date: f('filedDate') || new Date().toISOString().split('T')[0], method: 'portal', recipients: 'Board record', respondedBy: filing.responsible, status: 'sent', notes: `Filed ${f('filedDate')}. Confirmation: ${f('confirmationNum') || 'N/A'}. ${filing.legalRef}` }); } setModal(null); }} saveLabel="Confirm Filed"><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Date Filed</label><input type="date" value={f('filedDate')} onChange={e => sf('filedDate', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Confirmation #</label><input value={f('confirmationNum')} onChange={e => sf('confirmationNum', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div></div></Modal>)}
      {modal === 'addComm' && (<Modal title="Log Communication" onClose={() => setModal(null)} onSave={() => { if (!f('subject')) { alert('Subject required'); return; } comp.addCommunication({ type: f('type'), subject: f('subject'), date: f('date'), method: f('method'), recipients: f('recipients'), respondedBy: null, status: f('status') as any, notes: f('notes') }); setModal(null); }}><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={f('type')} onChange={e => sf('type', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['notice','minutes','financial','response','resale','violation','other'].map(t => <option key={t}>{t}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Subject *</label><input value={f('subject')} onChange={e => sf('subject', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Date</label><input type="date" value={f('date')} onChange={e => sf('date', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={f('method')} onChange={e => sf('method', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['email','mail','mail+email','email+portal','certified mail','posted'].map(m => <option key={m}>{m}</option>)}</select></div></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Recipients</label><input value={f('recipients')} onChange={e => sf('recipients', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['sent','pending','draft'].map(s => <option key={s}>{s}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div></div></Modal>)}

      {/* Meeting modals */}
      {(modal === 'addMeeting' || modal === 'editMeeting') && (<Modal title={modal === 'addMeeting' ? 'Schedule Meeting' : 'Edit Meeting'} onClose={() => setModal(null)} onSave={saveMeeting} saveLabel={modal === 'addMeeting' ? 'Schedule' : 'Save'}><div className="space-y-3">
        <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={mForm.title} onChange={e => setMForm({ ...mForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="February Board Meeting" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={mForm.type} onChange={e => { const t = e.target.value; const d = getVoteDefaults(t); setMForm({ ...mForm, type: t, requiresVote: d.requiresVote, voteScope: d.voteScope, voteItems: [] }); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['BOARD','ANNUAL','QUARTERLY','SPECIAL','EMERGENCY'].map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={mForm.status} onChange={e => setMForm({ ...mForm, status: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['SCHEDULED','COMPLETED','CANCELLED','RESCHEDULED'].map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Date *</label><input type="date" value={mForm.date} onChange={e => setMForm({ ...mForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Time</label><input type="time" value={mForm.time} onChange={e => setMForm({ ...mForm, time: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Location</label><input value={mForm.location} onChange={e => setMForm({ ...mForm, location: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Virtual Link</label><input value={mForm.virtualLink} onChange={e => setMForm({ ...mForm, virtualLink: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="https://zoom.us/..." /></div></div>
        <div><label className="block text-xs font-medium text-ink-700 mb-1">Agenda (one item per line) *</label><textarea value={mForm.agenda} onChange={e => setMForm({ ...mForm, agenda: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={4} placeholder={"Review January financials\nElevator maintenance proposal\nApprove 2026 budget"} /></div>
        {/* Vote requirement */}
        {modal === 'addMeeting' && (() => { const defaults = getVoteDefaults(mForm.type);
          // Auto-detect agenda items that likely need a vote
          const agendaItems = mForm.agenda.split('\n').map(s => s.trim()).filter(Boolean);
          const voteKeywords = /\b(approv|adopt|ratif|elect|amend|authori|resolv|vote|budget|assess|special assessment|terminat|contract|remov|waiv)\w*/i;
          const autoDetected = agendaItems.map((item, i) => ({ index: i, text: item, isVotable: voteKeywords.test(item) }));
          const detectedIndices = autoDetected.filter(a => a.isVotable).map(a => a.index);
          const hasVotableItems = detectedIndices.length > 0;
          // Auto-suggest vote items if not manually configured
          const effectiveVoteItems = mForm.voteItems.length > 0 ? mForm.voteItems : (mForm.requiresVote ? detectedIndices : []);
          return (
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between"><div><label className="text-xs font-bold text-ink-700">Requires Vote?</label><p className="text-[10px] text-ink-400 mt-0.5">{defaults.reason}</p></div>
              <button onClick={() => { const nv = !mForm.requiresVote; setMForm({ ...mForm, requiresVote: nv, voteItems: nv && mForm.voteItems.length === 0 ? detectedIndices : mForm.voteItems }); }} className={`relative w-11 h-6 rounded-full transition-colors ${mForm.requiresVote ? 'bg-accent-500' : 'bg-ink-200'}`}><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mForm.requiresVote ? 'left-[22px]' : 'left-0.5'}`} /></button>
            </div>
            {/* Auto-detection hint */}
            {!mForm.requiresVote && hasVotableItems && agendaItems.length > 0 && (
              <button onClick={() => setMForm({ ...mForm, requiresVote: true, voteItems: detectedIndices })} className="w-full text-left bg-amber-50 border border-amber-200 rounded-lg p-3 hover:bg-amber-100 transition-colors">
                <p className="text-[10px] font-semibold text-amber-800">💡 {detectedIndices.length} agenda item{detectedIndices.length > 1 ? 's' : ''} may require a vote:</p>
                <div className="mt-1.5 space-y-0.5">{autoDetected.filter(a => a.isVotable).map(a => (<p key={a.index} className="text-[10px] text-amber-700">• {a.text}</p>))}</div>
                <p className="text-[10px] text-accent-600 font-medium mt-2">Click to enable vote for these items →</p>
              </button>
            )}
            {mForm.requiresVote && (<div className="space-y-2"><div><label className="block text-[10px] font-semibold text-ink-600 mb-1">Vote Scope</label><div className="flex gap-2">
              <button onClick={() => setMForm({ ...mForm, voteScope: 'board' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mForm.voteScope === 'board' ? 'bg-accent-600 text-white' : 'bg-white border border-ink-200 text-ink-600'}`}>Board Vote</button>
              <button onClick={() => setMForm({ ...mForm, voteScope: 'owner' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mForm.voteScope === 'owner' ? 'bg-accent-600 text-white' : 'bg-white border border-ink-200 text-ink-600'}`}>Owner Vote</button>
            </div></div>
            <div className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-[10px] text-ink-600">{mForm.voteScope === 'board' ? '🏛 Board members vote on motions. Quorum: majority of board.' : '🗳 Unit owners vote. Quorum: 25% of eligible units.'}</p>
              {agendaItems.length > 0 && (() => {
                const selected = effectiveVoteItems;
                return (<div className="mt-3 border-t border-ink-50 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-ink-500">Select agenda items that require a vote:</p>
                    <div className="flex gap-2">
                      <button onClick={() => setMForm({ ...mForm, voteItems: agendaItems.map((_, i) => i) })} className="text-[10px] text-accent-600 font-medium hover:underline">Select all</button>
                      <button onClick={() => setMForm({ ...mForm, voteItems: [] })} className="text-[10px] text-ink-400 font-medium hover:underline">Clear</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">{agendaItems.map((agItem, i) => {
                    const isSelected = selected.includes(i);
                    const isAutoDetected = detectedIndices.includes(i);
                    return (
                    <label key={i} className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-accent-50 border border-accent-200' : 'hover:bg-mist-50 border border-transparent'}`}>
                      <input type="checkbox" checked={isSelected} onChange={e => {
                        if (e.target.checked) setMForm({ ...mForm, voteItems: [...selected, i] });
                        else setMForm({ ...mForm, voteItems: selected.filter(x => x !== i) });
                      }} className="h-4 w-4 mt-0.5 shrink-0 accent-accent-600" />
                      <div className="flex-1">
                        <span className={`text-xs ${isSelected ? 'text-accent-800 font-medium' : 'text-ink-600'}`}>{agItem}</span>
                        {isSelected && <span className="text-[10px] text-accent-500 ml-1.5">→ vote item</span>}
                        {isAutoDetected && !isSelected && <span className="text-[10px] text-amber-500 ml-1.5">💡 suggested</span>}
                      </div>
                    </label>);
                  })}</div>
                  {selected.length === 0 && <p className="text-[10px] text-amber-600 mt-2">⚠ No items selected — select at least one agenda item to vote on, or toggle off "Requires Vote"</p>}
                  {selected.length > 0 && <p className="text-[10px] text-sage-600 mt-2">✓ {selected.length} of {agendaItems.length} agenda items will become vote items</p>}
                </div>);
              })()}
              {agendaItems.length === 0 && <p className="text-[10px] text-ink-400 mt-2 italic">Add agenda items above to select which require a vote</p>}
            </div></div>)}
          </div>); })()}
        <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
        {modal === 'addMeeting' && (mForm.status === 'SCHEDULED' || mForm.status === 'RESCHEDULED') && (
          <label className="flex items-start gap-3 bg-accent-50 border border-accent-200 rounded-xl p-4 cursor-pointer hover:bg-accent-100 transition-colors">
            <input type="checkbox" checked={mForm.sendNotice} onChange={e => setMForm({ ...mForm, sendNotice: e.target.checked })} className="h-4 w-4 mt-0.5 accent-accent-600" />
            <div><span className="text-xs font-semibold text-accent-800">📧 Send meeting notice to all members</span>
              <p className="text-[11px] text-accent-600 mt-0.5">Emails {buildingMembers.filter(m => m.email && m.status === 'active').length} active members with meeting details, agenda, and virtual link via Mailjet.</p>
            </div>
          </label>
        )}
      </div></Modal>)}
      {modal === 'attendees' && (<Modal title="Manage Attendees" onClose={() => setModal(null)} onSave={saveAttendees}><div className="space-y-4"><div><label className="block text-xs font-medium text-ink-700 mb-2">Board Members</label><div className="space-y-1">{board.map(b => (<label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attForm.board.includes(b.name)} onChange={e => { if (e.target.checked) setAttForm({ ...attForm, board: [...attForm.board, b.name] }); else setAttForm({ ...attForm, board: attForm.board.filter(n => n !== b.name) }); }} className="h-4 w-4" />{b.name} <span className="text-ink-400">({b.role})</span></label>))}</div></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Owners (one per line)</label><textarea value={attForm.owners} onChange={e => setAttForm({ ...attForm, owners: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Guests</label><textarea value={attForm.guests} onChange={e => setAttForm({ ...attForm, guests: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div></div></Modal>)}
      {modal === 'minutes' && (<Modal title="Meeting Minutes" onClose={() => setModal(null)} onSave={() => { mtg.updateMinutes(targetId, minText); setModal(null); }} wide><textarea value={minText} onChange={e => setMinText(e.target.value)} className="w-full px-4 py-3 border border-ink-200 rounded-lg text-sm font-mono" rows={12} /></Modal>)}

      {modal === 'addFilingAtt' && (<Modal title="Attach Proof of Filing" onClose={() => setModal(null)} onSave={() => { if (!pendingFile) return alert('Select a file.'); comp.addFilingAttachment(targetId, { name: pendingFile.name, size: pendingFile.size, uploadedAt: new Date().toISOString().split('T')[0] }); setModal(null); setPendingFile(null); }} saveLabel="Attach"><div className="space-y-3"><FileUpload onFileSelected={fObj => setPendingFile(fObj)} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" label="Drop proof of filing here or click to browse" />{pendingFile && <div className="bg-sage-50 border border-sage-200 rounded-lg p-3"><p className="text-xs text-sage-700">📎 <strong>{pendingFile.name}</strong> ({pendingFile.size})</p></div>}</div></Modal>)}
      {modal === 'addRunbookAtt' && (<Modal title="Attach Document to Checklist Item" onClose={() => setModal(null)} onSave={() => { if (!pendingFile) return alert('Select a file.'); comp.addItemAttachment(targetId, { name: pendingFile.name, size: pendingFile.size, uploadedAt: new Date().toISOString().split('T')[0] }); setModal(null); setPendingFile(null); }} saveLabel="Attach"><div className="space-y-3"><FileUpload onFileSelected={fObj => setPendingFile(fObj)} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />{pendingFile && <div className="bg-sage-50 border border-sage-200 rounded-lg p-3"><p className="text-xs text-sage-700">📎 <strong>{pendingFile.name}</strong> ({pendingFile.size})</p></div>}</div></Modal>)}
      {modal === 'linkCaseToMeeting' && (<Modal title="Link Existing Case" onClose={() => setModal(null)} onSave={() => { if (linkCaseId) { mtg.linkCase(targetId, linkCaseId); setModal(null); } }} saveLabel="Link"><div className="space-y-3"><p className="text-xs text-ink-500">Select an existing case from Case Ops.</p><select value={linkCaseId} onChange={e => setLinkCaseId(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select a case...</option>{issues.cases.filter(c => c.status !== 'closed').map(c => <option key={c.id} value={c.id}>{c.id}: {c.title} ({c.status})</option>)}</select></div></Modal>)}
      {modal === 'createCaseForMeeting' && (<Modal title="Create Case" onClose={() => setModal(null)} onSave={handleCreateCase} saveLabel="Create"><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Case Title *</label><input value={newCaseForm.title} onChange={e => setNewCaseForm({ ...newCaseForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Workflow</label><select value={newCaseForm.sitId} onChange={e => setNewCaseForm({ ...newCaseForm, sitId: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{GOV_SITS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Priority</label><select value={newCaseForm.priority} onChange={e => setNewCaseForm({ ...newCaseForm, priority: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div></div></div></Modal>)}
      {modal === 'addDocument' && (() => { const meeting = meetings.find(m => m.id === targetId); return (
        <Modal title={`Documents — ${meeting?.title || ''}`} onClose={() => setModal(null)} onSave={() => { if (pendingFile) { mtg.addDocument(targetId, { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type, uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Board' }); setPendingFile(null); } setModal(null); }} saveLabel={pendingFile ? 'Upload & Close' : 'Close'}>
          <div className="space-y-4">
            {(meeting?.documents || []).length > 0 && (<div><label className="block text-xs font-semibold text-ink-600 mb-2">Attached Documents</label><div className="space-y-1.5">{(meeting?.documents || []).map(d => (<div key={d.id} className="flex items-center justify-between bg-mist-50 border border-mist-200 rounded-lg px-3 py-2"><div className="flex items-center gap-2"><span className="text-sm">📄</span><span className="text-xs text-ink-800 font-medium">{d.name}</span><span className="text-[10px] text-ink-400">{d.size}</span></div><button onClick={() => mtg.removeDocument(targetId, d.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button></div>))}</div></div>)}
            <div><label className="block text-xs font-semibold text-ink-600 mb-2">Upload New Document</label><FileUpload onFileSelected={fObj => setPendingFile({ name: fObj.name, size: fObj.size, type: fObj.type })} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />{pendingFile && <p className="text-xs text-sage-600 mt-1.5">📎 Ready: {pendingFile.name} ({pendingFile.size})</p>}</div>
          </div>
        </Modal>); })()}
      {modal === 'runbookLinkOrCreate' && (() => {
        const item = categories.flatMap(c => c.items).find(i => i.id === targetId);
        return (<Modal title={runbookAction === 'case' ? 'Add Case' : 'Schedule Meeting'} onClose={() => setModal(null)} onSave={() => setModal(null)} saveLabel="Done"><div className="space-y-4">
          {item && <div className="bg-mist-50 border border-mist-200 rounded-lg p-3"><p className="text-xs font-semibold text-ink-700">📋 {item.task}</p><p className="text-[10px] text-ink-400 mt-0.5">{item.legalRef} · {item.role} · {item.freq}</p></div>}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { if (runbookAction === 'case') { setLinkCaseId(''); setModal('linkCaseToMeeting'); } else { setModal(null); setTab('meetings'); } }} className="p-4 bg-mist-50 border border-mist-200 rounded-xl text-center hover:border-accent-400 hover:bg-accent-50 transition-colors"><span className="text-2xl">🔗</span><p className="text-sm font-semibold text-ink-900 mt-2">Link Existing</p><p className="text-xs text-ink-400 mt-1">{runbookAction === 'case' ? 'Choose from open cases' : 'Go to Meetings tab'}</p></button>
            <button onClick={() => {
              if (runbookAction === 'case') { setNewCaseForm({ catId: 'governance', sitId: 'board-meetings', title: item?.task || '', priority: item?.critical ? 'high' : 'medium' }); setModal('createCaseForMeeting'); }
              else {
                // Pre-fill meeting form from runbook item metadata and open the form
                const mType = item?.meetingType || 'BOARD';
                const agenda = item?.suggestedAgenda || [item?.task || 'Agenda item'];
                const d = getVoteDefaults(mType);
                setRunbookItemForMeeting(targetId);
                setMForm({ title: item?.task || 'Meeting', type: mType, date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: agenda.join('\n'), notes: `From Runbook: ${item?.task || ''}. ${item?.legalRef || ''}`, status: 'SCHEDULED', requiresVote: d.requiresVote, voteScope: d.voteScope, voteItems: [], sendNotice: false });
                setModal('addMeeting');
              }
            }} className="p-4 bg-mist-50 border border-mist-200 rounded-xl text-center hover:border-accent-400 hover:bg-accent-50 transition-colors"><span className="text-2xl">✨</span><p className="text-sm font-semibold text-ink-900 mt-2">Create New</p><p className="text-xs text-ink-400 mt-1">{runbookAction === 'case' ? 'Open a new case' : 'Schedule & mark complete'}</p></button>
          </div>
        </div></Modal>);
      })()}

      {/* Announcement modal */}
      {modal === 'addAnnouncement' && (<Modal title="Post Announcement" onClose={() => { if (!sendingEmail) setModal(null); }} onSave={async () => {
        if (!f('annTitle') || !f('annBody')) { alert('Title and body required'); return; }
        const boardMember = board.find(b => b.name === currentUser.name);
        const roleName = boardMember?.role || currentRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        comp.addAnnouncement({
          title: f('annTitle'),
          body: f('annBody'),
          category: (f('annCategory') || 'general') as any,
          postedBy: roleName,
          postedDate: new Date().toISOString().split('T')[0],
          pinned: f('annPinned') === 'true',
        });
        // Send via email if checked
        if (f('annSendEmail') === 'true') {
          setSendingEmail(true);
          try {
            const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
            const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const recipients = buildingMembers.filter(m => m.email && m.status === 'active').map(m => ({ email: m.email, name: m.name }));
            if (!sbUrl || !sbKey) {
              alert('Announcement posted! Email not sent — Supabase not configured.');
            } else {
              const res = await fetch(`${sbUrl}/functions/v1/send-announcement`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`,
                  'apikey': sbKey,
                },
                body: JSON.stringify({
                  title: f('annTitle'),
                  announcementBody: f('annBody'),
                  category: f('annCategory') || 'general',
                  postedBy: roleName,
                  recipients,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.sent > 0) {
                  alert(`Announcement posted and emailed to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}.`);
                } else {
                  alert('Announcement posted! Email sending is not configured yet — deploy the send-announcement Edge Function.');
                }
              } else {
                const errText = await res.text();
                if (res.status === 404) {
                  alert('Announcement posted! To enable email, deploy the Edge Function:\nsupabase functions deploy send-announcement --no-verify-jwt');
                } else {
                  alert(`Announcement posted but email failed: ${errText.slice(0, 100)}`);
                }
              }
            }
          } catch (e) {
            console.error('Announcement email error:', e);
            alert('Announcement posted! Email sending encountered an error.');
          } finally {
            setSendingEmail(false);
          }
        }
        setModal(null);
      }} saveLabel={sendingEmail ? 'Sending...' : f('annSendEmail') === 'true' ? 'Post & Send Email' : 'Post to Community'}>
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={f('annTitle')} onChange={e => sf('annTitle', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Elevator Modernization Project Update" /></div>
          <div><label className="block text-xs font-medium text-ink-700 mb-1">Category</label><select value={f('annCategory')} onChange={e => sf('annCategory', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
            <option value="general">General</option><option value="maintenance">Maintenance</option><option value="financial">Financial</option><option value="safety">Safety</option><option value="rules">Rules & Policies</option><option value="meeting">Meeting</option>
          </select></div>
          <div><label className="block text-xs font-medium text-ink-700 mb-1">Message *</label><textarea value={f('annBody')} onChange={e => sf('annBody', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={5} placeholder="Write the announcement body. This will be visible to all residents in the Community Room." /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f('annPinned') === 'true'} onChange={e => sf('annPinned', e.target.checked ? 'true' : 'false')} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">📌 Pin this announcement</span><span className="text-[10px] text-ink-400">(pinned posts appear first)</span></label>
          <div className="border-t border-ink-100 pt-3 mt-1">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f('annSendEmail') === 'true'} onChange={e => sf('annSendEmail', e.target.checked ? 'true' : 'false')} className="h-4 w-4 accent-accent-600 rounded" /><span className="text-sm text-ink-700">✉️ Also send via email</span><span className="text-[10px] text-ink-400">(to all building members)</span></label>
            {f('annSendEmail') === 'true' && (
              <p className="text-[11px] text-ink-400 mt-1.5 ml-6">This announcement will be emailed to {buildingMembers.filter(m => m.email && m.status === 'active').length} active members via Mailjet.</p>
            )}
          </div>
        </div>
      </Modal>)}
    </div>
  );
}
