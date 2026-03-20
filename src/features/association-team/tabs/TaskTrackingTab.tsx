import { useState, useMemo, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import { useTaskTrackingStore } from '@/store/useTaskTrackingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import type { TaskItem, TaskStatus, TaskPriority, TaskCategory, LinkedItem } from '@/store/useTaskTrackingStore';

/* ── Constants ─────────────────────────────────────────────── */

const LANES: { key: TaskStatus; label: string; color: string; bg: string }[] = [
  { key: 'todo', label: 'To Do', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  { key: 'blocked', label: 'Blocked', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  { key: 'in_progress', label: 'In Progress', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { key: 'done', label: 'Done', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-ink-100 text-ink-500',
};

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  maintenance: 'Maintenance',
  administrative: 'Administrative',
  compliance: 'Compliance',
  communication: 'Communication',
  financial: 'Financial',
  other: 'Other',
};

const LINKED_TYPE_LABELS: Record<LinkedItem['type'], string> = {
  meeting: 'Meeting',
  case: 'Case',
  property_log: 'Property Log',
  request: 'Request',
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const fmtDate = (d: string) => {
  const date = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

type EmptyForm = Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>;

function emptyForm(userName: string, userId: string): EmptyForm {
  return {
    title: '', description: '', status: 'todo', priority: 'medium', category: 'other',
    assignedTo: null, assignedToName: null, createdBy: userId, createdByName: userName,
    dueDate: '', completedAt: null, linkedItems: [], notes: '',
  };
}

/* ── Component ─────────────────────────────────────────────── */

export default function TaskTrackingTab() {
  const { tasks, addTask, updateTask, deleteTask, moveTask, addLinkedItem, removeLinkedItem } = useTaskTrackingStore();
  const { currentUser, buildingMembers } = useAuthStore();
  const { meetings } = useMeetingsStore();
  const { cases, issues } = useIssuesStore();
  const { logs: propertyLogs } = usePropertyLogStore();

  const [showLogs, setShowLogs] = useState(false);
  const [taskModal, setTaskModal] = useState<'add' | 'edit' | null>(null);
  const [taskForm, setTaskForm] = useState<EmptyForm>(emptyForm(currentUser.name, currentUser.id));
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [linkModal, setLinkModal] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<{ type: LinkedItem['type']; id: string; title: string }>({ type: 'meeting', id: '', title: '' });
  const [moveMenu, setMoveMenu] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<TaskStatus | null>(null);
  const dragTaskId = useRef<string | null>(null);

  /* ── Derived data ────────────────── */

  const now = Date.now();

  const kanbanTasks = useMemo(() =>
    tasks.filter(t => {
      if (t.status !== 'done') return true;
      if (!t.completedAt) return true;
      return now - new Date(t.completedAt).getTime() < THIRTY_DAYS_MS;
    }),
  [tasks, now]);

  const logTasks = useMemo(() =>
    tasks.filter(t =>
      t.status === 'done' && t.completedAt && now - new Date(t.completedAt).getTime() >= THIRTY_DAYS_MS
    ).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
  [tasks, now]);

  const byLane = (status: TaskStatus) =>
    kanbanTasks.filter(t => t.status === status).sort((a, b) => {
      const po = { urgent: 0, high: 1, medium: 2, low: 3 };
      return po[a.priority] - po[b.priority];
    });

  const counts = {
    todo: byLane('todo').length,
    in_progress: byLane('in_progress').length,
    blocked: byLane('blocked').length,
    done: byLane('done').length,
  };

  /* ── Linkable artifact options ───── */

  const meetingOptions = meetings.map(m => ({ id: m.id, title: `${m.title} (${fmtDate(m.date)})` }));
  const caseOptions = cases.map(c => ({ id: c.id, title: c.title }));
  const propertyLogOptions = propertyLogs.map(pl => ({ id: pl.id, title: `${pl.title} (${fmtDate(pl.date)})` }));
  const requestOptions = issues.map(i => ({ id: i.id, title: `${i.title} — ${i.status}` }));

  const optionsForType = (type: LinkedItem['type']) => {
    switch (type) {
      case 'meeting': return meetingOptions;
      case 'case': return caseOptions;
      case 'property_log': return propertyLogOptions;
      case 'request': return requestOptions;
    }
  };

  /* ── Handlers ────────────────────── */

  const openAdd = () => {
    setTaskForm(emptyForm(currentUser.name, currentUser.id));
    setEditTaskId(null);
    setTaskModal('add');
  };

  const openEdit = (t: TaskItem) => {
    const { id, createdAt, updatedAt, ...rest } = t;
    setTaskForm(rest);
    setEditTaskId(id);
    setTaskModal('edit');
  };

  const saveTask = () => {
    if (!taskForm.title.trim()) return;
    if (taskModal === 'add') {
      addTask(taskForm);
    } else if (editTaskId) {
      const { createdBy, createdByName, ...updates } = taskForm;
      updateTask(editTaskId, updates);
    }
    setTaskModal(null);
  };

  const handleDelete = (id: string) => {
    deleteTask(id);
    setDetailTask(null);
  };

  const handleMove = (id: string, status: TaskStatus) => {
    moveTask(id, status);
    setMoveMenu(null);
    if (detailTask?.id === id) {
      const updated = useTaskTrackingStore.getState().tasks.find(t => t.id === id);
      if (updated) setDetailTask(updated);
    }
  };

  const refreshDetail = (taskId: string) => {
    setTimeout(() => {
      const updated = useTaskTrackingStore.getState().tasks.find(t => t.id === taskId);
      if (updated) setDetailTask(updated);
    }, 0);
  };

  const openLinkModal = (taskId: string) => {
    setLinkForm({ type: 'meeting', id: '', title: '' });
    setLinkModal(taskId);
  };

  const saveLink = () => {
    if (!linkModal || !linkForm.id || !linkForm.title.trim()) return;
    const newLink: LinkedItem = { id: linkForm.id, type: linkForm.type, title: linkForm.title };
    if (linkModal === '__task_form__') {
      // Adding link to unsaved task form (add or edit mode)
      setTaskForm(f => ({
        ...f,
        linkedItems: f.linkedItems.some(li => li.id === newLink.id) ? f.linkedItems : [...f.linkedItems, newLink],
      }));
    } else {
      addLinkedItem(linkModal, newLink);
      if (detailTask?.id === linkModal) refreshDetail(linkModal);
    }
    setLinkModal(null);
  };

  const handleUnlink = (taskId: string, linkedItemId: string) => {
    if (taskId === '__task_form__') {
      setTaskForm(f => ({ ...f, linkedItems: f.linkedItems.filter(li => li.id !== linkedItemId) }));
    } else {
      removeLinkedItem(taskId, linkedItemId);
      if (detailTask?.id === taskId) refreshDetail(taskId);
    }
  };

  /* ── Drag & Drop handlers ────────── */

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    dragTaskId.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Make the dragging card semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      requestAnimationFrame(() => {
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      });
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    dragTaskId.current = null;
    setDragOverLane(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, laneKey: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLane(laneKey);
  };

  const handleDragLeave = (e: React.DragEvent, laneKey: TaskStatus) => {
    // Only clear if leaving the lane container (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !(e.currentTarget as HTMLElement).contains(relatedTarget)) {
      if (dragOverLane === laneKey) setDragOverLane(null);
    }
  };

  const handleDrop = (e: React.DragEvent, laneKey: TaskStatus) => {
    e.preventDefault();
    setDragOverLane(null);
    const taskId = dragTaskId.current || e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== laneKey) {
      handleMove(taskId, laneKey);
    }
    dragTaskId.current = null;
  };

  /* ── Assignee options ────────────── */
  const assigneeOptions = buildingMembers
    .filter(m => m.status === 'active' && (m.role === 'BOARD_MEMBER' || m.role === 'PROPERTY_MANAGER'))
    .map(m => ({ id: m.id, name: m.name }));

  /* ── Render ──────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Task Board</h3>
          {logTasks.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs font-medium text-ink-500 hover:text-ink-700 border border-ink-200 rounded-lg px-3 py-1.5 hover:bg-ink-50 transition-colors"
            >
              {showLogs ? 'Show Board' : `Logs (${logTasks.length})`}
            </button>
          )}
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">
          + New Task
        </button>
      </div>

      {/* ═══════════ KANBAN BOARD ═══════════ */}
      {!showLogs && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {LANES.map(lane => (
            <div
              key={lane.key}
              className="space-y-3"
              onDragOver={e => handleDragOver(e, lane.key)}
              onDragLeave={e => handleDragLeave(e, lane.key)}
              onDrop={e => handleDrop(e, lane.key)}
            >
              {/* Lane header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${lane.bg}`}>
                <span className={`text-sm font-semibold ${lane.color}`}>{lane.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${lane.bg} ${lane.color}`}>{counts[lane.key]}</span>
              </div>

              {/* Drop zone */}
              <div className={`space-y-2 min-h-[120px] rounded-lg transition-colors ${
                dragOverLane === lane.key ? 'bg-ink-50 ring-2 ring-ink-300 ring-dashed' : ''
              }`}>
                {byLane(lane.key).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDetail={() => setDetailTask(task)}
                    onEdit={() => openEdit(task)}
                    moveMenu={moveMenu}
                    setMoveMenu={setMoveMenu}
                    onMove={handleMove}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {byLane(lane.key).length === 0 && (
                  <div className={`text-center py-8 text-sm ${
                    dragOverLane === lane.key ? 'text-ink-500 font-medium' : 'text-ink-300'
                  }`}>
                    {dragOverLane === lane.key ? 'Drop here' : 'No tasks'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ LOGS (completed > 30 days) ═══════════ */}
      {showLogs && (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Completed tasks older than 30 days are archived here for reference.</p>
          <div className="overflow-x-auto border border-ink-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Assigned To</th>
                  <th className="px-4 py-3 font-medium">Completed</th>
                  <th className="px-4 py-3 font-medium">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {logTasks.map(t => (
                  <tr key={t.id} className="hover:bg-ink-50/50 cursor-pointer" onClick={() => setDetailTask(t)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{t.title}</p>
                      <p className="text-xs text-ink-400 mt-0.5 line-clamp-1">{t.description}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{CATEGORY_LABELS[t.category]}</td>
                    <td className="px-4 py-3 text-ink-600">{t.assignedToName ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-600">{t.completedAt ? fmtDate(t.completedAt) : '—'}</td>
                    <td className="px-4 py-3 text-ink-500">{t.linkedItems.length > 0 ? `${t.linkedItems.length} linked` : '—'}</td>
                  </tr>
                ))}
                {logTasks.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-400">No archived tasks yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ TASK DETAIL MODAL ═══════════ */}
      {detailTask && (
        <Modal title={detailTask.title} wide onClose={() => setDetailTask(null)}>
          <div className="space-y-5">
            {/* Status + priority badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                LANES.find(l => l.key === detailTask.status)?.bg ?? ''
              } ${LANES.find(l => l.key === detailTask.status)?.color ?? ''}`}>
                {LANES.find(l => l.key === detailTask.status)?.label}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[detailTask.priority]}`}>
                {detailTask.priority.charAt(0).toUpperCase() + detailTask.priority.slice(1)}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-ink-100 text-ink-600">
                {CATEGORY_LABELS[detailTask.category]}
              </span>
            </div>

            {/* Description */}
            {detailTask.description && (
              <div>
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-ink-700">{detailTask.description}</p>
              </div>
            )}

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink-400">Assigned To</p>
                <p className="font-medium text-ink-900">{detailTask.assignedToName ?? 'Unassigned'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Due Date</p>
                <p className="font-medium text-ink-900">{detailTask.dueDate ? fmtDate(detailTask.dueDate) : 'No due date'}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Created By</p>
                <p className="font-medium text-ink-900">{detailTask.createdByName}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Created</p>
                <p className="font-medium text-ink-900">{fmtDate(detailTask.createdAt)}</p>
              </div>
              {detailTask.completedAt && (
                <div>
                  <p className="text-xs text-ink-400">Completed</p>
                  <p className="font-medium text-emerald-700">{fmtDate(detailTask.completedAt)}</p>
                </div>
              )}
            </div>

            {/* Notes */}
            {detailTask.notes && (
              <div>
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-ink-600 bg-ink-50 rounded-lg p-3">{detailTask.notes}</p>
              </div>
            )}

            {/* Linked items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">Linked Items</p>
                <button onClick={() => openLinkModal(detailTask.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  + Link Item
                </button>
              </div>
              {detailTask.linkedItems.length > 0 ? (
                <div className="space-y-1">
                  {detailTask.linkedItems.map(li => (
                    <div key={li.id} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          li.type === 'meeting' ? 'bg-blue-100 text-blue-600' :
                          li.type === 'case' ? 'bg-purple-100 text-purple-600' :
                          li.type === 'property_log' ? 'bg-amber-100 text-amber-600' :
                          'bg-emerald-100 text-emerald-600'
                        }`}>
                          {LINKED_TYPE_LABELS[li.type]}
                        </span>
                        <span className="text-ink-700">{li.title}</span>
                      </div>
                      <button onClick={() => handleUnlink(detailTask.id, li.id)} className="text-ink-300 hover:text-red-500 text-xs">Remove</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">No linked items</p>
              )}
            </div>

            {/* Move + actions */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ink-100">
              <span className="text-xs text-ink-500 mr-1">Move to:</span>
              {LANES.filter(l => l.key !== detailTask.status).map(l => (
                <button
                  key={l.key}
                  onClick={() => { handleMove(detailTask.id, l.key); setDetailTask(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${l.bg} ${l.color} hover:opacity-80`}
                >
                  {l.label}
                </button>
              ))}
              <div className="flex-1" />
              <button onClick={() => { openEdit(detailTask); setDetailTask(null); }} className="text-xs text-ink-500 hover:text-ink-700 font-medium">Edit</button>
              <button onClick={() => handleDelete(detailTask.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════ ADD / EDIT TASK MODAL ═══════════ */}
      {taskModal && (
        <Modal
          title={taskModal === 'add' ? 'New Task' : 'Edit Task'}
          wide
          onClose={() => setTaskModal(null)}
          onSave={saveTask}
          saveLabel={taskModal === 'add' ? 'Create Task' : 'Save Changes'}
        >
          <div className="space-y-5">
            {/* Title */}
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">Title</p>
              <input
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                placeholder="What needs to be done?"
              />
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">Description</p>
              <textarea
                value={taskForm.description}
                onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                rows={3}
                placeholder="Additional details..."
              />
            </div>

            {/* Meta grid — matches detail view layout */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink-400 mb-1">Status</p>
                <select
                  value={taskForm.status}
                  onChange={e => setTaskForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {LANES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-ink-400 mb-1">Priority</p>
                <select
                  value={taskForm.priority}
                  onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-ink-400 mb-1">Category</p>
                <select
                  value={taskForm.category}
                  onChange={e => setTaskForm(f => ({ ...f, category: e.target.value as TaskCategory }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-ink-400 mb-1">Due Date</p>
                <input
                  type="date"
                  value={taskForm.dueDate ?? ''}
                  onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value || null }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-ink-400 mb-1">Assigned To</p>
                <select
                  value={taskForm.assignedTo ?? ''}
                  onChange={e => {
                    const member = assigneeOptions.find(m => m.id === e.target.value);
                    setTaskForm(f => ({
                      ...f,
                      assignedTo: member?.id ?? null,
                      assignedToName: member?.name ?? null,
                    }));
                  }}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              {taskModal === 'edit' && (
                <div>
                  <p className="text-xs text-ink-400">Created By</p>
                  <p className="font-medium text-ink-900 mt-1">{taskForm.createdByName}</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">Notes</p>
              <textarea
                value={taskForm.notes}
                onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-ink-50"
                rows={2}
                placeholder="Internal notes..."
              />
            </div>

            {/* Linked items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-ink-500 uppercase tracking-wide">Linked Items</p>
                <button onClick={() => openLinkModal('__task_form__')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  + Link Item
                </button>
              </div>
              {taskForm.linkedItems.length > 0 ? (
                <div className="space-y-1">
                  {taskForm.linkedItems.map(li => (
                    <div key={li.id} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          li.type === 'meeting' ? 'bg-blue-100 text-blue-600' :
                          li.type === 'case' ? 'bg-purple-100 text-purple-600' :
                          li.type === 'property_log' ? 'bg-amber-100 text-amber-600' :
                          'bg-emerald-100 text-emerald-600'
                        }`}>
                          {LINKED_TYPE_LABELS[li.type]}
                        </span>
                        <span className="text-ink-700">{li.title}</span>
                      </div>
                      <button onClick={() => handleUnlink('__task_form__', li.id)} className="text-ink-300 hover:text-red-500 text-xs">Remove</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">No linked items</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════ LINK ITEM MODAL ═══════════ */}
      {linkModal && (
        <Modal title="Link Item to Task" onClose={() => setLinkModal(null)} onSave={saveLink} saveLabel="Link">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Type</label>
              <select
                value={linkForm.type}
                onChange={e => setLinkForm({ type: e.target.value as LinkedItem['type'], id: '', title: '' })}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="meeting">Meeting</option>
                <option value="case">Case</option>
                <option value="property_log">Property Log</option>
                <option value="request">Request</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Select {LINKED_TYPE_LABELS[linkForm.type]}
              </label>
              {optionsForType(linkForm.type).length > 0 ? (
                <select
                  value={linkForm.id}
                  onChange={e => {
                    const opt = optionsForType(linkForm.type).find(o => o.id === e.target.value);
                    setLinkForm(f => ({ ...f, id: opt?.id ?? '', title: opt?.title ?? '' }));
                  }}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select...</option>
                  {optionsForType(linkForm.type).map(o => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-ink-400 py-2">No {LINKED_TYPE_LABELS[linkForm.type].toLowerCase()}s found in this tenancy.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Task Card sub-component ───────────────────────────────── */

function TaskCard({ task, onDetail, onEdit, moveMenu, setMoveMenu, onMove, onDragStart, onDragEnd }: {
  task: TaskItem;
  onDetail: () => void;
  onEdit: () => void;
  moveMenu: string | null;
  setMoveMenu: (id: string | null) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate + 'T23:59:59') < new Date();
  const isMenuOpen = moveMenu === task.id;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      className="bg-white border border-ink-100 rounded-lg p-3 space-y-2 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
    >
      {/* Title + priority */}
      <div className="flex items-start justify-between gap-2">
        <button onClick={onDetail} className="text-left text-sm font-medium text-ink-900 hover:text-blue-700 transition-colors leading-tight">
          {task.title}
        </button>
        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </span>
      </div>

      {/* Category + due date */}
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span>{CATEGORY_LABELS[task.category]}</span>
        {task.dueDate && (
          <>
            <span>·</span>
            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{isOverdue ? 'Overdue: ' : 'Due: '}{fmtDate(task.dueDate)}</span>
          </>
        )}
      </div>

      {/* Assigned + linked count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {task.assignedToName ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink-100 text-ink-600">
              {task.assignedToName.split(' ')[0]}
            </span>
          ) : (
            <span className="text-[11px] text-ink-300">Unassigned</span>
          )}
          {task.linkedItems.length > 0 && (
            <span className="text-[11px] text-ink-400">{task.linkedItems.length} linked</span>
          )}
        </div>
        {/* Move menu */}
        <div className="relative">
          <button
            onClick={() => setMoveMenu(isMenuOpen ? null : task.id)}
            className="text-ink-300 hover:text-ink-600 text-xs px-1"
            title="Move task"
          >
            ···
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-6 z-20 bg-white border border-ink-200 rounded-lg shadow-lg py-1 min-w-[140px]">
              {LANES.filter(l => l.key !== task.status).map(l => (
                <button
                  key={l.key}
                  onClick={() => { onMove(task.id, l.key); setMoveMenu(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-ink-50 ${l.color}`}
                >
                  Move to {l.label}
                </button>
              ))}
              <div className="border-t border-ink-100 mt-1 pt-1">
                <button onClick={() => { setMoveMenu(null); onEdit(); }} className="w-full text-left px-3 py-1.5 text-xs text-ink-500 hover:bg-ink-50">Edit</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
