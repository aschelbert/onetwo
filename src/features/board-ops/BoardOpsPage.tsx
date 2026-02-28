import { useState, useMemo } from 'react';
import { useBoardOpsStore, type BoardTask } from '@/store/useBoardOpsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

// ─── Constants ────────────────────────────────────

const PRIORITY_BADGE: Record<BoardTask['priority'], string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-sage-100 text-sage-700',
};

const PRIORITY_DOT: Record<BoardTask['priority'], string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-sage-500',
};

const STATUS_BADGE: Record<BoardTask['status'], string> = {
  open: 'bg-accent-100 text-accent-700',
  in_progress: 'bg-mist-100 text-ink-600',
  done: 'bg-sage-100 text-sage-700',
  blocked: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<BoardTask['status'], string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

const CATEGORY_BADGE: Record<BoardTask['category'], { bg: string; icon: string }> = {
  governance: { bg: 'bg-accent-50 text-accent-700 border-accent-200', icon: 'G' },
  maintenance: { bg: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: 'M' },
  financial: { bg: 'bg-sage-50 text-sage-700 border-sage-200', icon: 'F' },
  legal: { bg: 'bg-red-50 text-red-700 border-red-200', icon: 'L' },
  compliance: { bg: 'bg-mist-50 text-ink-600 border-mist-200', icon: 'C' },
  general: { bg: 'bg-ink-50 text-ink-500 border-ink-200', icon: 'X' },
};

const PRIORITY_ORDER: Record<BoardTask['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type ModalType = null | 'add' | 'edit';
type SortKey = 'dueDate' | 'priority' | 'created';

const emptyForm = (): Omit<BoardTask, 'id'> => ({
  title: '',
  description: '',
  status: 'open',
  priority: 'medium',
  assignedTo: '',
  assignedRole: '',
  dueDate: '',
  category: 'general',
  source: '',
  sourceId: '',
  notes: '',
  completedAt: '',
});

// ─── Helpers ──────────────────────────────────────

function isOverdue(task: BoardTask): boolean {
  if (!task.dueDate) return false;
  if (task.status === 'done') return false;
  return task.dueDate < new Date().toISOString().split('T')[0];
}

function formatDate(d: string): string {
  if (!d) return '--';
  return new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────

export default function BoardOpsPage() {
  const { tasks, addTask, updateTask, deleteTask } = useBoardOpsStore();
  const { currentUser, currentRole } = useAuthStore();
  const { board } = useBuildingStore();

  // UI state
  const [modal, setModal] = useState<ModalType>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<Omit<BoardTask, 'id'>>(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BoardTask['status']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | BoardTask['priority']>('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | BoardTask['category']>('all');
  const [sortBy, setSortBy] = useState<SortKey>('dueDate');

  // ─── Derived data ──────────────────────────────

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter(t => t.status === 'open').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => isOverdue(t)).length;
    return { total, open, inProgress, done, overdue };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Status filter
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter);

    // Priority filter
    if (priorityFilter !== 'all') result = result.filter(t => t.priority === priorityFilter);

    // Assigned filter
    if (assignedFilter !== 'all') result = result.filter(t => t.assignedTo === assignedFilter);

    // Category filter
    if (categoryFilter !== 'all') result = result.filter(t => t.category === categoryFilter);

    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(s) ||
        t.description.toLowerCase().includes(s) ||
        t.assignedTo.toLowerCase().includes(s) ||
        t.source.toLowerCase().includes(s) ||
        t.notes.toLowerCase().includes(s)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === 'priority') {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      // created (id order, newer first)
      return b.id.localeCompare(a.id);
    });

    return result;
  }, [tasks, statusFilter, priorityFilter, assignedFilter, categoryFilter, search, sortBy]);

  const assignees = useMemo(() => {
    return [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))];
  }, [tasks]);

  // ─── Handlers ──────────────────────────────────

  const openAdd = () => {
    setForm(emptyForm());
    setModal('add');
  };

  const openEdit = (task: BoardTask) => {
    setEditId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo,
      assignedRole: task.assignedRole,
      dueDate: task.dueDate,
      category: task.category,
      source: task.source,
      sourceId: task.sourceId,
      notes: task.notes,
      completedAt: task.completedAt,
    });
    setModal('edit');
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      alert('Title is required');
      return;
    }
    if (modal === 'add') {
      addTask(form);
    } else {
      updateTask(editId, form);
    }
    setModal(null);
  };

  const handleComplete = (task: BoardTask) => {
    updateTask(task.id, {
      status: 'done',
      completedAt: today,
    });
  };

  const handleDelete = (task: BoardTask) => {
    if (confirm(`Delete task "${task.title}"?`)) {
      deleteTask(task.id);
    }
  };

  const handleAssignedToChange = (name: string) => {
    const member = board.find(b => b.name === name);
    setForm({
      ...form,
      assignedTo: name,
      assignedRole: member?.role || '',
    });
  };

  // ─── Render ────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* ── Header ─────────────────────────── */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Board Ops</h2>
            <p className="text-accent-200 text-sm mt-1">Task & action management for the board</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-white text-ink-900 rounded-lg text-sm font-medium hover:bg-accent-100"
            >
              + New Task
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Total Tasks', value: stats.total, icon: '>' },
            { label: 'Open', value: stats.open, icon: '>' },
            { label: 'In Progress', value: stats.inProgress, icon: '>' },
            { label: 'Done', value: stats.done, icon: '>' },
            { label: 'Overdue', value: stats.overdue, icon: '>' },
          ].map(s => (
            <div
              key={s.label}
              className={`bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center ${
                s.label === 'Overdue' && s.value > 0 ? 'ring-1 ring-red-400' : ''
              }`}
            >
              <p className="text-[11px] text-accent-100 leading-tight">{s.label}</p>
              <p className={`text-sm font-bold mt-1 ${s.label === 'Overdue' && s.value > 0 ? 'text-red-300' : 'text-white'}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters Bar ────────────────────── */}
      <div className="bg-white border-x border-b border-ink-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>

          {/* Priority */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as any)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Assigned To */}
          <select
            value={assignedFilter}
            onChange={e => setAssignedFilter(e.target.value)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
          >
            <option value="all">All Assignees</option>
            {assignees.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as any)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
          >
            <option value="all">All Categories</option>
            <option value="governance">Governance</option>
            <option value="maintenance">Maintenance</option>
            <option value="financial">Financial</option>
            <option value="legal">Legal</option>
            <option value="compliance">Compliance</option>
            <option value="general">General</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-700"
          >
            <option value="dueDate">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="created">Sort: Newest</option>
          </select>
        </div>
      </div>

      {/* ── Task List ──────────────────────── */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-mist-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-ink-500 font-medium">No tasks found</p>
            <p className="text-ink-400 text-sm mt-1">
              {tasks.length === 0
                ? 'Create your first board task to get started.'
                : 'Try adjusting your filters or search terms.'}
            </p>
            {tasks.length === 0 && (
              <button onClick={openAdd} className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
                + New Task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map(task => {
              const overdue = isOverdue(task);
              const cat = CATEGORY_BADGE[task.category];
              return (
                <div
                  key={task.id}
                  className={`border rounded-xl p-5 hover:shadow-md transition-all ${
                    overdue
                      ? 'border-red-200 bg-red-50 bg-opacity-30'
                      : task.status === 'done'
                        ? 'border-ink-100 bg-sage-50 bg-opacity-30'
                        : 'border-ink-100 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Priority dot */}
                    <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority]}`} title={task.priority} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className={`text-sm font-bold ${task.status === 'done' ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                          {task.title}
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${PRIORITY_BADGE[task.priority]}`}>
                          {task.priority}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[task.status]}`}>
                          {STATUS_LABEL[task.status]}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${cat.bg}`}>
                          {task.category}
                        </span>
                        {overdue && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                            OVERDUE
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className={`text-xs mt-1 ${task.status === 'done' ? 'text-ink-300' : 'text-ink-500'}`}>
                          {task.description.length > 160 ? task.description.slice(0, 160) + '...' : task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {/* Assigned to */}
                        {task.assignedTo && (
                          <span className="text-xs text-ink-500">
                            <span className="font-semibold text-ink-700">{task.assignedTo}</span>
                            {task.assignedRole && <span className="text-ink-400"> ({task.assignedRole})</span>}
                          </span>
                        )}

                        {/* Due date */}
                        {task.dueDate && (
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-ink-500'}`}>
                            Due: {formatDate(task.dueDate)}
                          </span>
                        )}

                        {/* Source */}
                        {task.source && (
                          <span className="text-xs text-ink-400">
                            Source: {task.source}
                          </span>
                        )}

                        {/* Completed date */}
                        {task.completedAt && (
                          <span className="text-xs text-sage-600">
                            Completed: {formatDate(task.completedAt)}
                          </span>
                        )}
                      </div>

                      {task.notes && (
                        <div className="mt-2 bg-mist-50 rounded-lg px-3 py-2">
                          <p className="text-xs text-ink-500">{task.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEdit(task)}
                        className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:bg-mist-50 text-ink-700"
                      >
                        Edit
                      </button>
                      {task.status !== 'done' && (
                        <button
                          onClick={() => handleComplete(task)}
                          className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-medium hover:bg-sage-700"
                        >
                          Complete
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(task)}
                        className="px-3 py-1.5 text-red-500 text-xs font-medium hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Results summary */}
        {filteredTasks.length > 0 && (
          <div className="mt-4 text-xs text-ink-400 text-center">
            Showing {filteredTasks.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Add/Edit Task Modal ────────────── */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'New Board Task' : 'Edit Task'}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saveLabel={modal === 'add' ? 'Create Task' : 'Save Changes'}
          wide
        >
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                placeholder="e.g., Review elevator modernization bids"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                rows={3}
                placeholder="Detailed description of the task..."
              />
            </div>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as BoardTask['status'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as BoardTask['priority'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Assigned To + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Assigned To</label>
                <select
                  value={form.assignedTo}
                  onChange={e => handleAssignedToChange(e.target.value)}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="">Unassigned</option>
                  {board.map(b => (
                    <option key={b.id} value={b.name}>{b.name} ({b.role})</option>
                  ))}
                </select>
                {form.assignedRole && (
                  <p className="text-[10px] text-ink-400 mt-1">Role: {form.assignedRole}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Category + Source */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value as BoardTask['category'] })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                >
                  <option value="governance">Governance</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="financial">Financial</option>
                  <option value="legal">Legal</option>
                  <option value="compliance">Compliance</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Source</label>
                <input
                  value={form.source}
                  onChange={e => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                  placeholder="e.g., Board Meeting Jan 2026"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
                rows={2}
                placeholder="Additional notes or context..."
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
