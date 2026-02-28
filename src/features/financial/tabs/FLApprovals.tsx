import { useState, useMemo } from 'react';
import { useSpendingStore } from '@/store/useSpendingStore';
import type { SpendingApproval } from '@/store/useSpendingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

type StatusFilter = 'all' | 'pending' | 'approved' | 'denied';
type CategoryFilter = 'all' | SpendingApproval['category'];

const CATEGORIES: { value: SpendingApproval['category']; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'capital', label: 'Capital' },
  { value: 'operations', label: 'Operations' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
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
};

export default function FLApprovals() {
  const { approvals, addApproval, castVote, deleteApproval } = useSpendingStore();
  const { currentUser, currentRole } = useAuthStore();
  const { board } = useBuildingStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Determine if current user is a board member
  const isBoardMember = currentRole === 'BOARD_MEMBER' || currentRole === 'PLATFORM_ADMIN';

  // Current month boundaries for summary stats
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

  // Summary metrics
  const summary = useMemo(() => {
    const pending = approvals.filter(a => a.status === 'pending');
    const pendingCount = pending.length;
    const pendingAmount = pending.reduce((s, a) => s + a.amount, 0);
    const approvedThisMonth = approvals.filter(
      a => a.status === 'approved' && a.decidedAt >= currentMonthStart && a.decidedAt < nextMonth
    ).length;
    const deniedThisMonth = approvals.filter(
      a => a.status === 'denied' && a.decidedAt >= currentMonthStart && a.decidedAt < nextMonth
    ).length;
    return { pendingCount, pendingAmount, approvedThisMonth, deniedThisMonth };
  }, [approvals, currentMonthStart, nextMonth]);

  // Filtered list
  const filtered = useMemo(() => {
    return approvals.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      return true;
    });
  }, [approvals, statusFilter, categoryFilter]);

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
    });
    setForm(EMPTY_FORM);
    setShowAddModal(false);
  };

  // Check if the current user has already voted on a given approval
  const hasVoted = (approval: SpendingApproval) => {
    return approval.votes.some(v => v.member === currentUser.name);
  };

  // Can the current user vote on this approval?
  const canVote = (approval: SpendingApproval) => {
    return isBoardMember && approval.status === 'pending' && !hasVoted(approval);
  };

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{summary.pendingCount}</p>
          <p className="text-xs text-ink-400 mt-0.5">requests awaiting vote</p>
        </div>
        <div className="bg-accent-50 border border-accent-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-accent-600 uppercase tracking-wider">Total Pending</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{fmt(summary.pendingAmount)}</p>
          <p className="text-xs text-ink-400 mt-0.5">amount under review</p>
        </div>
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-sage-600 uppercase tracking-wider">Approved</p>
          <p className="text-2xl font-bold text-sage-700 mt-1">{summary.approvedThisMonth}</p>
          <p className="text-xs text-ink-400 mt-0.5">this month</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Denied</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{summary.deniedThisMonth}</p>
          <p className="text-xs text-ink-400 mt-0.5">this month</p>
        </div>
      </div>

      {/* Filter / Action Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status filter */}
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

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700 bg-white"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium"
        >
          + New Request
        </button>
      </div>

      {/* Approval Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-mist-50 rounded-xl">
          <p className="text-ink-400 text-lg">No approval requests found</p>
          <p className="text-ink-300 text-sm mt-1">
            {statusFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create a new request to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(approval => {
            const statusStyle = STATUS_COLORS[approval.status];
            const approveCount = approval.votes.filter(v => v.vote === 'approve').length;
            const denyCount = approval.votes.filter(v => v.vote === 'deny').length;

            return (
              <div
                key={approval.id}
                className={`bg-white border rounded-xl p-5 hover:shadow-sm transition-all ${
                  approval.priority === 'urgent' ? 'border-red-300 border-l-4 border-l-red-500' : 'border-ink-100'
                }`}
              >
                {/* Header row: badges + delete */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                    {approval.priority === 'urgent' && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                        Urgent
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-ink-100 text-ink-500 capitalize">
                      {approval.category}
                    </span>
                    {approval.vendorName && (
                      <span className="text-xs text-ink-400">
                        Vendor: {approval.vendorName}
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

                {/* Title + Description + Amount */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-ink-900 text-base">{approval.title}</h4>
                    {approval.description && (
                      <p className="text-sm text-ink-500 mt-1 line-clamp-2">{approval.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-ink-900">{fmt(approval.amount)}</p>
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-4 text-xs text-ink-400 mb-4 flex-wrap">
                  <span>Requested by: <span className="font-medium text-ink-600">{approval.requestedBy}</span></span>
                  <span>Threshold: <span className="font-medium text-ink-600">{fmt(approval.threshold)}</span></span>
                  {approval.notes && (
                    <span className="italic">Note: {approval.notes}</span>
                  )}
                </div>

                {/* Vote Section (for pending items) */}
                {approval.status === 'pending' && (
                  <div className="bg-mist-50 border border-mist-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-semibold text-ink-700">Board Votes</h5>
                      <span className="text-xs font-medium text-ink-500">
                        {approveCount}/3 needed to approve
                      </span>
                    </div>

                    {/* Existing votes */}
                    {approval.votes.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {approval.votes.map((v, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                              v.vote === 'approve'
                                ? 'bg-sage-100 text-sage-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            <span>{v.vote === 'approve' ? '\u2713' : '\u2717'}</span>
                            <span>{v.member}</span>
                            <span className="text-[10px] opacity-60">{v.date}</span>
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
                            <div
                              className="bg-sage-500 h-full transition-all"
                              style={{ width: `${(approveCount / board.length) * 100}%` }}
                            />
                          )}
                          {denyCount > 0 && (
                            <div
                              className="bg-red-500 h-full transition-all"
                              style={{ width: `${(denyCount / board.length) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-ink-400 shrink-0">
                        {approveCount} approve / {denyCount} deny
                      </span>
                    </div>

                    {/* Vote buttons */}
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

                {/* Decided at for resolved items */}
                {(approval.status === 'approved' || approval.status === 'denied') && approval.decidedAt && (
                  <div className="mt-3 pt-3 border-t border-ink-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-ink-400">
                        <span>
                          Decided: <span className="font-medium text-ink-600">{approval.decidedAt}</span>
                        </span>
                        <span>
                          Votes: {approveCount} approve, {denyCount} deny
                        </span>
                      </div>
                      {/* Show vote details for resolved items */}
                      <div className="flex flex-wrap gap-1.5">
                        {approval.votes.map((v, i) => (
                          <span
                            key={i}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              v.vote === 'approve'
                                ? 'bg-sage-50 text-sage-600'
                                : 'bg-red-50 text-red-600'
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
          title="New Spending Approval Request"
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
              <label className="block text-sm font-medium text-ink-700 mb-2">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                placeholder="e.g., Lobby security camera replacement"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                rows={3}
                placeholder="Describe the work or purchase needed"
              />
            </div>

            {/* Amount + Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Amount *</label>
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
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Vendor Name</label>
                <input
                  value={form.vendorName}
                  onChange={e => setForm({ ...form, vendorName: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                  placeholder="e.g., SecureTech Solutions"
                />
              </div>
            </div>

            {/* Threshold + Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Approval Threshold</label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={e => setForm({ ...form, threshold: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                  placeholder="5000"
                />
                <p className="text-[10px] text-ink-400 mt-1">Spending above this requires board approval</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Notes</label>
                <input
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-ink-200 rounded-lg"
                  placeholder="Any additional context"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
