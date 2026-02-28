import { useState } from 'react';
import { usePropertyLogStore, type PropertyLogEntry } from '@/store/usePropertyLogStore';
import { useAuthStore } from '@/store/useAuthStore';
import Modal from '@/components/ui/Modal';

type ModalMode = null | 'add' | 'edit';
type TypeFilter = 'all' | PropertyLogEntry['type'];
type StatusFilter = 'all' | PropertyLogEntry['status'];

const TYPE_BADGES: Record<PropertyLogEntry['type'], string> = {
  walkthrough: 'bg-accent-100 text-accent-700',
  inspection: 'bg-sage-100 text-sage-700',
  incident: 'bg-red-100 text-red-700',
  maintenance_check: 'bg-mist-100 text-ink-600',
};

const TYPE_LABELS: Record<PropertyLogEntry['type'], string> = {
  walkthrough: 'Walkthrough',
  inspection: 'Inspection',
  incident: 'Incident',
  maintenance_check: 'Maintenance Check',
};

const STATUS_BADGES: Record<PropertyLogEntry['status'], string> = {
  open: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-sage-100 text-sage-700',
  monitoring: 'bg-accent-100 text-accent-700',
};

const CONDITION_COLORS: Record<string, string> = {
  good: 'text-sage-700 bg-sage-50',
  fair: 'text-yellow-700 bg-yellow-50',
  poor: 'text-red-700 bg-red-50',
};

const SEVERITY_COLORS: Record<string, string> = {
  none: 'text-ink-500 bg-ink-50',
  low: 'text-sage-700 bg-sage-50',
  medium: 'text-yellow-700 bg-yellow-50',
  high: 'text-red-700 bg-red-50',
};

interface Finding {
  area: string;
  condition: string;
  notes: string;
  severity: string;
}

interface ActionItem {
  description: string;
  assignedTo: string;
  dueDate: string;
  status: string;
}

interface LogForm {
  title: string;
  type: PropertyLogEntry['type'];
  date: string;
  conductedBy: string;
  location: string;
  status: PropertyLogEntry['status'];
  findings: Finding[];
  actionItems: ActionItem[];
  notes: string;
}

const emptyFinding = (): Finding => ({ area: '', condition: 'good', notes: '', severity: 'none' });
const emptyActionItem = (): ActionItem => ({ description: '', assignedTo: '', dueDate: '', status: 'open' });

const emptyForm = (): LogForm => ({
  title: '',
  type: 'walkthrough',
  date: new Date().toISOString().split('T')[0],
  conductedBy: '',
  location: '',
  status: 'open',
  findings: [emptyFinding()],
  actionItems: [emptyActionItem()],
  notes: '',
});

