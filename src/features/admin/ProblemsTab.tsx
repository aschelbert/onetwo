import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type Stage = 'identified' | 'scoped' | 'designing' | 'building' | 'released';
type Priority = 'high' | 'medium' | 'low';

interface ProblemFraming {
  who: string;
  trying: string;
  obstacle: string;
  impact: string;
  hmw: string;
  scope: string;
  assumptions: string;
}

interface FeedbackRef {
  id: string;
  title: string;
  type: 'bug' | 'feature';
  votes: number;
}

interface DeployInfo {
  branch: string;
  status: 'open' | 'merged' | 'draft';
  sha: string;
  author: string;
}

interface Environment {
  name: string;
  status: 'deployed' | 'pending' | 'not_started';
  deployedAt?: string;
}

interface AssocRollout {
  id: string;
  status: 'live' | 'staged' | 'pending';
}

interface HistoryEntry {
  from: Stage | 'created';
  to: Stage;
  date: string;
  actor: string;
}

interface ProblemStatement {
  id: string;
  title: string;
  stage: Stage;
  owner: string;
  priority: Priority;
  feedbackIds: string[];
  linkedAssocs: string[];
  framing: ProblemFraming;
  hypothesis: string;
  notes: string;
  metrics: { label: string; done: boolean }[];
  deploy: { pr: DeployInfo | null; environments: Environment[]; rollout: AssocRollout[] };
  history: HistoryEntry[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = ['identified', 'scoped', 'designing', 'building', 'released'];
const STAGE_LABELS: Record<Stage, string> = { identified: 'Identified', scoped: 'Scoped', designing: 'Designing', building: 'Building', released: 'Released' };
const STAGE_COLORS: Record<Stage, string> = { identified: '#6b7280', scoped: '#d97706', designing: '#7c3aed', building: '#2563eb', released: '#059669' };
const PRIORITY_COLORS: Record<Priority, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-ink-100 text-ink-500' };

const ASSOC_MAP: Record<string, { name: string; plan: string; color: string; units: number }> = {
  a1: { name: '1302 R Street NW Condominium', plan: 'Compliance Pro', color: '#dc2626', units: 12 },
  a2: { name: 'Capitol Hill Terraces HOA', plan: 'Community Plus', color: '#2563eb', units: 48 },
  a3: { name: 'Dupont Circle Lofts', plan: 'Management Suite', color: '#7c3aed', units: 32 },
  a4: { name: 'Adams Morgan Commons', plan: 'Compliance Pro', color: '#dc2626', units: 24 },
};

const FEEDBACK_REF: Record<string, FeedbackRef> = {
  'F-001': { id: 'F-001', title: 'Reserve fund balance sync delay from General Ledger', type: 'bug', votes: 6 },
  'F-002': { id: 'F-002', title: 'PDF upload fails silently over 10MB', type: 'bug', votes: 4 },
  'F-003': { id: 'F-003', title: 'Live quorum count not updating for all participants', type: 'bug', votes: 8 },
  'F-004': { id: 'F-004', title: 'Email notification when quorum is reached', type: 'feature', votes: 12 },
  'F-005': { id: 'F-005', title: 'Vendor assignment on work order form not persisting', type: 'bug', votes: 3 },
  'F-006': { id: 'F-006', title: 'Recurring work order templates', type: 'feature', votes: 19 },
  'F-007': { id: 'F-007', title: 'Compliance grade breakdown — drill-down detail', type: 'feature', votes: 9 },
  'F-008': { id: 'F-008', title: 'Resident portal — maintenance request submission', type: 'feature', votes: 31 },
  'F-009': { id: 'F-009', title: 'Budget vs actuals comparison report', type: 'feature', votes: 14 },
  'F-010': { id: 'F-010', title: 'Bulk resident import via CSV', type: 'feature', votes: 7 },
};

const SEED_PROBLEMS: ProblemStatement[] = [
  {
    id: 'PS-001', title: 'Board meeting workflow is unreliable and error-prone', stage: 'building', owner: 'Maya R.', priority: 'high',
    feedbackIds: ['F-003', 'F-004', 'F-002'], linkedAssocs: ['a2', 'a1'],
    framing: { who: 'Board members running formal meetings', trying: 'Conduct quorum-verified votes and generate meeting records', obstacle: 'Quorum counts are unreliable and PDF uploads fail silently', impact: 'Invalid votes, missing documentation, legal exposure', hmw: 'How might we ensure board meetings produce reliable, auditable records?', scope: 'Board Room module — meeting lifecycle', assumptions: 'Boards meet monthly; quorum rules are per-bylaws' },
    hypothesis: 'Fixing real-time quorum tracking and file upload reliability will reduce meeting-related support tickets by 60%.',
    notes: 'Engineering spike completed. WebSocket approach validated for live counts.',
    metrics: [{ label: 'Support tickets reduced by 60%', done: false }, { label: 'Zero failed uploads in staging', done: true }, { label: 'Quorum accuracy 100% in test', done: true }],
    deploy: {
      pr: { branch: 'feat/board-meeting-reliability', status: 'open', sha: 'a3f2c91', author: 'Maya R.' },
      environments: [{ name: 'Staging', status: 'deployed', deployedAt: '2026-03-05' }, { name: 'Production', status: 'pending' }],
      rollout: [{ id: 'a2', status: 'staged' }, { id: 'a1', status: 'pending' }],
    },
    history: [{ from: 'created', to: 'identified', date: '2026-02-10', actor: 'Maya R.' }, { from: 'identified', to: 'scoped', date: '2026-02-14', actor: 'Maya R.' }, { from: 'scoped', to: 'designing', date: '2026-02-20', actor: 'Alex K.' }, { from: 'designing', to: 'building', date: '2026-03-01', actor: 'Maya R.' }],
  },
  {
    id: 'PS-002', title: 'Financial data consistency across Fiscal Lens modules', stage: 'scoped', owner: 'Alex K.', priority: 'high',
    feedbackIds: ['F-001', 'F-005', 'F-006', 'F-009'], linkedAssocs: ['a1', 'a3', 'a4'],
    framing: { who: 'Property managers and board treasurers', trying: 'View accurate financial data and manage work orders', obstacle: 'Reserve fund sync delays, vendor assignment bugs, and no recurring templates', impact: 'Financial misreporting, duplicated manual work, audit risk', hmw: 'How might we make Fiscal Lens a single source of truth for association finances?', scope: 'Fiscal Lens — GL sync, work orders, budgets', assumptions: 'Most associations reconcile monthly; work orders average 15/month' },
    hypothesis: 'Resolving data sync issues and adding work order templates will reduce manual reconciliation time by 40%.',
    notes: 'Scoping in progress. Need to audit GL sync pipeline.',
    metrics: [{ label: 'GL sync latency < 5 min', done: false }, { label: 'Work order templates adopted by 3+ assocs', done: false }, { label: 'Budget report accuracy verified', done: false }],
    deploy: { pr: null, environments: [{ name: 'Staging', status: 'not_started' }, { name: 'Production', status: 'not_started' }], rollout: [{ id: 'a1', status: 'pending' }, { id: 'a3', status: 'pending' }, { id: 'a4', status: 'pending' }] },
    history: [{ from: 'created', to: 'identified', date: '2026-02-12', actor: 'Alex K.' }, { from: 'identified', to: 'scoped', date: '2026-02-25', actor: 'Alex K.' }],
  },
  {
    id: 'PS-003', title: 'Resident self-service reduces operational burden on boards', stage: 'designing', owner: 'Sam L.', priority: 'medium',
    feedbackIds: ['F-008', 'F-010'], linkedAssocs: ['a2', 'a3', 'a1'],
    framing: { who: 'Residents needing to submit maintenance requests and board admins onboarding residents', trying: 'Enable self-service maintenance requests and bulk resident imports', obstacle: 'No resident-facing portal for requests; manual one-by-one resident entry', impact: 'High admin overhead, slow response to maintenance issues, resident frustration', hmw: 'How might we empower residents to self-serve while reducing board admin workload?', scope: 'Resident Portal — request submission + CSV import', assumptions: 'Average association has 30 residents; CSV format is standardized' },
    hypothesis: 'A resident portal with self-service maintenance requests will cut board admin time on request routing by 50%.',
    notes: 'Design mockups in progress. CSV parser spec drafted.',
    metrics: [{ label: 'Admin time on requests reduced 50%', done: false }, { label: 'CSV import success rate > 95%', done: false }],
    deploy: { pr: null, environments: [{ name: 'Staging', status: 'not_started' }, { name: 'Production', status: 'not_started' }], rollout: [{ id: 'a2', status: 'pending' }, { id: 'a3', status: 'pending' }, { id: 'a1', status: 'pending' }] },
    history: [{ from: 'created', to: 'identified', date: '2026-01-20', actor: 'Sam L.' }, { from: 'identified', to: 'scoped', date: '2026-02-05', actor: 'Sam L.' }, { from: 'scoped', to: 'designing', date: '2026-02-28', actor: 'Sam L.' }],
  },
  {
    id: 'PS-004', title: 'Compliance visibility gives boards confidence on governance obligations', stage: 'identified', owner: 'Unassigned', priority: 'medium',
    feedbackIds: ['F-007'], linkedAssocs: ['a2', 'a3'],
    framing: { who: 'Board members responsible for governance compliance', trying: 'Understand compliance grade breakdowns in detail', obstacle: 'Compliance score is a single number with no drill-down', impact: 'Boards lack visibility into what is driving their score, reducing trust', hmw: 'How might we make compliance scores transparent and actionable?', scope: 'Compliance module — grade detail view', assumptions: 'Compliance grades are updated weekly; boards review monthly' },
    hypothesis: 'Adding compliance grade drill-down will increase board engagement with compliance tools by 30%.',
    notes: '',
    metrics: [{ label: 'Compliance tool engagement up 30%', done: false }],
    deploy: { pr: null, environments: [{ name: 'Staging', status: 'not_started' }, { name: 'Production', status: 'not_started' }], rollout: [{ id: 'a2', status: 'pending' }, { id: 'a3', status: 'pending' }] },
    history: [{ from: 'created', to: 'identified', date: '2026-03-02', actor: 'Platform' }],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function ProblemsTab() {
  const [problems, setProblems] = useState<ProblemStatement[]>(SEED_PROBLEMS);
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'feedback' | 'metrics' | 'deploy' | 'history'>('overview');

  const detail = problems.find(p => p.id === detailId) || null;

  const openDetail = (id: string) => { setDetailId(id); setDetailTab('overview'); };

  const moveToNextStage = (ps: ProblemStatement) => {
    const idx = STAGES.indexOf(ps.stage);
    if (idx < STAGES.length - 1) {
      const nextStage = STAGES[idx + 1];
      setProblems(prev => prev.map(p => p.id === ps.id ? {
        ...p,
        stage: nextStage,
        history: [...p.history, { from: ps.stage, to: nextStage, date: new Date().toISOString().split('T')[0], actor: 'Admin' }],
      } : p));
    }
  };

  const stageCounts = STAGES.map(s => ({ stage: s, count: problems.filter(p => p.stage === s).length }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Problem Statements</h2>
          <p className="text-sm text-ink-500 mt-1">{problems.length} problem statements in the pipeline</p>
        </div>
        <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-0.5">
          <button onClick={() => setView('pipeline')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'pipeline' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
            Pipeline
          </button>
          <button onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'list' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
            List
          </button>
        </div>
      </div>

      {/* Stage summary strip */}
      <div className="grid grid-cols-5 gap-3">
        {stageCounts.map(({ stage, count }) => (
          <div key={stage} className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
            <div className="h-1" style={{ backgroundColor: STAGE_COLORS[stage] }} />
            <div className="p-3 text-center">
              <p className="text-xl font-display font-bold text-ink-900">{count}</p>
              <p className="text-[0.7rem] text-ink-500 font-medium capitalize">{STAGE_LABELS[stage]}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline view */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-5 gap-4 items-start">
          {STAGES.map(stage => (
            <div key={stage} className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                <span className="text-xs font-bold uppercase tracking-wide text-ink-600">{STAGE_LABELS[stage]}</span>
                <span className="text-[0.65rem] bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded-full font-semibold">{problems.filter(p => p.stage === stage).length}</span>
              </div>
              {problems.filter(p => p.stage === stage).map(ps => (
                <div key={ps.id} onClick={() => openDetail(ps.id)}
                  className="bg-white rounded-lg border border-ink-200 p-4 hover:shadow-md cursor-pointer transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[0.65rem] text-ink-400">{ps.id}</span>
                    <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[ps.priority]}`}>{ps.priority}</span>
                  </div>
                  <p className="text-sm font-semibold text-ink-900 mb-2 leading-snug">{ps.title}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {ps.linkedAssocs.map(a => (
                        <span key={a} className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSOC_MAP[a]?.color }} title={ASSOC_MAP[a]?.name} />
                      ))}
                    </div>
                    <span className="text-[0.65rem] text-ink-400">{ps.owner}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-ink-100">
                    <svg className="w-3 h-3 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                    <span className="text-[0.65rem] text-ink-400">{ps.feedbackIds.length} feedback</span>
                  </div>
                </div>
              ))}
              {problems.filter(p => p.stage === stage).length === 0 && (
                <div className="bg-ink-50 rounded-lg border border-dashed border-ink-200 p-4 text-center">
                  <p className="text-xs text-ink-400">No items</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-[10px] border border-ink-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase tracking-wide text-ink-500 font-semibold border-b-2 border-ink-200 bg-ink-50">
                <th className="px-5 py-2.5 w-24">ID</th>
                <th className="px-3 py-2.5">Title</th>
                <th className="px-3 py-2.5 w-28">Stage</th>
                <th className="px-3 py-2.5 w-24">Priority</th>
                <th className="px-3 py-2.5 w-28">Owner</th>
                <th className="px-3 py-2.5 w-24">Feedback</th>
                <th className="px-3 py-2.5">Associations</th>
              </tr>
            </thead>
            <tbody>
              {problems.map(ps => (
                <tr key={ps.id} className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer" onClick={() => openDetail(ps.id)}>
                  <td className="px-5 py-3 font-mono text-xs text-ink-500">{ps.id}</td>
                  <td className="px-3 py-3 font-medium text-ink-900">{ps.title}</td>
                  <td className="px-3 py-3">
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold text-white capitalize"
                      style={{ backgroundColor: STAGE_COLORS[ps.stage] }}>{STAGE_LABELS[ps.stage]}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[ps.priority]}`}>{ps.priority}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-600">{ps.owner}</td>
                  <td className="px-3 py-3 text-xs text-ink-500">{ps.feedbackIds.length} items</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {ps.linkedAssocs.map(a => (
                        <span key={a} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ASSOC_MAP[a]?.color }} title={ASSOC_MAP[a]?.name} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Detail slide-in panel ═══ */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDetailId(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[560px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-ink-200 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-400">{detail.id}</span>
                  <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[detail.priority]}`}>{detail.priority}</span>
                </div>
                <h3 className="font-display text-base font-bold text-ink-900 mt-1">{detail.title}</h3>
              </div>
              <button onClick={() => setDetailId(null)} className="text-ink-400 hover:text-ink-700 text-xl leading-none">&times;</button>
            </div>

            {/* Panel tabs */}
            <div className="px-6 border-b border-ink-200 flex gap-1 shrink-0">
              {(['overview', 'feedback', 'metrics', 'deploy', 'history'] as const).map(tab => (
                <button key={tab} onClick={() => setDetailTab(tab)}
                  className={`px-3 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px ${
                    detailTab === tab ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'
                  }`}>{tab}</button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ─── Overview Tab ─── */}
              {detailTab === 'overview' && (
                <div className="space-y-5">
                  {/* Stage progress track */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-3">Stage Progress</p>
                    <div className="flex items-center gap-1">
                      {STAGES.map((s, i) => {
                        const currentIdx = STAGES.indexOf(detail.stage);
                        const isPast = i < currentIdx;
                        const isCurrent = i === currentIdx;
                        return (
                          <div key={s} className="flex-1">
                            <div className="h-2 rounded-full" style={{
                              backgroundColor: isPast || isCurrent ? STAGE_COLORS[s] : '#e5e7eb',
                              opacity: isPast ? 0.5 : 1,
                            }} />
                            <p className={`text-[0.6rem] mt-1 capitalize text-center ${isCurrent ? 'font-bold text-ink-900' : 'text-ink-400'}`}>{STAGE_LABELS[s]}</p>
                          </div>
                        );
                      })}
                    </div>
                    {STAGES.indexOf(detail.stage) < STAGES.length - 1 && (
                      <button onClick={() => moveToNextStage(detail)}
                        className="mt-3 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 w-full">
                        Move to {STAGE_LABELS[STAGES[STAGES.indexOf(detail.stage) + 1]]} &rarr;
                      </button>
                    )}
                  </div>

                  {/* Problem Framing */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-3">Problem Framing</p>
                    <div className="space-y-3">
                      {([
                        { key: 'who', label: 'Who', required: true },
                        { key: 'trying', label: 'Trying to', required: true },
                        { key: 'obstacle', label: 'Obstacle', required: true },
                        { key: 'impact', label: 'Impact', required: true },
                        { key: 'hmw', label: 'How Might We', required: true },
                        { key: 'scope', label: 'Scope', required: false },
                        { key: 'assumptions', label: 'Assumptions', required: false },
                      ] as const).map(field => (
                        <div key={field.key} className="bg-ink-50 rounded-lg px-4 py-3">
                          <p className="text-[0.65rem] font-semibold text-ink-500 uppercase mb-0.5">
                            {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                          </p>
                          <p className="text-sm text-ink-800">{detail.framing[field.key] || <span className="text-ink-300 italic">Not defined</span>}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hypothesis */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Hypothesis</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                      <p className="text-sm text-blue-900">{detail.hypothesis || <span className="text-blue-300 italic">No hypothesis defined</span>}</p>
                    </div>
                  </div>

                  {/* Affected Associations */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Affected Associations</p>
                    <div className="space-y-2">
                      {detail.linkedAssocs.map(a => (
                        <div key={a} className="flex items-center gap-2.5 bg-ink-50 rounded-lg px-3 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ASSOC_MAP[a]?.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink-800 truncate">{ASSOC_MAP[a]?.name}</p>
                            <p className="text-[0.65rem] text-ink-400">{ASSOC_MAP[a]?.plan} · {ASSOC_MAP[a]?.units} units</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Owner */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Owner</p>
                    <p className="text-sm text-ink-800 font-medium">{detail.owner}</p>
                  </div>

                  {/* Internal Notes */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Internal Notes</p>
                    <div className="bg-ink-50 rounded-lg px-4 py-3">
                      <p className="text-sm text-ink-700">{detail.notes || <span className="text-ink-300 italic">No notes</span>}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Feedback Tab ─── */}
              {detailTab === 'feedback' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Linked Feedback ({detail.feedbackIds.length})</p>
                  {detail.feedbackIds.map(fid => {
                    const fb = FEEDBACK_REF[fid];
                    if (!fb) return null;
                    return (
                      <div key={fid} className="bg-white border border-ink-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-xs text-ink-400">{fb.id}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${
                              fb.type === 'bug' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}>{fb.type}</span>
                            <span className="text-xs text-ink-500 font-semibold">{fb.votes} votes</span>
                          </div>
                        </div>
                        <p className="text-sm text-ink-900 font-medium">{fb.title}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Metrics Tab ─── */}
              {detailTab === 'metrics' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Success Criteria</p>
                  {detail.metrics.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 bg-ink-50 rounded-lg px-4 py-3">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                        m.done ? 'bg-sage-600 border-sage-600' : 'border-ink-300'
                      }`}>
                        {m.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className={`text-sm ${m.done ? 'text-ink-500 line-through' : 'text-ink-800'}`}>{m.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Deploy Tab ─── */}
              {detailTab === 'deploy' && (
                <div className="space-y-5">
                  {/* PR Info */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Pull Request</p>
                    {detail.deploy.pr ? (
                      <div className="bg-white border border-ink-200 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Branch</p><p className="font-mono text-xs text-ink-700">{detail.deploy.pr.branch}</p></div>
                          <div><p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Status</p>
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                              detail.deploy.pr.status === 'merged' ? 'bg-purple-100 text-purple-700' : detail.deploy.pr.status === 'open' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'
                            }`}>{detail.deploy.pr.status}</span>
                          </div>
                          <div><p className="text-[0.65rem] text-ink-400 uppercase font-semibold">SHA</p><p className="font-mono text-xs text-ink-500">{detail.deploy.pr.sha}</p></div>
                          <div><p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Author</p><p className="text-xs text-ink-700">{detail.deploy.pr.author}</p></div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-ink-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-ink-400">No PR created yet</p>
                      </div>
                    )}
                  </div>

                  {/* Environments */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Environments</p>
                    <div className="space-y-2">
                      {detail.deploy.environments.map(env => (
                        <div key={env.name} className="flex items-center justify-between bg-white border border-ink-200 rounded-lg px-4 py-3">
                          <span className="text-sm font-medium text-ink-800">{env.name}</span>
                          <div className="flex items-center gap-2">
                            {env.deployedAt && <span className="text-[0.65rem] text-ink-400">{env.deployedAt}</span>}
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                              env.status === 'deployed' ? 'bg-sage-100 text-sage-700' : env.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'
                            }`}>{env.status === 'not_started' ? 'Not Started' : env.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Association Rollout */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Association Rollout</p>
                    <div className="space-y-2">
                      {detail.deploy.rollout.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-white border border-ink-200 rounded-lg px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ASSOC_MAP[r.id]?.color }} />
                            <span className="text-sm font-medium text-ink-800">{ASSOC_MAP[r.id]?.name}</span>
                          </div>
                          <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                            r.status === 'live' ? 'bg-sage-100 text-sage-700' : r.status === 'staged' ? 'bg-blue-100 text-blue-700' : 'bg-ink-100 text-ink-500'
                          }`}>{r.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── History Tab ─── */}
              {detailTab === 'history' && (
                <div className="space-y-0">
                  <p className="text-xs font-semibold text-ink-400 uppercase mb-3">Stage Transition Timeline</p>
                  {detail.history.map((h, i) => (
                    <div key={i} className="flex gap-3">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full border-2 shrink-0"
                          style={{ borderColor: STAGE_COLORS[h.to], backgroundColor: i === detail.history.length - 1 ? STAGE_COLORS[h.to] : 'white' }} />
                        {i < detail.history.length - 1 && <div className="w-0.5 flex-1 bg-ink-200 my-1" />}
                      </div>
                      {/* Content */}
                      <div className="pb-4">
                        <p className="text-sm font-medium text-ink-900">
                          {h.from === 'created' ? 'Created' : <><span className="capitalize">{h.from}</span> &rarr;</>} <span className="capitalize" style={{ color: STAGE_COLORS[h.to] }}>{STAGE_LABELS[h.to]}</span>
                        </p>
                        <p className="text-[0.72rem] text-ink-400">{h.date} · {h.actor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
