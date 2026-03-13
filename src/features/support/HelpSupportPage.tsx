import { useState } from 'react';
import { MessageCircle, BookOpen } from 'lucide-react';
import SupportPage from './SupportPage';
import HowItWorksPage from './HowItWorksPage';

const TABS = [
  { id: 'chat', label: 'Support Chat', icon: MessageCircle },
  { id: 'guides', label: 'How This Works', icon: BookOpen },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function HelpSupportPage() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-ink-900 text-white'
                  : 'text-ink-600 hover:bg-mist-50 hover:text-ink-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'chat' ? (
        <div className="flex-1 min-h-0">
          <SupportPage />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <HowItWorksPage />
        </div>
      )}
    </div>
  );
}
