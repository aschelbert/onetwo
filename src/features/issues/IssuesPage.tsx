import { useState } from 'react';
import { useIssuesStore, CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useLetterStore } from '@/store/useLetterStore';
import { CaseCard, BoardVoteDisplay, StepsSection } from './components/CaseComponents';
import { BoardVoteModal, CommModal, DocModal, ApproachModal, LinkLetterModal, InvoiceCreateModal, LinkInvoiceModal, LinkMeetingModal } from './components/CaseModals';
import Modal from '@/components/ui/Modal';
import type { CaseApproach, CasePriority } from '@/types/issues';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function IssuesPage({ embedded }: { embedded?: boolean } = {}) {
  const store = useIssuesStore();
  const { cases, issues } = store;
  const [view, setView] = useState<string>('tabs');
  const role = useAuthStore(s => s.currentUser.role);
  const user = useAuthStore(s => s.currentUser);
  const isBoard = role !== 'RESIDENT';

  if (view === 'new') return <WizardView onDone={(id) => setView(`case:${id}`)} onBack={() => setView('tabs')} />;
  if (view.startsWith('case:')) return <CaseDetail caseId={view.split(':')[1]} onBack={() => setView('tabs')} onNav={setView} />;

  const open = cases.filter(c => c.status === 'open');
  const closed = cases.filter(c => c.status === 'closed');
  const urgent = open.filter(c => c.priority === 'urgent');
  const high = open.filter(c => c.priority === 'high');

  return <CaseOpsTabs
    open={open} closed={closed} urgent={urgent} high={high}
    issues={issues} isBoard={isBoard} user={user}
    onNav={setView} store={store} embedded={embedded}
  />;
}

type CaseTab = 'open' | 'issues' | 'archive';

