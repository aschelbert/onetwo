import { useState, useMemo } from 'react';
import { useScorecardStore } from '@/store/useScorecardStore';
import type { ScorecardEntry } from '@/store/useScorecardStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

// ─── Constants ────────────────────────────────────────

type Category = ScorecardEntry['category'];

const CATEGORIES: { key: Category; label: string; icon: string; description: string }[] = [
  { key: 'responsiveness', label: 'Responsiveness', icon: '⚡', description: 'Response time to requests and emergencies' },
  { key: 'financial', label: 'Financial', icon: '💰', description: 'Budget reporting, fee collection, financial accuracy' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧', description: 'Property upkeep, vendor management, repairs' },
  { key: 'communication', label: 'Communication', icon: '💬', description: 'Board updates, resident communication' },
  { key: 'compliance', label: 'Compliance', icon: '📋', description: 'Regulatory filing, legal compliance' },
];

const PERIODS = ['2026-Q1', '2025-Q4', '2025-Q3', '2025-Q2', '2025-Q1', '2024-Q4'];

function scoreColorClasses(score: number): { bg: string; text: string; border: string; fill: string } {
  if (score >= 4) return { bg: 'bg-sage-50', text: 'text-sage-700', border: 'border-sage-200', fill: 'text-sage-500' };
  if (score === 3) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', fill: 'text-yellow-500' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', fill: 'text-red-500' };
}

// ─── Star Components ──────────────────────────────────

