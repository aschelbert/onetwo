import type { CaseTrackerCase } from '@/types/issues';
import { CATS, SITUATION_PHASES } from '@/store/useIssuesStore';

interface OwnerCaseViewProps {
  c: CaseTrackerCase;
  onBack: () => void;
}

export function OwnerCaseView({ c, onBack }: OwnerCaseViewProps) {
  const cat = CATS.find(x => x.id === c.catId);
  const phases = SITUATION_PHASES[c.sitId] || [];
  const steps = c.steps || [];

  // Phase-level progress
  const phaseProgress = phases.map(p => {
    const phaseSteps = steps.filter(s => s.phaseId === p.id);
    const done = phaseSteps.filter(s => s.done).length;
    const total = phaseSteps.length;
    return { ...p, done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }).filter(p => p.total > 0);

  const totalDone = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const overallPct = totalSteps > 0 ? Math.round((totalDone / totalSteps) * 100) : 0;

  const statusColors: Record<string, string> = {
    open: 'bg-accent-50 text-accent-600',
    'on-hold': 'bg-amber-100 text-amber-700',
    closed: 'bg-sage-100 text-sage-700',
  };

  const phaseColors = ['#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#06b6d4'];

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-ink-400 hover:text-ink-600">← Back</button>

      <div className="bg-white rounded-xl border border-ink-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{cat?.icon || '📋'}</span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">{c.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${statusColors[c.status] || ''}`}>
                {c.status === 'on-hold' ? 'ON HOLD' : c.status}
              </span>
              <span className="text-xs text-ink-400">{cat?.label}</span>
              <span className="text-xs text-ink-400">Opened {c.created}</span>
            </div>
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-ink-600">Progress</span>
            <span className="font-bold text-ink-700">{overallPct}%</span>
          </div>
          <div className="w-full h-3 bg-ink-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${c.status === 'closed' ? 'bg-sage-500' : 'bg-accent-500'}`} style={{ width: `${overallPct}%` }} />
          </div>
        </div>

        {/* Phase-level timeline */}
        {phaseProgress.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Case Phases</p>
            {phaseProgress.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: phaseColors[i % phaseColors.length] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink-800">{p.label}</p>
                    <span className="text-xs text-ink-400">{p.done}/{p.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: phaseColors[i % phaseColors.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-2">Progress</p>
            <p className="text-sm text-ink-600">{totalDone} of {totalSteps} steps completed</p>
          </div>
        )}
      </div>

      {/* What You Can Do */}
      <div className="bg-white rounded-xl border border-ink-100 p-6">
        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">What You Can Do</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-mist-50 rounded-lg">
            <span className="text-lg mt-0.5">📝</span>
            <div>
              <p className="text-sm font-medium text-ink-800">Respond to Notices</p>
              <p className="text-xs text-ink-500">If you've received a notice, respond within the cure period specified.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-mist-50 rounded-lg">
            <span className="text-lg mt-0.5">🤝</span>
            <div>
              <p className="text-sm font-medium text-ink-800">Request Mediation</p>
              <p className="text-xs text-ink-500">You may request mediation per DC Code § 42-1903.14.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-mist-50 rounded-lg">
            <span className="text-lg mt-0.5">📞</span>
            <div>
              <p className="text-sm font-medium text-ink-800">Contact Management</p>
              <p className="text-xs text-ink-500">Reach out to property management with questions about this case.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Your Rights */}
      <div className="bg-white rounded-xl border border-ink-100 p-6">
        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Your Rights</p>
        <div className="space-y-2 text-xs text-ink-600">
          <p>• Right to cure before fines (DC Code § 42-1903.13)</p>
          <p>• Right to hearing before the board (Bylaws, Article VII)</p>
          <p>• Right to inspect association records (DC Code § 42-1903.14)</p>
          <p>• Right to attend board meetings (DC Code § 42-1903.14(c))</p>
          <p>• Right to mediation (DC Code § 42-1903.14)</p>
        </div>
      </div>

      {/* Documents available to owner */}
      {c.comms.filter(cm => cm.recipient?.includes(c.unit)).length > 0 && (
        <div className="bg-white rounded-xl border border-ink-100 p-6">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Communications</p>
          <div className="space-y-2">
            {c.comms.filter(cm => cm.recipient?.includes(c.unit)).map(cm => (
              <div key={cm.id} className="p-3 bg-mist-50 rounded-lg">
                <p className="text-sm font-medium text-ink-800">{cm.subject}</p>
                <p className="text-xs text-ink-400">{cm.date} · via {cm.method}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
