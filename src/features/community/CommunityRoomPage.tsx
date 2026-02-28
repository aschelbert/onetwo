import { useState } from 'react';
import { useTabParam } from '@/hooks/useTabParam';
import { useMeetingsStore, type Meeting } from '@/store/useMeetingsStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import VotingPage from '@/features/elections/ElectionsPage';

type TabId = 'announcements' | 'requests' | 'meetings' | 'votes';

const ANN_CATS: Record<string, { icon: string; label: string; bg: string; text: string }> = {
  general: { icon: '📢', label: 'General', bg: 'bg-ink-100', text: 'text-ink-600' },
  maintenance: { icon: '🔧', label: 'Maintenance', bg: 'bg-amber-100', text: 'text-amber-700' },
  financial: { icon: '💰', label: 'Financial', bg: 'bg-sage-100', text: 'text-sage-700' },
  safety: { icon: '🔒', label: 'Safety', bg: 'bg-red-100', text: 'text-red-700' },
  rules: { icon: '📋', label: 'Rules & Policies', bg: 'bg-violet-100', text: 'text-violet-700' },
  meeting: { icon: '📅', label: 'Meeting', bg: 'bg-accent-100', text: 'text-accent-700' },
};

const REQ_CATS = [
  'Maintenance Request', 'Noise Complaint', 'Common Area Issue', 'Parking Issue',
  'Safety Concern', 'Resale Certificate Request', 'Records Inspection Request',
  'Architectural Modification Request', 'General Question', 'Other',
];

