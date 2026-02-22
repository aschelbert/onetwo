import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore, type Meeting, type MeetingVote } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { refreshComplianceRequirements, type ComplianceCategory } from '@/lib/complianceRefresh';
import Modal from '@/components/ui/Modal';

const ROLE_COLORS: Record<string, string> = { President:'accent', 'Vice President':'mist', Treasurer:'sage', Secretary:'yellow', 'Member at Large':'purple' };
const COMM_TYPES: Record<string, string> = { notice:'bg-accent-100 text-accent-700', minutes:'bg-sage-100 text-sage-700', financial:'bg-yellow-100 text-yellow-700', response:'bg-mist-100 text-ink-600', resale:'bg-ink-100 text-ink-600', violation:'bg-red-100 text-red-700', other:'bg-ink-100 text-ink-500' };
const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

type ModalType = null | 'addFiling' | 'markFiled' | 'addComm' | 'addMeeting' | 'editMeeting' | 'attendees' | 'minutes' | 'addVote' | 'addFilingAtt';
type TabId = 'runbook' | 'filings' | 'meetings' | 'communications';

export default function CompliancePage() {
  const comp = useComplianceStore();
  const mtg = useMeetingsStore();
  const { board, address, legalDocuments, insurance, management } = useBuildingStore();
  const navigate = useNavigate();

  // ─── Dynamic compliance refresh based on jurisdiction + uploaded docs ───
  const refreshResult = refreshComplianceRequirements({
    state: address.state,
    legalDocuments: legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: board.length,
    hasManagement: !!management.company,
  });
  const categories = refreshResult.categories;

  const [tab, setTab] = useState<TabId>('runbook');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState<ModalType>(null);
  const [targetId, setTargetId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Meeting form states
  const [mForm, setMForm] = useState({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED' });
  const [attForm, setAttForm] = useState({ board: [] as string[], owners: '' as string, guests: '' as string });
  const [minText, setMinText] = useState('');
  const [vForm, setVForm] = useState({ motion: '', type: 'board' as 'board' | 'owner', votes: {} as Record<string, string> });
  const [expanded, setExpanded] = useState<string | null>(null);

  // ─── Compliance scores ───
  const catScores = categories.map(c => {
    const filtered = roleFilter === 'all' ? c.items : c.items.filter(i => i.role === roleFilter);
    const passed = filtered.filter(i => comp.completions[i.id]).length;
    const pct = filtered.length > 0 ? Math.round((passed / filtered.length) * 100) : 100;
    return { ...c, items: filtered, passed, total: filtered.length, pct };
  });
  const totalWeight = catScores.reduce((s, c) => s + c.weight, 0);
  const healthIndex = Math.round(catScores.reduce((s, c) => s + (c.pct * c.weight) / totalWeight, 0));
  const grade = healthIndex >= 90 ? 'A' : healthIndex >= 80 ? 'B' : healthIndex >= 70 ? 'C' : healthIndex >= 60 ? 'D' : 'F';
  const allRoles: string[] = [...new Set(categories.flatMap(c => c.items.map(i => i.role)))];

  // ─── Meeting stats ───
  const { meetings } = mtg;
  const boardCount = meetings.filter(m => m.type === 'BOARD' && m.date.startsWith('2026')).length;
  const annualCount = meetings.filter(m => m.type === 'ANNUAL' && (m.date.startsWith('2025-12') || m.date.startsWith('2026'))).length;
  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
  const isDC = address.state === 'District of Columbia';
  const jurisdiction = isDC ? 'DC' : address.state;
  const hasBylaws = legalDocuments.some(d => d.name.toLowerCase().includes('bylaw'));
  const hasCCRs = legalDocuments.some(d => d.name.toLowerCase().includes('cc&r') || d.name.toLowerCase().includes('declaration'));
  const hasMinutes = meetings.filter(m => m.status === 'COMPLETED' && m.minutes).length;
  const completedMeetings = meetings.filter(m => m.status === 'COMPLETED').length;
  const minutesRate = completedMeetings > 0 ? Math.round((hasMinutes / completedMeetings) * 100) : 100;
  const meetingReqs = [
    { label: 'Board Meetings', req: 4, actual: boardCount, freq: 'Quarterly minimum', legalRef: isDC ? 'DC Code § 29-1109.01' : `${jurisdiction} Condo Act`, source: hasBylaws ? 'Bylaws Art. III' : 'DC Code' },
    { label: 'Annual Meeting', req: 1, actual: annualCount, freq: 'Within 13 months of prior', legalRef: isDC ? 'DC Code § 29-1109.02' : `${jurisdiction} Condo Act`, source: hasBylaws ? 'Bylaws Art. III §2' : 'DC Code' },
    { label: 'Meeting Minutes', req: 100, actual: minutesRate, freq: 'All completed meetings', legalRef: isDC ? 'DC Code § 29-1108.06' : `${jurisdiction} Condo Act`, source: 'Required by law', isPct: true },
    { label: 'Meeting Notices', req: 1, actual: 1, freq: 'Annual: 10-60 days · Board: 48 hrs', legalRef: isDC ? 'DC Code § 29-1109.02(a)' : `${jurisdiction} Condo Act`, source: 'Required by law' },
  ];
  const mtgMet = meetingReqs.filter(r => (r as any).isPct ? r.actual >= r.req : r.actual >= r.req).length;
  const mtgScore = Math.round((mtgMet / meetingReqs.length) * 100);

  // Meeting helpers
  const openAddMeeting = () => { setMForm({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED' }); setModal('addMeeting'); };
  const openEditMeeting = (m: Meeting) => { setTargetId(m.id); setMForm({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda.join('\n'), notes: m.notes, status: m.status }); setModal('editMeeting'); };
  const openAttendees = (m: Meeting) => { setTargetId(m.id); setAttForm({ board: [...m.attendees.board], owners: m.attendees.owners.join('\n'), guests: m.attendees.guests.join('\n') }); setModal('attendees'); };
  const openMinutes = (m: Meeting) => { setTargetId(m.id); setMinText(m.minutes); setModal('minutes'); };
  const openAddVote = (m: Meeting) => { setTargetId(m.id); const voteMap: Record<string, string> = {}; board.forEach(b => { voteMap[b.name] = ''; }); setVForm({ motion: '', type: 'board', votes: voteMap }); setModal('addVote'); };
  const saveMeeting = () => { if (!mForm.title || !mForm.date) { alert('Title and date required'); return; } const agenda = mForm.agenda.split('\n').map(s => s.trim()).filter(Boolean); if (modal === 'addMeeting') mtg.addMeeting({ title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes }); else mtg.updateMeeting(targetId, { title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes }); setModal(null); };
  const saveAttendees = () => { mtg.updateAttendees(targetId, { board: attForm.board, owners: attForm.owners.split('\n').map(s => s.trim()).filter(Boolean), guests: attForm.guests.split('\n').map(s => s.trim()).filter(Boolean) }); setModal(null); };
  const saveVote = () => { if (!vForm.motion) { alert('Motion required'); return; } const results = Object.entries(vForm.votes).filter(([, v]) => v).map(([name, vote]) => ({ name, vote })); const tally = { approve: results.filter(r => r.vote === 'approve').length, deny: results.filter(r => r.vote === 'deny').length, abstain: results.filter(r => r.vote === 'abstain').length }; const status = tally.approve > tally.deny ? 'passed' : 'failed'; mtg.addVote(targetId, { motion: vForm.motion, type: vForm.type, status, date: meetings.find(m => m.id === targetId)?.date || '', results, tally }); setModal(null); };

  const renderMeeting = (m: Meeting, isUpcoming: boolean) => (
    <div key={m.id} className={`bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all ${isUpcoming ? 'border-2 border-accent-200' : 'border-ink-100'}`}>
      <div className="p-5 cursor-pointer" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-lg font-bold text-ink-900">{m.title}</h4>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[m.type] || 'bg-ink-100 text-ink-500'}`}>{m.type}</span>
              <svg className={`h-5 w-5 text-ink-400 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            <p className="text-sm text-ink-500">{new Date(m.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {m.time} · {m.location}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[m.status] || 'bg-ink-100 text-ink-500'}`}>{m.status}</span>
        </div>
      </div>
      {expanded === m.id && (
        <div className="border-t border-ink-100 p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openEditMeeting(m)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">Edit Meeting</button>
            <button onClick={() => openAttendees(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">Manage Attendees</button>
            <button onClick={() => openMinutes(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">{m.minutes ? 'Edit Minutes' : 'Add Minutes'}</button>
            <button onClick={() => openAddVote(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">+ Add Vote</button>
            <button onClick={() => { if (confirm('Delete this meeting?')) mtg.deleteMeeting(m.id); }} className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700">Delete</button>
          </div>
          {m.notes && <div className="bg-mist-50 rounded-lg p-3 text-sm text-ink-600">{m.notes}</div>}
          {m.agenda.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Agenda</p><div className="bg-mist-50 rounded-lg p-4 space-y-2">{m.agenda.map((item, i) => (<div key={i} className="flex items-start gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span><span className="text-ink-700">{item}</span></div>))}</div></div>)}
          {(m.attendees.board.length > 0 || m.attendees.owners.length > 0) && (<div><p className="font-bold text-ink-900 mb-2">Attendance ({m.attendees.board.length + m.attendees.owners.length + m.attendees.guests.length})</p><div className="bg-mist-50 rounded-lg p-3 space-y-2 text-sm">{m.attendees.board.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Board</span><p className="text-ink-700">{m.attendees.board.join(', ')}</p></div>}{m.attendees.owners.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Owners ({m.attendees.owners.length})</span><p className="text-ink-700">{m.attendees.owners.join(', ')}</p></div>}{m.attendees.guests.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Guests</span><p className="text-ink-700">{m.attendees.guests.join(', ')}</p></div>}</div></div>)}
          {m.minutes && (<div><p className="font-bold text-ink-900 mb-2">Meeting Minutes</p><div className="bg-mist-50 rounded-lg p-4 text-sm text-ink-700 whitespace-pre-wrap max-h-48 overflow-y-auto border border-mist-100">{m.minutes}</div></div>)}
          {m.votes.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Votes ({m.votes.length})</p>{m.votes.map(v => (<div key={v.id} className="bg-mist-50 border border-mist-200 rounded-lg p-3 mb-2"><div className="flex items-start justify-between gap-2 mb-2"><div><p className="text-sm font-medium text-ink-900">{v.motion}</p><p className="text-xs text-ink-400">{v.type === 'board' ? 'Board vote' : 'Owner vote'} · {v.date}</p></div><div className="flex items-center gap-2"><span className={`pill px-2 py-0.5 rounded ${v.status === 'passed' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{v.status.toUpperCase()}</span><button onClick={() => { if (confirm('Delete this vote?')) mtg.deleteVote(m.id, v.id); }} className="text-xs text-red-400 hover:text-red-600">×</button></div></div><div className="flex gap-3 text-sm"><span className="text-sage-600 font-semibold">{v.tally.approve} Approve</span><span className="text-red-600 font-semibold">{v.tally.deny} Deny</span><span className="text-ink-400">{v.tally.abstain} Abstain</span></div>{v.results.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{v.results.map((r, i) => (<span key={i} className={`text-xs px-2 py-0.5 rounded ${r.vote === 'approve' ? 'bg-sage-50 text-sage-700' : r.vote === 'deny' ? 'bg-red-50 text-red-700' : 'bg-ink-50 text-ink-500'}`}>{r.name}: {r.vote}</span>))}</div>}</div>))}</div>)}
        </div>
      )}
    </div>
  );

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'runbook', label: 'Compliance Runbook' },
    { id: 'filings', label: 'Filings & Deadlines', badge: comp.filings.filter(fi => fi.status === 'pending' && new Date(fi.dueDate) < new Date()).length || undefined },
    { id: 'meetings', label: 'Meetings', badge: upcoming.length || undefined },
    { id: 'communications', label: 'Communications', badge: comp.communications.filter(c => c.status === 'pending').length || undefined },
  ];

  return (
    <div className="space-y-0">
      {/* ══════ Dark gradient header ══════ */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">📋 Compliance & Governance</h2>
            <p className="text-accent-200 text-sm mt-1">Runbook, meetings, filings & communications · {isDC ? 'District of Columbia' : jurisdiction} jurisdiction</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">{grade}</div>
              <div className="text-accent-200 text-xs">Health {healthIndex}%</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">{mtgScore}%</div>
              <div className="text-accent-200 text-xs">Meeting Compliance</div>
            </div>
          </div>
        </div>
        {/* Mini KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          {catScores.map(c => {
            const pc = c.pct >= 80 ? 'sage' : c.pct >= 50 ? 'yellow' : 'red';
            return (<div key={c.id} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => { setTab('runbook'); setTimeout(() => document.getElementById('comp-' + c.id)?.scrollIntoView({ behavior: 'smooth' }), 100); }}>
              <span className="text-xl">{c.icon}</span>
              <p className="text-[11px] text-accent-100 mt-0.5 leading-tight">{c.label}</p>
              <p className="text-sm font-bold text-white mt-1">{c.pct}%</p>
            </div>);
          })}
        </div>
      </div>

      {/* ══════ Tab Nav ══════ */}
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

      {/* ══════ Tab Content ══════ */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {/* ─── RUNBOOK TAB ─── */}
        {tab === 'runbook' && (<div className="space-y-6">
          {/* Regulatory Refresh Banner */}
          {refreshResult.regulatoryNotes.length > 0 && (
            <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><span className="text-base">🔄</span><h4 className="text-xs font-bold text-accent-800">Compliance Auto-Refresh · {refreshResult.jurisdiction} Jurisdiction</h4></div>
              <div className="space-y-1">{refreshResult.regulatoryNotes.map((n, i) => <p key={i} className="text-xs text-accent-700">{n}</p>)}</div>
              {refreshResult.documentsDetected.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{refreshResult.documentsDetected.map(d => <span key={d} className="text-[10px] bg-accent-100 text-accent-700 px-2 py-0.5 rounded-lg font-medium">📄 {d}</span>)}</div>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRoleFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${roleFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>All Roles</button>
            {allRoles.map(r => (<button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${roleFilter === r ? 'px-3 py-1.5 bg-accent-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>{r}</button>))}
          </div>
          {catScores.filter(c => c.items.length > 0).map(cat => {
            const pc = cat.pct >= 80 ? 'sage' : cat.pct >= 50 ? 'yellow' : 'red';
            return (
              <div key={cat.id} id={`comp-${cat.id}`} className="bg-white rounded-xl border border-ink-100 overflow-hidden">
                <div className="p-5 border-b border-ink-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div><h3 className="font-bold text-ink-900">{cat.label}</h3><p className="text-xs text-ink-400">{cat.passed}/{cat.total} complete · Weight: {cat.weight}%</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-ink-100 rounded-full overflow-hidden"><div className={`h-full bg-${pc}-500 rounded-full`} style={{ width: `${cat.pct}%` }} /></div>
                    <span className={`text-lg font-bold text-${pc}-600`}>{cat.pct}%</span>
                  </div>
                </div>
                <div className="divide-y divide-ink-50">
                  {cat.items.map(item => {
                    const done = comp.completions[item.id];
                    const rc = ROLE_COLORS[item.role] || 'ink';
                    return (
                      <div key={item.id} className={`p-4 flex items-start gap-4 ${done ? 'bg-sage-50 bg-opacity-30' : ''}`}>
                        <button onClick={() => comp.toggleItem(item.id)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 ${done ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 hover:border-accent-400'}`}>{done ? '✓' : ''}</button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-medium ${done ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{item.task}</p>
                            {item.critical && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">CRITICAL</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${rc}-100 text-${rc}-700 font-semibold`}>{item.role}</span>
                          </div>
                          <p className="text-xs text-ink-400 mt-1">{item.tip}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-mono text-accent-600">{item.legalRef}</span>
                            <span className="text-[10px] text-ink-300">{item.freq} · Due: {item.due}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>)}

        {/* ─── FILINGS TAB ─── */}
        {tab === 'filings' && (<div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h3 className="font-display text-lg font-bold text-ink-900">📅 Regulatory Filings & Deadlines</h3><p className="text-xs text-ink-400">Tax returns, government reports, inspections, certifications</p></div>
            <button onClick={() => { setForm({ name: '', category: 'tax', dueDate: '', responsible: 'President', recurrence: 'annual', legalRef: '', notes: '' }); setModal('addFiling'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Add Filing</button>
          </div>
          <div className="bg-white rounded-xl border border-ink-100 overflow-hidden divide-y divide-ink-50">
            {comp.filings.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(fi => {
              const isPast = fi.status === 'pending' && new Date(fi.dueDate) < new Date();
              return (
                <div key={fi.id} className={`p-4 ${fi.status === 'filed' ? 'bg-sage-50 bg-opacity-50' : isPast ? 'bg-red-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${fi.status === 'filed' ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{fi.name}</p>
                        <span className={`pill px-1.5 py-0.5 rounded text-xs ${fi.status === 'filed' ? 'bg-sage-100 text-sage-700' : isPast ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{fi.status === 'filed' ? '✓ Filed' : isPast ? 'OVERDUE' : 'Pending'}</span>
                        <span className="text-xs text-ink-400">{fi.category} · {fi.recurrence}</span>
                      </div>
                      <p className="text-xs text-ink-500 mt-1">Due: {fi.dueDate} · {fi.responsible}{fi.filedDate ? ` · Filed: ${fi.filedDate}` : ''}{fi.confirmationNum ? ` · Ref: ${fi.confirmationNum}` : ''}</p>
                      {fi.notes && <p className="text-xs text-ink-400 mt-1">{fi.notes}</p>}
                      {fi.legalRef && <p className="text-xs text-ink-300 font-mono mt-0.5">{fi.legalRef}</p>}
                      {/* Attachments */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {fi.attachments.map(att => (
                          <span key={att.name} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1">
                            <span className="text-[11px] text-accent-600 font-medium">📎 {att.name}</span>
                            <span className="text-[10px] text-ink-400">{att.size}</span>
                            <button onClick={() => comp.removeFilingAttachment(fi.id, att.name)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                          </span>
                        ))}
                        <button onClick={() => { setTargetId(fi.id); setModal('addFilingAtt'); }} className="text-[11px] text-accent-600 font-medium hover:text-accent-700 border border-dashed border-accent-300 rounded-lg px-2.5 py-1 hover:bg-accent-50">+ Attach proof</button>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {fi.status === 'pending' && <button onClick={() => { setTargetId(fi.id); setForm({ filedDate: new Date().toISOString().split('T')[0], confirmationNum: '' }); setModal('markFiled'); }} className="px-3 py-1 bg-sage-600 text-white rounded text-xs font-medium hover:bg-sage-700">Mark Filed</button>}
                      <button onClick={() => { if (confirm('Remove?')) comp.deleteFiling(fi.id); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>)}

        {/* ─── MEETINGS TAB ─── */}
        {tab === 'meetings' && (<div className="space-y-6">
          {/* Compliance check */}
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-ink-900">Meeting Compliance — {jurisdiction}</h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Requirements from <span className="font-mono text-accent-700">{isDC ? 'DC Code § 29-1101 et seq.' : `${jurisdiction} Condo Act`}</span>
                  {hasBylaws && <>, cross-referenced with <span className="font-semibold">Condominium Bylaws</span></>}
                  {hasCCRs && <> and <span className="font-semibold">CC&Rs</span></>}
                  {!hasBylaws && <span className="text-amber-600 ml-1">· ⚠ Upload Bylaws to enable bylaw-specific checks</span>}
                </p>
              </div>
              <button onClick={openAddMeeting} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Schedule Meeting</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {meetingReqs.map(r => {
                const met = (r as any).isPct ? r.actual >= r.req : r.actual >= r.req;
                return (
                  <div key={r.label} className={`bg-white rounded-lg p-3 border ${met ? 'border-sage-200' : 'border-red-200'}`}>
                    <div className="flex justify-between items-center mb-1"><span className="font-bold text-ink-900 text-sm">{r.label}</span><span className={`text-lg ${met ? 'text-sage-600' : 'text-red-600'}`}>{met ? '✓' : '✗'}</span></div>
                    {(r as any).isPct ? (<p className="text-xs text-ink-500">Rate: <strong className={met ? 'text-sage-600' : 'text-red-600'}>{r.actual}%</strong></p>) : (<p className="text-xs text-ink-500">Required: <strong>{r.req}</strong> · Actual: <strong className={met ? 'text-sage-600' : 'text-red-600'}>{r.actual}</strong></p>)}
                    <p className="text-xs text-ink-400">{r.freq}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent-50 text-accent-600 font-medium">{r.legalRef}</span>
                      {r.source !== 'Required by law' && <span className="text-[9px] px-1 py-0.5 rounded bg-mist-100 text-ink-500">{r.source}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {upcoming.length > 0 && (<div><h3 className="font-display text-lg font-bold text-ink-900 mb-4">Upcoming Meetings</h3><div className="space-y-3">{upcoming.map(m => renderMeeting(m, true))}</div></div>)}
          {past.length > 0 && (<div><h3 className="font-display text-lg font-bold text-ink-900 mb-4">Past Meetings</h3><div className="space-y-3">{past.map(m => renderMeeting(m, false))}</div></div>)}
        </div>)}

        {/* ─── COMMUNICATIONS TAB ─── */}
        {tab === 'communications' && (<div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><h3 className="font-display text-lg font-bold text-ink-900">✉ Owner Communications Log</h3><p className="text-xs text-ink-400">Notices, minutes distribution, disclosure statements, resale certificates</p></div>
            <button onClick={() => { setForm({ type: 'notice', subject: '', date: new Date().toISOString().split('T')[0], method: 'email', recipients: 'All owners (50 units)', status: 'sent', notes: '' }); setModal('addComm'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">+ Log Communication</button>
          </div>
          <div className="bg-white rounded-xl border border-ink-100 overflow-hidden divide-y divide-ink-50">
            {comp.communications.sort((a, b) => b.date.localeCompare(a.date)).map(c => (
              <div key={c.id} className="p-4 hover:bg-mist-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`pill px-1.5 py-0.5 rounded text-xs ${COMM_TYPES[c.type] || COMM_TYPES.other}`}>{c.type}</span>
                      <p className="text-sm font-medium text-ink-900">{c.subject}</p>
                      <span className={`pill px-1.5 py-0.5 rounded text-xs ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : c.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-ink-100 text-ink-500'}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-ink-500">{c.date} · {c.method} · To: {c.recipients}{c.respondedBy ? ` · By: ${c.respondedBy}` : ''}</p>
                    {c.notes && <p className="text-xs text-ink-400 mt-1">{c.notes}</p>}
                  </div>
                  <button onClick={() => { if (confirm('Remove?')) comp.deleteCommunication(c.id); }} className="text-xs text-red-400 hover:text-red-600 shrink-0">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>)}
      </div>

      {/* ══════ MODALS ══════ */}
      {modal === 'addFiling' && (
        <Modal title="Add Regulatory Filing" onClose={() => setModal(null)} onSave={() => { if (!f('name') || !f('dueDate')) { alert('Name and due date required'); return; } comp.addFiling({ name: f('name'), category: f('category'), dueDate: f('dueDate'), responsible: f('responsible'), recurrence: f('recurrence'), legalRef: f('legalRef'), notes: f('notes') }); setModal(null); }}>
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Filing Name *</label><input value={f('name')} onChange={e => sf('name', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Annual Fire Safety Inspection" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Category</label><select value={f('category')} onChange={e => sf('category', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['tax','government','inspection','financial','governance','other'].map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Recurrence</label><select value={f('recurrence')} onChange={e => sf('recurrence', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['annual','biennial','quarterly','one-time'].map(r => <option key={r}>{r}</option>)}</select></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Due Date *</label><input type="date" value={f('dueDate')} onChange={e => sf('dueDate', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Responsible</label><select value={f('responsible')} onChange={e => sf('responsible', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['President','Vice President','Treasurer','Secretary','Member at Large'].map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={f('legalRef')} onChange={e => sf('legalRef', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="DC Code § 29-102.11" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
          </div>
        </Modal>
      )}
      {modal === 'markFiled' && (
        <Modal title="Mark as Filed" onClose={() => setModal(null)} onSave={() => { comp.markFilingComplete(targetId, f('filedDate'), f('confirmationNum')); setModal(null); }} saveLabel="Confirm Filed">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Date Filed</label><input type="date" value={f('filedDate')} onChange={e => sf('filedDate', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Confirmation / Reference #</label><input value={f('confirmationNum')} onChange={e => sf('confirmationNum', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Optional" /></div>
          </div>
        </Modal>
      )}
      {modal === 'addComm' && (
        <Modal title="Log Communication" onClose={() => setModal(null)} onSave={() => { if (!f('subject')) { alert('Subject required'); return; } comp.addCommunication({ type: f('type'), subject: f('subject'), date: f('date'), method: f('method'), recipients: f('recipients'), respondedBy: null, status: f('status') as any, notes: f('notes') }); setModal(null); }}>
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={f('type')} onChange={e => sf('type', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['notice','minutes','financial','response','resale','violation','other'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Subject *</label><input value={f('subject')} onChange={e => sf('subject', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Date</label><input type="date" value={f('date')} onChange={e => sf('date', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={f('method')} onChange={e => sf('method', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['email','mail','mail+email','email+portal','certified mail','posted'].map(m => <option key={m}>{m}</option>)}</select></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Recipients</label><input value={f('recipients')} onChange={e => sf('recipients', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={f('status')} onChange={e => sf('status', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['sent','pending','draft'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><textarea value={f('notes')} onChange={e => sf('notes', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
          </div>
        </Modal>
      )}
      {/* Meeting modals */}
      {(modal === 'addMeeting' || modal === 'editMeeting') && (
        <Modal title={modal === 'addMeeting' ? 'Schedule Meeting' : 'Edit Meeting'} onClose={() => setModal(null)} onSave={saveMeeting} saveLabel={modal === 'addMeeting' ? 'Schedule' : 'Save'}>
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={mForm.title} onChange={e => setMForm({ ...mForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="February Board Meeting" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={mForm.type} onChange={e => setMForm({ ...mForm, type: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['BOARD','ANNUAL','QUARTERLY','SPECIAL','EMERGENCY'].map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Status</label><select value={mForm.status} onChange={e => setMForm({ ...mForm, status: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{['SCHEDULED','COMPLETED','CANCELLED','RESCHEDULED'].map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Date *</label><input type="date" value={mForm.date} onChange={e => setMForm({ ...mForm, date: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Time</label><input type="time" value={mForm.time} onChange={e => setMForm({ ...mForm, time: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Location</label><input value={mForm.location} onChange={e => setMForm({ ...mForm, location: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Virtual Link</label><input value={mForm.virtualLink} onChange={e => setMForm({ ...mForm, virtualLink: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="https://zoom.us/..." /></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Agenda (one item per line)</label><textarea value={mForm.agenda} onChange={e => setMForm({ ...mForm, agenda: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={4} placeholder={"Review January financials\nElevator maintenance proposal"} /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><input value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}
      {modal === 'attendees' && (
        <Modal title="Manage Attendees" onClose={() => setModal(null)} onSave={saveAttendees}>
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-ink-700 mb-2">Board Members</label><div className="space-y-1">{board.map(b => (<label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attForm.board.includes(b.name)} onChange={e => { if (e.target.checked) setAttForm({ ...attForm, board: [...attForm.board, b.name] }); else setAttForm({ ...attForm, board: attForm.board.filter(n => n !== b.name) }); }} className="h-4 w-4" />{b.name} <span className="text-ink-400">({b.role})</span></label>))}</div></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Owners (one per line)</label><textarea value={attForm.owners} onChange={e => setAttForm({ ...attForm, owners: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Unit 201 — Karen Liu" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Guests (one per line)</label><textarea value={attForm.guests} onChange={e => setAttForm({ ...attForm, guests: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="PremierProperty — Diane Carter" /></div>
          </div>
        </Modal>
      )}
      {modal === 'minutes' && (
        <Modal title="Meeting Minutes" onClose={() => setModal(null)} onSave={() => { mtg.updateMinutes(targetId, minText); setModal(null); }} wide>
          <textarea value={minText} onChange={e => setMinText(e.target.value)} className="w-full px-4 py-3 border border-ink-200 rounded-lg text-sm font-mono" rows={12} placeholder={"Meeting called to order at 7:00 PM.\n\n1. ..."} />
        </Modal>
      )}
      {modal === 'addVote' && (
        <Modal title="Record Vote" onClose={() => setModal(null)} onSave={saveVote} saveLabel="Record Vote">
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Motion *</label><input value={vForm.motion} onChange={e => setVForm({ ...vForm, motion: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Approve 2026 maintenance budget" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Vote Type</label><select value={vForm.type} onChange={e => setVForm({ ...vForm, type: e.target.value as 'board' | 'owner' })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="board">Board Vote</option><option value="owner">Owner Vote</option></select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-2">Votes</label><div className="space-y-2">{Object.keys(vForm.votes).map(name => (<div key={name} className="flex items-center gap-3"><span className="text-sm text-ink-700 w-40">{name}</span>{['approve','deny','abstain'].map(v => (<label key={v} className="flex items-center gap-1 text-xs"><input type="radio" name={`vote-${name}`} checked={vForm.votes[name] === v} onChange={() => setVForm({ ...vForm, votes: { ...vForm.votes, [name]: v } })} className="h-3 w-3" /><span className={v === 'approve' ? 'text-sage-700' : v === 'deny' ? 'text-red-700' : 'text-ink-400'}>{v}</span></label>))}</div>))}</div></div>
          </div>
        </Modal>
      )}

      {/* Filing Attachment Modal */}
      {modal === 'addFilingAtt' && (
        <Modal title="Attach Proof of Filing" onClose={() => setModal(null)} onSave={() => {
          if (!f('attName')) return alert('Enter a file name.');
          comp.addFilingAttachment(targetId, { name: f('attName'), size: f('attSize') || 'N/A', uploadedAt: new Date().toISOString().split('T')[0] });
          setModal(null); setForm({});
        }} saveLabel="Attach">
          <div className="space-y-3">
            <p className="text-xs text-ink-500 bg-mist-50 rounded-lg p-3 border border-mist-100">Attach a document as proof of completion. In production, this uploads the file to secure storage.</p>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">File Name *</label><input value={f('attName')} onChange={e => sf('attName', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., tax-return-2025.pdf" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">File Size</label><input value={f('attSize')} onChange={e => sf('attSize', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 1.2 MB" /></div>
            <div className="bg-sand-100 border border-ink-100 rounded-lg p-3"><p className="text-xs text-ink-500"><strong>In production:</strong> A file picker would allow drag-and-drop upload to S3/GCS. The attachment would be stored with the filing record and downloadable by any board member.</p></div>
          </div>
        </Modal>
      )}

    </div>
  );
}

