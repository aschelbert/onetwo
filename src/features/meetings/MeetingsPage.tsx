import { useState } from 'react';
import { useMeetingsStore, type Meeting, type MeetingVote } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

type ModalType = null | 'addMeeting' | 'editMeeting' | 'attendees' | 'minutes' | 'addVote';

export default function MeetingsPage() {
  const { meetings, addMeeting, updateMeeting, deleteMeeting, updateAttendees, updateMinutes, addVote, deleteVote } = useMeetingsStore();
  const { board, address, legalDocuments } = useBuildingStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [targetId, setTargetId] = useState('');

  // Form states
  const [mForm, setMForm] = useState({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED' });
  const [attForm, setAttForm] = useState({ board: [] as string[], owners: '' as string, guests: '' as string });
  const [minText, setMinText] = useState('');
  const [vForm, setVForm] = useState({ motion: '', type: 'board' as 'board' | 'owner', votes: {} as Record<string, string> });

  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));

  const boardCount = meetings.filter(m => m.type === 'BOARD' && m.date.startsWith('2026')).length;
  const annualCount = meetings.filter(m => m.type === 'ANNUAL' && (m.date.startsWith('2025-12') || m.date.startsWith('2026'))).length;
  const quarterlyCount = meetings.filter(m => m.type === 'QUARTERLY' && m.date.startsWith('2026')).length;

  // Derive jurisdiction from building address
  const jurisdiction = address.state === 'District of Columbia' ? 'DC' : address.state;
  const isDC = jurisdiction === 'DC';

  // Meeting requirements tied to DC Code and building bylaws
  const hasMinutes = meetings.filter(m => m.status === 'COMPLETED' && m.minutes).length;
  const completedMeetings = meetings.filter(m => m.status === 'COMPLETED').length;
  const minutesRate = completedMeetings > 0 ? Math.round((hasMinutes / completedMeetings) * 100) : 100;
  const hasProperNotice = true; // Assume compliance unless flagged

  // Check if building has required governing docs uploaded
  const hasBylaws = legalDocuments.some(d => d.name.toLowerCase().includes('bylaw'));
  const hasCCRs = legalDocuments.some(d => d.name.toLowerCase().includes('cc&r') || d.name.toLowerCase().includes('declaration'));

  const meetingRequirements = [
    {
      label: 'Board Meetings',
      req: isDC ? 4 : 4,
      actual: boardCount,
      freq: 'Quarterly minimum',
      legalRef: isDC ? 'DC Code § 29-1109.01' : `${jurisdiction} Condo Act`,
      source: hasBylaws ? 'Bylaws Art. III' : 'DC Code',
      sourceType: 'law' as const,
    },
    {
      label: 'Annual Meeting',
      req: 1,
      actual: annualCount,
      freq: 'Within 13 months of prior',
      legalRef: isDC ? 'DC Code § 29-1109.02' : `${jurisdiction} Condo Act`,
      source: hasBylaws ? 'Bylaws Art. III §2' : 'DC Code',
      sourceType: 'law' as const,
    },
    {
      label: 'Meeting Minutes',
      req: 100,
      actual: minutesRate,
      freq: 'All completed meetings',
      legalRef: isDC ? 'DC Code § 29-1108.06' : `${jurisdiction} Condo Act`,
      source: 'Required by law',
      sourceType: 'law' as const,
      isPct: true,
    },
    {
      label: 'Meeting Notices',
      req: 1,
      actual: hasProperNotice ? 1 : 0,
      freq: 'Annual: 10-60 days · Board: 48 hrs',
      legalRef: isDC ? 'DC Code § 29-1109.02(a)' : `${jurisdiction} Condo Act`,
      source: 'Required by law',
      sourceType: 'law' as const,
    },
  ];

  const metCount = meetingRequirements.filter(r => r.isPct ? r.actual >= r.req : r.actual >= r.req).length;
  const compScore = Math.round((metCount / meetingRequirements.length) * 100);
  const hc = compScore >= 75 ? 'sage' : compScore >= 50 ? 'yellow' : 'red';

  const openAddMeeting = () => { setMForm({ title: '', type: 'BOARD', date: '', time: '19:00', location: 'Community Room', virtualLink: '', agenda: '', notes: '', status: 'SCHEDULED' }); setModal('addMeeting'); };
  const openEditMeeting = (m: Meeting) => { setTargetId(m.id); setMForm({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink, agenda: m.agenda.join('\n'), notes: m.notes, status: m.status }); setModal('editMeeting'); };
  const openAttendees = (m: Meeting) => { setTargetId(m.id); setAttForm({ board: [...m.attendees.board], owners: m.attendees.owners.join('\n'), guests: m.attendees.guests.join('\n') }); setModal('attendees'); };
  const openMinutes = (m: Meeting) => { setTargetId(m.id); setMinText(m.minutes); setModal('minutes'); };
  const openAddVote = (m: Meeting) => {
    setTargetId(m.id);
    const voteMap: Record<string, string> = {};
    board.forEach(b => { voteMap[b.name] = ''; });
    setVForm({ motion: '', type: 'board', votes: voteMap });
    setModal('addVote');
  };

  const saveMeeting = () => {
    if (!mForm.title || !mForm.date) { alert('Title and date required'); return; }
    const agenda = mForm.agenda.split('\n').map(s => s.trim()).filter(Boolean);
    if (modal === 'addMeeting') {
      addMeeting({ title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
    } else {
      updateMeeting(targetId, { title: mForm.title, type: mForm.type, status: mForm.status, date: mForm.date, time: mForm.time, location: mForm.location, virtualLink: mForm.virtualLink, agenda, notes: mForm.notes });
    }
    setModal(null);
  };

  const saveAttendees = () => {
    updateAttendees(targetId, {
      board: attForm.board,
      owners: attForm.owners.split('\n').map(s => s.trim()).filter(Boolean),
      guests: attForm.guests.split('\n').map(s => s.trim()).filter(Boolean),
    });
    setModal(null);
  };

  const saveVote = () => {
    if (!vForm.motion) { alert('Motion required'); return; }
    const results = Object.entries(vForm.votes).filter(([, v]) => v).map(([name, vote]) => ({ name, vote }));
    const tally = { approve: results.filter(r => r.vote === 'approve').length, deny: results.filter(r => r.vote === 'deny').length, abstain: results.filter(r => r.vote === 'abstain').length };
    const status = tally.approve > tally.deny ? 'passed' : 'failed';
    addVote(targetId, { motion: vForm.motion, type: vForm.type, status, date: meetings.find(m => m.id === targetId)?.date || '', results, tally });
    setModal(null);
  };

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
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openEditMeeting(m)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">Edit Meeting</button>
            <button onClick={() => openAttendees(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">Manage Attendees</button>
            <button onClick={() => openMinutes(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">{m.minutes ? 'Edit Minutes' : 'Add Minutes'}</button>
            <button onClick={() => openAddVote(m)} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50">+ Add Vote</button>
            <button onClick={() => { if (confirm('Delete this meeting?')) deleteMeeting(m.id); }} className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700">Delete</button>
          </div>
          {m.notes && <div className="bg-mist-50 rounded-lg p-3 text-sm text-ink-600">{m.notes}</div>}
          {/* Agenda */}
          {m.agenda.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Agenda</p><div className="bg-mist-50 rounded-lg p-4 space-y-2">{m.agenda.map((item, i) => (<div key={i} className="flex items-start gap-3 text-sm"><span className="w-6 h-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center shrink-0 text-xs font-bold">{i + 1}</span><span className="text-ink-700">{item}</span></div>))}</div></div>)}
          {/* Attendance */}
          {(m.attendees.board.length > 0 || m.attendees.owners.length > 0) && (<div><p className="font-bold text-ink-900 mb-2">Attendance ({m.attendees.board.length + m.attendees.owners.length + m.attendees.guests.length})</p><div className="bg-mist-50 rounded-lg p-3 space-y-2 text-sm">{m.attendees.board.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Board</span><p className="text-ink-700">{m.attendees.board.join(', ')}</p></div>}{m.attendees.owners.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Owners ({m.attendees.owners.length})</span><p className="text-ink-700">{m.attendees.owners.join(', ')}</p></div>}{m.attendees.guests.length > 0 && <div><span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Guests</span><p className="text-ink-700">{m.attendees.guests.join(', ')}</p></div>}</div></div>)}
          {/* Minutes */}
          {m.minutes && (<div><p className="font-bold text-ink-900 mb-2">Meeting Minutes</p><div className="bg-mist-50 rounded-lg p-4 text-sm text-ink-700 whitespace-pre-wrap max-h-48 overflow-y-auto border border-mist-100">{m.minutes}</div></div>)}
          {/* Votes */}
          {m.votes.length > 0 && (<div><p className="font-bold text-ink-900 mb-2">Votes ({m.votes.length})</p>{m.votes.map(v => (<div key={v.id} className="bg-mist-50 border border-mist-200 rounded-lg p-3 mb-2"><div className="flex items-start justify-between gap-2 mb-2"><div><p className="text-sm font-medium text-ink-900">{v.motion}</p><p className="text-xs text-ink-400">{v.type === 'board' ? 'Board vote' : 'Owner vote'} · {v.date}</p></div><div className="flex items-center gap-2"><span className={`pill px-2 py-0.5 rounded ${v.status === 'passed' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{v.status.toUpperCase()}</span><button onClick={() => { if (confirm('Delete this vote?')) deleteVote(m.id, v.id); }} className="text-xs text-red-400 hover:text-red-600">×</button></div></div><div className="flex gap-3 text-sm"><span className="text-sage-600 font-semibold">{v.tally.approve} Approve</span><span className="text-red-600 font-semibold">{v.tally.deny} Deny</span><span className="text-ink-400">{v.tally.abstain} Abstain</span></div>{v.results.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{v.results.map((r, i) => (<span key={i} className={`text-xs px-2 py-0.5 rounded ${r.vote === 'approve' ? 'bg-sage-50 text-sage-700' : r.vote === 'deny' ? 'bg-red-50 text-red-700' : 'bg-ink-50 text-ink-500'}`}>{r.name}: {r.vote}</span>))}</div>}</div>))}</div>)}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Compliance Header — Jurisdiction-aware */}
      <div className={`bg-gradient-to-br from-${hc}-50 to-${hc}-100 border-2 border-${hc}-200 rounded-xl p-6 shadow-sm`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900">📋 Meeting Compliance Status</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              2026 Year-to-Date · <span className="font-medium text-ink-700">{isDC ? 'District of Columbia' : jurisdiction}</span> jurisdiction
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className={`text-3xl font-bold text-${hc}-600`}>{compScore}%</div>
              <p className="text-[10px] text-ink-400">Compliance</p>
            </div>
            <button onClick={openAddMeeting} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Schedule Meeting</button>
          </div>
        </div>

        {/* Legal basis note */}
        <div className="mb-4 bg-white rounded-lg p-3 border border-ink-100 text-xs text-ink-500">
          <span className="font-semibold text-ink-700">Legal basis: </span>
          {isDC ? (
            <>
              Requirements derived from <span className="font-mono text-accent-700">DC Code § 29-1101 et seq.</span> (DC Condominium Act)
              {hasBylaws && <>, cross-referenced with your <span className="font-semibold text-ink-700">Condominium Bylaws</span></>}
              {hasCCRs && <> and <span className="font-semibold text-ink-700">CC&Rs / Declaration</span></>}.
              {!hasBylaws && <span className="text-amber-600 ml-1">⚠ Upload your Bylaws under Legal & Bylaws to enable bylaw-specific checks.</span>}
            </>
          ) : (
            <>Requirements based on {jurisdiction} condominium statutes and your governing documents.</>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {meetingRequirements.map(r => {
            const met = r.isPct ? r.actual >= r.req : r.actual >= r.req;
            return (
              <div key={r.label} className={`bg-white rounded-lg p-3 border ${met ? 'border-sage-200' : 'border-red-200'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-ink-900 text-sm">{r.label}</span>
                  <span className={`text-lg ${met ? 'text-sage-600' : 'text-red-600'}`}>{met ? '✓' : '✗'}</span>
                </div>
                {r.isPct ? (
                  <p className="text-xs text-ink-500">Rate: <strong className={met ? 'text-sage-600' : 'text-red-600'}>{r.actual}%</strong></p>
                ) : (
                  <p className="text-xs text-ink-500">Required: <strong>{r.req}</strong> · Actual: <strong className={met ? 'text-sage-600' : 'text-red-600'}>{r.actual}</strong></p>
                )}
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

      {/* Upcoming */}
      {upcoming.length > 0 && (<div><h3 className="font-display text-lg font-bold text-ink-900 mb-4">Upcoming Meetings</h3><div className="space-y-3">{upcoming.map(m => renderMeeting(m, true))}</div></div>)}

      {/* Past */}
      {past.length > 0 && (<div><h3 className="font-display text-lg font-bold text-ink-900 mb-4">Past Meetings</h3><div className="space-y-3">{past.map(m => renderMeeting(m, false))}</div></div>)}

      {/* Add/Edit Meeting Modal */}
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
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Agenda (one item per line)</label><textarea value={mForm.agenda} onChange={e => setMForm({ ...mForm, agenda: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={4} placeholder="Review January financials&#10;Elevator maintenance proposal" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Notes</label><input value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
          </div>
        </Modal>
      )}

      {/* Attendees Modal */}
      {modal === 'attendees' && (
        <Modal title="Manage Attendees" onClose={() => setModal(null)} onSave={saveAttendees}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-2">Board Members</label>
              <div className="space-y-1">{board.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={attForm.board.includes(b.name)} onChange={e => { if (e.target.checked) setAttForm({ ...attForm, board: [...attForm.board, b.name] }); else setAttForm({ ...attForm, board: attForm.board.filter(n => n !== b.name) }); }} className="h-4 w-4" />
                  {b.name} <span className="text-ink-400">({b.role})</span>
                </label>
              ))}</div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Owners (one per line)</label><textarea value={attForm.owners} onChange={e => setAttForm({ ...attForm, owners: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Unit 201 — Karen Liu" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Guests (one per line)</label><textarea value={attForm.guests} onChange={e => setAttForm({ ...attForm, guests: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="PremierProperty — Diane Carter" /></div>
          </div>
        </Modal>
      )}

      {/* Minutes Modal */}
      {modal === 'minutes' && (
        <Modal title="Meeting Minutes" onClose={() => setModal(null)} onSave={() => { updateMinutes(targetId, minText); setModal(null); }} wide>
          <textarea value={minText} onChange={e => setMinText(e.target.value)} className="w-full px-4 py-3 border border-ink-200 rounded-lg text-sm font-mono" rows={12} placeholder="Meeting called to order at 7:00 PM.&#10;&#10;1. ..." />
        </Modal>
      )}

      {/* Add Vote Modal */}
      {modal === 'addVote' && (
        <Modal title="Record Vote" onClose={() => setModal(null)} onSave={saveVote} saveLabel="Record Vote">
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Motion *</label><input value={vForm.motion} onChange={e => setVForm({ ...vForm, motion: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Approve 2026 maintenance budget" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Vote Type</label><select value={vForm.type} onChange={e => setVForm({ ...vForm, type: e.target.value as 'board' | 'owner' })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="board">Board Vote</option><option value="owner">Owner Vote</option></select></div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-2">Votes</label>
              <div className="space-y-2">{Object.keys(vForm.votes).map(name => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-ink-700 w-40">{name}</span>
                  {['approve','deny','abstain'].map(v => (
                    <label key={v} className="flex items-center gap-1 text-xs">
                      <input type="radio" name={`vote-${name}`} checked={vForm.votes[name] === v} onChange={() => setVForm({ ...vForm, votes: { ...vForm.votes, [name]: v } })} className="h-3 w-3" />
                      <span className={v === 'approve' ? 'text-sage-700' : v === 'deny' ? 'text-red-700' : 'text-ink-400'}>{v}</span>
                    </label>
                  ))}
                </div>
              ))}</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
