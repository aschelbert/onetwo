import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { VendorCombobox } from '@/components/ui/VendorCombobox';
import {
  type PMTask,
  type PMCategory,
  PM_CATEGORY_LABELS,
  CATEGORY_DOT_COLORS,
  hydrateTemplates,
  computeTaskMonths,
  buildCalendarGrid,
} from './pmCalendarData';

interface Step1PMCalendarProps {
  c: CaseTrackerCase;
  step: CaseStep;
  onToggleCheck: (checkId: string) => void;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FREQ_OPTIONS: PMTask['frequency'][] = ['monthly', 'quarterly', 'semi-annual', 'annual'];
const CATEGORY_OPTIONS = Object.keys(PM_CATEGORY_LABELS) as PMCategory[];

/* ── Tiny helpers ── */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-[10px] font-bold text-ink-400 uppercase tracking-wider text-left px-2 py-2">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`text-xs text-ink-700 px-2 py-1.5 ${className}`}>{children}</td>;
}

/* ── Main component ── */
export function Step1PMCalendar({ c, step, onToggleCheck }: Step1PMCalendarProps) {
  const savePMCalendar = useIssuesStore(s => s.savePMCalendar);
  const vendors = useBuildingStore(s => s.vendors);
  const checks = step.checks || [];
  const allChecked = checks.every(ck => ck.checked);

  // Local state initialized from persisted step data
  const persisted = step.pmCalendar;
  const [tasks, setTasks] = useState<PMTask[]>(() => (persisted?.tasks as PMTask[]) || []);
  const [calendarYear, setCalendarYear] = useState(() => persisted?.calendarYear || new Date().getFullYear());
  const [taskListOpen, setTaskListOpen] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Debounce timer ref for text inputs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist helper — saves to Zustand store (which persists to localStorage)
  const persist = useCallback((nextTasks: PMTask[], nextYear: number) => {
    savePMCalendar(c.id, 0, { tasks: nextTasks, calendarYear: nextYear });
  }, [c.id, savePMCalendar]);

  // Save immediately (for selects, toggles)
  const saveTasks = useCallback((nextTasks: PMTask[]) => {
    setTasks(nextTasks);
    persist(nextTasks, calendarYear);
  }, [calendarYear, persist]);

  // Save with debounce (for text inputs)
  const saveTasksDebounced = useCallback((nextTasks: PMTask[]) => {
    setTasks(nextTasks);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persist(nextTasks, calendarYear);
    }, 800);
  }, [calendarYear, persist]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Calendar grid (memoized)
  const grid = useMemo(() => buildCalendarGrid(tasks), [tasks]);

  // ── Actions ──
  const handleLoadTemplates = () => {
    const templates = hydrateTemplates();
    saveTasks(templates);
  };

  const handleScheduleAll = () => {
    const next = tasks.map(t => ({ ...t, eventCreated: true }));
    saveTasks(next);
  };

  const handleYearChange = (yr: number) => {
    setCalendarYear(yr);
    persist(tasks, yr);
  };

  const handleAddTask = () => {
    const id = `pmt_${crypto.randomUUID().slice(0, 8)}`;
    const newTask: PMTask = {
      id,
      name: '',
      category: 'other',
      startMonth: 1,
      frequency: 'annual',
      vendorId: null,
      vendorName: '',
      notes: '',
      eventCreated: false,
    };
    const next = [...tasks, newTask];
    saveTasks(next);
    setEditingTaskId(id);
  };

  const handleDeleteTask = (taskId: string) => {
    saveTasks(tasks.filter(t => t.id !== taskId));
    if (editingTaskId === taskId) setEditingTaskId(null);
  };

  const updateTask = (taskId: string, patch: Partial<PMTask>, debounce = false) => {
    const next = tasks.map(t => t.id === taskId ? { ...t, ...patch } : t);
    if (debounce) {
      saveTasksDebounced(next);
    } else {
      saveTasks(next);
    }
  };

  // ── Category stats for summary ──
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  return (
    <div className="p-5 md:px-7 md:py-6 space-y-4" style={{ maxWidth: 900 }}>

      {/* ── Step card header ── */}
      <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
        <div className={`flex items-center justify-between px-5 py-3 border-b border-ink-100 ${
          step.done ? 'bg-sage-50' : 'bg-ink-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
              step.done
                ? 'bg-sage-500 border-sage-500 text-white'
                : 'border-ink-200 text-ink-300'
            }`}>
              {step.done ? '✓' : '1'}
            </div>
            <span className={`text-[13px] font-semibold ${step.done ? 'text-sage-500' : 'text-ink-900'}`}>
              {step.done ? 'Completed' : 'Mark Complete'}
            </span>
            {step.doneDate && (
              <span className="text-[11px] text-ink-400 ml-1">on {step.doneDate}</span>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm font-medium text-ink-900 mb-3.5 leading-relaxed">{step.s}</p>

          {/* Metadata chips */}
          <div className="flex flex-wrap gap-3 mb-4">
            {step.t && (
              <div className="flex items-center gap-1.5">
                <span className="text-[13px]">⏱</span>
                <div>
                  <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">Timeline</div>
                  <div className="text-xs text-ink-700 font-medium">{step.t}</div>
                </div>
              </div>
            )}
            {step.d && (
              <div className="flex items-center gap-1.5">
                <span className="text-[13px]">📋</span>
                <div>
                  <div className="text-[9px] font-bold text-ink-400 uppercase tracking-wide">Reference</div>
                  <div className="text-xs text-ink-700 font-medium">{step.d}</div>
                </div>
              </div>
            )}
          </div>

          {/* Guidance block */}
          {step.detail && (
            <div className="bg-mist-50 border border-mist-100 rounded-lg p-3">
              <div className="text-[10px] font-bold text-mist-500 uppercase tracking-wide mb-1">Guidance</div>
              <p className="text-[13px] text-ink-700 leading-relaxed">{step.detail}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-xl border border-ink-100 px-5 py-4">
        <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLoadTemplates}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-accent-600 text-white hover:bg-accent-700 transition-colors"
          >
            📋 Load Templates
          </button>
          <button
            onClick={handleScheduleAll}
            disabled={tasks.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-ink-200 text-ink-700 hover:bg-mist-50 hover:border-ink-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📅 Schedule All
          </button>
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">Year</label>
            <input
              type="number"
              value={calendarYear}
              onChange={e => handleYearChange(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-20 text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:border-accent-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Checklist ── */}
      {checks.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-100 px-5 py-4 space-y-2">
          <p className="text-xs font-bold text-ink-400 uppercase tracking-widest mb-2">
            Checklist ({checks.filter(ck => ck.checked).length}/{checks.length} complete)
          </p>
          {checks.map(ck => (
            <div
              key={ck.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                ck.checked ? 'border-sage-200 bg-sage-50' : 'border-ink-100 bg-white'
              }`}
            >
              <button
                onClick={() => onToggleCheck(ck.id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                  ck.checked ? 'bg-sage-500 border-sage-500' : 'border-ink-300 hover:border-accent-400'
                }`}
              >
                {ck.checked && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className={`text-sm leading-tight ${ck.checked ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                {ck.label}
              </span>
              {ck.checked && ck.checkedDate && (
                <span className="text-[10px] text-sage-500 ml-auto shrink-0">{ck.checkedDate}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Task List ── */}
      <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
        <button
          onClick={() => setTaskListOpen(!taskListOpen)}
          className="w-full flex items-center justify-between px-5 py-3 bg-ink-50 border-b border-ink-100"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">
              Maintenance Tasks
            </p>
            <span className="text-[11px] text-ink-400">({tasks.length})</span>
          </div>
          <span className="text-ink-400 text-[11px]">{taskListOpen ? '▾' : '▸'}</span>
        </button>

        {taskListOpen && (
          <div className="overflow-x-auto">
            {tasks.length > 0 ? (
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-ink-100">
                    <Th>Task</Th>
                    <Th>Category</Th>
                    <Th>Start</Th>
                    <Th>Frequency</Th>
                    <Th>Vendor</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => {
                    const isEditing = editingTaskId === task.id;
                    return (
                      <tr key={task.id} className="border-b border-ink-50 hover:bg-mist-50/50">
                        <Td>
                          {isEditing ? (
                            <input
                              type="text"
                              value={task.name}
                              onChange={e => updateTask(task.id, { name: e.target.value }, true)}
                              className="w-full text-xs border border-ink-200 rounded-md px-2 py-1 focus:border-accent-400 focus:outline-none"
                              placeholder="Task name"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => setEditingTaskId(task.id)}
                              className="text-left text-xs text-ink-800 hover:text-accent-600 transition-colors truncate max-w-[200px] block"
                              title={task.name || 'Click to edit'}
                            >
                              {task.name || <span className="text-ink-300 italic">Untitled</span>}
                            </button>
                          )}
                        </Td>
                        <Td>
                          <select
                            value={task.category}
                            onChange={e => updateTask(task.id, { category: e.target.value as PMCategory })}
                            className="text-xs border border-ink-200 rounded-md px-1.5 py-1 focus:border-accent-400 focus:outline-none bg-white"
                          >
                            {CATEGORY_OPTIONS.map(cat => (
                              <option key={cat} value={cat}>{PM_CATEGORY_LABELS[cat]}</option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <select
                            value={task.startMonth}
                            onChange={e => updateTask(task.id, { startMonth: parseInt(e.target.value) })}
                            className="text-xs border border-ink-200 rounded-md px-1.5 py-1 focus:border-accent-400 focus:outline-none bg-white"
                          >
                            {MONTH_NAMES.map((name, i) => (
                              <option key={i} value={i + 1}>{name}</option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <select
                            value={task.frequency}
                            onChange={e => updateTask(task.id, { frequency: e.target.value as PMTask['frequency'] })}
                            className="text-xs border border-ink-200 rounded-md px-1.5 py-1 focus:border-accent-400 focus:outline-none bg-white"
                          >
                            {FREQ_OPTIONS.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </Td>
                        <Td className="min-w-[160px]">
                          <VendorCombobox
                            vendors={vendors}
                            value={{ vendorId: task.vendorId, vendorName: task.vendorName }}
                            onChange={(vendorId, vendorName) => updateTask(task.id, { vendorId, vendorName })}
                          />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <button
                                onClick={() => setEditingTaskId(null)}
                                className="text-[11px] text-sage-600 hover:text-sage-700 px-1.5 py-0.5 rounded hover:bg-sage-50"
                              >
                                Done
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingTaskId(task.id)}
                                className="text-[11px] text-ink-400 hover:text-ink-600 px-1.5 py-0.5 rounded hover:bg-ink-50"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-[11px] text-ink-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50"
                            >
                              ×
                            </button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-ink-400">No maintenance tasks yet.</p>
                <p className="text-xs text-ink-300 mt-1">Click "Load Templates" to get started with 24 pre-defined tasks.</p>
              </div>
            )}

            <div className="px-5 py-3 border-t border-ink-100">
              <button
                onClick={handleAddTask}
                className="text-xs font-medium text-accent-600 hover:text-accent-700 px-2 py-1 rounded hover:bg-accent-50 transition-colors"
              >
                + Add Task
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Notes editor for editing task ── */}
      {editingTaskId && (() => {
        const task = tasks.find(t => t.id === editingTaskId);
        if (!task) return null;
        return (
          <div className="bg-white rounded-xl border border-ink-100 px-5 py-4 space-y-3">
            <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">
              Task Notes — {task.name || 'Untitled'}
            </p>
            <textarea
              value={task.notes}
              onChange={e => updateTask(task.id, { notes: e.target.value }, true)}
              placeholder="Add notes for this task…"
              rows={3}
              className="w-full text-xs border border-ink-200 rounded-md px-3 py-2 focus:border-accent-400 focus:outline-none resize-none"
            />
          </div>
        );
      })()}

      {/* ── Calendar Preview ── */}
      <div className="bg-white rounded-xl border border-ink-100 overflow-hidden">
        <button
          onClick={() => setCalendarOpen(!calendarOpen)}
          className="w-full flex items-center justify-between px-5 py-3 bg-ink-50 border-b border-ink-100"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">
              Calendar Preview — {calendarYear}
            </p>
          </div>
          <span className="text-ink-400 text-[11px]">{calendarOpen ? '▾' : '▸'}</span>
        </button>

        {calendarOpen && (
          <div className="px-5 py-4">
            {tasks.length === 0 ? (
              <p className="text-xs text-ink-400 text-center py-4">Add tasks to see the calendar preview.</p>
            ) : (
              <>
                {/* Month grid */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {MONTH_NAMES.map((name, i) => {
                    const month = i + 1;
                    const monthTasks = grid[month] || [];
                    // Dedupe categories for dot display
                    const cats = [...new Set(monthTasks.map(t => t.category as PMCategory))];
                    return (
                      <div key={month} className="border border-ink-100 rounded-lg p-2.5">
                        <div className="text-[10px] font-bold text-ink-500 uppercase tracking-wide mb-1.5">
                          {name}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {cats.map(cat => (
                            <span
                              key={cat}
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: CATEGORY_DOT_COLORS[cat] }}
                              title={PM_CATEGORY_LABELS[cat]}
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-ink-400">
                          {monthTasks.length} {monthTasks.length === 1 ? 'task' : 'tasks'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-3 border-t border-ink-100">
                  {Object.entries(categoryCounts).map(([cat, count]) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_DOT_COLORS[cat as PMCategory] }}
                      />
                      <span className="text-[10px] text-ink-500">
                        {PM_CATEGORY_LABELS[cat as PMCategory]} ({count})
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation hint ── */}
      <div className="flex justify-center mt-5">
        <p className="text-[11px] text-ink-400">
          {allChecked
            ? '✓ Step complete — click step 2 in the sidebar to continue'
            : '↓ Complete all checklist items to finish this step'}
        </p>
      </div>
    </div>
  );
}