function CaseOpsTabs({ open, closed, urgent, high, issues, isBoard, user, onNav, store, embedded }: {
  open: any[]; closed: any[]; urgent: any[]; high: any[]; issues: any[];
  isBoard: boolean; user: any; onNav: (v: string) => void; store: any; embedded?: boolean;
}) {
  const [tab, setTab] = useState<CaseTab>('open');
  const [search, setSearch] = useState('');
  const [prioFilter, setPrioFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'overdue'>('all');
  // Issue creation
  const [showCreate, setShowCreate] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [iTitle, setITitle] = useState('');
  const [iDesc, setIDesc] = useState('');
  const [iCat, setICat] = useState('Maintenance');
  const [iPrio, setIPrio] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');

  const handleCreateIssue = () => {
    if (!iTitle.trim()) return;
    store.addIssue({
      type: 'BUILDING_PUBLIC', category: iCat, priority: iPrio, status: 'SUBMITTED',
      title: iTitle, description: iDesc,
      reportedBy: user.id, reporterName: user.name, reporterEmail: user.email,
      unitNumber: user.linkedUnits?.[0] || '', submittedDate: new Date().toISOString().split('T')[0]
    });
    setITitle(''); setIDesc(''); setShowCreate(false);
  };

  const handleConvertToCase = (issue: any) => {
    const catMap: Record<string, string> = { Maintenance: 'maintenance', Safety: 'safety', Noise: 'noise', 'Common Area': 'common-area', Parking: 'parking', Other: 'other' };
    const prioMap: Record<string, string> = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low', URGENT: 'urgent' };
    const catId = catMap[issue.category] || 'other';
    const sits = CATS.find(c => c.id === catId)?.sits || CATS[0].sits;
    const id = store.createCase({
      catId, sitId: sits[0]?.id || 'other', approach: 'pre' as CaseApproach,
      title: issue.title, unit: issue.unitNumber || '', owner: issue.reporterName,
      priority: (prioMap[issue.priority] || 'medium') as CasePriority, notes: `Converted from issue ${issue.id}. ${issue.description}`,
      source: 'issue', sourceId: issue.id
    });
    store.updateIssueStatus(issue.id, 'IN_PROGRESS');
    onNav(`case:${id}`);
  };

  // Filter open cases
  let filteredOpen = [...open];
  if (search) { const s = search.toLowerCase(); filteredOpen = filteredOpen.filter(c => c.title.toLowerCase().includes(s) || c.id.toLowerCase().includes(s) || c.unit?.toLowerCase().includes(s) || c.owner?.toLowerCase().includes(s) || c.assignedTo?.toLowerCase().includes(s)); }
  if (prioFilter !== 'all') filteredOpen = filteredOpen.filter(c => c.priority === prioFilter);
  if (catFilter !== 'all') filteredOpen = filteredOpen.filter(c => c.catId === catFilter);
  if (assignFilter === 'mine') filteredOpen = filteredOpen.filter(c => c.assignedTo === user.name);
  if (assignFilter === 'overdue') { const today = new Date().toISOString().split('T')[0]; filteredOpen = filteredOpen.filter(c => c.dueDate && c.dueDate < today); }

  // Filter archive
  let filteredClosed = [...closed];
  if (search) { const s = search.toLowerCase(); filteredClosed = filteredClosed.filter(c => c.title.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)); }

  const allCats = [...new Set(open.map(c => c.catId))];

  const TABS: { id: CaseTab; label: string; badge?: number }[] = [
    { id: 'open', label: 'Open Cases', badge: open.length || undefined },
    { id: 'issues', label: 'Recent Issues', badge: issues.filter(i => i.status === 'SUBMITTED').length || undefined },
    { id: 'archive', label: 'Case Archive', badge: closed.length || undefined },
  ];

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-0'}>
      {/* Header — only show when standalone */}
      {!embedded && (<>
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">{isBoard ? '⚙️ Daily Operations' : 'Issues & Cases'}</h2>
            <p className="text-accent-200 text-sm mt-1">Case tracking and issue management</p>
          </div>
          <div className="flex items-center gap-4">
            {isBoard && <button onClick={() => onNav('new')} className="px-4 py-2 bg-white text-ink-900 rounded-lg text-sm font-medium hover:bg-accent-100">＋ New Case</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { val: open.length, label: 'Open Cases', icon: '📂' },
            { val: urgent.length, label: 'Urgent', icon: '🔴' },
            { val: high.length, label: 'High Priority', icon: '🟠' },
            { val: closed.length, label: 'Closed', icon: '✅' },
          ].map(s => (
            <div key={s.label} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20" onClick={() => setTab(s.label === 'Closed' ? 'archive' : 'open')}>
              <span className="text-xl">{s.icon}</span>
              <p className="text-[11px] text-accent-100 mt-0.5 leading-tight">{s.label}</p>
              <p className="text-sm font-bold text-white mt-1">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav — standalone style */}
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
      </>)}

      {/* Embedded: pill sub-tabs + New Case button on same row */}
      {embedded && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1 bg-mist-50 rounded-lg p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === t.id ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>
                {t.label}
                {t.badge ? <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${tab === t.id ? 'bg-ink-100 text-ink-600' : 'bg-ink-200 text-ink-500'}`}>{t.badge}</span> : null}
              </button>
            ))}
          </div>
          {isBoard && <button onClick={() => onNav('new')} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 shrink-0">+ New Case</button>}
        </div>
      )}

      {/* Pending Requests Alert (embedded/board view only) */}
      {embedded && isBoard && tab === 'open' && issues.filter(i => i.status === 'SUBMITTED').length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">📋 {issues.filter(i => i.status === 'SUBMITTED').length} Pending Resident Request{issues.filter(i => i.status === 'SUBMITTED').length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-600 mt-0.5">Unresolved issues submitted by residents awaiting board action</p>
            </div>
            <button onClick={() => setTab('issues')} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 shrink-0">Review Requests →</button>
          </div>
          <div className="mt-3 space-y-1.5">
            {issues.filter(i => i.status === 'SUBMITTED').slice(0, 3).map(i => (
              <div key={i.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${i.priority === 'HIGH' || i.priority === 'URGENT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{i.priority}</span>
                  <span className="text-sm text-ink-800 truncate">{i.title}</span>
                  {i.unitNumber && <span className="text-[10px] text-ink-400 shrink-0">Unit {i.unitNumber}</span>}
                </div>
                {(() => {
                  const linkedCase = store.cases.find(c => c.sourceId === i.id);
                  return linkedCase
                    ? <button onClick={(e) => { e.stopPropagation(); onNav(`case:${linkedCase.id}`); }}
                        className="px-2 py-1 text-[10px] font-semibold bg-sage-600 text-white rounded hover:bg-sage-700 shrink-0 ml-2">
                        View Case →
                      </button>
                    : <button onClick={() => { handleConvertToCase(i); }}
                        className="px-2 py-1 text-[10px] font-semibold bg-accent-600 text-white rounded hover:bg-accent-700 shrink-0 ml-2">
                        → Convert to Case
                      </button>;
                })()}
              </div>
            ))}
            {issues.filter(i => i.status === 'SUBMITTED').length > 3 && (
              <p className="text-[10px] text-amber-600 text-center mt-1">+ {issues.filter(i => i.status === 'SUBMITTED').length - 3} more — click "Review Requests" to see all</p>
            )}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className={embedded ? '' : 'bg-white rounded-b-xl border-x border-b border-ink-100 p-6'}>


        {/* ─── OPEN CASES ─── */}
        {tab === 'open' && (<div className="space-y-4">
          {/* Filter pills */}
          {isBoard && (
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'all' as const, label: 'All Open' },
                { id: 'mine' as const, label: 'My Tasks' },
                { id: 'overdue' as const, label: 'Overdue' },
              ]).map(f => (
                <button key={f.id} onClick={() => setAssignFilter(f.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${assignFilter === f.id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}>
                  {f.label}
                  {f.id === 'overdue' && (() => { const today = new Date().toISOString().split('T')[0]; const count = open.filter(c => c.dueDate && c.dueDate < today).length; return count > 0 ? <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{count}</span> : null; })()}
                </button>
              ))}
            </div>
          )}
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search cases..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm" />
            <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {allCats.length > 1 && (
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="all">All Categories</option>
                {allCats.map(c => { const cat = CATS.find(ct => ct.id === c); return <option key={c} value={c}>{cat?.label || c}</option>; })}
              </select>
            )}
          </div>
          <p className="text-xs text-ink-400">{filteredOpen.length} case{filteredOpen.length !== 1 ? 's' : ''}{(search || prioFilter !== 'all' || catFilter !== 'all') ? ' (filtered)' : ''}</p>
          {filteredOpen.length === 0 ? (
            <p className="text-sm text-ink-400 py-8 text-center">No open cases match your filters.</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {filteredOpen.map(c => {
                const cat = CATS.find(ct => ct.id === c.catId);
                return (
                  <div key={c.id} className="py-3 flex items-center gap-4 hover:bg-mist-50 -mx-2 px-2 rounded-lg cursor-pointer" onClick={() => onNav(`case:${c.id}`)}>
                    <span className={`shrink-0 w-2 h-2 rounded-full ${c.priority === 'urgent' ? 'bg-red-500' : c.priority === 'high' ? 'bg-orange-500' : c.priority === 'medium' ? 'bg-yellow-500' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-ink-300">{c.id}</span>
                        <p className="text-sm font-semibold text-ink-900 truncate">{c.title}</p>
                      </div>
                      <p className="text-xs text-ink-400 mt-0.5">{cat?.label || c.catId} · {c.unit ? `Unit ${c.unit}` : 'No unit'}{c.owner ? ` · ${c.owner}` : ''} · {c.created}{c.assignedTo ? ` · ${c.assignedTo}` : ''}</p>
                      {c.dueDate && (() => { const today = new Date().toISOString().split('T')[0]; const isOverdue = c.dueDate < today; const daysUntil = Math.ceil((new Date(c.dueDate + 'T12:00').getTime() - new Date(today + 'T12:00').getTime()) / (1000*60*60*24)); const isNear = daysUntil >= 0 && daysUntil <= 7; return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700' : isNear ? 'bg-amber-100 text-amber-700' : 'bg-ink-50 text-ink-400'}`}>Due {c.dueDate}{isOverdue ? ' (OVERDUE)' : ''}</span>; })()}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${PRIO_COLORS[c.priority] || 'bg-ink-100 text-ink-500'}`}>{c.priority}</span>
                    <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${APPR_COLORS[c.approach] || 'bg-ink-100 text-ink-500'}`}>{APPR_LABELS[c.approach] || c.approach}</span>
                    <span className="text-ink-300 text-sm">→</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>)}

        {/* ─── RECENT ISSUES ─── */}
        {tab === 'issues' && (<div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-400">{issues.length} issue{issues.length !== 1 ? 's' : ''} reported</p>
            <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
              {showCreate ? 'Cancel' : '＋ Report Issue'}
            </button>
          </div>
          {showCreate && (
            <div className="bg-mist-50 rounded-xl border border-mist-200 p-5 space-y-3">
              <input value={iTitle} onChange={e => setITitle(e.target.value)} placeholder="Issue title" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
              <textarea value={iDesc} onChange={e => setIDesc(e.target.value)} placeholder="Description..." rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
              <div className="flex gap-3 flex-wrap">
                <select value={iCat} onChange={e => setICat(e.target.value)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  {['Maintenance', 'Safety', 'Noise', 'Common Area', 'Parking', 'Other'].map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={iPrio} onChange={e => setIPrio(e.target.value as any)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
                </select>
                <button onClick={handleCreateIssue} className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">Submit</button>
              </div>
            </div>
          )}
          <div className="divide-y divide-ink-50">
            {issues.map(i => {
              const subDate = new Date(i.submittedDate + 'T12:00');
              const dueDate = new Date(subDate); dueDate.setDate(dueDate.getDate() + 14);
              const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const isOpen = i.status === 'SUBMITTED' || i.status === 'IN_PROGRESS';
              return (
              <div key={i.id} className="py-3 flex items-start gap-3">
                <button onClick={() => store.upvoteIssue(i.id, user.id, user.name, user.linkedUnits?.[0] || '')} className="flex flex-col items-center shrink-0 mt-1">
                  <span className={`text-base ${i.upvotes.find((u: any) => u.userId === user.id) ? 'text-accent-500' : 'text-ink-300'}`}>▲</span>
                  <span className="text-[10px] font-bold text-ink-500">{i.upvotes.length}</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${i.priority === 'HIGH' ? 'bg-red-100 text-red-700' : i.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>{i.priority}</span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{i.category}</span>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${i.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' : i.status === 'IN_PROGRESS' ? 'bg-accent-100 text-accent-700' : 'bg-sage-100 text-sage-700'}`}>{i.status.replace('_', ' ')}</span>
                    {isBoard && isOpen && (daysLeft < 0
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">⚠ OVERDUE by {Math.abs(daysLeft)}d</span>
                      : daysLeft <= 3
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">⏰ {daysLeft}d left to respond</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-500">Due {dueDate.toISOString().split('T')[0]}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-ink-900 mt-1">{i.title}</p>
                  {i.description && <p className="text-xs text-ink-400 mt-0.5">{i.description}</p>}
                  <p className="text-[11px] text-ink-300 mt-1">Reported by {i.reporterName} · {i.submittedDate} · {i.viewCount} views</p>
                  {/* Comments */}
                  {(i.comments || []).length > 0 && (
                    <div className="mt-2 space-y-1">{i.comments.map((c: any) => (
                      <div key={c.id} className="bg-mist-50 rounded-lg p-2 border border-mist-100">
                        <span className="text-[10px] font-bold text-ink-600">{c.author}</span>
                        <span className="text-[10px] text-ink-400 ml-2">{c.date}</span>
                        <p className="text-xs text-ink-600 mt-0.5">{c.text}</p>
                      </div>
                    ))}</div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {isBoard && (['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map(st => (
                      <button key={st} onClick={() => store.updateIssueStatus(i.id, st)} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${i.status === st ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-400 hover:bg-ink-100'}`}>
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                    {isBoard && <button onClick={() => setReplyTo(replyTo === i.id ? null : i.id)} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-50 text-accent-700 hover:bg-accent-100 border border-accent-200">💬 Reply</button>}
                    {isBoard && i.status !== 'CLOSED' && (() => {
                      const linkedCase = store.cases.find(c => c.sourceId === i.id);
                      return linkedCase
                        ? <button onClick={(e) => { e.stopPropagation(); onNav(`case:${linkedCase.id}`); }}
                            className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-sage-600 text-white hover:bg-sage-700 ml-1">
                            View Case →
                          </button>
                        : <button onClick={(e) => { e.stopPropagation(); handleConvertToCase(i); }}
                            className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-accent-600 text-white hover:bg-accent-700 ml-1">
                            → Convert to Case
                          </button>;
                    })()}
                  </div>
                  {isBoard && replyTo === i.id && (
                    <div className="mt-2 flex gap-2">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Reply to resident..." className="flex-1 px-3 py-1.5 border border-ink-200 rounded-lg text-xs" onKeyDown={e => { if (e.key === 'Enter' && replyText.trim()) { store.addIssueComment(i.id, 'Board', replyText.trim()); setReplyText(''); setReplyTo(null); } }} />
                      <button onClick={() => { if (replyText.trim()) { store.addIssueComment(i.id, 'Board', replyText.trim()); setReplyText(''); setReplyTo(null); } }} className="px-3 py-1.5 bg-accent-600 text-white rounded-lg text-xs font-medium">Send</button>
                    </div>
                  )}
                </div>
              </div>
            ); })}
            {issues.length === 0 && <p className="text-sm text-ink-400 text-center py-8">No issues reported.</p>}
          </div>
        </div>)}

        {/* ─── CASE ARCHIVE ─── */}
        {tab === 'archive' && (<div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" placeholder="Search closed cases..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <p className="text-xs text-ink-400">{filteredClosed.length} closed case{filteredClosed.length !== 1 ? 's' : ''}</p>
          {filteredClosed.length === 0 ? (
            <p className="text-sm text-ink-400 py-8 text-center">No closed cases.</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {filteredClosed.map(c => {
                const cat = CATS.find(ct => ct.id === c.catId);
                return (
                  <div key={c.id} className="py-3 flex items-center gap-4 hover:bg-mist-50 -mx-2 px-2 rounded-lg cursor-pointer" onClick={() => onNav(`case:${c.id}`)}>
                    <span className="shrink-0 w-2 h-2 rounded-full bg-sage-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-ink-300">{c.id}</span>
                        <p className="text-sm font-medium text-ink-700 truncate">{c.title}</p>
                      </div>
                      <p className="text-xs text-ink-400 mt-0.5">{cat?.label || c.catId} · {c.unit ? `Unit ${c.unit}` : ''} · Opened {c.dateOpened}{c.dateClosed ? ` · Closed ${c.dateClosed}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-sage-100 text-sage-700">Closed</span>
                    <span className="text-ink-300 text-sm">→</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>)}
      </div>
    </div>
  );
}

// ─── Creation Wizard ───────────────────────────────────────
function WizardView({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const { createCase } = useIssuesStore();
  const { board: boardMembers } = useBuildingStore();
  const [step, setStep] = useState(1);
  const [catId, setCatId] = useState<string | null>(null);
  const [sitId, setSitId] = useState<string | null>(null);
  const [approach, setApproach] = useState<CaseApproach>('pre');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState<CasePriority>('medium');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedRole, setAssignedRole] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [source, setSource] = useState('');

  const selCat = CATS.find(c => c.id === catId);
  const selSit = selCat?.sits.find(s => s.id === sitId);

  const handleAssignedToChange = (name: string) => {
    setAssignedTo(name);
    const member = boardMembers.find(b => b.name === name);
    setAssignedRole(member?.role || '');
  };

  const handleCreate = () => {
    if (!catId || !sitId || !title.trim()) return;
    const id = createCase({ catId, sitId, approach, title, unit, owner, priority, notes, assignedTo: assignedTo || undefined, assignedRole: assignedRole || undefined, dueDate: dueDate || undefined, source: source || undefined });
    onDone(id);
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Back to Dashboard</button>
      <h2 className="text-2xl font-bold text-ink-900">New Case</h2>
      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-accent-500' : 'bg-ink-100'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-800">1. What's the situation?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CATS.map(cat => (
              <button key={cat.id} onClick={() => { setCatId(cat.id); setSitId(null); }} className={`rounded-xl border-2 p-3 text-center transition-all ${catId === cat.id ? 'border-accent-400 bg-accent-50 shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                <span className="text-xl">{cat.icon}</span>
                <p className="text-xs font-semibold text-ink-700 mt-1">{cat.label}</p>
              </button>
            ))}
          </div>
          {selCat && (
            <>
              <p className="text-sm font-medium text-ink-600">Select situation type:</p>
              <div className="space-y-2">
                {selCat.sits.map(sit => (
                  <button key={sit.id} onClick={() => setSitId(sit.id)} className={`w-full text-left rounded-xl border-2 p-4 transition-all ${sitId === sit.id ? 'border-accent-400 bg-accent-50' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                    <p className="text-sm font-semibold text-ink-900">{sit.title}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{sit.desc}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sit.tags.slice(0, 4).map(t => <span key={t} className="text-[10px] bg-ink-50 text-ink-400 px-1.5 py-0.5 rounded">{t}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <button onClick={() => catId && sitId ? setStep(2) : undefined} className={`px-6 py-2.5 rounded-lg text-sm font-semibold ${catId && sitId ? 'bg-ink-900 text-white hover:bg-ink-800 cursor-pointer' : 'bg-ink-100 text-ink-300 cursor-not-allowed'}`}>Next →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <button onClick={() => setStep(1)} className="text-xs text-ink-400 hover:text-ink-600">← Back</button>
          <h3 className="text-lg font-semibold text-ink-800">2. Choose approach</h3>
          <p className="text-sm text-ink-500">For: <span className="font-medium text-ink-700">{selSit?.title}</span></p>
          <div className="grid sm:grid-cols-3 gap-3">
            {([
              { id: 'pre' as const, label: 'Pre-Legal', desc: 'Board-managed steps. Document, notify, escalate through internal procedures.', border: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
              { id: 'self' as const, label: 'Self-Represented', desc: 'Board acts without attorney. Liens, small claims, formal demands.', border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
              { id: 'legal' as const, label: 'Legal Counsel', desc: 'Attorney-led. Cease & desist, litigation, foreclosure.', border: 'border-rose-400', bg: 'bg-rose-50', text: 'text-rose-700' }
            ]).map(a => {
              const stepCount = (a.id === 'legal' ? selSit?.legal : a.id === 'self' ? selSit?.self : selSit?.pre)?.length || 0;
              return (
                <button key={a.id} onClick={() => setApproach(a.id)} className={`rounded-xl border-2 p-4 text-left transition-all ${approach === a.id ? `${a.border} ${a.bg}` : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                  <p className={`text-sm font-bold ${a.text}`}>{a.label}</p>
                  <p className="text-xs text-ink-500 mt-1">{a.desc}</p>
                  <p className="text-[10px] text-ink-400 mt-2">{stepCount} steps</p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-ink-200 text-ink-600 hover:bg-ink-50">← Back</button>
            <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-ink-900 text-white hover:bg-ink-800">Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <button onClick={() => setStep(2)} className="text-xs text-ink-400 hover:text-ink-600">← Back</button>
          <h3 className="text-lg font-semibold text-ink-800">3. Case details</h3>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Case Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g., Unit 502 — ${selSit?.title || 'Issue description'}`} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Unit #</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g., 502 or Common" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Owner / Contact</label>
              <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Owner name" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Priority</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${priority === p ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Assignment fields (optional) */}
          <div className="border-t border-ink-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">Assignment (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Assigned To</label>
                <select value={assignedTo} onChange={e => handleAssignedToChange(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Unassigned</option>
                  {boardMembers.map(b => <option key={b.id} value={b.name}>{b.name} ({b.role})</option>)}
                </select>
                {assignedRole && <p className="text-[10px] text-ink-400 mt-1">Role: {assignedRole}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-ink-700 mb-1">Source</label>
              <input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g., Board Meeting Jan 2026" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Background details..." />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-ink-200 text-ink-600 hover:bg-ink-50">← Back</button>
            <button onClick={handleCreate} className={`px-6 py-2.5 rounded-lg text-sm font-semibold ${title.trim() ? 'bg-accent-500 text-white hover:bg-accent-600' : 'bg-ink-100 text-ink-300 cursor-not-allowed'}`}>Create Case ✓</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Case Detail ───────────────────────────────────────────
function CaseDetail({ caseId, onBack, onNav }: { caseId: string; onBack: () => void; onNav: (v: string) => void }) {
  const store = useIssuesStore();
  const { board: boardMembers } = useBuildingStore();
  const fin = useFinancialStore();
  const { workOrders } = fin;
  const letterStore = useLetterStore();
  const meetingsStore = useMeetingsStore();
  const c = store.cases.find(x => x.id === caseId);

  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showApproachModal, setShowApproachModal] = useState(false);
  const [showWOModal, setShowWOModal] = useState(false);
  const [showLinkLetterModal, setShowLinkLetterModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showLinkInvoiceModal, setShowLinkInvoiceModal] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [woForm, setWOForm] = useState({ title: '', vendor: '', amount: '', acctNum: '6050' });
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [assignForm, setAssignForm] = useState({ assignedTo: '', assignedRole: '', dueDate: '' });

  if (!c) return <div><button onClick={onBack} className="text-xs text-ink-400">← Back</button><p className="text-ink-400 mt-4">Case not found.</p></div>;

  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  const pct = c.steps ? Math.round((c.steps.filter(s => s.done).length / c.steps.length) * 100) : 0;
  const stNote = sit?.notes?.['_'] || '';

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Dashboard</button>
        <span className="text-ink-300">·</span>
        <button onClick={() => onNav('cases')} className="text-xs text-ink-400 hover:text-ink-600">All Cases</button>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-start gap-4">
          <span className="text-3xl">{cat?.icon || '📋'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>{c.priority}</span>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>{APPR_LABELS[c.approach]}</span>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${c.status === 'open' ? 'bg-accent-50 text-accent-600' : 'bg-sage-100 text-sage-700'}`}>{c.status}</span>
            </div>
            <h2 className="text-xl font-bold text-ink-900">{c.title}</h2>
            <p className="text-sm text-ink-400 mt-1">{sit?.title || ''} · Unit {c.unit} · {c.owner} · Created {c.created}</p>
            {/* Assignment info */}
            {(c.assignedTo || c.dueDate || c.source || c.completedAt) && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {c.assignedTo && (
                  <span className="text-xs bg-accent-50 text-accent-700 px-2 py-1 rounded-lg font-medium">
                    Assigned to: {c.assignedTo}{c.assignedRole ? ` (${c.assignedRole})` : ''}
                  </span>
                )}
                {c.dueDate && (() => {
                  const today = new Date().toISOString().split('T')[0];
                  const daysUntil = Math.ceil((new Date(c.dueDate + 'T12:00').getTime() - new Date(today + 'T12:00').getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = c.status === 'open' && daysUntil < 0;
                  const isNear = c.status === 'open' && daysUntil >= 0 && daysUntil <= 7;
                  return (
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${isOverdue ? 'bg-red-100 text-red-700' : isNear ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-600'}`}>
                      Due: {c.dueDate}{isOverdue ? ' (OVERDUE)' : ''}
                    </span>
                  );
                })()}
                {c.source && <span className="text-xs text-ink-400">Source: {c.source}</span>}
                {c.completedAt && <span className="text-xs bg-sage-100 text-sage-700 px-2 py-1 rounded-lg font-medium">Completed: {c.completedAt}</span>}
                <button onClick={() => { setAssignForm({ assignedTo: c.assignedTo || '', assignedRole: c.assignedRole || '', dueDate: c.dueDate || '' }); setEditingAssignment(true); }} className="text-[11px] text-accent-500 hover:text-accent-600 font-medium">Edit Assignment</button>
              </div>
            )}
            {!c.assignedTo && !c.dueDate && (
              <button onClick={() => { setAssignForm({ assignedTo: '', assignedRole: '', dueDate: '' }); setEditingAssignment(true); }} className="text-[11px] text-accent-500 hover:text-accent-600 font-medium mt-2 inline-block">+ Add Assignment</button>
            )}
            {c.notes && <p className="text-sm text-ink-500 mt-2 bg-sand-100 rounded-lg p-3">{c.notes}</p>}
          </div>
          <div className="shrink-0 text-center">
            <svg viewBox="0 0 36 36" className="w-16 h-16">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={c.status === 'closed' ? '#22c55e' : '#f59e0b'} strokeWidth="3" strokeDasharray={`${pct}, 100`} />
            </svg>
            <span className="text-sm font-bold text-ink-700">{pct}%</span>
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-ink-50 flex-wrap">
          {c.status === 'open' ? (
            <button onClick={() => { if (confirm('Close this case?')) store.closeCase(caseId); }} className="px-4 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-semibold hover:bg-sage-700">✓ Close Case</button>
          ) : (
            <button onClick={() => store.reopenCase(caseId)} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">↻ Reopen</button>
          )}
          <button onClick={() => setShowApproachModal(true)} className="px-4 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-semibold hover:bg-ink-50">+ Add Approach</button>
          <button onClick={() => { if (confirm('Delete this case?')) { store.deleteCase(caseId); onBack(); } }} className="px-4 py-1.5 text-red-500 rounded-lg text-xs font-semibold hover:bg-red-50 ml-auto">Delete</button>
        </div>
      </div>

      {/* Jurisdiction note */}
      {stNote && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <span>📍</span>
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Jurisdiction Guidance</p>
              <p className="text-sm text-amber-900 mt-1">{stNote}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main approach steps */}
      {c.steps && (
        <StepsSection
          caseId={caseId}
          approach={c.approach}
          steps={c.steps}
          onToggle={(idx) => store.toggleStep(caseId, idx)}
          onNote={(idx, note) => store.addStepNote(caseId, idx, note)}
        />
      )}

      {/* Additional approaches */}
      {c.additionalApproaches?.map((aa: any, ai: number) => (
        <div key={ai} className="bg-white rounded-xl border border-ink-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${APPR_COLORS[aa.approach]}`}>{APPR_LABELS[aa.approach]}</span>
            <h3 className="text-lg font-semibold text-ink-800">Steps</h3>
            <span className="text-ink-400 text-sm">({aa.steps.filter((s: any) => s.done).length}/{aa.steps.length} complete · added {aa.addedDate})</span>
          </div>
          <div className="space-y-3">
            {aa.steps.map((st: any, si: number) => (
              <div key={si} className="flex items-start gap-3">
                <button onClick={() => store.toggleAdditionalStep(caseId, ai, si)} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all text-sm font-bold ${st.done ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 text-ink-300 hover:border-accent-400'}`}>
                  {st.done ? '✓' : si + 1}
                </button>
                <div className="flex-1">
                  <p className={`text-sm ${st.done ? 'text-ink-400 line-through' : 'text-ink-800 font-medium'}`}>{st.s}</p>
                  {st.w && <span className="text-[11px] text-rose-500">⚠ {st.w}</span>}
                  {st.done && st.doneDate && <span className="text-[10px] text-sage-500 block">Completed {st.doneDate}</span>}
                  {st.userNotes && <p className="text-xs text-ink-400 mt-1 bg-sand-100 rounded p-2">📝 {st.userNotes}</p>}
                  <button onClick={() => { const note = prompt('Add note:', st.userNotes || ''); if (note !== null) store.addAdditionalStepNote(caseId, ai, si, note); }} className="text-[11px] text-accent-500 hover:text-accent-600 mt-1 inline-block">+ Add note</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Board Vote */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-800">Board Vote</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowVoteModal(true)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${c.boardVotes ? 'border border-ink-200 text-ink-700 hover:bg-mist-50' : 'bg-ink-900 text-white hover:bg-ink-800'}`}>
              {c.boardVotes ? 'Edit Vote' : 'Record Vote'}
            </button>
            {c.boardVotes && <button onClick={() => { if (confirm('Remove vote?')) store.clearBoardVote(caseId); }} className="px-3 py-1.5 text-red-400 hover:bg-red-50 rounded-lg text-xs font-medium">Remove</button>}
          </div>
        </div>
        {c.boardVotes ? <BoardVoteDisplay vote={c.boardVotes} /> : <p className="text-sm text-ink-400 py-3 text-center">No board vote recorded for this case.</p>}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-800">Documents</h3>
          <button onClick={() => setShowDocModal(true)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">📎 Upload</button>
        </div>
        {c.attachments.length > 0 ? (
          <div className="space-y-1.5">
            {c.attachments.map((a, i) => {
              const tc: Record<string, string> = { evidence: 'bg-amber-100 text-amber-700', notice: 'bg-accent-100 text-accent-700', legal: 'bg-rose-100 text-rose-700', claim: 'bg-purple-100 text-purple-700' };
              return (
                <div key={i} className="flex items-center justify-between p-2.5 bg-mist-50 border border-mist-100 rounded-lg group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-ink-400">📄</span>
                    <span className="text-sm text-ink-700 truncate">{a.name}</span>
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${tc[a.type] || 'bg-ink-100 text-ink-500'}`}>{a.type}</span>
                    <span className="text-xs text-ink-300">{a.size}</span>
                  </div>
                  <button onClick={() => store.removeDocument(caseId, i)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 shrink-0 ml-2">✕</button>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-ink-400 py-3 text-center">No documents attached.</p>}
      </div>

      {/* Communications */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-800">Communications</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowLinkLetterModal(true)} className="px-3 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-50">Link Letter</button>
            <button onClick={() => setShowCommModal(true)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">✉ Send</button>
          </div>
        </div>
        {c.comms.length > 0 ? (
          <div className="space-y-2">
            {[...c.comms].sort((a, b) => b.date.localeCompare(a.date)).map((cm, i) => {
              const icons: Record<string, string> = { notice: '📢', response: '✉️', reminder: '⏰', violation: '⚠️', legal: '⚖️' };
              return (
                <div key={cm.id} className="p-3 bg-mist-50 border border-mist-100 rounded-lg group">
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5">{icons[cm.type] || '📨'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-ink-900">{cm.subject}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${cm.status === 'sent' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'}`}>{cm.status}</span>
                            <span className="text-[11px] text-ink-400">{cm.date} · via {cm.method}</span>
                            <span className="text-[11px] text-ink-500">→ {cm.recipient}</span>
                          </div>
                        </div>
                        <button onClick={() => store.removeComm(caseId, i)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 shrink-0">✕</button>
                      </div>
                      {cm.notes && <p className="text-xs text-ink-400 mt-1">{cm.notes}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-ink-400 py-3 text-center">No communications sent.</p>}

        {/* Linked Letters */}
        {(c.linkedLetterIds?.length ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-ink-50">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">Linked Letters</p>
            <div className="space-y-2">
              {(c.linkedLetterIds || []).map(letterId => {
                const letter = letterStore.letters.find(l => l.id === letterId);
                if (!letter) return <div key={letterId} className="p-3 bg-red-50 rounded-lg text-sm text-red-500">Letter {letterId} not found</div>;
                const sc: Record<string, string> = { draft: 'bg-yellow-100 text-yellow-700', sent: 'bg-sage-100 text-sage-700', archived: 'bg-ink-100 text-ink-500' };
                return (
                  <div key={letterId} className="flex items-center justify-between p-3 bg-mist-50 border border-mist-200 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[letter.status] || 'bg-ink-100 text-ink-500'}`}>{letter.status}</span>
                      <span className="text-sm font-medium text-ink-900 truncate">{letter.subject}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-ink-400">{letter.recipient} · {letter.sentDate}</span>
                      <button onClick={() => store.unlinkLetter(caseId, letterId)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded font-medium">Unlink</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Financials: Work Orders + Invoices */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-800">Financials</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowLinkInvoiceModal(true)} className="px-3 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-50">Link Invoice</button>
            <button onClick={() => setShowInvoiceModal(true)} className="px-3 py-1.5 border border-ink-200 text-ink-600 rounded-lg text-xs font-medium hover:bg-ink-50">+ Create Invoice</button>
            <button onClick={() => { setWOForm({ title: `${c.title}`, vendor: '', amount: '', acctNum: '6050' }); setShowWOModal(true); }} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">+ Create Work Order</button>
          </div>
        </div>

        {/* Work Orders */}
        <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">Work Orders</p>
        {c.linkedWOs.length > 0 ? (
          <div className="space-y-2">
            {c.linkedWOs.map(woId => {
              const wo = workOrders.find(w => w.id === woId);
              if (!wo) return <div key={woId} className="p-3 bg-red-50 rounded-lg text-sm text-red-500">WO {woId} not found</div>;
              const sc: Record<string, string> = { draft: 'bg-ink-100 text-ink-500', approved: 'bg-yellow-100 text-yellow-700', invoiced: 'bg-accent-100 text-accent-700', paid: 'bg-sage-100 text-sage-700' };
              return (
                <div key={woId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-mist-50 border border-mist-200 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${sc[wo.status]}`}>{wo.status}</span>
                    <span className="text-xs font-mono text-ink-300">{wo.id}</span>
                    <span className="text-sm font-medium text-ink-900 truncate">{wo.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-ink-500">{wo.vendor}</span>
                    <span className="font-bold text-ink-900">{fmt(wo.amount)}</span>
                    <button onClick={() => store.unlinkWO(caseId, woId)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded font-medium">Unlink</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-ink-400 py-2 text-center">No work orders linked.</p>}

        {/* Linked Invoices */}
        <div className="mt-4 pt-4 border-t border-ink-50">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">Invoices</p>
          {(c.linkedInvoiceIds?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {(c.linkedInvoiceIds || []).map(invId => {
                const inv = fin.unitInvoices.find(i => i.id === invId);
                if (!inv) return <div key={invId} className="p-3 bg-red-50 rounded-lg text-sm text-red-500">Invoice {invId} not found</div>;
                const sc: Record<string, string> = { sent: 'bg-accent-100 text-accent-700', paid: 'bg-sage-100 text-sage-700', overdue: 'bg-red-100 text-red-700', void: 'bg-ink-100 text-ink-500' };
                return (
                  <div key={invId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-mist-50 border border-mist-200 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[inv.status] || 'bg-ink-100 text-ink-500'}`}>{inv.status}</span>
                      <span className="text-xs font-mono text-ink-300">{inv.id}</span>
                      <span className="text-sm font-medium text-ink-900 truncate">{inv.description}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-ink-500">Unit {inv.unitNumber}</span>
                      <span className="font-bold text-ink-900">{fmt(inv.amount)}</span>
                      <button onClick={() => store.unlinkInvoice(caseId, invId)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded font-medium">Unlink</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-ink-400 py-2 text-center">No invoices linked.</p>}
        </div>
      </div>

      {/* Meetings */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-800">Meetings</h3>
          <button onClick={() => setShowMeetingModal(true)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">+ Link Meeting</button>
        </div>
        {(c.linkedMeetingIds?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {(c.linkedMeetingIds || []).map(meetingId => {
              const meeting = meetingsStore.meetings.find(m => m.id === meetingId);
              if (!meeting) return <div key={meetingId} className="p-3 bg-red-50 rounded-lg text-sm text-red-500">Meeting {meetingId} not found</div>;
              const sc: Record<string, string> = { scheduled: 'bg-accent-100 text-accent-700', completed: 'bg-sage-100 text-sage-700', cancelled: 'bg-red-100 text-red-700', draft: 'bg-yellow-100 text-yellow-700' };
              return (
                <div key={meetingId} className="flex items-center justify-between p-3 bg-mist-50 border border-mist-200 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[meeting.status] || 'bg-ink-100 text-ink-500'}`}>{meeting.status}</span>
                    <span className="text-sm font-medium text-ink-900 truncate">{meeting.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-ink-400">{meeting.date} · {meeting.type}</span>
                    <button onClick={() => store.unlinkMeeting(caseId, meetingId)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded font-medium">Unlink</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-ink-400 py-3 text-center">No meetings linked.</p>}
      </div>

      {/* Modals */}
      {showVoteModal && <BoardVoteModal c={c} boardMembers={boardMembers} store={store} onClose={() => setShowVoteModal(false)} />}
      {showCommModal && <CommModal caseId={caseId} store={store} catId={c.catId} sitId={c.sitId} onClose={() => setShowCommModal(false)} />}
      {showDocModal && <DocModal caseId={caseId} store={store} onClose={() => setShowDocModal(false)} />}
      {showApproachModal && <ApproachModal c={c} store={store} onClose={() => setShowApproachModal(false)} />}
      {showLinkLetterModal && <LinkLetterModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowLinkLetterModal(false)} />}
      {showInvoiceModal && <InvoiceCreateModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowInvoiceModal(false)} />}
      {showLinkInvoiceModal && <LinkInvoiceModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowLinkInvoiceModal(false)} />}
      {showMeetingModal && <LinkMeetingModal caseId={caseId} store={store} onClose={() => setShowMeetingModal(false)} />}
      {editingAssignment && (
        <Modal title="Edit Assignment" onClose={() => setEditingAssignment(false)} onSave={() => {
          store.updateCaseAssignment(caseId, {
            assignedTo: assignForm.assignedTo || undefined,
            assignedRole: assignForm.assignedRole || undefined,
            dueDate: assignForm.dueDate || undefined,
          });
          setEditingAssignment(false);
        }} saveLabel="Save">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Assigned To</label>
              <select value={assignForm.assignedTo} onChange={e => { const name = e.target.value; const member = boardMembers.find(b => b.name === name); setAssignForm({ ...assignForm, assignedTo: name, assignedRole: member?.role || '' }); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Unassigned</option>
                {boardMembers.map(b => <option key={b.id} value={b.name}>{b.name} ({b.role})</option>)}
              </select>
              {assignForm.assignedRole && <p className="text-[10px] text-ink-400 mt-1">Role: {assignForm.assignedRole}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Due Date</label>
              <input type="date" value={assignForm.dueDate} onChange={e => setAssignForm({ ...assignForm, dueDate: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
            </div>
          </div>
        </Modal>
      )}
      {showWOModal && (
        <Modal title="Create Work Order" onClose={() => setShowWOModal(false)} onSave={() => {
          if (!woForm.title || !woForm.vendor || !woForm.amount) { alert('Title, vendor, and amount required'); return; }
          fin.createWorkOrder({ title: woForm.title, vendor: woForm.vendor, amount: parseFloat(woForm.amount), acctNum: woForm.acctNum, caseId });
          const newWO = fin.workOrders[fin.workOrders.length - 1];
          if (newWO) store.linkWO(caseId, newWO.id);
          setShowWOModal(false);
        }} saveLabel="Create & Link">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={woForm.title} onChange={e => setWOForm({ ...woForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Vendor *</label><input value={woForm.vendor} onChange={e => setWOForm({ ...woForm, vendor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Company name" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Amount *</label><input type="number" value={woForm.amount} onChange={e => setWOForm({ ...woForm, amount: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0.00" /></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Expense Account</label>
              <select value={woForm.acctNum} onChange={e => setWOForm({ ...woForm, acctNum: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                {fin.chartOfAccounts.filter(a => a.type === 'expense').map(a => <option key={a.num} value={a.num}>{a.num} — {a.name}</option>)}
              </select>
            </div>
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <p className="text-xs text-ink-600">This creates a work order in Fiscal Lens and links it to case <strong>{caseId}</strong>. The WO will appear in AP/Work Orders for approval and payment.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
