import { useTabParam } from '@/hooks/useTabParam';
import { useAuthStore } from '@/store/useAuthStore';
import PropertyLogPage from '@/features/property-log/PropertyLogPage';
import TaskTrackingTab from '@/features/association-team/tabs/TaskTrackingTab';
import PMScorecardTab from '@/features/building/tabs/PMScorecardTab';
import PayrollTab from '@/features/association-team/tabs/PayrollTab';

const TABS = ['property-log', 'task-tracking', 'pm-scorecard', 'payroll'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  'property-log': 'Property Log',
  'task-tracking': 'Task Tracking',
  'pm-scorecard': 'PM Scorecard',
  'payroll': 'Payroll & 1099s',
};

export default function AssociationTeamPage() {
  const [tab, setTab] = useTabParam<Tab>('tab', 'property-log', [...TABS]);
  const { currentRole } = useAuthStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Association Team</h2>
            <p className="text-accent-200 text-sm mt-1">Property operations, task management, and team oversight</p>
          </div>
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

        {tab === 'payroll' && <PayrollTab />}
      </div>
    </div>
  );
}
