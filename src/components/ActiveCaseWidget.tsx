import { useState, useEffect } from 'react';
import { useIssuesStore, CATS } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import type { CaseApproach, CasePriority } from '@/types/issues';

type PillState = 'idle' | 'picker' | 'active' | 'minimized';

const APPROACH_LABELS: Record<string, string> = { pre: 'Pre-Legal', self: 'Self-Represented', legal: 'Legal Counsel' };
const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  low: { bg: 'bg-green-100', text: 'text-green-700' },
};

function ProgressRing({ pct, size = 36, stroke = 3, color }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || '#d62839'} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: size * 0.28, fontWeight: 700, fill: '#1a1a2e' }}>{pct}%</text>
    </svg>
  );
}

// Map store color names to hex for ProgressRing
const COLOR_HEX: Record<string, string> = {
  emerald: '#059669', amber: '#f59e0b', rose: '#e11d48', blue: '#2563eb',
  violet: '#7c3aed', cyan: '#0891b2', indigo: '#6366f1', red: '#dc2626', slate: '#64748b', green: '#059669',
};

export default function ActiveCaseWidget() {
  const ctx = useIssuesStore(s => s.activeCaseContext);
  const cases = useIssuesStore(s => s.cases);
  const store = useIssuesStore();
  const currentUser = useAuthStore(s => s.currentUser);
  const navigate = useNavigate();
  const location = useLocation();

  // Local pill state — starts 'idle', upgrades to 'active' when ctx exists
  const [pillState, setPillState] = useState<PillState>(ctx ? 'active' : 'idle');
  const [pickerTab, setPickerTab] = useState<'open' | 'create'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [createSearchQuery, setCreateSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  // New case wizard (single-step: pick situation then fill details)
  const [wizSitKey, setWizSitKey] = useState<string | null>(null); // "catId:sitId"
  const [wizTitle, setWizTitle] = useState('');
  const [wizUnit, setWizUnit] = useState('');
  const [wizPriority, setWizPriority] = useState<CasePriority>('medium');
  const [wizApproach, setWizApproach] = useState<CaseApproach>('pre');
  const [wizNotes, setWizNotes] = useState('');

  const resetWiz = () => { setWizSitKey(null); setWizTitle(''); setWizUnit(''); setWizPriority('medium'); setWizApproach('pre'); setWizNotes(''); setCreateSearchQuery(''); };

  // Sync pill state with ctx
  useEffect(() => {
    if (ctx && pillState === 'idle') setPillState('active');
    if (!ctx && pillState === 'active') setPillState('idle');
  }, [ctx]);

  useEffect(() => {
    setMounted(false);
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, [pillState]);

  // Case data for active view
  const openCases = cases.filter(c => c.status === 'open');
  const urgentCount = openCases.filter(c => c.priority === 'urgent' || c.priority === 'high').length;
  const filteredCases = openCases.filter(c => !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Active case step navigation
  const caseData = ctx ? cases.find(c => c.id === ctx.caseId) : null;
  const steps = caseData?.steps || [];
  const totalSteps = steps.length;
  const canPrev = ctx ? ctx.stepIdx > 0 : false;
  const canNext = ctx ? ctx.stepIdx < totalSteps - 1 : false;

  const navigateStep = (newIdx: number) => {
    if (!ctx) return;
    const step = steps[newIdx];
    if (!step) return;
    const checksDone = step.checks?.filter(ck => ck.checked).length || 0;
    const checksTotal = step.checks?.length || 0;
    const doneCount = steps.filter(s => s.done).length;
    store.setActiveCaseContext({
      ...ctx,
      stepIdx: newIdx,
      stepTitle: step.s,
      stepTiming: step.t || undefined,
      progress: { done: doneCount, total: totalSteps },
      stepProgress: checksTotal > 0 ? { done: checksDone, total: checksTotal } : undefined,
    });
  };

  const handleReturn = () => {
    if (!ctx) return;
    navigate(ctx.returnPath);
    store.clearActiveCaseContext();
    setPillState('idle');
  };

  const openCaseInIssues = (caseId: string) => {
    navigate(`/issues?view=case:${caseId}`);
    setPillState('idle');
  };

  const handleCreateCase = () => {
    if (!wizSitKey || !wizTitle.trim()) return;
    const [catId, sitId] = wizSitKey.split(':');
    const newId = store.createCase({
      catId, sitId, approach: wizApproach, title: wizTitle.trim(),
      unit: wizUnit || 'N/A', owner: currentUser?.name || 'Board',
      priority: wizPriority, notes: wizNotes,
    });
    resetWiz();
    openCaseInIssues(newId);
  };

  const selectedCat = wizSitKey ? CATS.find(c => c.id === wizSitKey.split(':')[0]) : null;
  const selectedSit = wizSitKey && selectedCat ? selectedCat.sits.find(s => s.id === wizSitKey.split(':')[1]) : null;

  // ── IDLE ──────────────────────────────────────────────
  if (pillState === 'idle' && !ctx) {
    return (
      <button
        onClick={() => { setPillState('picker'); setPickerTab('open'); setSearchQuery(''); }}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #1a1f25, #2d1b3d)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <span className="relative w-7 h-7 flex items-center justify-center">
          <span className="text-base">⚡</span>
          {urgentCount > 0 && (
            <>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
            </>
          )}
        </span>
        <span className="text-sm font-semibold text-white tracking-wide">Case Workflow</span>
        {urgentCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{urgentCount}</span>
        )}
      </button>
    );
  }

  // ── PICKER ────────────────────────────────────────────
  if (pillState === 'picker') {
    return (
      <div
        className="fixed bottom-6 left-6 z-50 w-96 rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #e5e0dc', maxHeight: '600px',
          transform: mounted ? 'translateY(0)' : 'translateY(20px)', opacity: mounted ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1a1f25, #2d1b3d)' }}>
          <div>
            <h3 className="text-white font-bold text-sm">Case Workflow</h3>
            <p className="text-gray-400 text-xs mt-0.5">Create, open, or resume a case</p>
          </div>
          <button onClick={() => { setPillState(ctx ? 'active' : 'idle'); resetWiz(); }}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center cursor-pointer">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-200">
          {([
            { key: 'open' as const, label: 'Open Cases', count: openCases.length },
            { key: 'create' as const, label: '+ New Case' },
          ]).map(t => (
            <button key={t.key} onClick={() => { setPickerTab(t.key); resetWiz(); setSearchQuery(''); }}
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wide cursor-pointer transition-colors ${
                pickerTab === t.key ? 'text-ink-900 border-b-2 border-accent-500' : 'text-ink-400 hover:text-ink-600'
              }`}>
              {t.label}
              {t.count != null && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-500 text-xs">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* OPEN CASES TAB */}
        {pickerTab === 'open' && (
          <div>
            <div className="px-4 pt-3 pb-2">
              <input type="text" placeholder="Search cases..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300" />
            </div>
            <div className="px-4 pb-3 overflow-y-auto" style={{ maxHeight: '360px', scrollbarWidth: 'thin' }}>
              {filteredCases.length === 0 && (
                <p className="text-xs text-ink-400 text-center py-4">No matching cases</p>
              )}
              {filteredCases.map(c => {
                const cat = CATS.find(x => x.id === c.catId);
                const pri = PRIORITY_STYLES[c.priority] || PRIORITY_STYLES.medium;
                const doneCount = c.steps?.filter(s => s.done).length || 0;
                const totalCount = c.steps?.length || 0;
                const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
                return (
                  <button key={c.id} onClick={() => openCaseInIssues(c.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left hover:bg-ink-50 transition-colors group cursor-pointer border border-transparent hover:border-ink-200">
                    <ProgressRing pct={pct} size={36} stroke={3} color={COLOR_HEX[cat?.color || ''] || '#d62839'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pri.bg} ${pri.text}`}>{c.priority}</span>
                        <span className="text-[10px] text-ink-300">{cat?.icon} Unit {c.unit || 'N/A'}</span>
                      </div>
                      <p className="text-sm font-medium text-ink-900 truncate">{c.title}</p>
                      <p className="text-[10px] text-ink-400">{doneCount}/{totalCount} steps · {APPROACH_LABELS[c.approach] || c.approach}</p>
                    </div>
                    <span className="text-ink-300 group-hover:text-accent-500 text-lg">→</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* NEW CASE TAB */}
        {pickerTab === 'create' && !wizSitKey && (() => {
          const q = createSearchQuery.toLowerCase().trim();
          const filteredCats = q
            ? CATS.map(cat => ({
                ...cat,
                sits: cat.sits.filter(sit =>
                  sit.title.toLowerCase().includes(q) ||
                  sit.desc.toLowerCase().includes(q) ||
                  cat.label.toLowerCase().includes(q) ||
                  sit.tags?.some((t: string) => t.toLowerCase().includes(q))
                ),
              })).filter(cat => cat.sits.length > 0)
            : CATS;
          return (
            <div>
              <div className="px-4 pt-3 pb-2">
                <input type="text" placeholder="Search situations..." value={createSearchQuery} onChange={e => setCreateSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '380px', scrollbarWidth: 'thin' }}>
                {filteredCats.length === 0 && (
                  <p className="text-xs text-ink-400 text-center py-4">No matching situations</p>
                )}
                {filteredCats.map(cat => (
                  <div key={cat.id} className="px-4 py-2 first:pt-1">
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <span>{cat.icon}</span> {cat.label}
                    </p>
                    <div className="space-y-1 mb-2">
                      {cat.sits.map(sit => (
                        <button key={sit.id} onClick={() => { setWizSitKey(`${cat.id}:${sit.id}`); setWizTitle(''); setCreateSearchQuery(''); }}
                          className="w-full text-left px-3 py-2 rounded-lg border border-ink-100 hover:border-ink-300 hover:bg-ink-50 transition-all cursor-pointer group">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink-800 group-hover:text-ink-900">{sit.title}</span>
                            <span className="text-ink-200 group-hover:text-ink-400 text-xs">→</span>
                          </div>
                          <p className="text-[10px] text-ink-400 mt-0.5 leading-snug">{sit.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* NEW CASE — Details form (after selecting situation) */}
        {pickerTab === 'create' && wizSitKey && selectedCat && selectedSit && (
          <div className="p-4 overflow-y-auto" style={{ maxHeight: '440px', scrollbarWidth: 'thin' }}>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setWizSitKey(null)} className="text-ink-400 hover:text-ink-600 cursor-pointer text-xs font-medium">← Back</button>
              <span className="text-ink-200">|</span>
              <span className="text-sm">{selectedCat.icon}</span>
              <span className="text-xs font-semibold text-ink-700">{selectedSit.title}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1">Case Title</label>
                <input type="text" value={wizTitle} onChange={e => setWizTitle(e.target.value)}
                  placeholder={`e.g. Unit 402 — ${selectedSit.title}`}
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1">Unit</label>
                  <input type="text" value={wizUnit} onChange={e => setWizUnit(e.target.value)}
                    placeholder="e.g. 402" className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1">Priority</label>
                  <select value={wizPriority} onChange={e => setWizPriority(e.target.value as CasePriority)}
                    className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300 bg-white">
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1">Approach</label>
                <div className="flex gap-1.5">
                  {(['pre', 'self', 'legal'] as const).map(a => (
                    <button key={a} onClick={() => setWizApproach(a)}
                      className={`flex-1 py-2 px-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        wizApproach === a ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}>{APPROACH_LABELS[a]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1">Notes</label>
                <textarea value={wizNotes} onChange={e => setWizNotes(e.target.value)} rows={2}
                  placeholder="Additional context..."
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:border-accent-300 resize-none" />
              </div>
              <button onClick={handleCreateCase} disabled={!wizTitle.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                style={{ background: 'linear-gradient(135deg, #d62839, #a61c2a)' }}>
                Create Case
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MINIMIZED ─────────────────────────────────────────
  if (pillState === 'minimized' || (ctx?.minimized && pillState === 'active')) {
    if (!ctx) return null;
    const cat = CATS.find(c => c.id === caseData?.catId);
    const doneCount = steps.filter(s => s.done).length;
    const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
    return (
      <button
        onClick={() => { store.setActiveCaseContext({ ...ctx, minimized: false }); setPillState('active'); }}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #1a1f25, #2d1b3d)', border: '1px solid rgba(255,255,255,0.15)',
          transform: mounted ? 'translateY(0)' : 'translateY(20px)', opacity: mounted ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
      >
        <ProgressRing pct={pct} size={30} stroke={2.5} color={COLOR_HEX[cat?.color || ''] || '#d62839'} />
        <div className="text-left">
          <p className="text-white text-xs font-bold truncate max-w-[160px]">{ctx.caseTitle}</p>
          <p className="text-gray-400 text-[10px]">{doneCount}/{totalSteps} steps</p>
        </div>
      </button>
    );
  }

  // ── ACTIVE ────────────────────────────────────────────
  if (!ctx) return null;
  const phaseColor = ctx.phaseColor || '#e53e3e';
  const cat = CATS.find(c => c.id === caseData?.catId);
  const pri = PRIORITY_STYLES[caseData?.priority || 'medium'] || PRIORITY_STYLES.medium;
  const doneCount = steps.filter(s => s.done).length;
  const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 w-96 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        background: '#fff', border: '1px solid #e5e0dc',
        transform: mounted ? 'translateY(0)' : 'translateY(40px)',
        opacity: mounted ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
      }}
      role="complementary"
    >
      {/* Header with case info */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #1a1f25, #2d1b3d)' }}>
        <ProgressRing pct={pct} size={42} stroke={3.5} color={COLOR_HEX[cat?.color || ''] || '#d62839'} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold truncate">{ctx.caseTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pri.bg} ${pri.text}`}>{caseData?.priority || 'medium'}</span>
            <span className="text-gray-400 text-[10px]">{cat?.icon} Unit {caseData?.unit || 'N/A'} · {APPROACH_LABELS[caseData?.approach || 'pre']}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={() => { store.setActiveCaseContext({ ...ctx, minimized: true }); setPillState('minimized'); }}
            className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs flex items-center justify-center cursor-pointer">—</button>
          <button onClick={() => { store.clearActiveCaseContext(); setPillState('idle'); }}
            className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs flex items-center justify-center cursor-pointer">✕</button>
        </div>
      </div>

      {/* Current step card */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Current Step</p>
          <p className="text-[10px] text-ink-400">{doneCount}/{totalSteps} complete</p>
        </div>
        <div className="bg-ink-50 border border-ink-100 rounded-[10px] p-2.5 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-full bg-accent-500 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">{ctx.stepIdx + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink-900 leading-tight">{ctx.stepTitle}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {ctx.stepTiming && (
                <>
                  <span className="text-[10px] text-ink-400 font-medium">⏱ {ctx.stepTiming}</span>
                  <span className="text-ink-200">·</span>
                </>
              )}
              {ctx.stepProgress && (
                <span className="text-[10px] font-semibold text-accent-500">{ctx.stepProgress.done}/{ctx.stepProgress.total} tasks</span>
              )}
              {ctx.phaseLabel && (
                <span className="text-[10px] font-semibold rounded px-1.5 py-px" style={{ color: phaseColor, background: `${phaseColor}11` }}>
                  {ctx.phaseLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Step navigation */}
        {totalSteps > 1 && (
          <div className="flex items-center justify-between mt-2">
            <button onClick={() => canPrev && navigateStep(ctx.stepIdx - 1)} disabled={!canPrev}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                canPrev ? 'text-ink-600 hover:bg-ink-100 hover:text-ink-800' : 'text-ink-200 cursor-not-allowed'
              }`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Prev
            </button>
            <span className="text-[10px] font-medium text-ink-400">Step {ctx.stepIdx + 1} of {totalSteps}</span>
            <button onClick={() => canNext && navigateStep(ctx.stepIdx + 1)} disabled={!canNext}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                canNext ? 'text-ink-600 hover:bg-ink-100 hover:text-ink-800' : 'text-ink-200 cursor-not-allowed'
              }`}>
              Next
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3.5 pb-3.5 flex items-center gap-2">
        <button onClick={() => { setPillState('picker'); setPickerTab('open'); setSearchQuery(''); }}
          className="text-xs text-ink-400 hover:text-ink-600 cursor-pointer font-medium">← All Cases</button>
        <div className="flex-1" />
        <button onClick={handleReturn}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer hover:shadow-lg transition-all"
          style={{ background: 'linear-gradient(135deg, #d62839, #a61c2a)' }}>
          Open Full Case →
        </button>
      </div>
    </div>
  );
}
