import { useState } from 'react';
import { useMeetingsStore, type Meeting } from '@/store/useMeetingsStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import IssuesPage from '@/features/issues/IssuesPage';
import VotingPage from '@/features/elections/ElectionsPage';

type TabId = 'meetings' | 'votes' | 'issues';

export default function CommunityRoomPage() {
  const [tab, setTab] = useState<TabId>('meetings');
  const mtg = useMeetingsStore();
  const elections = useElectionStore();
  const user = useAuthStore(s => s.currentUser);
  const { board } = useBuildingStore();
  const { meetings } = mtg;

  const upcoming = meetings.filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED').sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter(m => m.status === 'COMPLETED').sort((a, b) => b.date.localeCompare(a.date));
  const openElections = elections.elections.filter(e => e.status === 'open').length;
  const certifiedCount = elections.elections.filter(e => e.status === 'certified').length;

  const TYPE_BADGE: Record<string, string> = { BOARD:'bg-accent-100 text-accent-700', ANNUAL:'bg-sage-100 text-sage-700', QUARTERLY:'bg-mist-100 text-ink-600', SPECIAL:'bg-yellow-100 text-yellow-700', EMERGENCY:'bg-red-100 text-red-700' };
  const STATUS_BADGE: Record<string, string> = { SCHEDULED:'bg-accent-100 text-accent-700', COMPLETED:'bg-sage-100 text-sage-700', CANCELLED:'bg-red-100 text-red-700', RESCHEDULED:'bg-yellow-100 text-yellow-700' };

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'meetings', label: 'Meetings', badge: upcoming.length || undefined },
    { id: 'votes', label: 'Votes & Resolutions', badge: openElections || undefined },
    { id: 'issues', label: 'Report Issues' },
  ];

  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

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
                minutesApproved
                  ? <span className="text-[10px] px-2 py-0.5 rounded bg-sage-100 text-sage-700 font-medium">✍️ Minutes approved</span>
                  : approvalCount > 0
                    ? <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">✍️ {approvalCount}/{majorityNeeded} approvals</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-600 font-medium">⚠ No minutes</span>
              )}
            </div>
            <svg className={`w-4 h-4 transition-transform ${isExp ? 'rotate-180' : ''} text-ink-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400">
            <span>📅 {m.date}</span>
            <span>🕐 {m.time}</span>
            <span>📍 {m.location}</span>
            {m.virtualLink && <span>🔗 Virtual</span>}
          </div>
        </div>

        {isExp && (
          <div className="px-4 pb-4 space-y-3 border-t border-ink-50 pt-3">
            {/* Agenda */}
            {m.agenda.length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-700 mb-1.5">📋 Agenda</p>
                <ol className="space-y-1 ml-4">{m.agenda.map((a, i) => (
                  <li key={i} className="text-xs text-ink-600 list-decimal">{a}</li>
                ))}</ol>
              </div>
            )}

            {/* Minutes */}
            {m.notes && (
              <div>
                <p className="text-xs font-bold text-ink-700 mb-1.5">📝 Minutes</p>
                <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-700 whitespace-pre-wrap">{m.notes}</div>
              </div>
            )}

            {/* Documents */}
            {(m.documents || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-700 mb-1.5">📎 Documents</p>
                <div className="flex flex-wrap gap-2">
                  {m.documents.map(d => (
                    <span key={d.id} className="inline-flex items-center gap-1.5 bg-mist-50 border border-mist-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] text-accent-600 font-medium">📄 {d.name}</span>
                      <span className="text-[10px] text-ink-400">{d.size}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Votes */}
            {(m.linkedVoteIds || []).length > 0 && (() => {
              const linkedVotes = elections.elections.filter(e => (m.linkedVoteIds || []).includes(e.id));
              return linkedVotes.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-ink-700 mb-1.5">🗳 Linked Votes</p>
                  <div className="space-y-1.5">{linkedVotes.map(v => (
                    <div key={v.id} className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center justify-between">
                      <div><p className="text-xs font-medium text-green-900">{v.title}</p><p className="text-[10px] text-green-600">{v.status} · {v.ballotItems.length} items</p></div>
                      <button onClick={() => setTab('votes')} className="text-[10px] text-accent-600 hover:underline">View →</button>
                    </div>
                  ))}</div>
                </div>
              ) : null;
            })()}
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
            <p className="text-accent-200 text-sm mt-1">Meetings, vote results & issue reporting</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { val: upcoming.length, label: 'Upcoming Meetings', icon: '📅', tab: 'meetings' as TabId },
            { val: past.length, label: 'Past Meetings', icon: '📋', tab: 'meetings' as TabId },
            { val: openElections, label: 'Open Votes', icon: '🗳', tab: 'votes' as TabId },
            { val: certifiedCount, label: 'Certified Results', icon: '✅', tab: 'votes' as TabId },
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

        {/* ═══ MEETINGS ═══ */}
        {tab === 'meetings' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900">📅 Meetings</h3>
              <p className="text-xs text-ink-400 mt-1">{upcoming.length} upcoming · {past.length} completed · View agendas, minutes, and documents</p>
            </div>

            {upcoming.length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Upcoming</p>
                <div className="space-y-2">{upcoming.map(m => renderMeeting(m))}</div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Past Meetings</p>
                <div className="space-y-2">{past.map(m => renderMeeting(m))}</div>
              </div>
            )}

            {meetings.length === 0 && (
              <p className="text-center text-ink-400 py-8">No meetings scheduled yet.</p>
            )}
          </div>
        )}

        {/* ═══ VOTES & RESOLUTIONS ═══ */}
        {tab === 'votes' && <VotingPage />}

        {/* ═══ REPORT ISSUES ═══ */}
        {tab === 'issues' && <IssuesPage embedded />}

      </div>
    </div>
  );
}