function StarRating({ score, max = 5, size = 'md' }: { score: number; max?: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm';
  return (
    <span className={`inline-flex gap-0.5 ${sizeClass}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < Math.round(score) ? `${scoreColorClasses(score).fill}` : 'text-ink-200'}>
          {i < Math.round(score) ? '\u2605' : '\u2606'}
        </span>
      ))}
    </span>
  );
}

function ClickableStars({ value, onChange, size = 'md' }: { value: number; onChange: (v: number) => void; size?: 'sm' | 'md' | 'lg' }) {
  const [hover, setHover] = useState(0);
  const sizeClass = size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-2xl' : 'text-lg';
  const display = hover || value;
  return (
    <span className={`inline-flex gap-1 ${sizeClass} cursor-pointer`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`transition-colors ${i < display ? (scoreColorClasses(display).fill) : 'text-ink-200 hover:text-ink-300'}`}
          onMouseEnter={() => setHover(i + 1)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i + 1)}
        >
          {i < display ? '\u2605' : '\u2606'}
        </span>
      ))}
    </span>
  );
}

// ─── Modal Types ──────────────────────────────────────

type ModalType = null | 'scoreEntry' | 'writeReview' | 'viewReview';

// ─── Component ────────────────────────────────────────

export default function PMScorecardTab() {
  const store = useScorecardStore();
  const { currentUser } = useAuthStore();
  const { management } = useBuildingStore();

  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[0]);
  const [modal, setModal] = useState<ModalType>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [viewReviewId, setViewReviewId] = useState<string | null>(null);

  // Score entry form state
  const [entryScore, setEntryScore] = useState(0);
  const [entryNotes, setEntryNotes] = useState('');

  // Review form state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewSummary, setReviewSummary] = useState('');
  const [reviewStrengths, setReviewStrengths] = useState<string[]>(['']);
  const [reviewImprovements, setReviewImprovements] = useState<string[]>(['']);

  // ─── Derived Data ───────────────────────────────────

  const periodEntries = useMemo(
    () => store.entries.filter(e => e.period === selectedPeriod),
    [store.entries, selectedPeriod],
  );

  const periodReviews = useMemo(
    () => store.reviews.filter(r => r.period === selectedPeriod),
    [store.reviews, selectedPeriod],
  );

  const categoryScores = useMemo(() => {
    const map: Record<Category, ScorecardEntry[]> = {
      responsiveness: [], financial: [], maintenance: [], communication: [], compliance: [],
    };
    for (const entry of periodEntries) {
      map[entry.category].push(entry);
    }
    return map;
  }, [periodEntries]);

  const categoryAverages = useMemo(() => {
    const avgs: Record<Category, number> = { responsiveness: 0, financial: 0, maintenance: 0, communication: 0, compliance: 0 };
    for (const cat of CATEGORIES) {
      const entries = categoryScores[cat.key];
      avgs[cat.key] = entries.length > 0 ? entries.reduce((s, e) => s + e.score, 0) / entries.length : 0;
    }
    return avgs;
  }, [categoryScores]);

  const overallScore = useMemo(() => {
    const scored = CATEGORIES.filter(c => categoryAverages[c.key] > 0);
    if (scored.length === 0) return 0;
    return scored.reduce((s, c) => s + categoryAverages[c.key], 0) / scored.length;
  }, [categoryAverages]);

  // Historical data for trend view
  const trendData = useMemo(() => {
    return PERIODS.map(period => {
      const entries = store.entries.filter(e => e.period === period);
      const catAvgs: Record<Category, number> = { responsiveness: 0, financial: 0, maintenance: 0, communication: 0, compliance: 0 };
      for (const cat of CATEGORIES) {
        const catEntries = entries.filter(e => e.category === cat.key);
        catAvgs[cat.key] = catEntries.length > 0 ? catEntries.reduce((s, e) => s + e.score, 0) / catEntries.length : 0;
      }
      const scored = CATEGORIES.filter(c => catAvgs[c.key] > 0);
      const overall = scored.length > 0 ? scored.reduce((s, c) => s + catAvgs[c.key], 0) / scored.length : 0;
      return { period, categories: catAvgs, overall, hasData: entries.length > 0 };
    });
  }, [store.entries]);

  // ─── Handlers ───────────────────────────────────────

  const openScoreModal = (category: Category) => {
    const existing = periodEntries.find(e => e.category === category && e.scoredBy === currentUser.name);
    setActiveCategory(category);
    setEntryScore(existing ? existing.score : 0);
    setEntryNotes(existing ? existing.notes : '');
    setModal('scoreEntry');
  };

  const saveScore = () => {
    if (!activeCategory || entryScore === 0) return;
    // Remove existing entry from this user for this category/period
    const existing = periodEntries.find(e => e.category === activeCategory && e.scoredBy === currentUser.name);
    if (existing) store.deleteEntry(existing.id);
    store.addEntry({
      period: selectedPeriod,
      category: activeCategory,
      score: entryScore,
      notes: entryNotes,
      scoredBy: currentUser.name,
    });
    setModal(null);
    setActiveCategory(null);
    setEntryScore(0);
    setEntryNotes('');
  };

  const openReviewModal = () => {
    setReviewRating(0);
    setReviewSummary('');
    setReviewStrengths(['']);
    setReviewImprovements(['']);
    setModal('writeReview');
  };

  const saveReview = () => {
    if (reviewRating === 0 || !reviewSummary.trim()) return;
    store.addReview({
      period: selectedPeriod,
      overallRating: reviewRating,
      summary: reviewSummary,
      strengths: reviewStrengths.filter(s => s.trim()),
      improvements: reviewImprovements.filter(s => s.trim()),
      reviewedBy: currentUser.name,
    });
    setModal(null);
  };

  const openViewReview = (id: string) => {
    setViewReviewId(id);
    setModal('viewReview');
  };

  const viewedReview = viewReviewId ? store.reviews.find(r => r.id === viewReviewId) : null;

  // ─── Dynamic list helpers ───────────────────────────

  const updateStrength = (idx: number, val: string) => {
    setReviewStrengths(prev => prev.map((s, i) => i === idx ? val : s));
  };
  const addStrength = () => setReviewStrengths(prev => [...prev, '']);
  const removeStrength = (idx: number) => setReviewStrengths(prev => prev.filter((_, i) => i !== idx));

  const updateImprovement = (idx: number, val: string) => {
    setReviewImprovements(prev => prev.map((s, i) => i === idx ? val : s));
  };
  const addImprovement = () => setReviewImprovements(prev => [...prev, '']);
  const removeImprovement = (idx: number) => setReviewImprovements(prev => prev.filter((_, i) => i !== idx));

  // ─── Render ─────────────────────────────────────────

  const activeCatMeta = activeCategory ? CATEGORIES.find(c => c.key === activeCategory) : null;

  return (
    <div className="space-y-6">
      {/* ── Overview Header ─────────────────────────── */}
      <div className="bg-gradient-to-br from-ink-900 via-ink-800 to-accent-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display text-xl font-bold">PM Scorecard</h3>
            <p className="text-accent-200 text-sm mt-1">{management.company || 'Property Management Company'}</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="bg-white bg-opacity-10 border border-white border-opacity-20 rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer"
            >
              {PERIODS.map(p => <option key={p} value={p} className="text-ink-900">{p}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold">
              {overallScore > 0 ? overallScore.toFixed(1) : '--'}
            </div>
            <p className="text-accent-200 text-xs mt-1">Overall Score</p>
          </div>
          <div>
            {overallScore > 0 ? (
              <StarRating score={overallScore} size="lg" />
            ) : (
              <span className="text-accent-300 text-sm">No scores yet for this period</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mt-4">
          {CATEGORIES.map(cat => {
            const avg = categoryAverages[cat.key];
            return (
              <div key={cat.key} className="bg-white bg-opacity-10 rounded-lg p-2 text-center">
                <p className="text-[10px] text-accent-100 leading-tight">{cat.label}</p>
                <p className={`text-sm font-bold mt-0.5 ${avg >= 4 ? 'text-green-300' : avg >= 3 ? 'text-yellow-300' : avg > 0 ? 'text-red-300' : 'text-accent-300'}`}>
                  {avg > 0 ? avg.toFixed(1) : '--'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Category Scores Grid ────────────────────── */}
      <div>
        <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Category Scores</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORIES.map(cat => {
            const entries = categoryScores[cat.key];
            const avg = categoryAverages[cat.key];
            const colors = avg > 0 ? scoreColorClasses(Math.round(avg)) : { bg: 'bg-ink-50', text: 'text-ink-500', border: 'border-ink-100', fill: 'text-ink-300' };

            return (
              <div key={cat.key} className={`rounded-xl border p-4 transition-all ${colors.border} ${colors.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.icon}</span>
                    <div>
                      <h5 className="text-sm font-bold text-ink-900">{cat.label}</h5>
                      <p className="text-[11px] text-ink-500">{cat.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div>
                    {avg > 0 ? (
                      <StarRating score={avg} size="md" />
                    ) : (
                      <span className="text-xs text-ink-400">Not yet rated</span>
                    )}
                    {avg > 0 && (
                      <p className={`text-xs font-semibold mt-0.5 ${colors.text}`}>{avg.toFixed(1)} / 5.0</p>
                    )}
                  </div>
                  <button
                    onClick={() => openScoreModal(cat.key)}
                    className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors"
                  >
                    Rate
                  </button>
                </div>

                {entries.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-ink-100 space-y-2">
                    {entries.map(entry => (
                      <div key={entry.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-ink-600 leading-snug">{entry.notes}</p>
                          <p className="text-[10px] text-ink-400 mt-0.5">
                            {entry.scoredBy} -- {'\u2605'.repeat(entry.score)}{'\u2606'.repeat(5 - entry.score)}
                          </p>
                        </div>
                        <button
                          onClick={() => { if (confirm('Remove this score?')) store.deleteEntry(entry.id); }}
                          className="text-[10px] text-red-400 hover:text-red-600 shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quarterly Reviews Section ───────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Quarterly Reviews</h4>
          <button
            onClick={openReviewModal}
            className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium"
          >
            + Write Review
          </button>
        </div>

        {periodReviews.length === 0 ? (
          <div className="bg-ink-50 rounded-xl p-8 text-center border border-ink-100">
            <p className="text-ink-400 text-sm">No reviews for {selectedPeriod} yet.</p>
            <button onClick={openReviewModal} className="mt-2 text-sm text-accent-600 font-medium hover:text-accent-700">
              Write the first review
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {periodReviews.map(review => (
              <div key={review.id} className="bg-white rounded-xl border border-ink-100 p-5 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <StarRating score={review.overallRating} size="sm" />
                      <span className="text-sm font-bold text-ink-900">{review.overallRating}/5</span>
                    </div>
                    <p className="text-sm text-ink-700 mt-2">{review.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openViewReview(review.id)}
                      className="text-xs text-accent-600 font-medium hover:text-accent-700"
                    >
                      View
                    </button>
                    <button
                      onClick={() => { if (confirm('Delete this review?')) store.deleteReview(review.id); }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  {review.strengths.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-sage-700 uppercase tracking-wider mb-1">Strengths</p>
                      <ul className="space-y-0.5">
                        {review.strengths.slice(0, 3).map((s, i) => (
                          <li key={i} className="text-xs text-ink-600 flex items-start gap-1.5">
                            <span className="text-sage-500 shrink-0 mt-px">{'\u2713'}</span>
                            <span>{s}</span>
                          </li>
                        ))}
                        {review.strengths.length > 3 && (
                          <li className="text-[10px] text-ink-400">+{review.strengths.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {review.improvements.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wider mb-1">Improvements</p>
                      <ul className="space-y-0.5">
                        {review.improvements.slice(0, 3).map((s, i) => (
                          <li key={i} className="text-xs text-ink-600 flex items-start gap-1.5">
                            <span className="text-yellow-500 shrink-0 mt-px">{'\u25CB'}</span>
                            <span>{s}</span>
                          </li>
                        ))}
                        {review.improvements.length > 3 && (
                          <li className="text-[10px] text-ink-400">+{review.improvements.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-ink-400 mt-3">Reviewed by {review.reviewedBy}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Historical Trend ────────────────────────── */}
      <div>
        <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Performance Trend</h4>
        <div className="bg-white rounded-xl border border-ink-100 p-5">
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <div className="w-20 shrink-0 text-[10px] font-semibold text-ink-500 uppercase">Period</div>
              <div className="flex-1 text-[10px] font-semibold text-ink-500 uppercase text-right">Score</div>
              <div className="w-40 text-[10px] font-semibold text-ink-500 uppercase">Distribution</div>
            </div>

            {trendData.map(row => {
              if (!row.hasData) return null;
              const barColor = row.overall >= 4 ? 'bg-sage-400' : row.overall >= 3 ? 'bg-yellow-400' : 'bg-red-400';
              const barWidth = (row.overall / 5) * 100;
              return (
                <div
                  key={row.period}
                  className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-colors ${row.period === selectedPeriod ? 'bg-accent-50 border border-accent-200' : 'hover:bg-ink-50'}`}
                  onClick={() => setSelectedPeriod(row.period)}
                >
                  <div className="w-20 shrink-0">
                    <span className={`text-xs font-semibold ${row.period === selectedPeriod ? 'text-accent-700' : 'text-ink-700'}`}>
                      {row.period}
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    <span className="text-sm font-bold text-ink-900">{row.overall.toFixed(1)}</span>
                    <span className="text-xs text-ink-400 ml-1">/5</span>
                  </div>
                  <div className="w-40">
                    <div className="h-4 bg-ink-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}

            {trendData.every(r => !r.hasData) && (
              <p className="text-center text-sm text-ink-400 py-4">No historical data available.</p>
            )}
          </div>

          {/* Category breakdown bars */}
          {trendData.some(r => r.hasData) && (
            <div className="mt-5 pt-4 border-t border-ink-100">
              <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider mb-3">Category Breakdown by Period</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-3 text-ink-500 font-semibold w-20">Period</th>
                      {CATEGORIES.map(cat => (
                        <th key={cat.key} className="text-center py-1.5 px-1 text-ink-500 font-semibold">
                          <span className="mr-0.5">{cat.icon}</span>{cat.label.slice(0, 4)}.
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.filter(r => r.hasData).map(row => (
                      <tr key={row.period} className={row.period === selectedPeriod ? 'bg-accent-50' : ''}>
                        <td className="py-1.5 pr-3 font-semibold text-ink-700">{row.period}</td>
                        {CATEGORIES.map(cat => {
                          const val = row.categories[cat.key];
                          const color = val >= 4 ? 'sage' : val >= 3 ? 'yellow' : val > 0 ? 'red' : 'ink';
                          return (
                            <td key={cat.key} className="text-center py-1.5 px-1">
                              {val > 0 ? (
                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-${color}-700 bg-${color}-100`}>
                                  {val.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-ink-300">--</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Score Entry Modal ───────────────────────── */}
      {modal === 'scoreEntry' && activeCatMeta && (
        <Modal
          title={`Rate: ${activeCatMeta.label}`}
          subtitle={activeCatMeta.description}
          onClose={() => { setModal(null); setActiveCategory(null); }}
          onSave={saveScore}
          saveLabel="Submit Score"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Period</label>
              <input
                type="text"
                value={selectedPeriod}
                disabled
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-ink-50 text-ink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Category</label>
              <input
                type="text"
                value={activeCatMeta.label}
                disabled
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-ink-50 text-ink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-2">Score *</label>
              <div className="flex items-center gap-3">
                <ClickableStars value={entryScore} onChange={setEntryScore} size="lg" />
                {entryScore > 0 && (
                  <span className={`text-sm font-bold ${scoreColorClasses(entryScore).text}`}>
                    {entryScore}/5
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Notes</label>
              <textarea
                value={entryNotes}
                onChange={e => setEntryNotes(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none"
                rows={3}
                placeholder="Add context or observations about this rating..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Scored By</label>
              <input
                type="text"
                value={currentUser.name}
                disabled
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-ink-50 text-ink-500"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Write Review Modal ─────────────────────── */}
      {modal === 'writeReview' && (
        <Modal
          title="Write Quarterly Review"
          subtitle={`${management.company || 'PM Company'} -- ${selectedPeriod}`}
          onClose={() => setModal(null)}
          onSave={saveReview}
          saveLabel="Submit Review"
          wide
        >
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-2">Overall Rating *</label>
              <div className="flex items-center gap-3">
                <ClickableStars value={reviewRating} onChange={setReviewRating} size="lg" />
                {reviewRating > 0 && (
                  <span className={`text-sm font-bold ${scoreColorClasses(reviewRating).text}`}>
                    {reviewRating}/5
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Summary *</label>
              <textarea
                value={reviewSummary}
                onChange={e => setReviewSummary(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none"
                rows={4}
                placeholder="Provide an overall assessment of the PM company's performance this quarter..."
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* Strengths */}
              <div>
                <label className="block text-xs font-medium text-sage-700 mb-2">{'\u2713'} Strengths</label>
                <div className="space-y-2">
                  {reviewStrengths.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sage-500 text-sm shrink-0">{'\u2713'}</span>
                      <input
                        type="text"
                        value={s}
                        onChange={e => updateStrength(i, e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-ink-200 rounded-lg text-sm"
                        placeholder="Add a strength..."
                      />
                      {reviewStrengths.length > 1 && (
                        <button onClick={() => removeStrength(i)} className="text-xs text-red-400 hover:text-red-600 shrink-0">{'\u00D7'}</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addStrength} className="text-xs text-sage-600 font-medium hover:text-sage-700">+ Add strength</button>
                </div>
              </div>

              {/* Improvements */}
              <div>
                <label className="block text-xs font-medium text-yellow-700 mb-2">{'\u25CB'} Areas for Improvement</label>
                <div className="space-y-2">
                  {reviewImprovements.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-yellow-500 text-sm shrink-0">{'\u25CB'}</span>
                      <input
                        type="text"
                        value={s}
                        onChange={e => updateImprovement(i, e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-ink-200 rounded-lg text-sm"
                        placeholder="Add an improvement area..."
                      />
                      {reviewImprovements.length > 1 && (
                        <button onClick={() => removeImprovement(i)} className="text-xs text-red-400 hover:text-red-600 shrink-0">{'\u00D7'}</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addImprovement} className="text-xs text-yellow-600 font-medium hover:text-yellow-700">+ Add improvement</button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Reviewed By</label>
              <input
                type="text"
                value={currentUser.name}
                disabled
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm bg-ink-50 text-ink-500"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ── View Review Modal ──────────────────────── */}
      {modal === 'viewReview' && viewedReview && (
        <Modal
          title="Quarterly Review"
          subtitle={`${management.company || 'PM Company'} -- ${viewedReview.period}`}
          onClose={() => { setModal(null); setViewReviewId(null); }}
          wide
        >
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <StarRating score={viewedReview.overallRating} size="lg" />
              <span className={`text-2xl font-bold ${scoreColorClasses(viewedReview.overallRating).text}`}>
                {viewedReview.overallRating}/5
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">Summary</p>
              <p className="text-sm text-ink-700 leading-relaxed">{viewedReview.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {viewedReview.strengths.length > 0 && (
                <div className="bg-sage-50 rounded-xl p-4 border border-sage-200">
                  <p className="text-xs font-semibold text-sage-700 uppercase tracking-wider mb-2">Strengths</p>
                  <ul className="space-y-1.5">
                    {viewedReview.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-ink-700 flex items-start gap-2">
                        <span className="text-sage-500 font-bold shrink-0 mt-px">{'\u2713'}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {viewedReview.improvements.length > 0 && (
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                  <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wider mb-2">Areas for Improvement</p>
                  <ul className="space-y-1.5">
                    {viewedReview.improvements.map((s, i) => (
                      <li key={i} className="text-sm text-ink-700 flex items-start gap-2">
                        <span className="text-yellow-500 font-bold shrink-0 mt-px">{'\u25CB'}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className="text-xs text-ink-400">Reviewed by <strong>{viewedReview.reviewedBy}</strong></p>
          </div>
        </Modal>
      )}
    </div>
  );
}
