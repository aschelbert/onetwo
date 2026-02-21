import { useLocation } from 'react-router-dom';

const titles: Record<string, { label: string; desc: string; icon: string }> = {
  '/financial': { label: 'Fiscal Lens', desc: 'Monitor income, units, and reserve fund', icon: '💰' },
  '/issues': { label: 'Case Ops', desc: 'Track HOA situations and resident issues', icon: '📋' },
  '/meetings': { label: 'Meetings', desc: 'View meeting schedules, agendas, and notes', icon: '📅' },
  '/building': { label: 'The Building', desc: 'Building information, contacts, and bylaws', icon: '🏢' },
  '/compliance': { label: 'Compliance Runbook', desc: 'Annual compliance with health scoring', icon: '🛡️' },
  '/my-unit': { label: 'My Unit', desc: 'Your unit assessments, payments, and cases', icon: '🏠' },
  '/account': { label: 'My Account', desc: 'Update your profile and notification settings', icon: '👤' },
  '/admin/users': { label: 'User Management', desc: 'Invite and manage residents and board members', icon: '👥' },
};

export default function PlaceholderPage() {
  const location = useLocation();
  const info = titles[location.pathname] || { label: 'Page', desc: 'Coming soon', icon: '📄' };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">{info.icon}</span>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">{info.label}</h1>
            <p className="text-sm text-ink-500">{info.desc}</p>
          </div>
        </div>
        <div className="bg-mist-50 border border-mist-200 rounded-xl p-6 text-center">
          <p className="text-ink-600 font-medium mb-2">Module Ready for Migration</p>
          <p className="text-sm text-ink-400">
            This module&apos;s route is wired up and ready. The full functionality from the original
            app will be migrated here as a React component with its own Zustand store.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-sage-100 text-sage-700 rounded-lg text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Route active · Store scaffolded · Ready for Phase 3
          </div>
        </div>
      </div>
    </div>
  );
}