export default function CommunityRoomPage() {
  const [tab, setTab] = useTabParam<TabId>('tab', 'announcements', ['announcements', 'requests', 'meetings', 'votes']);
  const mtg = useMeetingsStore();
  const elections = useElectionStore();
  const user = useAuthStore(s => s.currentUser);
  const { board } = useBuildingStore();
  const comp = useComplianceStore();
  const issueStore = useIssuesStore();
  const { meetings } = mtg;

  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
  const openElections = elections.elections.filter(e => e.status === 'open').length;
  const announcements = [...(comp.announcements || [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.postedDate.localeCompare(a.postedDate);
  });

  // Request form state
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCat, setReqCat] = useState('Maintenance Request');
  const [reqPrio, setReqPrio] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');

  const handleSubmitRequest = () => {
    if (!reqTitle.trim()) return;
    issueStore.addIssue({
      type: 'BUILDING_PUBLIC', category: reqCat, priority: reqPrio, status: 'SUBMITTED',
      title: reqTitle, description: reqDesc,
      reportedBy: user.id, reporterName: user.name, reporterEmail: user.email,
      unitNumber: user.linkedUnits?.[0] || '', submittedDate: new Date().toISOString().split('T')[0]
    });
    setReqTitle(''); setReqDesc(''); setReqCat('Maintenance Request'); setReqPrio('MEDIUM'); setShowReqForm(false);
  };

  const myRequests = issueStore.issues.filter(i => i.reportedBy === user.id);
  const allRequests = issueStore.issues;

  const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
  const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'announcements', label: 'Announcements', badge: announcements.filter(a => a.pinned).length || undefined },
    { id: 'requests', label: 'Requests', badge: myRequests.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED').length || undefined },
    { id: 'meetings', label: 'Meetings', badge: upcoming.length || undefined },
    { id: 'votes', label: 'Votes & Resolutions', badge: openElections || undefined },
  ];

  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  const renderMeeting = (m: Meeting) => {
    const isExp = expandedMeeting === m.id;
    const approvalCount = m.minutesApprovals?.length || 0;
    const boardSize = board.length || 5;
    const majorityNeeded = Math.ceil(boardSize / 2);
    const minutesApproved = approvalCount >= majorityNeeded;
    return (
      <div key={m.id} className={`rounded-xl border transition-all ${isExp ? 'border-accent-300 shadow-sm' : 'border-ink-100 hover:border-accent-200 hover:shadow-sm'}`}>
        <div className="p-4 cursor-pointer" onClick={() => setExpandedMeeting(isExp ? null : m.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${TYPE_BADGE[m.type] || 'bg-ink-100 text-ink-600'}`}>{m.type}</span>
              <h4 className="text-sm font-semibold text-ink-900">{m.title}</h4>
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${STATUS_BADGE[m.status] || ''}`}>{m.status}</span>
              {m.status === 'COMPLETED' && (
                minutesApproved ? <span className="text-[10px] px-2 py-0.5 rounded bg-sage-100 text-sage-700 font-medium">✍️ Minutes approved</span>
                : approvalCount > 0 ? <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">✍️ {approvalCount}/{majorityNeeded} approvals</span>
                : <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-600 font-medium">⚠ No minutes</span>
              )}
            </div>
            <svg className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''} text-ink-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
            <span>📅 {m.date}</span><span>🕐 {m.time}</span><span>📍 {m.location}</span>{m.virtualLink && <span>🔗 Virtual</span>}
          </div>
        </div>
        {isExp && (
          <div className="px-4 pb-4 space-y-3 border-t border-ink-50 pt-3">
            {m.agenda.length > 0 && (<div><p className="text-xs font-bold text-ink-700 mb-1.5">📋 Agenda</p><ol className="space-y-1 ml-4">{m.agenda.map((a, i) => <li key={i} className="text-xs text-ink-600 list-decimal">{a}</li>)}</ol></div>)}
            {m.notes && (<div><p className="text-xs font-bold text-ink-700 mb-1.5">📝 Minutes</p><div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-700 whitespace-pre-wrap">{m.notes}</div></div>)}
            {(m.documents || []).length > 0 && (<div><p className="text-xs font-bold text-ink-700 mb-1.5">📎 Documents</p><div className="flex flex-wrap gap-2">{m.documents.map(d => <span key={d.id} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1.5"><span className="text-[11px] text-accent-600 font-medium">📄 {d.name}</span><span className="text-[10px] text-ink-400">{d.size}</span></span>)}</div></div>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">🏠 Community Room</h2>
            <p className="text-accent-200 text-sm mt-1">Announcements, requests, meetings & vote results</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { val: announcements.filter(a => a.pinned).length, label: 'Pinned Updates', icon: '📌', tab: 'announcements' as TabId },
            { val: myRequests.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED').length, label: 'My Open Requests', icon: '📬', tab: 'requests' as TabId },
            { val: upcoming.length, label: 'Upcoming Meetings', icon: '📅', tab: 'meetings' as TabId },
            { val: openElections, label: 'Open Votes', icon: '🗳', tab: 'votes' as TabId },
          ].map(s => (
            <div key={s.label} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setTab(s.tab)}>
              <span className="text-xl">{s.icon}</span>
              <p className="text-[11px] text-accent-100 mt-0.5 leading-tight">{s.label}</p>
              <p className="text-sm font-bold text-white mt-1">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${tab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {t.label}
              {t.badge ? <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {/* ═══ ANNOUNCEMENTS ═══ */}
        {tab === 'announcements' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900">📢 Announcements</h3>
              <p className="text-xs text-ink-400 mt-1">Updates from the board and management</p>
            </div>
            {announcements.length === 0 && <p className="text-center text-ink-400 py-8">No announcements yet.</p>}
            <div className="space-y-3">
              {announcements.map(a => {
                const cat = ANN_CATS[a.category] || ANN_CATS.general;
                return (
                  <div key={a.id} className={`rounded-xl border p-5 ${a.pinned ? 'border-accent-300 bg-accent-50 bg-opacity-30' : 'border-ink-100 bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 font-bold">📌 PINNED</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cat.bg} ${cat.text}`}>{cat.label}</span>
                          <h4 className="text-sm font-bold text-ink-900">{a.title}</h4>
                        </div>
                        <p className="text-xs text-ink-600 mt-2 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                        <div className="flex items-center gap-3 mt-3 text-[10px] text-ink-400">
                          <span>Posted by {a.postedBy}</span><span>·</span><span>{a.postedDate}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ REQUESTS ═══ */}
        {tab === 'requests' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-ink-900">📬 Requests</h3>
                <p className="text-xs text-ink-400 mt-1">Maintenance, information requests, resale certificates, complaints & more</p>
              </div>
              <button onClick={() => setShowReqForm(!showReqForm)} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
                {showReqForm ? 'Cancel' : '+ New Request'}
              </button>
            </div>

            {showReqForm && (
              <div className="bg-mist-50 rounded-xl border border-mist-200 p-5 space-y-3">
                <p className="text-xs font-bold text-ink-700">Submit a Request</p>
                <select value={reqCat} onChange={e => setReqCat(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  {REQ_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                <input value={reqTitle} onChange={e => setReqTitle(e.target.value)} placeholder="Brief summary of your request" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
                <textarea value={reqDesc} onChange={e => setReqDesc(e.target.value)} placeholder="Provide details — what, where, when, any relevant unit number..." rows={4} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
                <div className="flex items-center gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Priority</label>
                    <select value={reqPrio} onChange={e => setReqPrio(e.target.value as any)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-0.5">
                      <option value="HIGH">High — Urgent issue</option>
                      <option value="MEDIUM">Medium — Normal request</option>
                      <option value="LOW">Low — When convenient</option>
                    </select>
                  </div>
                  <button onClick={handleSubmitRequest} className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 mt-4">Submit Request</button>
                </div>
                <p className="text-[10px] text-ink-400">Requests are sent to the board and/or property management. Response required within 14 days per DC Code § 42-1903.14(c).</p>
              </div>
            )}

            {myRequests.length > 0 && (() => {
              const getSLA = (submitted: string) => {
                const sub = new Date(submitted + 'T12:00');
                const due = new Date(sub); due.setDate(due.getDate() + 14);
                const now = new Date();
                const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return { due: due.toISOString().split('T')[0], daysLeft, overdue: daysLeft < 0 };
              };
              return (
              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">My Requests ({myRequests.length})</p>
                <div className="space-y-2">
                  {myRequests.map(r => {
                    const sla = getSLA(r.submittedDate);
                    const isOpen = r.status === 'SUBMITTED' || r.status === 'IN_PROGRESS';
                    const isExp = expandedReq === r.id;
                    return (
                    <div key={r.id} className={`rounded-xl border transition-all ${isExp ? 'border-accent-300 shadow-sm' : 'border-ink-100 hover:border-accent-200'}`}>
                      <div className="p-4 cursor-pointer" onClick={() => setExpandedReq(isExp ? null : r.id)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' : r.status === 'IN_PROGRESS' ? 'bg-accent-100 text-accent-700' : r.status === 'RESOLVED' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{r.status.replace('_', ' ')}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-medium">{r.category}</span>
                              {isOpen && (sla.overdue
                                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">⚠ OVERDUE — response was due {sla.due}</span>
                                : sla.daysLeft <= 3
                                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">⏰ {sla.daysLeft} day{sla.daysLeft !== 1 ? 's' : ''} left</span>
                                  : <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-500">Response due by {sla.due}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-ink-900 mt-1">{r.title}</p>
                            <p className="text-[10px] text-ink-300 mt-1">Submitted {r.submittedDate} · {r.id}</p>
                          </div>
                          <svg className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''} text-ink-300 shrink-0 mt-1`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </div>
                      {isExp && (
                        <div className="px-4 pb-4 border-t border-ink-50 pt-3 space-y-3">
                          {r.description && <p className="text-xs text-ink-600">{r.description}</p>}
                          {/* Comment thread */}
                          {(r.comments || []).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Responses</p>
                              {r.comments.map((c: any) => (
                                <div key={c.id} className="bg-mist-50 rounded-lg p-3 border border-mist-200">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-ink-700">{c.author}</span>
                                    <span className="text-[10px] text-ink-400">{c.date}</span>
                                  </div>
                                  <p className="text-xs text-ink-600">{c.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {(r.comments || []).length === 0 && isOpen && (
                            <p className="text-xs text-ink-400 italic">No response yet. The board is required to respond within 14 days.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ); })}
                </div>
              </div>
            ); })()}

            {allRequests.filter(r => r.reportedBy !== user.id).length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Community Requests ({allRequests.filter(r => r.reportedBy !== user.id).length})</p>
                <p className="text-[10px] text-ink-400 mb-3">Upvote requests you'd also like addressed</p>
                <div className="space-y-2">
                  {allRequests.filter(r => r.reportedBy !== user.id).map(r => (
                    <div key={r.id} className="rounded-xl border border-ink-100 p-4 hover:border-accent-200 transition-colors">
                      <div className="flex items-start gap-3">
                        <button onClick={() => issueStore.upvoteIssue(r.id, user.id, user.name, user.linkedUnits?.[0] || '')} className="flex flex-col items-center shrink-0 mt-1">
                          <span className={`text-base ${r.upvotes.find((u: any) => u.userId === user.id) ? 'text-accent-500' : 'text-ink-300'}`}>▲</span>
                          <span className="text-[10px] font-bold text-ink-500">{r.upvotes.length}</span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' : r.status === 'IN_PROGRESS' ? 'bg-accent-100 text-accent-700' : r.status === 'RESOLVED' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{r.status.replace('_', ' ')}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-medium">{r.category}</span>
                          </div>
                          <p className="text-sm font-semibold text-ink-900 mt-1">{r.title}</p>
                          {r.description && <p className="text-xs text-ink-400 mt-0.5 line-clamp-2">{r.description}</p>}
                          <p className="text-[10px] text-ink-300 mt-1.5">Reported by {r.reporterName} · {r.submittedDate}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allRequests.length === 0 && !showReqForm && (
              <div className="text-center py-8">
                <p className="text-ink-400">No requests yet.</p>
                <button onClick={() => setShowReqForm(true)} className="mt-2 text-accent-600 text-sm font-medium hover:underline">Submit your first request →</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ MEETINGS ═══ */}
        {tab === 'meetings' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900">📅 Meetings</h3>
              <p className="text-xs text-ink-400 mt-1">{upcoming.length} upcoming · {past.length} completed · View agendas, minutes, and documents</p>
            </div>
            {upcoming.length > 0 && (<div><p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Upcoming</p><div className="space-y-2">{upcoming.map(m => renderMeeting(m))}</div></div>)}
            {past.length > 0 && (<div><p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Past Meetings</p><div className="space-y-2">{past.map(m => renderMeeting(m))}</div></div>)}
            {meetings.length === 0 && <p className="text-center text-ink-400 py-8">No meetings scheduled yet.</p>}
          </div>
        )}

        {/* ═══ VOTES & RESOLUTIONS ═══ */}
        {tab === 'votes' && <VotingPage />}

      </div>
    </div>
  );
}
