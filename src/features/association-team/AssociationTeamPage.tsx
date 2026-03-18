import { useTabParam } from '@/hooks/useTabParam';
import { useAuthStore } from '@/store/useAuthStore';
import PropertyLogPage from '@/features/property-log/PropertyLogPage';
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

        {tab === 'task-tracking' && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">&#x1F4CB;</p>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-2">Task Tracking</h3>
            <p className="text-sm text-ink-500 mb-1">Track and manage association tasks, action items, and follow-ups</p>
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-mist-50 border border-mist-200 text-ink-600 rounded-lg text-sm font-medium">
              Coming Soon
            </div>
          </div>
        )}

        {tab === 'pm-scorecard' && <PMScorecardTab />}

        {tab === 'payroll' && <PayrollTab />}
      </div>
    </div>
  );
}
