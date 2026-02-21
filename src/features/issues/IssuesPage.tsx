import { useState } from 'react';
import { useIssuesStore, CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CaseCard, BoardVoteDisplay, StepsSection } from './components/CaseComponents';
import { BoardVoteModal, CommModal, DocModal, ApproachModal } from './components/CaseModals';
import type { CaseApproach, CasePriority } from '@/types/issues';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function IssuesPage() {
  const { cases, issues } = useIssuesStore();
  const [view, setView] = useState<string>('dashboard');
  const role = useAuthStore(s => s.currentUser.role);
  const isBoard = role !== 'RESIDENT';

  if (view === 'new') return <WizardView onDone={(id) => setView(`case:${id}`)} onBack={() => setView('dashboard')} />;
  if (view.startsWith('case:')) return <CaseDetail caseId={view.split(':')[1]} onBack={() => setView('dashboard')} onNav={setView} />;
  if (view === 'cases') return <CaseList onNav={setView} />;
  if (view === 'issues') return <IssuesList onBack={() => setView('dashboard')} />;

  // Dashboard
  const open = cases.filter(c => c.status === 'open');
  const urgent = open.filter(c => c.priority === 'urgent');
  const high = open.filter(c => c.priority === 'high');
  const closed = cases.filter(c => c.status === 'closed');

  return (
    <div className="space-y-5">
      {/* Header container */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{isBoard ? '📋 Case Ops' : 'Issues & Cases'}</h2>
            <p className="text-accent-200 text-sm mt-1">Track situations, enforce compliance, manage disputes</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('cases')} className="px-4 py-2 bg-white bg-opacity-10 border border-white border-opacity-20 text-white rounded-lg text-sm font-medium hover:bg-opacity-20">All Cases</button>
            <button onClick={() => setView('issues')} className="px-4 py-2 bg-white bg-opacity-10 border border-white border-opacity-20 text-white rounded-lg text-sm font-medium hover:bg-opacity-20">Issues Board</button>
            {isBoard && <button onClick={() => setView('new')} className="px-4 py-2 bg-white text-ink-900 rounded-lg text-sm font-medium hover:bg-accent-100">＋ New Case</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { val: open.length, label: 'Open Cases', icon: '📂', border: 'border-white border-opacity-20' },
            { val: urgent.length, label: 'Urgent', icon: '🔴', border: urgent.length > 0 ? 'border-red-400 border-opacity-50' : 'border-white border-opacity-10' },
            { val: high.length, label: 'High Priority', icon: '🟠', border: high.length > 0 ? 'border-orange-400 border-opacity-50' : 'border-white border-opacity-10' },
            { val: closed.length, label: 'Closed', icon: '✅', border: 'border-white border-opacity-20' },
          ].map(s => (
            <div key={s.label} className={`bg-white bg-opacity-10 backdrop-blur-sm rounded-xl border ${s.border} p-4`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{s.icon}</span>
                <span className="text-2xl font-bold text-white">{s.val}</span>
              </div>
              <p className="text-xs text-accent-200">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick start categories */}
      {isBoard && (
        <div className="bg-white rounded-xl border border-ink-100 p-5">
          <h3 className="text-lg font-semibold text-ink-800 mb-3">Quick Start</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CATS.map(cat => (
              <button key={cat.id} onClick={() => setView('new')} className="bg-white rounded-xl border border-ink-100 p-3 text-center hover:border-accent-300 transition-all">
                <span className="text-2xl">{cat.icon}</span>
                <p className="text-xs font-semibold text-ink-700 mt-1">{cat.label}</p>
                <p className="text-[10px] text-ink-400">{cat.sits.length} types</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Open cases */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <h3 className="text-lg font-semibold text-ink-800 mb-3">Open Cases</h3>
        {open.length === 0 ? (
          <p className="text-sm text-ink-400 py-4 text-center">No open cases.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {open.map(c => <CaseCard key={c.id} c={c} onClick={() => setView(`case:${c.id}`)} />)}
          </div>
        )}
      </div>

      {/* Recent issues */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-ink-800">Recent Issues</h3>
          <button onClick={() => setView('issues')} className="text-xs text-accent-600 hover:text-accent-700 font-medium">View all →</button>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-4">No issues reported.</p>
        ) : (
          <div className="space-y-2">
            {issues.slice(0, 5).map(i => (
              <div key={i.id} className="flex items-center justify-between p-3 bg-mist-50 rounded-lg border border-mist-100">
                <div>
                  <p className="text-sm font-medium text-ink-900">{i.title}</p>
                  <p className="text-xs text-ink-400">{i.category} · {i.submittedDate} · {i.upvotes.length} upvotes</p>
                </div>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${i.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' : i.status === 'IN_PROGRESS' ? 'bg-accent-100 text-accent-700' : 'bg-sage-100 text-sage-700'}`}>{i.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Case List ─────────────────────────────────────────────
function CaseList({ onNav }: { onNav: (v: string) => void }) {
  const { cases } = useIssuesStore();
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const filtered = filter === 'all' ? cases : cases.filter(c => c.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => onNav('dashboard')} className="text-xs text-ink-400 hover:text-ink-600">← Dashboard</button>
          <h2 className="text-2xl font-bold text-ink-900">All Cases</h2>
        </div>
        <div className="flex gap-2">
          {(['all', 'open', 'closed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filter === f ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-500 hover:border-ink-300'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={() => onNav('new')} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">＋ New Case</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-400 text-center py-8">No cases match this filter.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => <CaseCard key={c.id} c={c} onClick={() => onNav(`case:${c.id}`)} />)}
        </div>
      )}
    </div>
  );
}

// ─── Issues Board ──────────────────────────────────────────
function IssuesList({ onBack }: { onBack: () => void }) {
  const { issues, addIssue, upvoteIssue, updateIssueStatus } = useIssuesStore();
  const user = useAuthStore(s => s.currentUser);
  const isBoard = user.role !== 'RESIDENT';
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('Maintenance');
  const [prio, setPrio] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');

  const handleCreate = () => {
    if (!title.trim()) return;
    addIssue({
      type: 'BUILDING_PUBLIC', category: cat, priority: prio, status: 'SUBMITTED',
      title, description: desc,
      reportedBy: user.id, reporterName: user.name, reporterEmail: user.email,
      unitNumber: user.linkedUnits?.[0] || '', submittedDate: new Date().toISOString().split('T')[0]
    });
    setTitle(''); setDesc(''); setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Dashboard</button>
          <h2 className="text-2xl font-bold text-ink-900">Issues Board</h2>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
          {showCreate ? 'Cancel' : '＋ Report Issue'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-ink-100 p-5 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description..." rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          <div className="flex gap-3 flex-wrap">
            <select value={cat} onChange={e => setCat(e.target.value)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
              {['Maintenance', 'Safety', 'Noise', 'Common Area', 'Parking', 'Other'].map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={prio} onChange={e => setPrio(e.target.value as any)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
              <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
            </select>
            <button onClick={handleCreate} className="px-6 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">Submit</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {issues.map(i => (
          <div key={i.id} className="bg-white rounded-xl border border-ink-100 p-4">
            <div className="flex items-start gap-3">
              <button onClick={() => upvoteIssue(i.id, user.id, user.name, user.linkedUnits?.[0] || '')} className="flex flex-col items-center shrink-0 mt-1">
                <span className={`text-lg ${i.upvotes.find(u => u.userId === user.id) ? 'text-accent-500' : 'text-ink-300'}`}>▲</span>
                <span className="text-xs font-bold text-ink-500">{i.upvotes.length}</span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${i.priority === 'HIGH' ? 'bg-red-100 text-red-700' : i.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>{i.priority}</span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{i.category}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${i.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-700' : i.status === 'IN_PROGRESS' ? 'bg-accent-100 text-accent-700' : 'bg-sage-100 text-sage-700'}`}>{i.status.replace('_', ' ')}</span>
                </div>
                <p className="text-sm font-semibold text-ink-900 mt-1">{i.title}</p>
                <p className="text-xs text-ink-400 mt-0.5">{i.description}</p>
                <p className="text-[11px] text-ink-300 mt-1">Reported by {i.reporterName} · {i.submittedDate} · {i.viewCount} views</p>
                {isBoard && (
                  <div className="flex gap-1 mt-2">
                    {(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map(st => (
                      <button key={st} onClick={() => updateIssueStatus(i.id, st)} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${i.status === st ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-400 hover:bg-ink-100'}`}>
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Creation Wizard ───────────────────────────────────────
function WizardView({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const { createCase } = useIssuesStore();
  const [step, setStep] = useState(1);
  const [catId, setCatId] = useState<string | null>(null);
  const [sitId, setSitId] = useState<string | null>(null);
  const [approach, setApproach] = useState<CaseApproach>('pre');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState<CasePriority>('medium');
  const [notes, setNotes] = useState('');

  const selCat = CATS.find(c => c.id === catId);
  const selSit = selCat?.sits.find(s => s.id === sitId);

  const handleCreate = () => {
    if (!catId || !sitId || !title.trim()) return;
    const id = createCase({ catId, sitId, approach, title, unit, owner, priority, notes });
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
  const { workOrders } = useFinancialStore();
  const c = store.cases.find(x => x.id === caseId);

  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showApproachModal, setShowApproachModal] = useState(false);

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
          <button onClick={() => setShowCommModal(true)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800">✉ Send</button>
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
      </div>

      {/* Linked Work Orders */}
      <div className="bg-white rounded-xl border border-ink-100 p-5">
        <h3 className="text-lg font-semibold text-ink-800 mb-4">Financials</h3>
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
        ) : <p className="text-sm text-ink-400 py-4 text-center">No work orders linked.</p>}
      </div>

      {/* Modals */}
      {showVoteModal && <BoardVoteModal c={c} boardMembers={boardMembers} store={store} onClose={() => setShowVoteModal(false)} />}
      {showCommModal && <CommModal caseId={caseId} store={store} onClose={() => setShowCommModal(false)} />}
      {showDocModal && <DocModal caseId={caseId} store={store} onClose={() => setShowDocModal(false)} />}
      {showApproachModal && <ApproachModal c={c} store={store} onClose={() => setShowApproachModal(false)} />}
    </div>
  );
}
