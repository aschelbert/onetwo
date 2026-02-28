import { useState, useMemo } from 'react';
import { useSpendingStore } from '@/store/useSpendingStore';
import type { SpendingApproval, FundingOption } from '@/store/useSpendingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

type StatusFilter = 'all' | 'pending' | 'approved' | 'denied';

const CATEGORIES: { value: SpendingApproval['category']; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'capital', label: 'Capital' },
  { value: 'operations', label: 'Operations' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
];

const FUNDING_SOURCES: { value: SpendingApproval['fundingSource']; label: string; desc: string }[] = [
  { value: 'operating', label: 'Operating Budget', desc: 'Day-to-day operating funds' },
  { value: 'reserves', label: 'Reserve Fund', desc: 'Long-term capital reserves' },
  { value: 'special_assessment', label: 'Special Assessment', desc: 'One-time charge to unit owners' },
  { value: 'insurance', label: 'Insurance Claim', desc: 'Filed or expected insurance recovery' },
  { value: 'loan', label: 'HOA Loan / Financing', desc: 'Financed over time to reduce owner impact' },
];

const STATUS_COLORS: Record<SpendingApproval['status'], { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
  approved: { bg: 'bg-sage-100', text: 'text-sage-700', label: 'Approved' },
  denied: { bg: 'bg-red-100', text: 'text-red-700', label: 'Denied' },
  more_info: { bg: 'bg-mist-100', text: 'text-mist-700', label: 'More Info' },
};

const EMPTY_FORM = {
  title: '',
  description: '',
  amount: '',
  category: 'maintenance' as SpendingApproval['category'],
  priority: 'normal' as SpendingApproval['priority'],
  vendorName: '',
  threshold: '5000',
  notes: '',
  fundingSource: '' as SpendingApproval['fundingSource'],
};

