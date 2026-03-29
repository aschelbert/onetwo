import { useTabParam } from '@/hooks/useTabParam';
import { useAuthStore } from '@/store/useAuthStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { useTaskTrackingStore } from '@/store/useTaskTrackingStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import PropertyLogPage from '@/features/property-log/PropertyLogPage';
import TaskTrackingTab from '@/features/association-team/tabs/TaskTrackingTab';
import PMScorecardTab from '@/features/building/tabs/PMScorecardTab';
import PayrollTab from '@/features/association-team/tabs/PayrollTab';
import CommunicationsTab from '@/features/association-team/tabs/CommunicationsTab';

const TABS = ['property-log', 'task-tracking', 'pm-scorecard', 'communications', 'payroll'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  'property-log': 'Property Log',
  'task-tracking': 'Task Tracking',
  'pm-scorecard': 'PM Scorecard',
  'communications': 'Intercom',
  'payroll': 'Payroll & 1099s',
};

export default function AssociationTeamPage() {
  const [tab, setTab] = useTabParam<Tab>('tab', 'property-log', [...TABS]);
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  const { logs } = usePropertyLogStore();
  const { tasks } = useTaskTrackingStore();
  const { staff } = usePayrollStore();

  /* ── Header metrics ──────────────── */
  const openLogs = logs.filter(l => l.status === 'open').length;
  const highFindings = logs.flatMap(l => l.findings).filter(f => f.severity === 'high' || f.severity === 'medium').length;
  const openActions = logs.flatMap(l => l.actionItems).filter(a => a.status === 'open').length;
  const activeTasks = tasks.filter(t => t.status === 'in_progress').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const activeStaff = staff.filter(s => s.status === 'active').length;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Association Team</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          {[
            { val: openLogs, label: 'Open Logs', icon: '📋', tab: 'property-log' as Tab },
            { val: highFindings, label: 'Findings', icon: '🔍', tab: 'property-log' as Tab },
            { val: openActions, label: 'Action Items', icon: '⚡', tab: 'property-log' as Tab },
            { val: activeTasks, label: 'In Progress', icon: '🔄', tab: 'task-tracking' as Tab },
            { val: blockedTasks, label: 'Blocked', icon: '🚫', tab: 'task-tracking' as Tab },
            { val: activeStaff, label: 'Active Staff', icon: '👥', tab: 'payroll' as Tab },
          ].map(s => (
            <div key={s.label} onClick={() => setTab(s.tab)} className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-3 text-center cursor-pointer hover:bg-opacity-20 transition-colors">
              <span className="text-xl">{s.icon}</span>
              <p className="text-[11px] text-accent-100 mt-0.5 leading-tight">{s.label}</p>
              <p className="text-sm font-bold text-white mt-1">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t
                  ? 'border-ink-900 text-ink-900'
                  : 'border-transparent text-ink-400 hover:text-ink-700'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
        {tab === 'property-log' && <PropertyLogPage />}

        {tab === 'task-tracking' && <TaskTrackingTab />}

        {tab === 'pm-scorecard' && <PMScorecardTab />}

        {tab === 'communications' && <CommunicationsTab />}

        {tab === 'payroll' && <PayrollTab />}
      </div>
    </div>
  );
}
