import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeetingsStore, type Meeting } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import VotingPage from '@/features/elections/ElectionsPage';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';

const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

type TabId = 'meetings' | 'votes';
type ModalType = null | 'addMeeting' | 'editMeeting' | 'attendees' | 'minutes' | 'linkCaseToMeeting' | 'createCaseForMeeting' | 'addDocument';

export default function BoardRoomPage() {
  const mtg = useMeetingsStore();
  const { board, address, legalDocuments } = useBuildingStore();
  const issues = useIssuesStore();
  const elections = useElectionStore();
  const { currentRole, currentUser } = useAuthStore();
  const navigate = useNavigate();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const isDC = address.state === 'District of Columbia';
  const jurisdiction = isDC ? 'DC' : address.state;
  const hasBylaws = legalDocuments.some(d => d.name.toLowerCase().includes('bylaw'));

  const { meetings } = mtg;
  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
  const boardCount = meetings.filter(m => m.type === 'BOARD' && m.date.startsWith('2026')).length;
  const annualCount = meetings.filter(m => m.type === 'ANNUAL' && (m.date.startsWith('2025-12') || m.date.startsWith('2026'))).length;
  const hasMinutes = meetings.filter(m => m.status === 'COMPLETED' && m.minutes).length;
  const completedMeetings = meetings.filter(m => m.status === 'COMPLETED').length;
  const minutesRate = completedMeetings > 0 ? Math.round((hasMinutes / completedMeetings) * 100) : 100;

  const openElections = elections.elections.filter(e => e.status === 'open').length;

  const [tab, setTab] = useState<TabId>('meetings');
  const [modal, setModal] = useState<ModalType>(null);
  const [targetId, setTargetId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [mForm, setMForm] = useState({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED', requiresVote: false, voteScope: 'board' as 'board' | 'owner' });
  const [attForm, setAttForm] = useState({ board: [] as string[], owners: '' as string, guests: '' as string });
  const [minText, setMinText] = useState('');
  const [linkCaseId, setLinkCaseId] = useState('');
  const [newCaseForm, setNewCaseForm] = useState({ catId: 'governance', sitId: 'board-meetings', title: '', priority: 'medium' as string });
  const [pendingFile, setPendingFile] = useState<{ name: string; size: string; type: string } | null>(null);

  const GOV_SITS = [
    { id: 'board-meetings', label: 'Board Meetings' }, { id: 'elections', label: 'Elections' },
    { id: 'bylaw-amendment', label: 'Bylaw / CC&R Amendment' }, { id: 'annual-budgeting', label: 'Annual Budgeting' },
    { id: 'special-assessments', label: 'Special Assessments' }, { id: 'covenant-violations', label: 'Covenant Violations' },
  ];

  // Smart defaults for vote requirement based on meeting type and jurisdiction
  const getVoteDefaults = (meetingType: string): { requiresVote: boolean; voteScope: 'board' | 'owner'; reason: string } => {
    const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`;
    switch (meetingType) {
      case 'ANNUAL': return { requiresVote: true, voteScope: 'owner', reason: `Required: Board elections & budget approval (${stateAct})` };
      case 'SPECIAL': return { requiresVote: true, voteScope: 'owner', reason: `Typically required: Special meetings are called for items requiring owner vote (${stateAct})` };
      case 'BOARD': return { requiresVote: false, voteScope: 'board', reason: 'Board meetings may include motions but votes are not always required' };
      case 'QUARTERLY': return { requiresVote: false, voteScope: 'board', reason: 'Quarterly reviews typically informational; toggle on if motions are planned' };
      case 'EMERGENCY': return { requiresVote: true, voteScope: 'board', reason: 'Emergency actions often require board ratification vote' };
      default: return { requiresVote: false, voteScope: 'board', reason: '' };
    }
  };

  const openAddMeeting = () => {
    const defaults = getVoteDefaults('BOARD');
    setMForm({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED', requiresVote: defaults.requiresVote, voteScope: defaults.voteScope });
    setModal('addMeeting');
  };
  const openEditMeeting = (m: Meeting) => { setTargetId(m.id); setMForm({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda.join('\n'), notes: m.notes, status: m.status, requiresVote: false, voteScope: 'board' }); setModal('editMeeting'); };
  const openAttendees = (m: Meeting) => { setTargetId(m.id); setAttForm({ board: [...m.attendees.board], owners: m.attendees.owners.join('\n'), guests: m.attendees.guests.join('\n') }); setModal('attendees'); };
  const openMinutes = (m: Meeting) => { setTargetId(m.id); setMinText(m.minutes); setModal('minutes'); };
  const saveMeeting = () => {
    if (!mForm.title || !mForm.date) { alert('Title and date required'); return; }
    const agenda = mForm.agenda.split('\n').map(s => s.trim()).filter(Boolean);
    if (agenda.length === 0) { alert('At least one agenda item is required'); return; }
    if (modal === 'addMeeting') {
      mtg.addMeeting({ title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
      // Get the newly created meeting ID from fresh state
      const freshMeetings = useMeetingsStore.getState().meetings;
      const newMeetingId = freshMeetings[freshMeetings.length - 1]?.id;
      // Auto-create election if vote required
      if (mForm.requiresVote && agenda.length > 0 && newMeetingId) {
        const typeMap: Record<string, string> = { ANNUAL: 'budget_approval', SPECIAL: 'special_assessment', BOARD: 'meeting_motion', QUARTERLY: 'meeting_motion', EMERGENCY: 'meeting_motion' };
        const elType = (typeMap[mForm.type] || 'meeting_motion') as any;
        const stateAct = isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`;
        // Create the election with agenda items as vote items
        elections.addElection({
          title: `${mForm.title} — Vote`,
          type: elType,
          status: 'draft',
          description: `Vote items for ${mForm.title} on ${mForm.date}. ${mForm.voteScope === 'owner' ? 'Owner vote' : 'Board vote'}.`,
          createdBy: 'Board',
          openedAt: null, closedAt: null, certifiedAt: null, certifiedBy: null,
          scheduledCloseDate: mForm.date,
          noticeDate: null,
          quorumRequired: mForm.voteScope === 'owner' ? 25 : 50.1,
          ballotItems: agenda.map((item, i) => ({
            id: 'bi_auto_' + Date.now() + '_' + i,
            title: item,
            description: `Agenda item from ${mForm.title}`,
            rationale: '',
            type: 'yes_no' as const,
            requiredThreshold: 50.1,
            legalRef: stateAct,
            attachments: [],
          })),
          legalRef: stateAct,
          notes: `Auto-created from meeting: ${mForm.title}. Scope: ${mForm.voteScope} vote.`,
          complianceChecks: [],
          linkedMeetingId: newMeetingId,
        });
        // Get the newly created election ID from fresh state
        const freshElections = useElectionStore.getState().elections;
        const newElectionId = freshElections[0]?.id; // addElection prepends
        if (newElectionId) {
          useMeetingsStore.getState().linkVote(newMeetingId, newElectionId);
        }
      }
    } else {
      mtg.updateMeeting(targetId, { title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
    }
    setModal(null);
  };
  const saveAttendees = () => { mtg.updateAttendees(targetId, { board: attForm.board, owners: attForm.owners.split('\n').map(s => s.trim()).filter(Boolean), guests: attForm.guests.split('\n').map(s => s.trim()).filter(Boolean) }); setModal(null); };
  const handleCreateCase = () => { if (!newCaseForm.title) { alert('Title required'); return; } const caseId = issues.createCase({ catId: newCaseForm.catId, sitId: newCaseForm.sitId, approach: 'self', title: newCaseForm.title, unit: 'N/A', owner: 'Board', priority: newCaseForm.priority as any, notes: `Linked to meeting: ${meetings.find(m => m.id === targetId)?.title || targetId}` }); mtg.linkCase(targetId, caseId); setModal(null); };

  const renderMeeting = (m: Meeting, isUpcoming: boolean) => {
    const linkedCases = issues.cases.filter(c => (m.linkedCaseIds || []).includes(c.id));
    const linkedVotes = elections.elections.filter(v => (m.linkedVoteIds || []).includes(v.id));
    return (
      <div key={m.id} className={`bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all ${isUpcoming ? 'border-2 border-accent-200' : 'border-ink-100'}`}>
        <div className="p-5 cursor-pointer" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-lg font-bold text-ink-900">{m.title}</h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[m.type] || 'bg-ink-100 text-ink-500'}`}>{m.type}</span>
                {linkedCases.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">📋 {linkedCases.length} case{linkedCases.length !== 1 ? 's' : ''}</span>}
                {linkedVotes.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">🗳 {linkedVotes.length} vote{linkedVotes.length !== 1 ? 's' : ''}</span>}
                <svg className={`h-5 w-5 text-ink-400 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <p className="text-sm text-ink-500">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {m.time} · {m.location}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[m.status] || 'bg-ink-100 text-ink-500'}`}>{m.status}</span>
          </div>
        </div>
        {expanded === m.id && (
          <div className="border-t border-ink-100 p-5 space-y-4">
            {isBoard && <div className="flex flex-wrap gap-2">
              <button onClick={() => openEditMeeting(m)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">Edit</button>
              <button onClick={() => openAttendees(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">Attendees</button>
              <button onClick={() => openMinutes(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">{m.minutes ? 'Edit Minutes' : 'Add Minutes'}</button>
              <button onClick={() => { setTargetId(m.id); setPendingFile(null); setModal('addDocument'); }} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">📎 Documents</button>
              <button onClick={() => { setTargetId(m.id); setNewCaseForm({ catId: 'governance', sitId: 'board-meetings', title: `${m.title} — `, priority: 'medium' }); setModal('createCaseForMeeting'); }} className="px-3 py-1.5 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50">+ Case</button>
              <button onClick={() => { setTargetId(m.id); setLinkCaseId(''); setModal('linkCaseToMeeting'); }} className="px-3 py-1.5 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50">🔗 Link Case</button>
              <button onClick={() => { if (confirm('Delete?')) mtg.deleteMeeting(m.id); }} className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700">Delete</button>
            </div>}
            {m.notes && <div className="bg-mist-50 rounded-lg p-3 text-sm text-ink-600">{m.notes}</div>}
            {m.agenda.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Agenda</p><div className="bg-mist-50 rounded-lg p-4 space-y-2">{m.agenda.map((item, i) => (<div key={i} className="flex items-start gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span><span className="text-ink-700">{item}</span></div>))}</div></div>)}
            {(m.documents || []).length > 0 && (<div><p className="font-bold text-ink-900 mb-2">📎 Documents ({m.documents.length})</p><div className="flex flex-wrap gap-2">{m.documents.map(d => (<span key={d.id} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1.5"><span className="text-[11px] text-accent-600 font-medium">📄 {d.name}</span><span className="text-[10px] text-ink-400">{d.size}</span>{isBoard && <button onClick={() => mtg.removeDocument(m.id, d.id)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>}</span>))}</div></div>)}
            {linkedCases.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">📋 Linked Cases ({linkedCases.length})</p><div className="space-y-2">{linkedCases.map(c => (<div key={c.id} className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-center justify-between"><div><p className="text-sm font-medium text-violet-900">{c.id}: {c.title}</p><p className="text-[10px] text-violet-600">{c.status} · {c.priority} · Created {c.created}</p></div><div className="flex gap-2"><button onClick={() => navigate('/issues')} className="text-[10px] text-accent-600 hover:underline">Open in Case Ops →</button>{isBoard && <button onClick={() => mtg.unlinkCase(m.id, c.id)} className="text-xs text-red-400">×</button>}</div></div>))}</div></div>)}
            {linkedVotes.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">🗳 Linked Votes ({linkedVotes.length})</p><div className="space-y-2">{linkedVotes.map(v => (<div key={v.id} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between"><div><p className="text-sm font-medium text-green-900">{v.title}</p><p className="text-[10px] text-green-600">{v.status} · {v.ballotItems.length} items · {v.ballots.length} ballots</p></div><div className="flex gap-2"><button onClick={() => setTab('votes')} className="text-[10px] text-accent-600 hover:underline">View in Votes →</button>{isBoard && <button onClick={() => mtg.unlinkVote(m.id, v.id)} className="text-xs text-red-400">×</button>}</div></div>))}</div></div>)}
            {(m.attendees.board.length > 0 || m.attendees.owners.length > 0) && (<div><p className="font-bold text-ink-900 mb-2">Attendance ({m.attendees.board.length + m.attendees.owners.length + m.attendees.guests.length})</p><div className="bg-mist-50 rounded-lg p-3 space-y-2 text-sm">{m.attendees.board.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Board</span><p className="text-ink-700">{m.attendees.board.join(', ')}</p></div>}{m.attendees.owners.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Owners ({m.attendees.owners.length})</span><p className="text-ink-700">{m.attendees.owners.join(', ')}</p></div>}{m.attendees.guests.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Guests</span><p className="text-ink-700">{m.attendees.guests.join(', ')}</p></div>}</div></div>)}
            {m.minutes && (<div><p className="font-bold text-ink-900 mb-2">Meeting Minutes</p><div className="bg-mist-50 rounded-lg p-4 text-sm text-ink-700 whitespace-pre-wrap max-h-48 overflow-y-auto border border-mist-100">{m.minutes}</div></div>)}
          </div>
        )}
      </div>
    );
  };

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'meetings', label: 'Meetings', badge: upcoming.length || undefined },
    { id: 'votes', label: 'Votes & Resolutions', badge: openElections || undefined },
  ];

  const meetingReqs = [
    { label: 'Board Meetings', req: 4, actual: boardCount, freq: 'Quarterly minimum', legalRef: isDC ? 'DC Code § 29-1109.01' : `${jurisdiction} Condo Act` },
    { label: 'Annual Meeting', req: 1, actual: annualCount, freq: 'Within 13 months of prior', legalRef: isDC ? 'DC Code § 29-1109.02' : `${jurisdiction} Condo Act` },
    { label: 'Meeting Minutes', req: 100, actual: minutesRate, freq: 'All completed meetings', legalRef: isDC ? 'DC Code § 29-1108.06' : `${jurisdiction} Condo Act`, isPct: true },
  ];

  return (
    <div className="space-y-0">
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">🏛 Board Room</h2>
            <p className="text-accent-200 text-sm mt-1">Meetings, votes & resolutions · {isDC ? 'District of Columbia' : jurisdiction} jurisdiction</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center bg-white bg-opacity-10 rounded-lg px-4 py-2">
              <p className="text-[10px] text-accent-200">Upcoming</p>
              <p className="text-lg font-bold text-white">{upcoming.length}</p>
            </div>
            <div className="text-center bg-white bg-opacity-10 rounded-lg px-4 py-2">
              <p className="text-[10px] text-accent-200">This Year</p>
              <p className="text-lg font-bold text-white">{meetings.filter(m => m.date.startsWith('2026')).length}</p>
            </div>
            <div className="text-center bg-white bg-opacity-10 rounded-lg px-4 py-2">
              <p className="text-[10px] text-accent-200">Open Votes</p>
              <p className="text-lg font-bold text-white">{openElections}</p>
            </div>
          </div>
        </div>
        {isBoard && (
          <div className="grid grid-cols-3 gap-3 mt-5">
            {meetingReqs.map(r => {
              const met = (r as any).isPct ? r.actual >= r.req : r.actual >= r.req;
              return (
                <div key={r.label} className={`bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 ${met ? '' : 'ring-1 ring-red-400 ring-opacity-50'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-accent-100 font-medium">{r.label}</span>
                    <span className={`text-sm ${met ? 'text-green-300' : 'text-red-300'}`}>{met ? '✓' : '✗'}</span>
                  </div>
                  {(r as any).isPct
                    ? <p className="text-sm font-bold text-white">{r.actual}%</p>
                    : <p className="text-sm font-bold text-white">{r.actual}/{r.req}</p>
                  }
                  <p className="text-[10px] text-accent-300 font-mono mt-0.5">{r.legalRef}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${tab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {t.label}
              {t.badge && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
        {/* MEETINGS TAB */}
        {tab === 'meetings' && (
          <div className="space-y-6">
            {isBoard && (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-ink-900">Meetings</h3>
                  <p className="text-xs text-ink-400">Schedule, manage & document board and owner meetings</p>
                </div>
                <button onClick={openAddMeeting} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Schedule Meeting</button>
              </div>
            )}
            {upcoming.length > 0 && (<div><h3 className="font-display text-base font-bold text-ink-900 mb-3">Upcoming</h3><div className="space-y-3">{upcoming.map(m => renderMeeting(m, true))}</div></div>)}
            {past.length > 0 && (<div><h3 className="font-display text-base font-bold text-ink-900 mb-3">Past Meetings</h3><div className="space-y-3">{past.map(m => renderMeeting(m, false))}</div></div>)}
            {upcoming.length === 0 && past.length === 0 && <p className="text-sm text-ink-400 py-8 text-center">No meetings scheduled yet.</p>}
          </div>
        )}

        {/* VOTES TAB — renders the full elections page */}
        {tab === 'votes' && <VotingPage />}
      </div>

      {/* MEETING MODALS */}
      {(modal === 'addMeeting' || modal === 'editMeeting') && (
        <Modal title={modal === 'addMeeting' ? 'Schedule Meeting' : 'Edit Meeting'} onClose={() => setModal(null)} onSave={saveMeeting} wide>
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={mForm.title} onChange={e => setMForm({ ...mForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="February Board Meeting" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={mForm.type} onChange={e => { const t = e.target.value; const d = getVoteDefaults(t); setMForm({ ...mForm, type: t, requiresVote: d.requiresVote, voteScope: d.voteScope }); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['BOARD','ANNUAL','QUARTERLY','SPECIAL','EMERGENCY'].map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={mForm.status} onChange={e => setMForm({ ...mForm, status: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['SCHEDULED','COMPLETED','CANCELLED','RESCHEDULED'].map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Date *</label><input type="date" value={mForm.date} onChange={e => setMForm({ ...mForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Time</label><input type="time" value={mForm.time} onChange={e => setMForm({ ...mForm, time: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Location</label><input value={mForm.location} onChange={e => setMForm({ ...mForm, location: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Virtual Link</label><input value={mForm.virtualLink} onChange={e => setMForm({ ...mForm, virtualLink: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="https://zoom.us/j/..." /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Agenda (one item per line) *</label><textarea value={mForm.agenda} onChange={e => setMForm({ ...mForm, agenda: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={4} placeholder="Review January financials&#10;Elevator maintenance proposal&#10;Approve 2026 budget" /></div>
            {/* Vote requirement */}
            {modal === 'addMeeting' && (() => {
              const defaults = getVoteDefaults(mForm.type);
              return (
                <div className="bg-mist-50 border border-mist-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-ink-700">Requires Vote?</label>
                      <p className="text-[10px] text-ink-400 mt-0.5">{defaults.reason}</p>
                    </div>
                    <button onClick={() => setMForm({ ...mForm, requiresVote: !mForm.requiresVote })} className={`relative w-11 h-6 rounded-full transition-colors ${mForm.requiresVote ? 'bg-accent-500' : 'bg-ink-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mForm.requiresVote ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {mForm.requiresVote && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-ink-600 mb-1">Vote Scope</label>
                        <div className="flex gap-2">
                          <button onClick={() => setMForm({ ...mForm, voteScope: 'board' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mForm.voteScope === 'board' ? 'bg-accent-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:border-accent-300'}`}>Board Vote</button>
                          <button onClick={() => setMForm({ ...mForm, voteScope: 'owner' })} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mForm.voteScope === 'owner' ? 'bg-accent-600 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:border-accent-300'}`}>Owner Vote</button>
                        </div>
                      </div>
                      <div className="bg-white border border-ink-100 rounded-lg p-3">
                        <p className="text-[10px] text-ink-600">
                          {mForm.voteScope === 'board'
                            ? '🏛 Board members vote on motions during the meeting. Quorum: majority of board.'
                            : '🗳 Unit owners vote on the items. Each occupied unit gets one vote weighted by ownership %. Quorum: 25% of eligible units.'}
                        </p>
                        {mForm.agenda.trim() && (
                          <div className="mt-2 border-t border-ink-50 pt-2">
                            <p className="text-[10px] font-semibold text-ink-500 mb-1">Agenda items will become vote items:</p>
                            {mForm.agenda.split('\n').filter(s => s.trim()).map((item, i) => (
                              <p key={i} className="text-[10px] text-accent-700">• {item.trim()}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
          </div>
        </Modal>
      )}
      {modal === 'attendees' && (<Modal title="Manage Attendees" onClose={() => setModal(null)} onSave={saveAttendees}><div className="space-y-4"><div><label className="block text-xs font-medium text-ink-700 mb-2">Board Members</label><div className="space-y-1">{board.map(b => (<label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attForm.board.includes(b.name)} onChange={e => { if (e.target.checked) setAttForm({ ...attForm, board: [...attForm.board, b.name] }); else setAttForm({ ...attForm, board: attForm.board.filter(n => n !== b.name) }); }} className="h-4 w-4" />{b.name} <span className="text-ink-400">({b.role})</span></label>))}</div></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Owners (one per line)</label><textarea value={attForm.owners} onChange={e => setAttForm({ ...attForm, owners: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Unit 201 — Karen Liu" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Guests</label><textarea value={attForm.guests} onChange={e => setAttForm({ ...attForm, guests: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div></div></Modal>)}
      {modal === 'minutes' && (<Modal title="Meeting Minutes" onClose={() => setModal(null)} onSave={() => { mtg.updateMinutes(targetId, minText); setModal(null); }} wide><textarea value={minText} onChange={e => setMinText(e.target.value)} className="w-full px-4 py-3 border border-ink-200 rounded-lg text-sm font-mono" rows={12} /></Modal>)}
      {modal === 'linkCaseToMeeting' && (<Modal title="Link Existing Case" onClose={() => setModal(null)} onSave={() => { if (linkCaseId) { mtg.linkCase(targetId, linkCaseId); setModal(null); } }} saveLabel="Link"><div className="space-y-3"><p className="text-xs text-ink-500">Select an existing case from Case Ops to link to this meeting.</p><select value={linkCaseId} onChange={e => setLinkCaseId(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select a case...</option>{issues.cases.filter(c => c.status !== 'closed').map(c => <option key={c.id} value={c.id}>{c.id}: {c.title} ({c.status})</option>)}</select></div></Modal>)}
      {modal === 'createCaseForMeeting' && (<Modal title="Create Case for Meeting" onClose={() => setModal(null)} onSave={handleCreateCase} saveLabel="Create & Link"><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Case Title *</label><input value={newCaseForm.title} onChange={e => setNewCaseForm({ ...newCaseForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Workflow</label><select value={newCaseForm.sitId} onChange={e => setNewCaseForm({ ...newCaseForm, sitId: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{GOV_SITS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Priority</label><select value={newCaseForm.priority} onChange={e => setNewCaseForm({ ...newCaseForm, priority: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div></div></div></Modal>)}
      {modal === 'addDocument' && (() => {
        const meeting = meetings.find(m => m.id === targetId);
        return (
          <Modal title={`Documents — ${meeting?.title || ''}`} onClose={() => setModal(null)} onSave={() => {
            if (pendingFile) { mtg.addDocument(targetId, { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type, uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Board' }); setPendingFile(null); }
            setModal(null);
          }} saveLabel={pendingFile ? 'Upload & Close' : 'Close'}>
            <div className="space-y-4">
              {(meeting?.documents || []).length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-ink-600 mb-2">Attached Documents</label>
                  <div className="space-y-1.5">{(meeting?.documents || []).map(d => (
                    <div key={d.id} className="flex items-center justify-between bg-mist-50 border border-mist-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2"><span className="text-sm">📄</span><span className="text-xs text-ink-800 font-medium">{d.name}</span><span className="text-[10px] text-ink-400">{d.size}</span></div>
                      <button onClick={() => mtg.removeDocument(targetId, d.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  ))}</div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-ink-600 mb-2">Upload New Document</label>
                <FileUpload onFileSelected={f => setPendingFile({ name: f.name, size: f.size, type: f.type })} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />
                {pendingFile && <p className="text-xs text-sage-600 mt-1.5">📎 Ready: {pendingFile.name} ({pendingFile.size})</p>}
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
