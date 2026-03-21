import { useBuildingStore } from '@/store/useBuildingStore';
import type { MaintenanceSchedule } from '@/store/useBuildingStore';

const CATEGORIES = ['HVAC', 'Elevator', 'Fire Safety', 'Plumbing', 'Electrical', 'General'] as const;
const FREQUENCIES = ['monthly', 'quarterly', 'semi-annual', 'annual'] as const;

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-Annual',
  annual: 'Annual',
};

const CAT_COLORS: Record<string, string> = {
  HVAC: 'bg-blue-100 text-blue-700',
  Elevator: 'bg-purple-100 text-purple-700',
  'Fire Safety': 'bg-red-100 text-red-700',
  Plumbing: 'bg-cyan-100 text-cyan-700',
  Electrical: 'bg-yellow-100 text-yellow-700',
  General: 'bg-ink-100 text-ink-600',
};

const STATUS_CONFIG: Record<MaintenanceSchedule['status'], { label: string; color: string; dot: string }> = {
  'on-track': { label: 'On Track', color: 'bg-sage-100 text-sage-700', dot: 'bg-sage-500' },
  'due-soon': { label: 'Due Soon', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  completed: { label: 'Completed', color: 'bg-mist-100 text-mist-700', dot: 'bg-mist-500' },
};

interface Props {
  store: ReturnType<typeof useBuildingStore.getState>;
  isBoard: boolean;
  openAdd: () => void;
  openEdit: (id: string, data: Record<string, string>) => void;
}

export default function MaintenanceScheduleTab({ store, isBoard, openAdd, openEdit }: Props) {
  const schedules = store.maintenanceSchedules;

  // Compliance scoring
  const total = schedules.length;
  const onTrack = schedules.filter(s => s.status === 'on-track' || s.status === 'completed').length;
  const overdue = schedules.filter(s => s.status === 'overdue').length;
  const dueSoon = schedules.filter(s => s.status === 'due-soon').length;
  const score = total > 0 ? Math.round((onTrack / total) * 100) : 100;
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const gc = score >= 80 ? 'sage' : score >= 60 ? 'yellow' : 'red';

  const totalCost = schedules.reduce((s, m) => {
    const num = parseFloat(m.estimatedCost.replace(/[^0-9.]/g, ''));
    return s + (isNaN(num) ? 0 : num);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Compliance header */}
      <div className={`bg-gradient-to-br from-${gc}-50 to-${gc}-100 border-2 border-${gc}-200 rounded-xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">Maintenance Health</h3>
            <p className="text-sm text-ink-500 mt-0.5">Preventive maintenance compliance score</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold text-${gc}-600`}>{grade}</div>
            <p className={`text-sm font-bold text-${gc}-600`}>{score}%</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Total Tasks</p>
            <p className="text-lg font-bold text-ink-900">{total}</p>
            <p className="text-[11px] text-ink-400 mt-1">scheduled items</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">On Track</p>
            <p className="text-lg font-bold text-sage-600">{onTrack}<span className="text-sm font-normal text-ink-400">/{total}</span></p>
            <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div className={`h-full bg-${gc}-500 rounded-full`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Overdue</p>
            <p className={`text-lg font-bold ${overdue > 0 ? 'text-red-600' : 'text-sage-600'}`}>{overdue}</p>
            <p className="text-[11px] text-ink-400 mt-1">{dueSoon > 0 ? `${dueSoon} due soon` : 'none upcoming'}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Est. Annual Cost</p>
            <p className="text-lg font-bold text-ink-900">${totalCost.toLocaleString()}</p>
            <p className="text-[11px] text-ink-400 mt-1">per cycle total</p>
          </div>
        </div>
      </div>

      {/* Schedule list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Recurring Schedules</h4>
          {isBoard && (
            <button onClick={openAdd} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Task</button>
          )}
        </div>

        <div className="space-y-2">
          {schedules.length === 0 && (
            <div className="text-center py-8">
              <p className="text-ink-400 text-sm">No maintenance schedules yet.</p>
            </div>
          )}

          {schedules.map(m => {
            const st = STATUS_CONFIG[m.status];
            const catColor = CAT_COLORS[m.category] || CAT_COLORS.General;
            return (
              <div key={m.id} className={`rounded-xl border p-4 transition-all ${m.status === 'overdue' ? 'border-red-200 bg-red-50 bg-opacity-40' : m.status === 'due-soon' ? 'border-yellow-200 bg-yellow-50 bg-opacity-40' : 'border-ink-100 bg-white hover:shadow-sm'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-ink-900">{m.task}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catColor}`}>{m.category}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${st.color}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${st.dot} mr-1`} />
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-ink-500 flex-wrap">
                      <span>Frequency: <strong className="text-ink-700">{FREQ_LABELS[m.frequency] || m.frequency}</strong></span>
                      {m.vendor && <span>Vendor: <strong className="text-ink-700">{m.vendor}</strong></span>}
                      <span>Est. Cost: <strong className="text-ink-700">{m.estimatedCost}</strong></span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs">
                      <span className="text-ink-400">Last completed: <strong className={m.lastCompleted ? 'text-ink-700' : 'text-ink-300'}>{m.lastCompleted || 'Never'}</strong></span>
                      <span className={`${m.status === 'overdue' ? 'text-red-600 font-semibold' : m.status === 'due-soon' ? 'text-yellow-600 font-semibold' : 'text-ink-400'}`}>
                        Next due: <strong>{m.nextDue || 'TBD'}</strong>
                      </span>
                    </div>
                    {m.notes && <p className="text-xs text-ink-400 mt-1.5">{m.notes}</p>}
                  </div>
                  {isBoard && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEdit(m.id, {
                          task: m.task, category: m.category, frequency: m.frequency,
                          vendor: m.vendor, lastCompleted: m.lastCompleted, nextDue: m.nextDue,
                          estimatedCost: m.estimatedCost, notes: m.notes, status: m.status,
                        })}
                        className="text-xs text-accent-600 font-medium hover:text-accent-700"
                      >Edit</button>
                      <button
                        onClick={() => { if (confirm(`Remove "${m.task}"?`)) store.removeMaintenanceSchedule(m.id); }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >Remove</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isBoard && (
        <button onClick={openAdd} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
          + Add Maintenance Task
        </button>
      )}
    </div>
  );
}