export default function PropertyLogPage() {
  const { logs, addLog, updateLog, deleteLog } = usePropertyLogStore();
  const { currentUser } = useAuthStore();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LogForm>(emptyForm());

  // Filtered logs
  const filtered = logs.filter(l => {
    if (typeFilter !== 'all' && l.type !== typeFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  // Stats
  const openCount = logs.filter(l => l.status === 'open').length;
  const pendingActions = logs.reduce((sum, l) => sum + l.actionItems.filter(a => a.status === 'open').length, 0);
  const lastWalkthrough = logs
    .filter(l => l.type === 'walkthrough')
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date || 'None';

  // Modal handlers
  const openAdd = () => {
    setForm({ ...emptyForm(), conductedBy: currentUser.name });
    setEditId(null);
    setModal('add');
  };

  const openEdit = (log: PropertyLogEntry) => {
    setForm({
      title: log.title,
      type: log.type,
      date: log.date,
      conductedBy: log.conductedBy,
      location: log.location,
      status: log.status,
      findings: log.findings.length > 0 ? [...log.findings] : [emptyFinding()],
      actionItems: log.actionItems.length > 0 ? [...log.actionItems] : [emptyActionItem()],
      notes: log.notes,
    });
    setEditId(log.id);
    setModal('edit');
  };

  const handleSave = () => {
    if (!form.title || !form.date || !form.conductedBy) {
      alert('Title, date, and conducted by are required.');
      return;
    }

    const cleanFindings = form.findings.filter(f => f.area.trim() !== '');
    const cleanActions = form.actionItems.filter(a => a.description.trim() !== '');

    const payload = {
      title: form.title,
      type: form.type,
      date: form.date,
      conductedBy: form.conductedBy,
      location: form.location,
      status: form.status,
      findings: cleanFindings,
      actionItems: cleanActions,
      notes: form.notes,
    };

    if (modal === 'edit' && editId) {
      updateLog(editId, payload);
    } else {
      addLog(payload);
    }
    setModal(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this log entry? This cannot be undone.')) {
      deleteLog(id);
      if (expanded === id) setExpanded(null);
    }
  };

  // Form helpers for dynamic lists
  const updateFinding = (index: number, key: keyof Finding, value: string) => {
    const updated = [...form.findings];
    updated[index] = { ...updated[index], [key]: value };
    setForm({ ...form, findings: updated });
  };

  const addFinding = () => setForm({ ...form, findings: [...form.findings, emptyFinding()] });

  const removeFinding = (index: number) => {
    if (form.findings.length <= 1) return;
    setForm({ ...form, findings: form.findings.filter((_, i) => i !== index) });
  };

  const updateAction = (index: number, key: keyof ActionItem, value: string) => {
    const updated = [...form.actionItems];
    updated[index] = { ...updated[index], [key]: value };
    setForm({ ...form, actionItems: updated });
  };

  const addAction = () => setForm({ ...form, actionItems: [...form.actionItems, emptyActionItem()] });

  const removeAction = (index: number) => {
    if (form.actionItems.length <= 1) return;
    setForm({ ...form, actionItems: form.actionItems.filter((_, i) => i !== index) });
  };

  // Toggle action item status inline
  const toggleActionStatus = (logId: string, actionIndex: number) => {
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    const updatedActions = [...log.actionItems];
    updatedActions[actionIndex] = {
      ...updatedActions[actionIndex],
      status: updatedActions[actionIndex].status === 'done' ? 'open' : 'done',
    };
    updateLog(logId, { actionItems: updatedActions });
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T12:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Property Log</h2>
            <p className="text-accent-200 text-sm mt-1">Inspections, walkthroughs & property condition tracking</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{logs.length}</p>
            <p className="text-[11px] text-accent-100 mt-0.5">Total Logs</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{openCount}</p>
            <p className="text-[11px] text-accent-100 mt-0.5">Open Items</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{pendingActions}</p>
            <p className="text-[11px] text-accent-100 mt-0.5">Action Items Pending</p>
          </div>
          <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center">
            <p className="text-sm font-bold text-white">{lastWalkthrough !== 'None' ? formatDate(lastWalkthrough) : 'None'}</p>
            <p className="text-[11px] text-accent-100 mt-0.5">Last Walkthrough</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border-x border-b border-ink-100 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-ink-500">Type</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as TypeFilter)}
                className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm text-ink-700 bg-white"
              >
                <option value="all">All Types</option>
                <option value="walkthrough">Walkthrough</option>
                <option value="inspection">Inspection</option>
                <option value="incident">Incident</option>
                <option value="maintenance_check">Maintenance Check</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-ink-500">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm text-ink-700 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="monitoring">Monitoring</option>
              </select>
            </div>
            {(typeFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setTypeFilter('all'); setStatusFilter('all'); }}
                className="text-xs text-accent-600 hover:text-accent-800 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
          >
            + New Log
          </button>
        </div>
      </div>

      {/* Log List */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ink-400 text-sm">No log entries found.</p>
            <button onClick={openAdd} className="mt-3 text-sm text-accent-600 hover:text-accent-800 font-medium">
              Create your first property log
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(log => {
              const isExpanded = expanded === log.id;
              const findingsCount = log.findings.length;
              const actionCount = log.actionItems.length;
              const openActions = log.actionItems.filter(a => a.status === 'open').length;

              return (
                <div
                  key={log.id}
                  className="bg-white border border-ink-100 rounded-xl overflow-hidden hover:shadow-md transition-all"
                >
                  {/* Card Header */}
                  <div
                    className="p-5 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : log.id)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGES[log.type]}`}>
                            {TYPE_LABELS[log.type]}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[log.status]}`}>
                            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                          </span>
                          <h4 className="text-lg font-bold text-ink-900">{log.title}</h4>
                        </div>
                        <p className="text-sm text-ink-500">
                          {formatDate(log.date)} &middot; {log.conductedBy}
                          {log.location && <> &middot; {log.location}</>}
                        </p>
                        <p className="text-xs text-ink-400 mt-1">
                          {findingsCount} finding{findingsCount !== 1 ? 's' : ''}
                          {actionCount > 0 && (
                            <> &middot; {actionCount} action item{actionCount !== 1 ? 's' : ''}
                              {openActions > 0 && (
                                <span className="text-yellow-600 font-medium"> ({openActions} open)</span>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <svg
                        className={`h-5 w-5 text-ink-400 transition-transform shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-ink-100 p-5 space-y-5">
                      {/* Findings Table */}
                      {log.findings.length > 0 && (
                        <div>
                          <p className="font-bold text-ink-900 mb-3">Findings ({log.findings.length})</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-ink-100">
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Area</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Condition</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Notes</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Severity</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink-50">
                                {log.findings.map((finding, idx) => (
                                  <tr key={idx} className="hover:bg-mist-50 transition-colors">
                                    <td className="py-2.5 px-3 font-medium text-ink-900">{finding.area}</td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${CONDITION_COLORS[finding.condition] || 'text-ink-500 bg-ink-50'}`}>
                                        {finding.condition.charAt(0).toUpperCase() + finding.condition.slice(1)}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-ink-600 max-w-xs">{finding.notes}</td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[finding.severity] || 'text-ink-500 bg-ink-50'}`}>
                                        {finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Action Items Table */}
                      {log.actionItems.length > 0 && (
                        <div>
                          <p className="font-bold text-ink-900 mb-3">Action Items ({log.actionItems.length})</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-ink-100">
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide w-8"></th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Description</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Assigned To</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Due Date</th>
                                  <th className="text-left py-2 px-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink-50">
                                {log.actionItems.map((action, idx) => {
                                  const isDone = action.status === 'done';
                                  const isOverdue = !isDone && action.dueDate && new Date(action.dueDate) < new Date();
                                  return (
                                    <tr key={idx} className={`hover:bg-mist-50 transition-colors ${isDone ? 'bg-sage-50 bg-opacity-40' : ''}`}>
                                      <td className="py-2.5 px-3">
                                        <button
                                          onClick={e => { e.stopPropagation(); toggleActionStatus(log.id, idx); }}
                                          className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs transition-colors ${isDone ? 'bg-sage-500 border-sage-500 text-white' : 'border-ink-200 hover:border-accent-400'}`}
                                        >
                                          {isDone && (
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                          )}
                                        </button>
                                      </td>
                                      <td className={`py-2.5 px-3 font-medium ${isDone ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                                        {action.description}
                                      </td>
                                      <td className="py-2.5 px-3 text-ink-600">{action.assignedTo}</td>
                                      <td className={`py-2.5 px-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-ink-600'}`}>
                                        {action.dueDate ? formatDate(action.dueDate) : '--'}
                                        {isOverdue && <span className="text-[10px] ml-1 text-red-500 font-bold">OVERDUE</span>}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${isDone ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                          {isDone ? 'Done' : 'Open'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {log.notes && (
                        <div>
                          <p className="font-bold text-ink-900 mb-2">Notes</p>
                          <div className="bg-mist-50 rounded-lg p-4 text-sm text-ink-700 whitespace-pre-wrap">
                            {log.notes}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => openEdit(log)}
                          className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <Modal
          title={modal === 'edit' ? 'Edit Log Entry' : 'New Log Entry'}
          subtitle={modal === 'edit' ? 'Update inspection or walkthrough details' : 'Record an inspection, walkthrough, or incident'}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saveLabel={modal === 'edit' ? 'Save Changes' : 'Create Log'}
          wide
        >
          <div className="space-y-5">
            {/* Top fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-700 mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="February Monthly Walkthrough"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as PropertyLogEntry['type'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="walkthrough">Walkthrough</option>
                  <option value="inspection">Inspection</option>
                  <option value="incident">Incident</option>
                  <option value="maintenance_check">Maintenance Check</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Conducted By *</label>
                <input
                  value={form.conductedBy}
                  onChange={e => setForm({ ...form, conductedBy: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="Inspector name or company"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Location</label>
                <input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="Full property, Unit 301, Parking Garage..."
                />
              </div>
            </div>

            {modal === 'edit' && (
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as PropertyLogEntry['status'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="monitoring">Monitoring</option>
                </select>
              </div>
            )}

            {/* Findings Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-ink-900">Findings</p>
                <button
                  onClick={addFinding}
                  className="text-xs text-accent-600 hover:text-accent-800 font-medium"
                >
                  + Add Finding
                </button>
              </div>
              <div className="space-y-3">
                {form.findings.map((finding, idx) => (
                  <div key={idx} className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-ink-500">Finding {idx + 1}</span>
                      {form.findings.length > 1 && (
                        <button
                          onClick={() => removeFinding(idx)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Area</label>
                        <input
                          value={finding.area}
                          onChange={e => updateFinding(idx, 'area', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          placeholder="Lobby, Stairwell 2..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Condition</label>
                        <select
                          value={finding.condition}
                          onChange={e => updateFinding(idx, 'condition', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                        >
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="poor">Poor</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Notes</label>
                        <input
                          value={finding.notes}
                          onChange={e => updateFinding(idx, 'notes', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          placeholder="Describe condition..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Severity</label>
                        <select
                          value={finding.severity}
                          onChange={e => updateFinding(idx, 'severity', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                        >
                          <option value="none">None</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Items Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-ink-900">Action Items</p>
                <button
                  onClick={addAction}
                  className="text-xs text-accent-600 hover:text-accent-800 font-medium"
                >
                  + Add Action Item
                </button>
              </div>
              <div className="space-y-3">
                {form.actionItems.map((action, idx) => (
                  <div key={idx} className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-ink-500">Action Item {idx + 1}</span>
                      {form.actionItems.length > 1 && (
                        <button
                          onClick={() => removeAction(idx)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Description</label>
                        <input
                          value={action.description}
                          onChange={e => updateAction(idx, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          placeholder="What needs to be done..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Assigned To</label>
                        <input
                          value={action.assignedTo}
                          onChange={e => updateAction(idx, 'assignedTo', e.target.value)}
                          className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          placeholder="Person or company"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Due Date</label>
                          <input
                            type="date"
                            value={action.dueDate}
                            onChange={e => updateAction(idx, 'dueDate', e.target.value)}
                            className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-ink-500 mb-0.5">Status</label>
                          <select
                            value={action.status}
                            onChange={e => updateAction(idx, 'status', e.target.value)}
                            className="w-full px-2 py-1.5 border border-ink-200 rounded-lg text-xs"
                          >
                            <option value="open">Open</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                rows={3}
                placeholder="Overall observations, follow-up reminders..."
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