export default function FLApprovals() {
  const { approvals, addApproval, castVote, deleteApproval } = useSpendingStore();
  const { currentUser, currentRole } = useAuthStore();
  const { board } = useBuildingStore();
  const financialStore = useFinancialStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const isBoardMember = currentRole === 'BOARD_MEMBER' || currentRole === 'PLATFORM_ADMIN';

  // ─── Financial context for decision-making ───────────────────
  const financialContext = useMemo(() => {
    const bs = financialStore.getBalanceSheet();
    const budget = financialStore.getOperatingBudget();
    const bv = financialStore.getBudgetVariance();
    const reserveStatus = financialStore.getReserveFundingStatus();
    const totalUnits = financialStore.units.length;

    const operatingBalance = bs.assets.operating;
    const reserveBalance = bs.assets.reserves;
    const totalReserveNeeded = reserveStatus.reduce((s, r) => s + r.estimatedCost, 0);
    const reservePctFunded = totalReserveNeeded > 0 ? Math.round((reserveBalance / totalReserveNeeded) * 100) : 100;

    const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
    const totalSpent = bv.reduce((s, b) => s + b.actual, 0);
    const budgetRemaining = totalBudgeted - totalSpent;

    return { operatingBalance, reserveBalance, reservePctFunded, totalUnits, budgetRemaining, totalBudgeted, totalSpent, budget };
  }, [financialStore]);

  // ─── Compute funding analysis for a given amount ───────────
  function analyzeFunding(amount: number): { options: FundingOption[]; recommendation: string } {
    const { operatingBalance, reserveBalance, reservePctFunded, totalUnits, budgetRemaining } = financialContext;
    const perUnit = totalUnits > 0 ? Math.round((amount / totalUnits) * 100) / 100 : amount;

    const options: FundingOption[] = [];

    // Operating budget
    const canOperating = budgetRemaining >= amount;
    const opPct = budgetRemaining > 0 ? Math.round((amount / budgetRemaining) * 100) : 999;
    options.push({
      source: 'operating',
      label: 'Operating Budget',
      available: canOperating,
      impact: canOperating
        ? `Uses ${opPct}% of remaining operating budget (${fmt(budgetRemaining)} left)`
        : `Short by ${fmt(amount - budgetRemaining)} — operating budget can't cover this`,
      perUnit: 0,
      recommended: canOperating && amount <= 10000,
    });

    // Reserves
    const canReserve = reserveBalance >= amount;
    const afterReservePct = reserveBalance > 0 ? Math.round(((reserveBalance - amount) / (reserveBalance / (reservePctFunded / 100))) * 100) : 0;
    options.push({
      source: 'reserves',
      label: 'Reserve Fund',
      available: canReserve,
      impact: canReserve
        ? `Reserves drop from ${reservePctFunded}% to ~${Math.max(0, afterReservePct)}% funded — ${afterReservePct < 30 ? 'CRITICALLY LOW, may trigger special assessment later' : afterReservePct < 50 ? 'below recommended level' : 'still healthy'}`
        : `Reserves only have ${fmt(reserveBalance)} — can't cover ${fmt(amount)}`,
      perUnit: 0,
      recommended: canReserve && afterReservePct >= 50,
    });

    // Special assessment
    options.push({
      source: 'special_assessment',
      label: 'Special Assessment',
      available: true,
      impact: `Each unit pays ${fmt(perUnit)} — ${perUnit > 2000 ? 'consider installment plan (3-12 months) to ease impact' : perUnit > 500 ? 'moderate per-unit cost' : 'minor per-unit cost'}`,
      perUnit,
      recommended: !canOperating && (!canReserve || afterReservePct < 30),
    });

    // Insurance
    options.push({
      source: 'insurance',
      label: 'Insurance Claim',
      available: true,
      impact: 'File claim with carrier — HOA pays deductible only if approved. Best option when damage is from a covered peril.',
      perUnit: 0,
      recommended: false,
    });

    // HOA Loan
    options.push({
      source: 'loan',
      label: 'HOA Loan / Financing',
      available: true,
      impact: amount >= 25000
        ? `Spread cost over 3-10 years — estimated ${fmt(Math.round(amount / 60))} to ${fmt(Math.round(amount / 36))}/month added to assessments. Avoids large one-time hit.`
        : `Financing typically makes sense for projects over $25K — this is ${fmt(amount)}.`,
      perUnit: amount >= 25000 ? Math.round((amount / 60 / totalUnits) * 100) / 100 : 0,
      recommended: amount >= 50000 && (!canReserve || afterReservePct < 40),
    });

    // Build recommendation
    let recommendation = '';
    const recommended = options.find(o => o.recommended);
    if (amount <= 5000 && canOperating) {
      recommendation = 'This is within typical board spending authority. Fund from operating budget — no owner vote likely needed.';
    } else if (canReserve && afterReservePct >= 50) {
      recommendation = 'Reserves can cover this and stay above 50% funded. This is the cleanest option — no impact on unit owners.';
    } else if (canReserve && afterReservePct >= 30) {
      recommendation = 'Reserves can cover this, but funding drops below 50%. Consider a partial reserve draw + increased reserve contribution next budget cycle.';
    } else if (amount >= 50000) {
      recommendation = 'For a project this size, consider phasing the work across fiscal years, using reserves for Phase 1, or financing to spread the cost. A special assessment of ' + fmt(perUnit) + '/unit is significant — installment plans reduce owner hardship.';
    } else if (!canOperating && !canReserve) {
      recommendation = 'Neither operating budget nor reserves can cover this. A special assessment is needed — ' + fmt(perUnit) + ' per unit. Consider payment plans for amounts over $1,000/unit.';
    } else {
      recommendation = recommended?.impact || 'Review the funding options below to find the best fit.';
    }

    return { options, recommendation };
  }

  // ─── Summary metrics ────────────────────────────────────────
  const summary = useMemo(() => {
    const pending = approvals.filter(a => a.status === 'pending');
    const pendingCount = pending.length;
    const pendingAmount = pending.reduce((s, a) => s + a.amount, 0);
    return { pendingCount, pendingAmount };
  }, [approvals]);

  // Filtered list
  const filtered = useMemo(() => {
    return approvals.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      return true;
    });
  }, [approvals, statusFilter]);

  // Handle adding a new request
  const handleAddRequest = () => {
    const amount = parseFloat(form.amount);
    if (!form.title.trim()) { alert('Title is required'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    addApproval({
      title: form.title.trim(),
      description: form.description.trim(),
      amount,
      category: form.category,
      requestedBy: currentUser.name,
      status: 'pending',
      priority: form.priority,
      vendorName: form.vendorName.trim(),
      workOrderId: '',
      votes: [],
      threshold: parseFloat(form.threshold) || 5000,
      notes: form.notes.trim(),
      decidedAt: '',
      fundingSource: form.fundingSource,
      caseId: '',
    });
    setForm(EMPTY_FORM);
    setShowAddModal(false);
  };

  const hasVoted = (approval: SpendingApproval) => approval.votes.some(v => v.member === currentUser.name);
  const canVote = (approval: SpendingApproval) => isBoardMember && approval.status === 'pending' && !hasVoted(approval);

  return (
    <div className="space-y-6">
      {/* Financial Context Bar */}
      <div className="bg-gradient-to-r from-mist-50 to-accent-50 border border-mist-200 rounded-xl p-5">
        <h3 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-3">Financial Snapshot — Know Before You Vote</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="text-center">
            <p className="text-[10px] text-ink-400 font-medium uppercase">Operating Cash</p>
            <p className="text-lg font-bold text-ink-900">{fmt(financialContext.operatingBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-ink-400 font-medium uppercase">Budget Remaining</p>
            <p className={`text-lg font-bold ${financialContext.budgetRemaining > 0 ? 'text-sage-700' : 'text-red-600'}`}>
              {fmt(financialContext.budgetRemaining)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-ink-400 font-medium uppercase">Reserve Balance</p>
            <p className="text-lg font-bold text-ink-900">{fmt(financialContext.reserveBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-ink-400 font-medium uppercase">Reserve Health</p>
            <p className={`text-lg font-bold ${financialContext.reservePctFunded >= 70 ? 'text-sage-700' : financialContext.reservePctFunded >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
              {financialContext.reservePctFunded}% funded
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-ink-400 font-medium uppercase">Pending Approvals</p>
            <p className="text-lg font-bold text-yellow-600">{summary.pendingCount} ({fmt(summary.pendingAmount)})</p>
          </div>
        </div>
      </div>

      {/* Filter / Action Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-mist-50 rounded-lg p-1">
            {([
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'denied', label: 'Denied' },
            ] as { value: StatusFilter; label: string }[]).map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-white shadow-sm text-ink-900'
                    : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium"
        >
          + New Spending Request
        </button>
      </div>

      {/* Approval Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-mist-50 rounded-xl">
          <p className="text-ink-400 text-lg">No spending requests found</p>
          <p className="text-ink-300 text-sm mt-1">
            {statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create a new spending request to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(approval => {
            const statusStyle = STATUS_COLORS[approval.status];
            const approveCount = approval.votes.filter(v => v.vote === 'approve').length;
            const denyCount = approval.votes.filter(v => v.vote === 'deny').length;
            const isExpanded = expandedId === approval.id;
            const analysis = isExpanded ? analyzeFunding(approval.amount) : null;
            const perUnit = financialContext.totalUnits > 0 ? approval.amount / financialContext.totalUnits : approval.amount;

            return (
              <div
                key={approval.id}
                className={`bg-white border rounded-xl overflow-hidden transition-all ${
                  approval.priority === 'urgent' ? 'border-red-300 border-l-4 border-l-red-500' : 'border-ink-100'
                }`}
              >
                {/* Main card content */}
                <div className="p-5">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.label}
                      </span>
                      {approval.priority === 'urgent' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">Urgent</span>
                      )}
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-ink-100 text-ink-500 capitalize">{approval.category}</span>
                      {approval.fundingSource && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-100 text-accent-700">
                          {FUNDING_SOURCES.find(f => f.value === approval.fundingSource)?.label || approval.fundingSource}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => { if (confirm(`Delete "${approval.title}"?`)) deleteApproval(approval.id); }}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Title + Amount + Per-Unit */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-ink-900 text-base">{approval.title}</h4>
                      {approval.description && (
                        <p className="text-sm text-ink-500 mt-1 line-clamp-2">{approval.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-ink-900">{fmt(approval.amount)}</p>
                      <p className="text-xs text-ink-400">{fmt(perUnit)}/unit if assessed</p>
                    </div>
                  </div>

                  {/* Quick context: is this within board authority? */}
                  {approval.status === 'pending' && (
                    <div className={`rounded-lg px-3 py-2 mb-3 text-xs ${
                      approval.amount <= approval.threshold
                        ? 'bg-sage-50 border border-sage-200 text-sage-700'
                        : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                    }`}>
                      {approval.amount <= approval.threshold
                        ? `Within board spending authority (${fmt(approval.threshold)} threshold) — board vote only.`
                        : `Exceeds ${fmt(approval.threshold)} threshold — check bylaws for owner vote requirement. Per-unit impact: ${fmt(perUnit)}.`
                      }
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-4 text-xs text-ink-400 mb-3 flex-wrap">
                    <span>By: <span className="font-medium text-ink-600">{approval.requestedBy}</span></span>
                    {approval.vendorName && <span>Vendor: <span className="font-medium text-ink-600">{approval.vendorName}</span></span>}
                    {approval.notes && <span className="italic">{approval.notes}</span>}
                  </div>

                  {/* Expand toggle for funding analysis */}
                  {approval.status === 'pending' && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : approval.id)}
                      className="text-xs font-medium text-accent-600 hover:text-accent-800 transition-colors"
                    >
                      {isExpanded ? 'Hide funding analysis' : 'View funding analysis & options'}
                    </button>
                  )}
                </div>

                {/* Expanded: Funding Analysis */}
                {isExpanded && analysis && (
                  <div className="border-t border-ink-100 bg-mist-50 p-5 space-y-4">
                    {/* Recommendation */}
                    <div className="bg-white border border-accent-200 rounded-lg p-4">
                      <h5 className="text-xs font-bold text-accent-700 uppercase tracking-wider mb-2">Recommendation</h5>
                      <p className="text-sm text-ink-700 leading-relaxed">{analysis.recommendation}</p>
                    </div>

                    {/* Funding options */}
                    <div>
                      <h5 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-3">Funding Options</h5>
                      <div className="space-y-2">
                        {analysis.options.map(opt => (
                          <div
                            key={opt.source}
                            className={`bg-white border rounded-lg p-3 ${opt.recommended ? 'border-sage-300 ring-1 ring-sage-200' : 'border-ink-100'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-ink-800">{opt.label}</span>
                                  {opt.recommended && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sage-100 text-sage-700 uppercase">Recommended</span>
                                  )}
                                  {!opt.available && opt.source !== 'special_assessment' && opt.source !== 'insurance' && opt.source !== 'loan' && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 uppercase">Insufficient</span>
                                  )}
                                </div>
                                <p className="text-xs text-ink-500 mt-1 leading-relaxed">{opt.impact}</p>
                              </div>
                              {opt.perUnit > 0 && (
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-ink-700">{fmt(opt.perUnit)}</p>
                                  <p className="text-[10px] text-ink-400">per unit</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tips for large projects */}
                    {approval.amount >= 25000 && (
                      <div className="bg-white border border-yellow-200 rounded-lg p-4">
                        <h5 className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-2">Large Project Tips</h5>
                        <ul className="text-xs text-ink-600 space-y-1.5">
                          <li>Phase the project across fiscal years to spread cost (e.g., building A this year, building B next year)</li>
                          <li>Combine funding sources: partial reserves + smaller special assessment</li>
                          <li>Offer installment plans (3-12 months) for special assessments over $1,000/unit</li>
                          <li>Get attorney review for contracts over $25K; require performance bond for projects over $50K</li>
                          <li>Check bylaws — projects this size likely require owner vote (typically 2/3 in DC)</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Vote Section (for pending items) */}
                {approval.status === 'pending' && (
                  <div className={`border-t border-ink-100 ${isExpanded ? '' : ''} p-5 bg-white`}>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-semibold text-ink-700">Board Vote</h5>
                      <span className="text-xs font-medium text-ink-500">{approveCount}/3 needed</span>
                    </div>

                    {approval.votes.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {approval.votes.map((v, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                              v.vote === 'approve' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            <span>{v.vote === 'approve' ? '\u2713' : '\u2717'}</span>
                            <span>{v.member}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-400 mb-3">No votes yet</p>
                    )}

                    {/* Vote tally bar */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 bg-ink-100 rounded-full h-2 overflow-hidden">
                        <div className="flex h-full">
                          {approveCount > 0 && (
                            <div className="bg-sage-500 h-full transition-all" style={{ width: `${(approveCount / board.length) * 100}%` }} />
                          )}
                          {denyCount > 0 && (
                            <div className="bg-red-500 h-full transition-all" style={{ width: `${(denyCount / board.length) * 100}%` }} />
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-ink-400 shrink-0">{approveCount} approve / {denyCount} deny</span>
                    </div>

                    {canVote(approval) && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => castVote(approval.id, currentUser.name, 'approve')}
                          className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium hover:bg-sage-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => castVote(approval.id, currentUser.name, 'deny')}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    )}

                    {isBoardMember && hasVoted(approval) && (
                      <p className="text-xs text-ink-400 italic">You have already voted on this request.</p>
                    )}
                  </div>
                )}

                {/* Decided footer for resolved items */}
                {(approval.status === 'approved' || approval.status === 'denied') && approval.decidedAt && (
                  <div className="border-t border-ink-100 px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-ink-400">
                        <span>Decided: <span className="font-medium text-ink-600">{approval.decidedAt}</span></span>
                        <span>Votes: {approveCount} approve, {denyCount} deny</span>
                        {approval.fundingSource && (
                          <span>Funded via: <span className="font-medium text-ink-600">{FUNDING_SOURCES.find(f => f.value === approval.fundingSource)?.label || approval.fundingSource}</span></span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {approval.votes.map((v, i) => (
                          <span
                            key={i}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              v.vote === 'approve' ? 'bg-sage-50 text-sage-600' : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {v.vote === 'approve' ? '\u2713' : '\u2717'} {v.member}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Request Modal */}
      {showAddModal && (
        <Modal
          title="New Spending Request"
          onClose={() => { setShowAddModal(false); setForm(EMPTY_FORM); }}
          onSave={handleAddRequest}
          saveLabel="Submit Request"
        >
          <div className="space-y-4">
            <div className="bg-mist-50 rounded-lg p-3 text-xs text-ink-500">
              Submitting as: <strong>{currentUser.name}</strong>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">What needs to be done? *</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                placeholder="e.g., Replace lobby security cameras"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Why is this needed?</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                rows={3}
                placeholder="Explain why the board should approve this and what happens if we don't"
              />
            </div>

            {/* Amount + Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Estimated Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                  placeholder="4200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value as SpendingApproval['category'] })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Funding Source */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Where should the money come from?</label>
              <select
                value={form.fundingSource}
                onChange={e => setForm({ ...form, fundingSource: e.target.value as SpendingApproval['fundingSource'] })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
              >
                <option value="">Not sure yet — show me the options</option>
                {FUNDING_SOURCES.map(f => (
                  <option key={f.value} value={f.value}>{f.label} — {f.desc}</option>
                ))}
              </select>
            </div>

            {/* Live funding preview when amount is entered */}
            {form.amount && parseFloat(form.amount) > 0 && (() => {
              const amt = parseFloat(form.amount);
              const { totalUnits, budgetRemaining, reserveBalance, reservePctFunded } = financialContext;
              const pu = totalUnits > 0 ? amt / totalUnits : amt;
              return (
                <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 space-y-2">
                  <h5 className="text-xs font-bold text-accent-700 uppercase">Quick Impact Analysis</h5>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-ink-400">Per Unit</p>
                      <p className="text-sm font-bold text-ink-800">{fmt(pu)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-400">Operating Budget</p>
                      <p className={`text-sm font-bold ${budgetRemaining >= amt ? 'text-sage-700' : 'text-red-600'}`}>
                        {budgetRemaining >= amt ? 'Can cover' : `Short ${fmt(amt - budgetRemaining)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-400">Reserves</p>
                      <p className={`text-sm font-bold ${reserveBalance >= amt ? 'text-sage-700' : 'text-red-600'}`}>
                        {reserveBalance >= amt ? `${reservePctFunded}% funded` : `Only ${fmt(reserveBalance)}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Priority + Vendor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as SpendingApproval['priority'] })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent — health/safety risk</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Vendor (if known)</label>
                <input
                  value={form.vendorName}
                  onChange={e => setForm({ ...form, vendorName: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                  placeholder="e.g., SecureTech Solutions"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Additional Context</label>
              <input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                placeholder="Anything else the board should consider"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
