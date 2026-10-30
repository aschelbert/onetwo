import { useState, useMemo } from 'react';
import { useReportStore } from '@/store/useReportStore';
import type { GeneratedReport, ReportCategory, ReportType } from '@/lib/services/reports';
import { CATEGORY_MAP, REPORT_TYPE_MAP, CATEGORIES, REPORT_TYPES } from './reportCategories';
import CaseReportRenderer from './renderers/CaseReportRenderer';
import FinancialStatementRenderer from './renderers/FinancialStatementRenderer';
import BoardReportRenderer from './renderers/BoardReportRenderer';
import SalesPackageRenderer from './renderers/SalesPackageRenderer';
import ExecutiveSummaryRenderer from './renderers/ExecutiveSummaryRenderer';
import { printReport } from '@/lib/printReport';

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReportRenderer({ report }: { report: GeneratedReport }) {
  if (report.type === 'executive_summary') return <ExecutiveSummaryRenderer snapshot={report.snapshot} />;
  const cat = report.category;
  if (cat === 'case_analysis') return <CaseReportRenderer type={report.type} snapshot={report.snapshot} />;
  if (cat === 'financial_statements') return <FinancialStatementRenderer type={report.type} snapshot={report.snapshot} />;
  if (cat === 'board_governance') return <BoardReportRenderer type={report.type} snapshot={report.snapshot} />;
  if (cat === 'sales_package') return <SalesPackageRenderer type={report.type} snapshot={report.snapshot} />;
  return <p className="text-sm text-ink-400">Unknown report category.</p>;
}

export default function ReportList() {
  const { reports, deleteReport } = useReportStore();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<ReportCategory | ''>('');
  const [filterType, setFilterType] = useState<ReportType | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    let result = [...reports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q));
    }
    if (filterCategory) result = result.filter(r => r.category === filterCategory);
    if (filterType) result = result.filter(r => r.type === filterType);
    return result;
  }, [reports, search, filterCategory, filterType]);

  // Build type options based on selected category
  const typeOptions = filterCategory
    ? REPORT_TYPES.filter(r => r.category === filterCategory)
    : REPORT_TYPES;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search report name..."
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">Category</label>
          <select
            value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value as ReportCategory | ''); setFilterType(''); }}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">Type</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as ReportType | '')}
            className="border border-ink-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            {typeOptions.map(r => <option key={r.type} value={r.type}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-ink-400">{filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}</p>

      {/* Report list */}
      {filteredReports.length === 0 ? (
        <div className="text-center py-12 text-ink-400">
          <p className="text-lg font-medium">No reports found</p>
          <p className="text-sm mt-1">{reports.length === 0 ? 'Generate your first report from the catalog.' : 'Try adjusting your filters.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReports.map(report => {
            const isExpanded = expandedId === report.id;
            const catMeta = CATEGORY_MAP[report.category];
            const typeMeta = REPORT_TYPE_MAP[report.type];
            return (
              <div key={report.id} className={`rounded-xl border transition-all ${isExpanded ? 'border-ink-200 bg-white shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
                <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : report.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-ink-900">{report.name}</span>
                        {catMeta && <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catMeta.color.bg} ${catMeta.color.text}`}>{catMeta.label}</span>}
                        {typeMeta && <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 font-semibold">{typeMeta.label}</span>}
                      </div>
                      {report.periodStart && report.periodEnd && (
                        <p className="text-xs text-ink-500 mt-0.5">Period: {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-ink-400">
                        <span>Generated {formatDate(report.generatedAt)}</span>
                        <span>By {report.generatedBy}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Delete this report?')) { deleteReport(report.id); if (expandedId === report.id) setExpandedId(null); } }}
                        className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium"
                      >
                        Delete
                      </button>
                      <svg className={`w-4 h-4 text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-ink-100 px-4 pb-5 pt-4">
                    <div className="flex justify-end mb-3 no-print">
                      <button
                        onClick={e => { e.stopPropagation(); printReport(document.querySelector(`[data-report-print="${report.id}"]`) as HTMLElement); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800 transition-colors"
                      >
                        Export PDF
                      </button>
                    </div>
                    <div className="print-report-root" data-report-print={report.id}>
                      <ReportRenderer report={report} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
