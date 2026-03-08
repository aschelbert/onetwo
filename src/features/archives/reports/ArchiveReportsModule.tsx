import { useState } from 'react';
import { useReportStore } from '@/store/useReportStore';
import ReportCatalog from './ReportCatalog';
import ReportList from './ReportList';

type View = 'generate' | 'history';

export default function ArchiveReportsModule() {
  const [view, setView] = useState<View>('generate');
  const reportCount = useReportStore(s => s.reports.length);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Reports</h3>
          <p className="text-sm text-ink-500 mt-0.5">Generate and manage reports across all categories</p>
        </div>
        <div className="flex bg-ink-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('generate')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'generate' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Generate
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'history' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            History
            {reportCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-accent-100 text-accent-700 rounded-full font-semibold">
                {reportCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'generate' && <ReportCatalog onGenerated={() => setView('history')} />}
      {view === 'history' && <ReportList />}
    </div>
  );
}
