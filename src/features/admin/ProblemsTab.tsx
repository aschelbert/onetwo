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
}

interface DesignLink {
  title: string;
  url: string;
  status: 'ready' | 'in_progress' | 'archived';
  addedBy: string;
  addedAt: string;
}

interface IdeationItem {
  text: string;
  author: string;
  votes: number;
  date: string;
}

interface CollabComment {
  author: string;
  text: string;
  timestamp: string;
}

interface FeedbackRef {
  id: string;
  title: string;
  type: 'bug' | 'feature';
  votes: number;
}

interface PRInfo {
  branch: string;
  number: number;
  title: string;
  status: 'open' | 'merged' | 'draft';
  sha: string;
  author: string;
  mergedAt?: string;
}

interface Environment {
  name: string;
  status: 'deployed' | 'deploying' | 'pending' | 'not_started';
  url?: string;
  sha?: string;
  deployedAt?: string;
}

interface AssocRollout {
  id: string;
  status: 'live' | 'staged' | 'pending' | 'failed';
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
  assumptions: string;
  dependencies: string;
  outOfScope: string;
  successMetrics: string[];
  notes: string;
  solution: {
    designs: DesignLink[];
    ideation: IdeationItem[];
    collab: CollabComment[];
  };
  deploy: { pr: PRInfo | null; environments: Environment[]; rollout: AssocRollout[] };
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
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

const DESIGN_STATUS_LABELS: Record<string, string> = { ready: 'Ready for review', in_progress: 'In progress', archived: 'Archived' };
const DESIGN_STATUS_COLORS: Record<string, string> = { ready: '#059669', in_progress: '#d97706', archived: '#9ca3af' };

const SEED_PROBLEMS: ProblemStatement[] = [
  {
    id: 'PS-001', title: 'Board meeting workflow is unreliable and error-prone', stage: 'building', owner: 'Maya R.', priority: 'high',
    feedbackIds: ['F-003', 'F-004', 'F-002'], linkedAssocs: ['a2', 'a1'],
    framing: {
      who: 'Board members and HOA presidents',
      trying: 'Run legally compliant board meetings with accurate quorum counts and on-record documents',
      obstacle: 'Live quorum tracking freezes mid-meeting and documents over 10MB fail to upload silently',
      impact: 'Boards lose confidence in the platform mid-meeting and risk procedural invalidity if quorum records are wrong',
      hmw: 'How might we make board meetings run reliably enough that boards forget the platform is even there?',
    },
    hypothesis: 'Fixing real-time quorum tracking and file upload reliability will reduce meeting-related support tickets by 60%.',
    assumptions: 'Board members are on a mix of desktop and mobile. Safari compatibility is a known gap. Meetings are typically 60-90 minutes with 5-15 participants.',
    dependencies: 'WebSocket infrastructure stability (Platform team). Document storage limits (Infra). Safari WebRTC compatibility audit (Engineering).',
    outOfScope: 'Voting and resolutions workflow. Minutes approval process. Post-meeting distribution of documents.',
    successMetrics: ['Meeting completion rate > 95%', 'Support threads re: meetings < 2/mo', 'Quorum tracking accuracy 100%'],
    notes: 'Engineering spike completed. WebSocket approach validated for live counts.',
    solution: {
      designs: [
        { title: 'Quorum tracker redesign', url: 'https://figma.com/file/abc123', status: 'ready', addedBy: 'Maya R.', addedAt: '2026-02-22' },
        { title: 'Document upload error states', url: 'https://figma.com/file/def456', status: 'in_progress', addedBy: 'Maya R.', addedAt: '2026-02-28' },
      ],
      ideation: [
        { text: 'Show reconnecting overlay instead of silently freezing', author: 'Sam L.', votes: 3, date: '2026-02-18' },
        { text: 'Optimistic UI for quorum — update locally and reconcile with server', author: 'Alex K.', votes: 5, date: '2026-02-19' },
        { text: 'Chunked upload for documents to make failures recoverable', author: 'Maya R.', votes: 4, date: '2026-02-20' },
      ],
      collab: [
        { author: 'Maya R.', text: 'Engineering sync confirmed: WebSocket race is reproducible in staging. Alex is picking up chunked upload.', timestamp: '2026-03-01T10:30:00' },
        { author: 'Alex K.', text: 'Chunked upload PR is up. Quorum WebSocket fix needs QA pass on Safari.', timestamp: '2026-03-03T14:15:00' },
        { author: 'Sam L.', text: 'Design review done. Edge case: what happens to quorum count if a participant loses connection mid-meeting?', timestamp: '2026-03-04T09:45:00' },
      ],
    },
    deploy: {
      pr: { branch: 'fix/board-meeting-workflow', number: 247, title: 'Fix board meeting workflow reliability', status: 'merged', sha: 'a3f2c91', author: 'Maya R.', mergedAt: '2026-03-05' },
      environments: [
        { name: 'Staging', status: 'deployed', url: 'staging.getonetwo.com', sha: 'a3f2c91', deployedAt: '2026-03-05T14:30:00' },
        { name: 'Production', status: 'deploying', url: 'app.getonetwo.com', sha: 'a3f2c91' },
      ],
      rollout: [{ id: 'a2', status: 'live' }, { id: 'a1', status: 'live' }],
    },
    history: [
      { from: 'created', to: 'identified', date: '2026-02-10', actor: 'Maya R.' },
      { from: 'identified', to: 'scoped', date: '2026-02-14', actor: 'Maya R.' },
      { from: 'scoped', to: 'designing', date: '2026-02-20', actor: 'Alex K.' },
      { from: 'designing', to: 'building', date: '2026-03-01', actor: 'Maya R.' },
    ],
    createdAt: '2026-02-10', updatedAt: '2026-03-05',
  },
  {
    id: 'PS-002', title: 'Financial data consistency across Fiscal Lens modules', stage: 'scoped', owner: 'Alex K.', priority: 'high',
    feedbackIds: ['F-001', 'F-005', 'F-006', 'F-009'], linkedAssocs: ['a1', 'a3', 'a4'],
    framing: {
      who: 'Property managers and board treasurers',
      trying: 'View accurate financial data and manage work orders',
      obstacle: 'Reserve fund sync delays, vendor assignment bugs, and no recurring templates',
      impact: 'Financial misreporting, duplicated manual work, audit risk',
      hmw: 'How might we make Fiscal Lens a single source of truth for association finances?',
    },
    hypothesis: 'Resolving data sync issues and adding work order templates will reduce manual reconciliation time by 40%.',
    assumptions: 'Some associations have external accountants who export data — export integrity matters as much as in-app display.',
    dependencies: 'Data pipeline team for eventual consistency fix. Stripe billing module (read-only access for reconciliation).',
    outOfScope: 'Stripe billing and payment processing. Multi-association consolidated reporting. Tax filing integrations.',
    successMetrics: ['GL sync latency < 5 min', 'Work order templates adopted by 3+ assocs', 'Budget report accuracy verified'],
    notes: 'Scoping in progress. Need to audit GL sync pipeline.',
    solution: {
      designs: [],
      ideation: [
        { text: 'Event-sourced ledger — derive balances from immutable event log', author: 'Alex K.', votes: 6, date: '2026-02-26' },
        { text: 'Reconciliation dashboard to surface discrepancies before board meetings', author: 'Sam L.', votes: 2, date: '2026-02-27' },
      ],
      collab: [
        { author: 'Alex K.', text: 'Scoping session done. Sync delay is 2-5 minutes worst case. Need write-through cache layer for real-time views.', timestamp: '2026-02-25T11:00:00' },
      ],
    },
    deploy: {
      pr: { branch: 'fix/fiscal-lens-consistency', number: 251, title: 'Fix fiscal lens data consistency', status: 'open', sha: 'b4e1d82', author: 'Alex K.' },
      environments: [
        { name: 'Staging', status: 'deployed', url: 'staging.getonetwo.com', sha: 'b4e1d82', deployedAt: '2026-03-04T09:00:00' },
        { name: 'Production', status: 'not_started' },
      ],
      rollout: [{ id: 'a1', status: 'pending' }, { id: 'a3', status: 'pending' }, { id: 'a4', status: 'pending' }],
    },
    history: [
      { from: 'created', to: 'identified', date: '2026-02-12', actor: 'Alex K.' },
      { from: 'identified', to: 'scoped', date: '2026-02-25', actor: 'Alex K.' },
    ],
    createdAt: '2026-02-12', updatedAt: '2026-03-04',
  },
  {
    id: 'PS-003', title: 'Resident self-service reduces operational burden on boards', stage: 'designing', owner: 'Sam L.', priority: 'medium',
    feedbackIds: ['F-008', 'F-010'], linkedAssocs: ['a2', 'a3', 'a1'],
    framing: {
      who: 'Residents needing to submit maintenance requests and board admins onboarding residents',
      trying: 'Enable self-service maintenance requests and bulk resident imports',
      obstacle: 'No resident-facing portal for requests; manual one-by-one resident entry',
      impact: 'High admin overhead, slow response to maintenance issues, resident frustration',
      hmw: 'How might we empower residents to self-serve while reducing board admin workload?',
    },
    hypothesis: 'A resident portal with self-service maintenance requests will cut board admin time on request routing by 50%.',
    assumptions: 'Residents are less technically sophisticated than board members. Mobile-first is essential. Targeting 60% adoption in year one.',
    dependencies: 'Authentication system: resident invite flow. Role system: Resident role permissions. Board Room: read access to community documents.',
    outOfScope: 'Resident payments and dues. Voting and elections for residents. Direct messaging between residents.',
    successMetrics: ['Admin time on requests reduced 50%', 'CSV import success rate > 95%'],
    notes: 'Design mockups in progress. CSV parser spec drafted.',
    solution: {
      designs: [
        { title: 'Resident portal — maintenance request flow', url: 'https://figma.com/file/ghi789', status: 'in_progress', addedBy: 'Sam L.', addedAt: '2026-03-01' },
      ],
      ideation: [
        { text: 'Progressive disclosure onboarding — show residents only features they need on first login', author: 'Sam L.', votes: 4, date: '2026-02-28' },
        { text: 'Photo upload on maintenance requests', author: 'Maya R.', votes: 7, date: '2026-03-02' },
      ],
      collab: [
        { author: 'Sam L.', text: 'Kicked off design sprint. Starting with maintenance request as anchor flow.', timestamp: '2026-02-28T15:00:00' },
        { author: 'Maya R.', text: 'First wireframes in Figma. Question: show residents the board response timeline or keep opaque?', timestamp: '2026-03-02T10:30:00' },
      ],
    },
    deploy: {
      pr: { branch: 'feat/resident-portal', number: 255, title: 'Resident self-service portal', status: 'open', sha: 'c5f3a73', author: 'Sam L.' },
      environments: [
        { name: 'Staging', status: 'not_started' },
        { name: 'Production', status: 'not_started' },
      ],
      rollout: [],
    },
    history: [
      { from: 'created', to: 'identified', date: '2026-01-20', actor: 'Sam L.' },
      { from: 'identified', to: 'scoped', date: '2026-02-05', actor: 'Sam L.' },
      { from: 'scoped', to: 'designing', date: '2026-02-28', actor: 'Sam L.' },
    ],
    createdAt: '2026-01-20', updatedAt: '2026-03-02',
  },
  {
    id: 'PS-004', title: 'Compliance visibility gives boards confidence on governance obligations', stage: 'identified', owner: 'Unassigned', priority: 'medium',
    feedbackIds: ['F-007'], linkedAssocs: ['a2', 'a3'],
    framing: {
      who: 'Board members responsible for governance compliance',
      trying: 'Understand compliance grade breakdowns in detail',
      obstacle: 'Compliance score is a single number with no drill-down',
      impact: 'Boards lack visibility into what is driving their score, reducing trust',
      hmw: 'How might we make compliance scores transparent and actionable?',
    },
    hypothesis: '',
    assumptions: '',
    dependencies: '',
    outOfScope: '',
    successMetrics: [],
    notes: '',
    solution: { designs: [], ideation: [], collab: [] },
    deploy: {
      pr: null,
      environments: [{ name: 'Staging', status: 'not_started' }, { name: 'Production', status: 'not_started' }],
      rollout: [{ id: 'a2', status: 'pending' }, { id: 'a3', status: 'pending' }],
    },
    history: [{ from: 'created', to: 'identified', date: '2026-03-02', actor: 'Platform' }],
    createdAt: '2026-03-02', updatedAt: '2026-03-02',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  if (!d) return '--';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(d: string) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'feedback' | 'metrics' | 'solution' | 'deploy' | 'history';
type SolutionSub = 'designs' | 'ideation' | 'collab';

export default function ProblemsTab() {
  const [problems, setProblems] = useState<ProblemStatement[]>(SEED_PROBLEMS);
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [solutionSub, setSolutionSub] = useState<SolutionSub>('designs');

  // Edit states
  const [editingFraming, setEditingFraming] = useState(false);
  const [framingDraft, setFramingDraft] = useState<ProblemFraming>({ who: '', trying: '', obstacle: '', impact: '', hmw: '' });
  const [editingHypothesis, setEditingHypothesis] = useState(false);
  const [editingAssumptions, setEditingAssumptions] = useState(false);
  const [editingDeps, setEditingDeps] = useState(false);
  const [editingOos, setEditingOos] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  // Solution form states
  const [showDesignForm, setShowDesignForm] = useState(false);
  const [designTitle, setDesignTitle] = useState('');
  const [designUrl, setDesignUrl] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newMetric, setNewMetric] = useState('');

  const detail = problems.find(p => p.id === detailId) || null;

  const openDetail = (id: string) => { setDetailId(id); setDetailTab('overview'); setEditingFraming(false); };

  const updateProblem = (id: string, updater: (p: ProblemStatement) => ProblemStatement) => {
    setProblems(prev => prev.map(p => p.id === id ? updater(p) : p));
  };

  const moveToNextStage = (ps: ProblemStatement) => {
    const idx = STAGES.indexOf(ps.stage);
    if (idx < STAGES.length - 1) {
      const nextStage = STAGES[idx + 1];
      updateProblem(ps.id, p => ({
        ...p,
        stage: nextStage,
        updatedAt: new Date().toISOString().split('T')[0],
        history: [...p.history, { from: ps.stage, to: nextStage, date: new Date().toISOString().split('T')[0], actor: 'Admin' }],
      }));
    }
  };

  const stageCounts = STAGES.map(s => ({ stage: s, count: problems.filter(p => p.stage === s).length }));

  const solutionCount = detail ? detail.solution.designs.length + detail.solution.ideation.length + detail.solution.collab.length : 0;

  const DETAIL_TABS: { id: DetailTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'solution', label: 'Solution', badge: solutionCount > 0 ? solutionCount : undefined },
    { id: 'deploy', label: 'Deploy' },
    { id: 'history', label: 'History' },
  ];

  const framingFields: { key: keyof ProblemFraming; label: string }[] = [
    { key: 'who', label: 'Who' },
    { key: 'trying', label: 'Trying to' },
    { key: 'obstacle', label: 'Obstacle' },
    { key: 'impact', label: 'Impact' },
    { key: 'hmw', label: 'How Might We' },
  ];

  const filledCount = detail ? framingFields.filter(f => detail.framing[f.key].trim()).length : 0;

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

      {/* Detail slide-in panel */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDetailId(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[580px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
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
              {DETAIL_TABS.map(tab => (
                <button key={tab.id} onClick={() => { setDetailTab(tab.id); if (tab.id === 'solution') setSolutionSub('designs'); }}
                  className={`px-3 py-2.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                    detailTab === tab.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'
                  }`}>
                  {tab.label}
                  {tab.badge !== undefined && (
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: '#7c3aed' }}>{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Overview Tab */}
              {detailTab === 'overview' && (
                <div className="space-y-5">
                  {/* 1. Lifecycle Stage */}
                  <div>
                    <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em] mb-3 bg-ink-50 px-3 py-1.5 rounded -mx-1">Lifecycle Stage</p>
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

                  {/* 2. Problem Framing */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Problem Framing</p>
                        <div className="flex items-center gap-1">
                          {framingFields.map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < filledCount ? 'bg-ink-900' : 'bg-ink-300'}`} />
                          ))}
                          <span className={`text-[0.6rem] ml-1 px-1.5 py-0.5 rounded font-semibold ${
                            filledCount === 5 ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'
                          }`}>{filledCount === 5 ? 'Complete' : `${filledCount}/5 filled`}</span>
                        </div>
                      </div>
                      <button onClick={() => {
                        if (!editingFraming) setFramingDraft({ ...detail.framing });
                        setEditingFraming(!editingFraming);
                      }} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingFraming ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingFraming ? (
                      <div className="space-y-3">
                        {framingFields.map(field => (
                          <div key={field.key} className="bg-ink-50 rounded-lg px-4 py-3">
                            <p className="text-[0.65rem] font-semibold text-ink-500 uppercase mb-0.5">
                              {field.label}<span className="text-red-500 ml-0.5">*</span>
                            </p>
                            <p className="text-sm text-ink-800">{detail.framing[field.key] || <span className="text-ink-300 italic">Not defined</span>}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {framingFields.map(field => (
                          <div key={field.key}>
                            <label className="block text-[0.65rem] font-semibold text-ink-500 uppercase mb-1">{field.label} *</label>
                            <textarea value={framingDraft[field.key]} onChange={e => setFramingDraft({ ...framingDraft, [field.key]: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={2} />
                          </div>
                        ))}
                        <button onClick={() => {
                          updateProblem(detail.id, p => ({ ...p, framing: { ...framingDraft }, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingFraming(false);
                        }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">
                          Save Framing
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3. Hypothesis */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-2">
                      <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Hypothesis</p>
                      <button onClick={() => setEditingHypothesis(!editingHypothesis)} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingHypothesis ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingHypothesis ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                        <p className="text-sm text-blue-900">{detail.hypothesis || <span className="text-blue-300 italic">No hypothesis defined</span>}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea defaultValue={detail.hypothesis}
                          id="hypothesis-edit"
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={3} />
                        <button onClick={() => {
                          const val = (document.getElementById('hypothesis-edit') as HTMLTextAreaElement).value;
                          updateProblem(detail.id, p => ({ ...p, hypothesis: val, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingHypothesis(false);
                        }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                      </div>
                    )}
                  </div>

                  {/* 4. Assumptions */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Assumptions</p>
                      </div>
                      <button onClick={() => setEditingAssumptions(!editingAssumptions)} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingAssumptions ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingAssumptions ? (
                      <div className="bg-ink-50 rounded-lg px-4 py-3">
                        <p className="text-sm text-ink-700">{detail.assumptions || <span className="text-ink-300 italic">What are we taking as true without full evidence?</span>}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea defaultValue={detail.assumptions} id="assumptions-edit"
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={3}
                          placeholder="What are we taking as true without full evidence?" />
                        <button onClick={() => {
                          const val = (document.getElementById('assumptions-edit') as HTMLTextAreaElement).value;
                          updateProblem(detail.id, p => ({ ...p, assumptions: val, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingAssumptions(false);
                        }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                      </div>
                    )}
                  </div>

                  {/* 5. Dependencies */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Dependencies</p>
                      </div>
                      <button onClick={() => setEditingDeps(!editingDeps)} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingDeps ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingDeps ? (
                      <div className="bg-ink-50 rounded-lg px-4 py-3">
                        <p className="text-sm text-ink-700">{detail.dependencies || <span className="text-ink-300 italic">What other teams, systems, or work does this rely on?</span>}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea defaultValue={detail.dependencies} id="deps-edit"
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={3}
                          placeholder="What other teams, systems, or work does this rely on?" />
                        <button onClick={() => {
                          const val = (document.getElementById('deps-edit') as HTMLTextAreaElement).value;
                          updateProblem(detail.id, p => ({ ...p, dependencies: val, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingDeps(false);
                        }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                      </div>
                    )}
                  </div>

                  {/* 6. Out of Scope */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-2">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Out of Scope</p>
                      </div>
                      <button onClick={() => setEditingOos(!editingOos)} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingOos ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingOos ? (
                      <div className="bg-ink-50 rounded-lg px-4 py-3">
                        <p className="text-sm text-ink-700">{detail.outOfScope || <span className="text-ink-300 italic">What are we explicitly NOT solving here?</span>}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea defaultValue={detail.outOfScope} id="oos-edit"
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={3}
                          placeholder="What are we explicitly NOT solving here?" />
                        <button onClick={() => {
                          const val = (document.getElementById('oos-edit') as HTMLTextAreaElement).value;
                          updateProblem(detail.id, p => ({ ...p, outOfScope: val, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingOos(false);
                        }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                      </div>
                    )}
                  </div>

                  {/* 7. Affected Associations */}
                  <div>
                    <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em] mb-2 bg-ink-50 px-3 py-1.5 rounded -mx-1">Affected Associations</p>
                    <div className="space-y-2">
                      {detail.linkedAssocs.map(a => (
                        <div key={a} className="flex items-center gap-2.5 bg-ink-50 rounded-lg px-3 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ASSOC_MAP[a]?.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink-800 truncate">{ASSOC_MAP[a]?.name}</p>
                            <p className="text-[0.65rem] text-ink-400">{ASSOC_MAP[a]?.plan} &middot; {ASSOC_MAP[a]?.units} units</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 8. Owner + Updated */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-ink-50 rounded-lg px-4 py-3">
                      <p className="text-[0.65rem] font-semibold text-ink-500 uppercase mb-0.5">Owner</p>
                      <p className="text-sm font-medium text-ink-800">{detail.owner}</p>
                    </div>
                    <div className="bg-ink-50 rounded-lg px-4 py-3">
                      <p className="text-[0.65rem] font-semibold text-ink-500 uppercase mb-0.5">Updated</p>
                      <p className="text-sm font-medium text-ink-800">{fmtDate(detail.updatedAt)}</p>
                    </div>
                  </div>

                  {/* 9. Internal Notes */}
                  <div>
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 rounded -mx-1 mb-2">
                      <p className="text-[0.65rem] font-semibold text-ink-500 uppercase tracking-[0.06em]">Internal Notes</p>
                      <button onClick={() => setEditingNotes(!editingNotes)} className="text-[0.65rem] font-semibold text-ink-500 hover:text-ink-700">
                        {editingNotes ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {!editingNotes ? (
                      <div className="bg-ink-50 rounded-lg px-4 py-3">
                        <p className="text-sm text-ink-700">{detail.notes || <span className="text-ink-300 italic">No notes</span>}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea defaultValue={detail.notes} id="notes-edit"
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={3} />
                        <button onClick={() => {
                          const val = (document.getElementById('notes-edit') as HTMLTextAreaElement).value;
                          updateProblem(detail.id, p => ({ ...p, notes: val, updatedAt: new Date().toISOString().split('T')[0] }));
                          setEditingNotes(false);
                        }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback Tab */}
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
                  <button className="w-full py-3 border-2 border-dashed border-ink-200 rounded-lg text-sm text-ink-400 font-medium hover:border-ink-300 hover:text-ink-500 transition-colors">
                    + Add feedback item
                  </button>
                </div>
              )}

              {/* Metrics Tab */}
              {detailTab === 'metrics' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Success Criteria</p>
                  {detail.successMetrics.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 bg-ink-50 rounded-lg px-4 py-3">
                      <div className="w-5 h-5 rounded-md border-2 border-ink-300 shrink-0" />
                      <span className="text-sm text-ink-800">{m}</span>
                    </div>
                  ))}
                  {detail.successMetrics.length === 0 && (
                    <div className="bg-ink-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-ink-400">No success metrics defined</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={newMetric} onChange={e => setNewMetric(e.target.value)}
                      className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm"
                      placeholder="Add a success metric..." />
                    <button onClick={() => {
                      if (!newMetric.trim()) return;
                      updateProblem(detail.id, p => ({ ...p, successMetrics: [...p.successMetrics, newMetric.trim()], updatedAt: new Date().toISOString().split('T')[0] }));
                      setNewMetric('');
                    }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 shrink-0">
                      + Add metric
                    </button>
                  </div>
                </div>
              )}

              {/* Solution Tab */}
              {detailTab === 'solution' && (
                <div className="space-y-4">
                  {/* Sub-nav */}
                  <div className="flex gap-1 border-b border-ink-100">
                    {(['designs', 'ideation', 'collab'] as SolutionSub[]).map(sub => (
                      <button key={sub} onClick={() => setSolutionSub(sub)}
                        className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 -mb-px transition-colors ${
                          solutionSub === sub ? 'border-[#7c3aed] text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'
                        }`}>{sub}</button>
                    ))}
                  </div>

                  {/* Designs sub-section */}
                  {solutionSub === 'designs' && (
                    <div className="space-y-3">
                      <p className="text-xs text-ink-500">Link design files, mockups, or prototypes for this problem statement.</p>
                      {detail.solution.designs.map((d, i) => (
                        <div key={i} className="bg-white border border-ink-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-ink-900">{d.title}</p>
                            <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-semibold text-white"
                              style={{ backgroundColor: DESIGN_STATUS_COLORS[d.status] }}>
                              {DESIGN_STATUS_LABELS[d.status]}
                            </span>
                          </div>
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{d.url}</a>
                          <p className="text-[0.65rem] text-ink-400 mt-1.5">{d.addedBy} &middot; {fmtDate(d.addedAt)}</p>
                        </div>
                      ))}
                      {!showDesignForm ? (
                        <button onClick={() => setShowDesignForm(true)}
                          className="w-full py-3 border-2 border-dashed border-ink-200 rounded-lg text-sm text-ink-400 font-medium hover:border-ink-300 hover:text-ink-500 transition-colors">
                          + Link design file
                        </button>
                      ) : (
                        <div className="border border-ink-200 rounded-lg p-4 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-ink-600 mb-1">Title</label>
                            <input value={designTitle} onChange={e => setDesignTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g. Quorum redesign mockup" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-ink-600 mb-1">URL</label>
                            <input value={designUrl} onChange={e => setDesignUrl(e.target.value)}
                              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="https://figma.com/file/..." />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setShowDesignForm(false); setDesignTitle(''); setDesignUrl(''); }}
                              className="px-3 py-1.5 text-xs text-ink-500 font-medium hover:text-ink-700">Cancel</button>
                            <button onClick={() => {
                              if (!designTitle.trim() || !designUrl.trim()) return;
                              updateProblem(detail.id, p => ({
                                ...p,
                                solution: { ...p.solution, designs: [...p.solution.designs, { title: designTitle.trim(), url: designUrl.trim(), status: 'in_progress', addedBy: 'Admin', addedAt: new Date().toISOString().split('T')[0] }] },
                                updatedAt: new Date().toISOString().split('T')[0],
                              }));
                              setShowDesignForm(false); setDesignTitle(''); setDesignUrl('');
                            }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Add</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ideation sub-section */}
                  {solutionSub === 'ideation' && (
                    <div className="space-y-3">
                      <p className="text-xs text-ink-500">Capture solution ideas and approaches. Vote to surface the strongest thinking.</p>
                      {[...detail.solution.ideation].sort((a, b) => b.votes - a.votes).map((idea, i) => (
                        <div key={i} className="flex gap-3 bg-white border border-ink-200 rounded-lg p-4">
                          <button onClick={() => {
                            const originalIdx = detail.solution.ideation.findIndex(item => item.text === idea.text && item.author === idea.author);
                            updateProblem(detail.id, p => ({
                              ...p,
                              solution: { ...p.solution, ideation: p.solution.ideation.map((item, idx) => idx === originalIdx ? { ...item, votes: item.votes + 1 } : item) },
                            }));
                          }} className="flex flex-col items-center shrink-0 group">
                            <svg className="w-4 h-4 text-ink-400 group-hover:text-ink-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            <span className="text-sm font-bold text-ink-700">{idea.votes}</span>
                          </button>
                          <div className="flex-1">
                            <p className="text-sm text-ink-900">{idea.text}</p>
                            <p className="text-[0.65rem] text-ink-400 mt-1">{idea.author} &middot; {fmtDate(idea.date)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="space-y-2 pt-2">
                        <textarea value={newIdea} onChange={e => setNewIdea(e.target.value)}
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={2}
                          placeholder="Share a solution idea..." />
                        <div className="flex justify-end">
                          <button onClick={() => {
                            if (!newIdea.trim()) return;
                            updateProblem(detail.id, p => ({
                              ...p,
                              solution: { ...p.solution, ideation: [...p.solution.ideation, { text: newIdea.trim(), author: 'Admin', votes: 0, date: new Date().toISOString().split('T')[0] }] },
                              updatedAt: new Date().toISOString().split('T')[0],
                            }));
                            setNewIdea('');
                          }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Add Idea</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collab sub-section */}
                  {solutionSub === 'collab' && (
                    <div className="space-y-3">
                      <p className="text-xs text-ink-500">Internal team discussion, decisions, and updates.</p>
                      {detail.solution.collab.map((c, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-[0.65rem] font-bold shrink-0">
                            {initials(c.author)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-ink-900">{c.author}</span>
                              <span className="text-[0.65rem] text-ink-400">{fmtDateTime(c.timestamp)}</span>
                            </div>
                            <p className="text-sm text-ink-700">{c.text}</p>
                          </div>
                        </div>
                      ))}
                      {detail.solution.collab.length === 0 && (
                        <div className="bg-ink-50 rounded-lg p-4 text-center">
                          <p className="text-sm text-ink-400">No comments yet</p>
                        </div>
                      )}
                      <div className="space-y-2 pt-2 border-t border-ink-100">
                        <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                          className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none" rows={2}
                          placeholder="Add a comment..." />
                        <div className="flex justify-end">
                          <button onClick={() => {
                            if (!newComment.trim()) return;
                            updateProblem(detail.id, p => ({
                              ...p,
                              solution: { ...p.solution, collab: [...p.solution.collab, { author: 'Admin', text: newComment.trim(), timestamp: new Date().toISOString() }] },
                              updatedAt: new Date().toISOString().split('T')[0],
                            }));
                            setNewComment('');
                          }} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Post</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Deploy Tab */}
              {detailTab === 'deploy' && (
                <div className="space-y-5">
                  {/* PR Info */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Pull Request</p>
                    {detail.deploy.pr ? (
                      <div className="bg-white border border-ink-200 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Branch</p>
                            <p className="font-mono text-xs text-ink-700">{detail.deploy.pr.branch}</p>
                          </div>
                          <div>
                            <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">PR</p>
                            <p className="text-xs text-ink-700">#{detail.deploy.pr.number} &middot; {detail.deploy.pr.title}</p>
                          </div>
                          <div>
                            <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Status</p>
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                              detail.deploy.pr.status === 'merged' ? 'bg-purple-100 text-purple-700' : detail.deploy.pr.status === 'open' ? 'bg-sage-100 text-sage-700' : 'bg-ink-100 text-ink-500'
                            }`}>{detail.deploy.pr.status}</span>
                          </div>
                          <div>
                            <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Author</p>
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-ink-200 text-ink-600 flex items-center justify-center text-[0.5rem] font-bold">
                                {initials(detail.deploy.pr.author)}
                              </div>
                              <span className="text-xs text-ink-700">{detail.deploy.pr.author}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">SHA</p>
                            <p className="font-mono text-xs text-ink-500">{detail.deploy.pr.sha}</p>
                          </div>
                          {detail.deploy.pr.mergedAt && (
                            <div>
                              <p className="text-[0.65rem] text-ink-400 uppercase font-semibold">Merged</p>
                              <p className="text-xs text-ink-700">{fmtDate(detail.deploy.pr.mergedAt)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-ink-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-ink-400">No PR linked</p>
                      </div>
                    )}
                  </div>

                  {/* Environments */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Environments</p>
                    <div className="space-y-2">
                      {detail.deploy.environments.map(env => (
                        <div key={env.name} className="bg-white border border-ink-200 rounded-lg px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                env.status === 'deployed' ? 'bg-sage-600' : env.status === 'deploying' ? 'bg-blue-500 animate-pulse' : env.status === 'pending' ? 'bg-amber-500' : 'bg-ink-300'
                              }`} />
                              <span className="text-sm font-medium text-ink-800">{env.name}</span>
                            </div>
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                              env.status === 'deployed' ? 'bg-sage-100 text-sage-700' : env.status === 'deploying' ? 'bg-blue-100 text-blue-700' : env.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'
                            }`}>{env.status === 'not_started' ? 'Not Started' : env.status}</span>
                          </div>
                          {(env.url || env.sha || env.deployedAt) && (
                            <div className="flex items-center gap-3 mt-2 text-[0.65rem] text-ink-400">
                              {env.url && <span>{env.url}</span>}
                              {env.sha && <span className="font-mono">{env.sha}</span>}
                              {env.deployedAt && <span>{fmtDateTime(env.deployedAt)}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Association Rollout */}
                  <div>
                    <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Association Rollout</p>
                    {detail.deploy.rollout.length > 0 ? (
                      <div className="space-y-2">
                        {detail.deploy.rollout.map(r => (
                          <div key={r.id} className="flex items-center justify-between bg-white border border-ink-200 rounded-lg px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ASSOC_MAP[r.id]?.color }} />
                              <span className="text-sm font-medium text-ink-800">{ASSOC_MAP[r.id]?.name}</span>
                            </div>
                            <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-semibold ${
                              r.status === 'live' ? 'bg-sage-100 text-sage-700' : r.status === 'staged' ? 'bg-blue-100 text-blue-700' : r.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-500'
                            }`}>{r.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-ink-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-ink-400">No rollout configured</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History Tab */}
              {detailTab === 'history' && (
                <div className="space-y-0">
                  <p className="text-xs font-semibold text-ink-400 uppercase mb-3">Stage Transition Timeline</p>
                  {[...detail.history].reverse().map((h, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full border-2 shrink-0"
                          style={{ borderColor: STAGE_COLORS[h.to], backgroundColor: i === 0 ? STAGE_COLORS[h.to] : 'white' }} />
                        {i < detail.history.length - 1 && <div className="w-0.5 flex-1 bg-ink-200 my-1" />}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium text-ink-900">
                          {h.from === 'created' ? 'Created' : <><span className="capitalize">{h.from}</span> &rarr;</>}{' '}
                          <span className="capitalize" style={{ color: STAGE_COLORS[h.to] }}>{STAGE_LABELS[h.to]}</span>
                        </p>
                        <p className="text-[0.72rem] text-ink-400">{h.date} &middot; {h.actor}</p>
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
