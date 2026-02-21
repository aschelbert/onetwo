import { CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import type { CaseTrackerCase, BoardVote } from '@/types/issues';

export function CaseCard({ c, onClick }: { c: CaseTrackerCase; onClick: () => void }) {
  const cat = CATS.find(x => x.id === c.catId);
  const pct = c.steps ? Math.round((c.steps.filter(s => s.done).length / c.steps.length) * 100) : 0;
  return (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-ink-100 p-4 hover:border-accent-300 hover:shadow-sm transition-all group">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{cat?.icon || '📋'}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIO_COLORS[c.priority]}`}>{c.priority}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${APPR_COLORS[c.approach]}`}>{APPR_LABELS[c.approach]}</span>
      </div>
      <p className="text-sm font-semibold text-ink-900 group-hover:text-accent-700 transition-colors">{c.title}</p>
      <p className="text-xs text-ink-400 mt-1">Unit {c.unit} · {c.created}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div className="h-full bg-sage-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-ink-500">{pct}%</span>
      </div>
    </button>
  );
}

export function BoardVoteDisplay({ vote }: { vote: BoardVote }) {
  const approveCount = vote.votes.filter(v => v.vote === 'approve').length;
  const denyCount = vote.votes.filter(v => v.vote === 'deny').length;
  const abstainCount = vote.votes.filter(v => v.vote === 'abstain').length;
  const passed = approveCount > denyCount;
  const vColors: Record<string, string> = { approve: 'bg-sage-100 text-sage-700', deny: 'bg-red-100 text-red-700', abstain: 'bg-ink-100 text-ink-500' };
  const rowBg: Record<string, string> = { approve: 'bg-sage-50', deny: 'bg-red-50', abstain: 'bg-ink-50' };

  return (
    <>
      <div className="mb-3 p-3 bg-mist-50 rounded-lg border border-mist-200">
        <p className="text-sm font-medium text-ink-900">{vote.motion}</p>
        <p className="text-xs text-ink-400 mt-1">Vote date: {vote.date}</p>
      </div>
      <div className="space-y-1.5">
        {vote.votes.map((v, i) => (
          <div key={i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${rowBg[v.vote] || 'bg-ink-50'} border border-ink-50`}>
            <div>
              <span className="text-sm font-medium text-ink-900">{v.name}</span>
              <span className="text-xs text-ink-400 ml-2">{v.role}</span>
            </div>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${vColors[v.vote] || 'bg-ink-50 text-ink-300'}`}>
              {v.vote ? v.vote.charAt(0).toUpperCase() + v.vote.slice(1) : '—'}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-ink-100 flex gap-4 text-sm">
        <span className="text-sage-600 font-semibold">{approveCount} Approve</span>
        <span className="text-red-600 font-semibold">{denyCount} Deny</span>
        <span className="text-ink-400">{abstainCount} Abstain</span>
        <span className={`ml-auto font-bold ${passed ? 'text-sage-700' : 'text-red-600'}`}>{passed ? 'PASSED' : 'NOT PASSED'}</span>
      </div>
    </>
  );
}

export function StepsSection({ caseId, approach, steps, onToggle, onNote }: {
  caseId: string;
  approach: string;
  steps: any[];
  onToggle: (idx: number) => void;
  onNote: (idx: number, note: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-100 p-5">
      <h3 className="text-lg font-semibold text-ink-800 mb-4">
        {APPR_LABELS[approach]} Steps{' '}
        <span className="text-ink-400 font-normal text-sm">({steps.filter(s => s.done).length}/{steps.length} complete)</span>
      </h3>
      <div className="space-y-3">
        {steps.map((st, i) => (
          <div key={i} className="flex items-start gap-3">
            <button
              onClick={() => onToggle(i)}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all text-sm font-bold ${st.done ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 text-ink-300 hover:border-accent-400'}`}
            >
              {st.done ? '✓' : i + 1}
            </button>
            <div className="flex-1">
              <p className={`text-sm ${st.done ? 'text-ink-400 line-through' : 'text-ink-800 font-medium'}`}>{st.s}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {st.t && <span className="text-[11px] text-ink-400">⏱ {st.t}</span>}
                {st.d && <span className="text-[11px] text-ink-400">📋 {st.d}</span>}
                {st.detail && <span className="text-[11px] text-ink-400">💡 {st.detail}</span>}
                {st.w && <span className="text-[11px] text-rose-500">⚠ {st.w}</span>}
              </div>
              {st.done && st.doneDate && <span className="text-[10px] text-sage-500">Completed {st.doneDate}</span>}
              {st.userNotes && <p className="text-xs text-ink-400 mt-1 bg-sand-100 rounded p-2">📝 {st.userNotes}</p>}
              <button
                onClick={() => {
                  const note = prompt('Add note:', st.userNotes || '');
                  if (note !== null) onNote(i, note);
                }}
                className="text-[11px] text-accent-500 hover:text-accent-600 mt-1 inline-block"
              >
                + Add note
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
