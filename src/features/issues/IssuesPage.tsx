import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIssuesStore, CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS, SITUATION_PHASES, PHASE_COLORS } from '@/store/useIssuesStore';
import type { StepAction } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useLetterStore } from '@/store/useLetterStore';
import { CaseCard, BoardVoteDisplay, StepsSection } from './components/CaseComponents';
import { BoardVoteModal, CommModal, DocModal, ApproachModal, LinkLetterModal, InvoiceCreateModal, LinkInvoiceModal, LinkMeetingModal, HoldCaseModal, CloseCaseModal, DeleteCaseModal, AddBidModal } from './components/CaseModals';
import { CaseWorkflow } from './components/workflow/CaseWorkflow';
import { CheckItemDocModal } from './components/workflow/CheckItemDocModal';
import { getCleanLabel, getReportMapping } from './components/workflow/checkItemReportMap';
import DecisionTrail from './components/workflow/DecisionTrail';
import SendNoticePanel from './components/SendNoticePanel';
import ComposePanel from '@/features/boardroom/components/ComposePanel';
import type { ComposePanelContext } from '@/types/communication';
import { OwnerCaseView } from './components/OwnerCaseView';
import { BudgetTracker } from './components/shell/BudgetTracker';
import { CaseHeader } from './components/shell/CaseHeader';
import { StepList } from './components/shell/StepList';
import { SideSections } from './components/shell/SideSections';
import { ShellStepHeader } from './components/shell/StepHeader';
import { StepContent } from './components/shell/StepContent';
import Modal from '@/components/ui/Modal';
import { useTabParam } from '@/hooks/useTabParam';
import { DACI_MATRIX } from '@/data/daciMatrix';
import type { CaseApproach, CasePriority, CaseComm } from '@/types/issues';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function IssuesPage({ embedded }: { embedded?: boolean } = {}) {
  const store = useIssuesStore();
  const { cases, issues } = store;
  const [view, setView] = useTabParam<string>('view', 'tabs');
  const [wizardPrefill, setWizardPrefill] = useState<{ source?: string; sourceId?: string; catId?: string; sitId?: string; title?: string; unit?: string; owner?: string; priority?: CasePriority; notes?: string } | undefined>();
  const role = useAuthStore(s => s.currentUser.role);
  const user = useAuthStore(s => s.currentUser);
  const isBoard = role !== 'RESIDENT';

  if (view === 'new') return <WizardView onDone={(id) => { setWizardPrefill(undefined); setView(`case:${id}`); }} onBack={() => { setWizardPrefill(undefined); setView('tabs'); }} prefill={wizardPrefill} />;
  if (view.startsWith('case:')) return <CaseDetail caseId={view.split(':')[1]} onBack={() => setView('tabs')} onNav={setView} />;

  const open = cases.filter(c => c.status === 'open' || c.status === 'on-hold');
  const closed = cases.filter(c => c.status === 'closed');
  const urgent = open.filter(c => c.priority === 'urgent');
  const high = open.filter(c => c.priority === 'high');

  return <CaseOpsTabs
    open={open} closed={closed} urgent={urgent} high={high}
    issues={issues} isBoard={isBoard} user={user}
    onNav={setView} store={store} embedded={embedded}
    onWizardPrefill={(pf) => { setWizardPrefill(pf); setView('new'); }}
  />;
}

type CaseTab = 'open' | 'issues' | 'archive';

function CaseOpsTabs({ open, closed, urgent, high, issues, isBoard, user, onNav, store, embedded, onWizardPrefill }: {
  open: any[]; closed: any[]; urgent: any[]; high: any[]; issues: any[];
  isBoard: boolean; user: any; onNav: (v: string) => void; store: any; embedded?: boolean;
  onWizardPrefill?: (pf: { source?: string; sourceId?: string; catId?: string; sitId?: string; title?: string; unit?: string; owner?: string; priority?: CasePriority; notes?: string }) => void;
}) {
  const [tab, setTab] = useTabParam<CaseTab>('caseTab', 'open', ['open', 'issues', 'archive']);
  const [search, setSearch] = useState('');
  const [prioFilter, setPrioFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'overdue'>('all');
  // Issue creation
  const [showCreate, setShowCreate] = useState(false);
  const [commIssueId, setCommIssueId] = useState<string | null>(null);
  const [iTitle, setITitle] = useState('');
  const [iDesc, setIDesc] = useState('');
  const [iCat, setICat] = useState('Maintenance Request');
  const [iPrio, setIPrio] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');

  const REQ_CATS = [
    'Maintenance Request', 'Noise Complaint', 'Common Area Issue', 'Parking Issue',
    'Safety Concern', 'Resale Certificate Request', 'Records Inspection Request',
    'Architectural Modification Request', 'General Question', 'Other',
  ];

  const handleCreateIssue = () => {
    if (!iTitle.trim()) return;
    store.addIssue({
      type: 'BUILDING_PUBLIC', category: iCat, priority: iPrio, status: 'SUBMITTED',
      title: iTitle, description: iDesc,
      reportedBy: user.id, reporterName: user.name, reporterEmail: user.email,
      unitNumber: user.linkedUnits?.[0] || '', submittedDate: new Date().toISOString().split('T')[0]
    });
    setITitle(''); setIDesc(''); setICat('Maintenance Request'); setIPrio('MEDIUM'); setShowCreate(false);
  };

  const handleConvertToCase = (issue: any) => {
    const catMap: Record<string, string> = {
      'Maintenance': 'maintenance', 'Maintenance Request': 'maintenance',
      'Safety': 'enforcement', 'Safety Concern': 'enforcement',
      'Noise': 'enforcement', 'Noise Complaint': 'enforcement',
      'Common Area': 'maintenance', 'Common Area Issue': 'maintenance',
      'Parking': 'enforcement', 'Parking Issue': 'enforcement',
      'Resale Certificate Request': 'admin', 'Records Inspection Request': 'admin',
      'Architectural Modification Request': 'enforcement',
      'General Question': 'admin', 'Other': 'admin',
    };
    const prioMap: Record<string, string> = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low', URGENT: 'urgent' };
    const mappedCatId = catMap[issue.category] || 'admin';
    const sits = CATS.find(c => c.id === mappedCatId)?.sits || CATS[0].sits;

    // Navigate to wizard with pre-populated data
    if (onWizardPrefill) {
      store.updateIssueStatus(issue.id, 'IN_PROGRESS');
      onWizardPrefill({
        source: 'issue', sourceId: issue.id,
        catId: mappedCatId, sitId: sits[0]?.id,
        title: issue.title, unit: issue.unitNumber || '', owner: issue.reporterName,
        priority: (prioMap[issue.priority] || 'medium') as CasePriority,
        notes: `Converted from issue ${issue.id}. ${issue.description}`,
      });
      return;
    }

    // Fallback: direct creation
    const id = store.createCase({
      catId: mappedCatId, sitId: sits[0]?.id || 'other', approach: 'pre' as CaseApproach,
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
    { id: 'issues', label: 'Request Inbox', badge: issues.filter(i => i.status === 'SUBMITTED').length || undefined },
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

        {/* ─── REQUEST INBOX ─── */}
        {tab === 'issues' && (<div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-400">{issues.length} issue{issues.length !== 1 ? 's' : ''} reported</p>
            <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
              {showCreate ? 'Cancel' : '+ Add Request'}
            </button>
          </div>
          {showCreate && (
            <div className="bg-mist-50 rounded-xl border border-mist-200 p-5 space-y-3">
              <p className="text-xs font-bold text-ink-700">Submit a Request</p>
              <select value={iCat} onChange={e => setICat(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white">
                {REQ_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input value={iTitle} onChange={e => setITitle(e.target.value)} placeholder="Brief summary of the request" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
              <textarea value={iDesc} onChange={e => setIDesc(e.target.value)} placeholder="Provide details — what, where, when, any relevant unit number..." rows={4} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white" />
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Priority</label>
                  <select value={iPrio} onChange={e => setIPrio(e.target.value as any)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-white mt-0.5">
                    <option value="HIGH">High — Urgent issue</option>
                    <option value="MEDIUM">Medium — Normal request</option>
                    <option value="LOW">Low — When convenient</option>
                  </select>
                </div>
                <button onClick={handleCreateIssue} className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 mt-4">Submit Request</button>
              </div>
              <p className="text-[10px] text-ink-400">Requests are sent to the board and/or property management. Response required within 14 days per DC Code § 42-1903.14(c).</p>
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
                    {isBoard && <button onClick={() => setCommIssueId(i.id)} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-50 text-accent-700 hover:bg-accent-100 border border-accent-200">New Communication</button>}
                    {isBoard && i.status !== 'CLOSED' && (() => {
                      const linkedCase = store.cases.find((c: any) => c.sourceId === i.id);
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
                  {/* Communications */}
                  {(i.comms || []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Communications</p>
                      {[...(i.comms as CaseComm[])].sort((a, b) => b.date.localeCompare(a.date)).map((cm: CaseComm) => {
                        const icons: Record<string, string> = { notice: '📢', response: '✉️', reminder: '⏰', violation: '⚠️', legal: '⚖️' };
                        return (
                          <div key={cm.id} className="bg-mist-50 rounded-lg p-2 border border-mist-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs">{icons[cm.type] || '📨'}</span>
                              <span className="text-[10px] font-bold text-ink-600">{cm.subject}</span>
                              <span className="text-[10px] text-ink-400">{cm.date} · via {cm.method}</span>
                            </div>
                            {cm.notes && <p className="text-xs text-ink-400 mt-0.5 ml-5">{cm.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ); })}
            {issues.length === 0 && <p className="text-sm text-ink-400 text-center py-8">No issues reported.</p>}
          </div>
          {commIssueId && <CommModal issueId={commIssueId} store={store} onClose={() => setCommIssueId(null)} />}
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
function WizardView({ onDone, onBack, prefill }: { onDone: (id: string) => void; onBack: () => void; prefill?: { source?: string; sourceId?: string; catId?: string; sitId?: string; title?: string; unit?: string; owner?: string; priority?: CasePriority; notes?: string } }) {
  const { createCase } = useIssuesStore();
  const { board: boardMembers } = useBuildingStore();
  const units = useFinancialStore(s => s.units);
  const [step, setStep] = useState(prefill?.catId && prefill?.sitId ? 2 : 1);
  const [catId, setCatId] = useState<string | null>(prefill?.catId || null);
  const [sitId, setSitId] = useState<string | null>(prefill?.sitId || null);
  const [approach, setApproach] = useState<CaseApproach>('pre');
  const [title, setTitle] = useState(prefill?.title || '');
  const [unit, setUnit] = useState(prefill?.unit || '');
  const [owner, setOwner] = useState(prefill?.owner || '');
  const [priority, setPriority] = useState<CasePriority>(prefill?.priority || 'medium');
  const [notes, setNotes] = useState(prefill?.notes || '');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedRole, setAssignedRole] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [source, setSource] = useState(prefill?.source || '');
  const [daciSuggested, setDaciSuggested] = useState(false);

  // Custom situation state
  const [isCustom, setIsCustom] = useState(false);
  const [customSitName, setCustomSitName] = useState('');
  const [customSitDesc, setCustomSitDesc] = useState('');
  const [customSteps, setCustomSteps] = useState<{ s: string; t: string; detail: string }[]>([{ s: '', t: '', detail: '' }]);

  const selCat = CATS.find(c => c.id === catId);
  const selSit = selCat?.sits.find(s => s.id === sitId);

  // DACI auto-assignment: when category changes, suggest the driver role
  useEffect(() => {
    if (!catId) return;
    const daci = DACI_MATRIX[catId];
    if (!daci) return;
    const driverMember = boardMembers.find(b => b.role === daci.driver);
    if (driverMember) {
      setAssignedTo(driverMember.name);
      setAssignedRole(driverMember.role);
      setDaciSuggested(true);
    }
  }, [catId, boardMembers]);

  const handleAssignedToChange = (name: string) => {
    setAssignedTo(name);
    const member = boardMembers.find(b => b.name === name);
    setAssignedRole(member?.role || '');
    setDaciSuggested(false);
  };

  const handleUnitChange = (unitNum: string) => {
    setUnit(unitNum);
    if (unitNum && unitNum !== 'Common') {
      const matched = units.find(u => u.number === unitNum);
      if (matched) setOwner(matched.owner);
    } else {
      setOwner('');
    }
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    if (isCustom) {
      const filteredSteps = customSteps.filter(cs => cs.s.trim());
      if (!customSitName.trim() || filteredSteps.length === 0) return;
      const customSitId = `custom-${Date.now()}`;
      const fullNotes = customSitDesc.trim() ? `[Custom: ${customSitDesc.trim()}]\n${notes}` : notes;
      const id = createCase({ catId: catId || 'general', sitId: customSitId, approach: 'pre', title, unit, owner, priority, notes: fullNotes, assignedTo: assignedTo || undefined, assignedRole: assignedRole || undefined, dueDate: dueDate || undefined, source: source || prefill?.source || undefined, sourceId: prefill?.sourceId || undefined, customSteps: filteredSteps.map(cs => ({ s: cs.s, ...(cs.t && { t: cs.t }), ...(cs.detail && { detail: cs.detail }) })) });
      onDone(id);
    } else {
      if (!catId || !sitId) return;
      const id = createCase({ catId, sitId, approach, title, unit, owner, priority, notes, assignedTo: assignedTo || undefined, assignedRole: assignedRole || undefined, dueDate: dueDate || undefined, source: source || prefill?.source || undefined, sourceId: prefill?.sourceId || undefined });
      onDone(id);
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Back to Dashboard</button>
      <h2 className="text-2xl font-bold text-ink-900">New Case</h2>
      {prefill?.sourceId && (
        <div className="inline-flex items-center gap-2 bg-accent-50 border border-accent-200 rounded-lg px-3 py-1.5">
          <span className="text-xs font-semibold text-accent-700">From {prefill.source === 'issue' ? `Request #${prefill.sourceId}` : `#${prefill.sourceId}`}</span>
        </div>
      )}
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
              <button key={cat.id} onClick={() => { setCatId(cat.id); setSitId(null); setIsCustom(false); }} className={`rounded-xl border-2 p-3 text-center transition-all ${catId === cat.id && !isCustom ? 'border-accent-400 bg-accent-50 shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                <span className="text-xl">{cat.icon}</span>
                <p className="text-xs font-semibold text-ink-700 mt-1">{cat.label}</p>
              </button>
            ))}
            <button onClick={() => { setIsCustom(true); setCatId(null); setSitId(null); }} className={`rounded-xl border-2 border-dashed p-3 text-center transition-all ${isCustom ? 'border-accent-400 bg-accent-50 shadow-sm' : 'border-ink-200 bg-white hover:border-ink-300'}`}>
              <span className="text-xl">+</span>
              <p className="text-xs font-semibold text-ink-700 mt-1">Custom</p>
            </button>
          </div>
          {selCat && (
            <>
              <p className="text-sm font-medium text-ink-600">Select situation type:</p>
              <div className="space-y-2">
                {selCat.sits.map(sit => (
                  <button key={sit.id} onClick={() => { setSitId(sit.id); setIsCustom(false); }} className={`w-full text-left rounded-xl border-2 p-4 transition-all ${sitId === sit.id && !isCustom ? 'border-accent-400 bg-accent-50' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
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
            <button onClick={() => (isCustom || (catId && sitId)) ? setStep(2) : undefined} className={`px-6 py-2.5 rounded-lg text-sm font-semibold ${(isCustom || (catId && sitId)) ? 'bg-ink-900 text-white hover:bg-ink-800 cursor-pointer' : 'bg-ink-100 text-ink-300 cursor-not-allowed'}`}>Next →</button>
          </div>
        </div>
      )}

      {step === 2 && !isCustom && (
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

      {step === 2 && isCustom && (
        <div className="space-y-4">
          <button onClick={() => setStep(1)} className="text-xs text-ink-400 hover:text-ink-600">← Back</button>
          <h3 className="text-lg font-semibold text-ink-800">2. Define your workflow</h3>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Situation Name *</label>
            <input value={customSitName} onChange={e => setCustomSitName(e.target.value)} placeholder="e.g., Pool renovation project" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Description</label>
            <textarea value={customSitDesc} onChange={e => setCustomSitDesc(e.target.value)} rows={2} placeholder="Brief description of this situation..." className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Category</label>
            <select value={catId || ''} onChange={e => setCatId(e.target.value || null)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
              <option value="">General (no category)</option>
              {CATS.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>)}
            </select>
            <p className="text-[10px] text-ink-400 mt-1">Used for DACI auto-assignment</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-2">Workflow Steps *</label>
            <div className="space-y-3">
              {customSteps.map((cs, idx) => (
                <div key={idx} className="border border-ink-100 rounded-lg p-3 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-400">Step {idx + 1}</span>
                    <div className="flex gap-1">
                      {idx > 0 && (
                        <button onClick={() => { const arr = [...customSteps]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; setCustomSteps(arr); }} className="text-xs text-ink-400 hover:text-ink-600 px-1">↑</button>
                      )}
                      {idx < customSteps.length - 1 && (
                        <button onClick={() => { const arr = [...customSteps]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; setCustomSteps(arr); }} className="text-xs text-ink-400 hover:text-ink-600 px-1">↓</button>
                      )}
                      {customSteps.length > 1 && (
                        <button onClick={() => setCustomSteps(customSteps.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-600 px-1">Remove</button>
                      )}
                    </div>
                  </div>
                  <input value={cs.s} onChange={e => { const arr = [...customSteps]; arr[idx] = { ...arr[idx], s: e.target.value }; setCustomSteps(arr); }} placeholder="Step description (required)" className="w-full px-3 py-1.5 border border-ink-200 rounded-lg text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={cs.t} onChange={e => { const arr = [...customSteps]; arr[idx] = { ...arr[idx], t: e.target.value }; setCustomSteps(arr); }} placeholder="Timing (e.g., Week 1)" className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs" />
                    <input value={cs.detail} onChange={e => { const arr = [...customSteps]; arr[idx] = { ...arr[idx], detail: e.target.value }; setCustomSteps(arr); }} placeholder="Detail / notes" className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs" />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setCustomSteps([...customSteps, { s: '', t: '', detail: '' }])} className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700">+ Add Step</button>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg text-sm font-semibold border border-ink-200 text-ink-600 hover:bg-ink-50">← Back</button>
            <button onClick={() => customSitName.trim() && customSteps.some(cs => cs.s.trim()) ? setStep(3) : undefined} className={`px-6 py-2.5 rounded-lg text-sm font-semibold ${customSitName.trim() && customSteps.some(cs => cs.s.trim()) ? 'bg-ink-900 text-white hover:bg-ink-800' : 'bg-ink-100 text-ink-300 cursor-not-allowed'}`}>Next →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <button onClick={() => setStep(2)} className="text-xs text-ink-400 hover:text-ink-600">← Back</button>
          <h3 className="text-lg font-semibold text-ink-800">3. Case details</h3>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Case Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g., Unit 502 — ${isCustom ? customSitName || 'Custom situation' : selSit?.title || 'Issue description'}`} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Unit #</label>
              <select value={unit} onChange={e => handleUnitChange(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="">Select unit...</option>
                <option value="Common">Common</option>
                {units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}
              </select>
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
          {/* Assignment fields */}
          <div className="border-t border-ink-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">Assignment</p>
            {daciSuggested && catId && DACI_MATRIX[catId] && (
              <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                <span className="text-base">🎯</span>
                <div>
                  <p className="text-xs font-semibold text-accent-800">DACI Auto-Assignment</p>
                  <p className="text-[11px] text-accent-600">Suggested <strong>{assignedTo}</strong> ({DACI_MATRIX[catId].driver}) as Driver for {selCat?.label || catId} cases</p>
                </div>
              </div>
            )}
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

// ─── Three-dot menu ────────────────────────────────────────
function ThreeDotMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-ink-100 py-1 min-w-[160px]">
            {items.map((item, i) => (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-mist-50 transition-colors ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-ink-700'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </>
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
  const navigate = useNavigate();
  const role = useAuthStore(s => s.currentUser.role);
  const isBoard = role !== 'RESIDENT';
  const c = store.cases.find(x => x.id === caseId);

  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showComposePanel, setShowComposePanel] = useState(false);
  const [composePanelContext, setComposePanelContext] = useState<ComposePanelContext | null>(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showApproachModal, setShowApproachModal] = useState(false);
  const [showWOModal, setShowWOModal] = useState(false);
  const [showLinkLetterModal, setShowLinkLetterModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showLinkInvoiceModal, setShowLinkInvoiceModal] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingModalTab, setMeetingModalTab] = useState<'link' | 'create'>('link');
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidTargetStep, setBidTargetStep] = useState<number | null>(null);
  const [showSendNotice, setShowSendNotice] = useState(false);
  const [noticeStepIdx, setNoticeStepIdx] = useState<number | null>(null);
  const [woForm, setWOForm] = useState({ title: '', vendor: '', amount: '', acctNum: '6050' });
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [assignForm, setAssignForm] = useState({ assignedTo: '', assignedRole: '', dueDate: '' });
  const [inlineStepIdx, setInlineStepIdx] = useState<number | null>(null);
  const [docTargetStep, setDocTargetStep] = useState<number | null>(null);
  const [voteTargetStep, setVoteTargetStep] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [activeApproachIdx, setActiveApproachIdx] = useState<number | null>(null);
  const [checkDocModal, setCheckDocModal] = useState<{ stepIdx: number; checkId: string; checkLabel: string; reportType: string | null } | null>(null);

  const buildingState = useBuildingStore(s => s.address.state);

  // Reset active step when navigating to a different case
  useEffect(() => { setActiveStep(0); setActiveApproachIdx(null); }, [caseId]);

  const ACTION_NAV: Record<string, { route: string; tab?: string }> = {
    'financial':            { route: '/financial' },
    'financial:dashboard':  { route: '/financial', tab: 'dashboard' },
    'financial:reserves':   { route: '/financial', tab: 'reserves' },
    'financial:budget':     { route: '/financial', tab: 'budget' },
    'financial:approvals':  { route: '/financial', tab: 'approvals' },
    'financial:workorders': { route: '/financial', tab: 'workorders' },
    'financial:ledger':     { route: '/financial', tab: 'ledger' },
  };

  const handleAction = (action: StepAction, stepIdx: number) => {
    if (action.type === 'navigate') {
      const nav = ACTION_NAV[action.target];
      if (nav) {
        if (c) {
          const step = c.steps?.[stepIdx];
          const stepTitle = step?.s || '';
          const phases = SITUATION_PHASES[c.sitId] || [];
          const stepPhaseId = step?.phaseId;
          const phaseIdx = stepPhaseId ? phases.findIndex(p => p.id === stepPhaseId) : -1;
          const phase = phaseIdx >= 0 ? phases[phaseIdx] : undefined;
          const phaseColor = phaseIdx >= 0 ? (PHASE_COLORS[phaseIdx % PHASE_COLORS.length]) : '#e53e3e';
          const steps = c.steps || [];
          const doneCount = steps.filter(s => s.done).length;
          const checksDone = step?.checks?.filter(ck => ck.checked).length || 0;
          const checksTotal = step?.checks?.length || 0;
          store.setActiveCaseContext({
            caseId: c.id,
            caseTitle: c.title,
            stepTitle,
            stepIdx,
            stepTiming: step?.t || undefined,
            returnPath: `/issues?view=case:${c.id}`,
            phaseLabel: phase?.label,
            phaseColor,
            progress: { done: doneCount, total: steps.length },
            stepProgress: checksTotal > 0 ? { done: checksDone, total: checksTotal } : undefined,
          });
        }
        if (nav.tab) fin.setActiveTab(nav.tab);
        navigate(nav.route);
      }
    } else if (action.type === 'modal') {
      if (action.target === 'create-wo' && c) {
        setWOForm({ title: c.title, vendor: '', amount: '', acctNum: '6050' });
        setShowWOModal(true);
      } else if (action.target === 'board-vote') {
        setVoteTargetStep(null);
        setShowVoteModal(true);
      } else if (action.target === 'owner-vote') {
        setVoteTargetStep(stepIdx);
        setShowVoteModal(true);
      } else if (action.target === 'send-comm') {
        // Open ComposePanel with case context for unified compose flow
        if (c) {
          const step = c.steps?.[stepIdx];
          setComposePanelContext({
            scope: 'unit',
            scopeLocked: true,
            recipientUnit: c.unit || undefined,
            recipientName: c.owner || undefined,
            caseId: c.id,
            stepIdx,
            caseLink: `Case ${c.id} · Step ${stepIdx + 1}`,
            source: 'case-workflow',
          });
          setShowComposePanel(true);
        }
      } else if (action.target === 'upload-doc') {
        setDocTargetStep(stepIdx);
        setShowDocModal(true);
      } else if (action.target === 'create-meeting') {
        setMeetingModalTab('create');
        setShowMeetingModal(true);
      } else if (action.target === 'link-meeting') {
        setMeetingModalTab('link');
        setShowMeetingModal(true);
      } else if (action.target === 'create-invoice') {
        setShowInvoiceModal(true);
      } else if (action.target === 'send-notice') {
        setNoticeStepIdx(stepIdx);
        setShowSendNotice(true);
      }
    } else if (action.type === 'inline') {
      setInlineStepIdx(inlineStepIdx === stepIdx ? null : stepIdx);
    }
  };

  // Clear floating widget when returning to this case (only on mount / caseId change)
  useEffect(() => {
    if (store.activeCaseContext?.caseId === caseId) {
      store.clearActiveCaseContext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  if (!c) return <div><button onClick={onBack} className="text-xs text-ink-400">← Back</button><p className="text-ink-400 mt-4">Case not found.</p></div>;

  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  const jurisdictionKey = buildingState === 'District of Columbia' ? 'DC' : buildingState;
  const stNote = sit?.notes?.[jurisdictionKey] || sit?.notes?.['_'] || '';

  const openAssignmentEditor = () => {
    setAssignForm({ assignedTo: c.assignedTo || '', assignedRole: c.assignedRole || '', dueDate: c.dueDate || '' });
    setEditingAssignment(true);
  };

  // Progress calculation (actions > checks > step-level)
  const steps = c.steps || [];
  let totalProgress = 0, doneProgress = 0;
  for (const step of steps) {
    if (step.actions && step.actions.length > 0) {
      totalProgress += step.actions.length;
      doneProgress += step.actions.filter(a => a.done).length;
    } else if (step.checks && step.checks.length > 0) {
      totalProgress += step.checks.length;
      doneProgress += step.checks.filter(ck => ck.checked).length;
    } else {
      totalProgress += 1;
      doneProgress += step.done ? 1 : 0;
    }
  }
  const pct = totalProgress > 0 ? Math.round((doneProgress / totalProgress) * 100) : 0;

  // Selection handlers
  const handleSelectPrimaryStep = (i: number) => { setActiveStep(i); setActiveApproachIdx(null); };
  const handleSelectAdditionalStep = (ai: number, si: number) => { setActiveApproachIdx(ai); setActiveStep(si); };

  // Clamp activeStep to valid range
  const safeStep = Math.max(0, Math.min(activeStep, steps.length - 1));
  const additionalApproaches = c.additionalApproaches || [];
  const isAdditionalActive = activeApproachIdx != null && additionalApproaches[activeApproachIdx];
  const currentStep = isAdditionalActive
    ? additionalApproaches[activeApproachIdx!].steps[Math.max(0, Math.min(activeStep, additionalApproaches[activeApproachIdx!].steps.length - 1))]
    : steps[safeStep];
  const currentStepIdx = isAdditionalActive
    ? Math.max(0, Math.min(activeStep, additionalApproaches[activeApproachIdx!].steps.length - 1))
    : safeStep;

  const stateAbbr = jurisdictionKey === 'DC' ? 'DC' : (buildingState || '');

  const handleAddNote = (idx: number) => {
    if (isAdditionalActive) {
      const existing = additionalApproaches[activeApproachIdx!].steps[idx]?.userNotes || '';
      const note = window.prompt('Step note:', existing);
      if (note !== null) store.addAdditionalStepNote(caseId, activeApproachIdx!, idx, note);
    } else {
      const existing = steps[idx]?.userNotes || '';
      const note = window.prompt('Step note:', existing);
      if (note !== null) store.addStepNote(caseId, idx, note);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case-${c.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Residents see simplified view
  if (c.steps && !isBoard) {
    return <OwnerCaseView c={c} onBack={onBack} />;
  }

  return (
    <div>
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-100 bg-white">
        <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Dashboard</button>
        <span className="text-ink-300 text-xs">·</span>
        <button onClick={() => onNav('cases')} className="text-xs text-ink-400 hover:text-ink-600">All Cases</button>
        <span className="text-ink-300 text-xs">·</span>
        <span className="text-xs text-ink-500 font-medium truncate">{c.title}</span>
      </div>

      {/* Two-column grid */}
      {c.steps && currentStep ? (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr' }}>
          {/* LEFT COLUMN — sticky, independent scroll */}
          <div
            className="border-r border-ink-200 bg-white overflow-y-auto"
            style={{ height: 'calc(100vh - 140px)', position: 'sticky', top: 140 }}
          >
            <BudgetTracker c={c} />
            <CaseHeader
              c={c}
              pct={pct}
              onAddApproach={() => setShowApproachModal(true)}
              onClose={() => setShowCloseModal(true)}
              onReopen={() => store.reopenCase(caseId)}
              onDelete={() => setShowDeleteModal(true)}
            />
            <StepList
              c={c}
              steps={steps}
              activeStep={isAdditionalActive ? activeStep : safeStep}
              onSelectStep={handleSelectPrimaryStep}
              onToggleAdditionalStep={(ai, si) => store.toggleAdditionalStep(caseId, ai, si)}
              onSelectAdditionalStep={handleSelectAdditionalStep}
              activeApproachIdx={activeApproachIdx}
            />
            <SideSections
              c={c}
              onUploadDoc={() => setShowDocModal(true)}
              onSendComm={() => {
                setComposePanelContext({
                  scope: c.unit ? 'unit' : 'community',
                  recipientUnit: c.unit || undefined,
                  recipientName: c.owner || undefined,
                  caseId: c.id,
                  caseLink: `Case ${c.id}`,
                  source: 'case-workflow',
                });
                setShowComposePanel(true);
              }}
              onRecordVote={() => setShowVoteModal(true)}
              onFiscalLens={() => navigate('/financial')}
              onExport={handleExport}
            />
          </div>

          {/* RIGHT COLUMN — independent scroll */}
          <div
            className="overflow-y-auto bg-ink-50"
            style={{ height: 'calc(100vh - 140px)' }}
          >
            <ShellStepHeader
              step={currentStep}
              stepNumber={currentStepIdx + 1}
              caseSitId={c.sitId}
              approachLabel={isAdditionalActive ? APPR_LABELS[additionalApproaches[activeApproachIdx!].approach] : undefined}
              approachColorClass={isAdditionalActive ? APPR_COLORS[additionalApproaches[activeApproachIdx!].approach] : undefined}
            />
            <StepContent
              c={c}
              step={currentStep}
              stepIndex={currentStepIdx}
              stNote={stNote}
              stateAbbr={stateAbbr}
              onToggleStep={(idx) => {
                if (isAdditionalActive) store.toggleAdditionalStep(caseId, activeApproachIdx!, idx);
                else store.toggleStep(caseId, idx);
              }}
              onAddNote={handleAddNote}
              onToggleAction={(actionId) => {
                if (isAdditionalActive) store.toggleAdditionalAction(caseId, activeApproachIdx!, currentStepIdx, actionId);
                else store.toggleAction(caseId, safeStep, actionId);
              }}
              onToggleCheck={(checkId) => {
                if (isAdditionalActive) store.toggleAdditionalCheck(caseId, activeApproachIdx!, currentStepIdx, checkId);
                else store.toggleCheck(caseId, safeStep, checkId);
              }}
              onAction={(action, stepIdx) => handleAction(action, stepIdx)}
              onNavigate={(target) => handleAction({ type: 'navigate', target, label: '' }, currentStepIdx)}
              onUpload={() => handleAction({ type: 'modal', target: 'upload-doc', label: '' }, currentStepIdx)}
              onGenerateCheckDoc={(checkId, reportType) => {
                const ck = currentStep.checks?.find(x => x.id === checkId);
                if (ck) setCheckDocModal({ stepIdx: currentStepIdx, checkId, checkLabel: getCleanLabel(ck.label), reportType });
              }}
              onUploadCheckDoc={(checkId) => {
                const ck = currentStep.checks?.find(x => x.id === checkId);
                if (ck) setCheckDocModal({ stepIdx: currentStepIdx, checkId, checkLabel: getCleanLabel(ck.label), reportType: null });
              }}
              inlineStepIdx={inlineStepIdx}
              caseId={caseId}
            />
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-ink-400">No workflow steps for this case.</div>
      )}

      {/* Modals */}
      {showVoteModal && <BoardVoteModal c={c} boardMembers={boardMembers} store={store} defaultMotion={voteTargetStep != null && c.steps?.[voteTargetStep] ? c.steps[voteTargetStep].s : undefined} onClose={() => { setShowVoteModal(false); setVoteTargetStep(null); }} />}
      {showCommModal && <CommModal caseId={caseId} store={store} catId={c.catId} sitId={c.sitId} onClose={() => setShowCommModal(false)} />}
      {showComposePanel && (
        <ComposePanel
          context={composePanelContext}
          onClose={() => { setShowComposePanel(false); setComposePanelContext(null); }}
        />
      )}
      {showDocModal && <DocModal caseId={caseId} store={store} stepIdx={docTargetStep} onClose={() => { setShowDocModal(false); setDocTargetStep(null); }} />}
      {showApproachModal && <ApproachModal c={c} store={store} onClose={() => setShowApproachModal(false)} />}
      {showLinkLetterModal && <LinkLetterModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowLinkLetterModal(false)} />}
      {showInvoiceModal && <InvoiceCreateModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowInvoiceModal(false)} />}
      {showLinkInvoiceModal && <LinkInvoiceModal caseId={caseId} caseUnit={c.unit} store={store} onClose={() => setShowLinkInvoiceModal(false)} />}
      {showMeetingModal && <LinkMeetingModal caseId={caseId} store={store} defaultTab={meetingModalTab} onClose={() => setShowMeetingModal(false)} />}
      {showHoldModal && <HoldCaseModal caseId={caseId} store={store} onClose={() => setShowHoldModal(false)} />}
      {showCloseModal && c.steps && <CloseCaseModal caseId={caseId} store={store} incompleteCount={c.steps.filter(s => !s.done).length} totalCount={c.steps.length} onClose={() => setShowCloseModal(false)} />}
      {showDeleteModal && <DeleteCaseModal caseId={caseId} store={store} onClose={() => setShowDeleteModal(false)} onDeleted={onBack} />}
      {checkDocModal && (
        <CheckItemDocModal
          checkLabel={checkDocModal.checkLabel}
          reportType={checkDocModal.reportType as any}
          unitNumber={c.unit}
          onAttach={(attachment) => {
            store.attachCheckDocument(caseId, checkDocModal.stepIdx, checkDocModal.checkId, attachment);
            setCheckDocModal(null);
          }}
          onClose={() => setCheckDocModal(null)}
        />
      )}
      {showBidModal && bidTargetStep != null && <AddBidModal caseId={caseId} stepIdx={bidTargetStep} store={store} onClose={() => { setShowBidModal(false); setBidTargetStep(null); }} />}
      {showSendNotice && c && (
        <SendNoticePanel
          caseId={caseId}
          caseData={c}
          stepIdx={noticeStepIdx}
          onClose={() => { setShowSendNotice(false); setNoticeStepIdx(null); }}
        />
      )}
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
