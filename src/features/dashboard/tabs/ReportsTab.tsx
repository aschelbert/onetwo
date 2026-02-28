import { useState, useMemo } from 'react';
import { useReportStore } from '@/store/useReportStore';
import type { ReportConfig, GeneratedReport } from '@/store/useReportStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBoardOpsStore } from '@/store/useBoardOpsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import Modal from '@/components/ui/Modal';
import { fmt } from '@/lib/formatters';

// ─── Constants ────────────────────────────────────────

type ReportType = ReportConfig['type'];
type Schedule = ReportConfig['schedule'];

const TYPE_LABELS: Record<ReportType, string> = {
  board_packet: 'Board Packet',
  monthly_summary: 'Monthly Summary',
  compliance_report: 'Compliance Report',
  financial_snapshot: 'Financial Snapshot',
};

const TYPE_COLORS: Record<ReportType, { bg: string; text: string }> = {
  board_packet:       { bg: 'bg-accent-100', text: 'text-accent-700' },
  monthly_summary:    { bg: 'bg-mist-100',   text: 'text-mist-700' },
  compliance_report:  { bg: 'bg-sage-100',   text: 'text-sage-700' },
  financial_snapshot: { bg: 'bg-yellow-100',  text: 'text-yellow-700' },
};

const SCHEDULE_LABELS: Record<Schedule, string> = {
  manual: 'Manual',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

const ALL_SECTIONS = [
  { id: 'financial',    label: 'Financial Summary' },
  { id: 'compliance',   label: 'Compliance Status' },
  { id: 'maintenance',  label: 'Maintenance & Work Orders' },
  { id: 'issues',       label: 'Open Issues & Cases' },
  { id: 'meetings',     label: 'Meeting Minutes' },
  { id: 'delinquency',  label: 'Delinquency Report' },
  { id: 'vendor',       label: 'Vendor Activity' },
  { id: 'property_log', label: 'Property Log' },
];

type SubView = 'configs' | 'reports';

// ─── Helpers ──────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────

export default function ReportsTab() {
  const { configs, reports, addConfig, updateConfig, deleteConfig, addReport, deleteReport } = useReportStore();
  const { currentUser } = useAuthStore();
  const fin = useFinancialStore();
  const comp = useComplianceStore();
  const issues = useIssuesStore();
  const { meetings } = useMeetingsStore();
  const boardOps = useBoardOpsStore();
  const building = useBuildingStore();
  const propertyLog = usePropertyLogStore();

  const [subView, setSubView] = useState<SubView>('configs');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);

  // ─── Config Editor state ────────────────────────
  const emptyForm = {
    name: '',
    type: 'board_packet' as ReportType,
    schedule: 'manual' as Schedule,
    sections: ALL_SECTIONS.map(s => ({ ...s, enabled: true })),
  };
  const [form, setForm] = useState(emptyForm);

  // ─── Derived ──────────────────────────────────────
  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [reports],
  );

  // ─── Snapshot builder ─────────────────────────────

  function buildSnapshot(config: ReportConfig): Record<string, any> {
    const snapshot: Record<string, any> = {};
    const enabledIds = new Set(config.sections.filter(s => s.enabled).map(s => s.id));

    if (enabledIds.has('financial')) {
      const bs = fin.getBalanceSheet();
      const metrics = fin.getIncomeMetrics();
      const variance = fin.getBudgetVariance();
      const overBudget = variance.filter(v => v.pct > 100).length;
      const underBudget = variance.filter(v => v.pct <= 100).length;
      snapshot.financial = {
        operatingCash: bs.assets.operating,
        reserveFund: bs.assets.reserves,
        totalAssets: bs.assets.total,
        totalLiabilities: bs.liabilities.total,
        totalEquity: bs.equity.total,
        monthlyExpected: metrics.monthlyExpected,
        monthlyCollected: metrics.monthlyCollected,
        collectionRate: metrics.collectionRate,
        totalUnits: metrics.totalUnits,
        budgetCategories: variance.length,
        overBudget,
        underBudget,
      };
    }

    if (enabledIds.has('compliance')) {
      const pending = comp.filings.filter(f => f.status === 'pending');
      const filed = comp.filings.filter(f => f.status === 'filed');
      const overdue = pending.filter(f => new Date(f.dueDate) < new Date());
      snapshot.compliance = {
        totalFilings: comp.filings.length,
        pending: pending.length,
        filed: filed.length,
        overdue: overdue.length,
        filings: comp.filings.map(f => ({
          name: f.name,
          status: f.status,
          dueDate: f.dueDate,
          responsible: f.responsible,
        })),
        communicationsSent: comp.communications.filter(c => c.status === 'sent').length,
      };
    }

    if (enabledIds.has('maintenance')) {
      const workOrders = fin.workOrders;
      const open = workOrders.filter(w => w.status !== 'paid');
      const paid = workOrders.filter(w => w.status === 'paid');
      snapshot.maintenance = {
        totalWorkOrders: workOrders.length,
        open: open.length,
        paid: paid.length,
        openItems: open.map(w => ({ title: w.title, vendor: w.vendor, status: w.status, amount: w.amount })),
      };
    }

    if (enabledIds.has('issues')) {
      const openCases = issues.cases.filter(c => c.status === 'open');
      const closedCases = issues.cases.filter(c => c.status === 'closed');
      const urgent = openCases.filter(c => c.priority === 'urgent');
      const high = openCases.filter(c => c.priority === 'high');
      const medium = openCases.filter(c => c.priority === 'medium');
      const low = openCases.filter(c => c.priority === 'low');
      snapshot.issues = {
        totalCases: issues.cases.length,
        open: openCases.length,
        closed: closedCases.length,
        urgent: urgent.length,
        high: high.length,
        medium: medium.length,
        low: low.length,
        openCases: openCases.map(c => ({ title: c.title, priority: c.priority, unit: c.unit, created: c.created })),
        submittedIssues: issues.issues.filter(i => i.status === 'SUBMITTED').length,
      };
    }

    if (enabledIds.has('meetings')) {
      const upcoming = meetings
        .filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED')
        .sort((a, b) => a.date.localeCompare(b.date));
      const completed = meetings.filter(m => m.status === 'COMPLETED');
      snapshot.meetings = {
        upcoming: upcoming.map(m => ({ title: m.title, date: m.date, time: m.time, type: m.type, location: m.location })),
        upcomingCount: upcoming.length,
        completedCount: completed.length,
        totalMeetings: meetings.length,
      };
    }

    if (enabledIds.has('delinquency')) {
      const delinquent = fin.units.filter(u => u.balance > 0);
      const totalOwed = delinquent.reduce((s, u) => s + u.balance, 0);
      snapshot.delinquency = {
        delinquentUnits: delinquent.length,
        totalUnits: fin.units.length,
        totalOwed,
        units: delinquent.map(u => ({ unit: u.number, owner: u.owner, balance: u.balance })),
      };
    }

    if (enabledIds.has('vendor')) {
      const activeVendors = building.vendors.filter(v => v.status === 'active');
      const inactiveVendors = building.vendors.filter(v => v.status === 'inactive');
      snapshot.vendor = {
        totalVendors: building.vendors.length,
        active: activeVendors.length,
        inactive: inactiveVendors.length,
        vendors: activeVendors.map(v => ({ name: v.name, service: v.service, contract: v.contract })),
      };
    }

    if (enabledIds.has('property_log')) {
      const logs = propertyLog.logs;
      const openLogs = logs.filter(l => l.status === 'open');
      snapshot.property_log = {
        totalLogs: logs.length,
        open: openLogs.length,
        resolved: logs.filter(l => l.status === 'resolved').length,
        recentLogs: logs.slice(0, 5).map(l => ({ title: l.title, date: l.date, type: l.type, status: l.status })),
      };
    }

    return snapshot;
  }

  // ─── Actions ──────────────────────────────────────

  function handleGenerate(config: ReportConfig) {
    const today = new Date().toISOString().split('T')[0];
    const snapshot = buildSnapshot(config);
    addReport({
      configId: config.id,
      name: `${config.name} -- ${today}`,
      type: config.type,
      generatedAt: today,
      generatedBy: currentUser.name,
      snapshot,
    });
    updateConfig(config.id, { lastGenerated: today });
  }

  function openEditor(config?: ReportConfig) {
    if (config) {
      setEditingConfigId(config.id);
      setForm({
        name: config.name,
        type: config.type,
        schedule: config.schedule,
        sections: ALL_SECTIONS.map(s => ({
          ...s,
          enabled: config.sections.find(cs => cs.id === s.id)?.enabled ?? false,
        })),
      });
    } else {
      setEditingConfigId(null);
      setForm({ ...emptyForm, sections: ALL_SECTIONS.map(s => ({ ...s, enabled: true })) });
    }
    setShowModal(true);
  }

  function saveConfig() {
    if (!form.name.trim()) return;
    const sections = form.sections.map(s => ({ id: s.id, label: s.label, enabled: s.enabled }));
    if (editingConfigId) {
      updateConfig(editingConfigId, { name: form.name, type: form.type, schedule: form.schedule, sections });
    } else {
      addConfig({
        name: form.name,
        type: form.type,
        sections,
        schedule: form.schedule,
        lastGenerated: '',
        createdBy: currentUser.name,
      });
    }
    setShowModal(false);
  }

  function toggleSection(id: string) {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s),
    }));
  }

  // ─── Render ───────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header with sub-view toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Auto-Reports</h3>
          <p className="text-sm text-ink-500 mt-0.5">Generate board packets and reports from live data</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-ink-100 rounded-lg p-0.5">
            <button
              onClick={() => setSubView('configs')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                subView === 'configs' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Configs
            </button>
            <button
              onClick={() => setSubView('reports')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                subView === 'reports' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              Generated Reports
              {reports.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-accent-100 text-accent-700 rounded-full font-semibold">
                  {reports.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════ CONFIGS VIEW ═══════════════ */}
      {subView === 'configs' && (
        <div className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Configurations</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">{configs.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Reports Generated</p>
              <p className="text-2xl font-bold text-sage-600 mt-1">{reports.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Auto-Scheduled</p>
              <p className="text-2xl font-bold text-mist-600 mt-1">
                {configs.filter(c => c.schedule !== 'manual').length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-ink-100 p-4">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Report Types</p>
              <p className="text-2xl font-bold text-ink-900 mt-1">
                {new Set(configs.map(c => c.type)).size}
              </p>
            </div>
          </div>

          {/* New config button */}
          <div className="flex justify-end">
            <button
              onClick={() => openEditor()}
              className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
            >
              + New Report Config
            </button>
          </div>

          {/* Config cards */}
          {configs.length === 0 ? (
            <div className="text-center py-12 text-ink-400">
              <p className="text-lg font-medium">No report configurations yet</p>
              <p className="text-sm mt-1">Create your first report configuration to start generating board packets.</p>
              <button
                onClick={() => openEditor()}
                className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
              >
                + New Report Config
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map(config => {
                const typeColor = TYPE_COLORS[config.type] || TYPE_COLORS.board_packet;
                const enabledCount = config.sections.filter(s => s.enabled).length;
                return (
                  <div
                    key={config.id}
                    className="bg-white rounded-xl border border-ink-100 hover:border-ink-200 transition-all"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-ink-900">{config.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${typeColor.bg} ${typeColor.text}`}>
                              {TYPE_LABELS[config.type]}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 font-semibold">
                              {SCHEDULE_LABELS[config.schedule]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-400">
                            <span>{enabledCount} section{enabledCount !== 1 ? 's' : ''} enabled</span>
                            <span>Created by {config.createdBy}</span>
                            <span>Last generated: {formatDate(config.lastGenerated)}</span>
                          </div>
                          {/* Section tags */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {config.sections.filter(s => s.enabled).map(s => (
                              <span
                                key={s.id}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-mist-50 text-ink-500 border border-mist-200"
                              >
                                {s.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleGenerate(config)}
                            className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-medium hover:bg-sage-700 transition-colors"
                          >
                            Generate Now
                          </button>
                          <button
                            onClick={() => openEditor(config)}
                            className="px-3 py-1.5 text-accent-600 hover:text-accent-700 text-xs font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete configuration "${config.name}"?`)) {
                                deleteConfig(config.id);
                              }
                            }}
                            className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ GENERATED REPORTS VIEW ═══════════════ */}
      {subView === 'reports' && (
        <div className="space-y-4">
          {sortedReports.length === 0 ? (
            <div className="text-center py-12 text-ink-400">
              <p className="text-lg font-medium">No generated reports yet</p>
              <p className="text-sm mt-1">Generate a report from one of your configurations.</p>
              <button
                onClick={() => setSubView('configs')}
                className="mt-4 px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 transition-colors"
              >
                View Configs
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedReports.map(report => {
                const isExpanded = expandedReport === report.id;
                const typeColor = TYPE_COLORS[report.type as ReportType] || TYPE_COLORS.board_packet;
                return (
                  <div
                    key={report.id}
                    className={`rounded-xl border transition-all ${
                      isExpanded ? 'border-ink-200 bg-white shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'
                    }`}
                  >
                    {/* Card header */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-ink-900">{report.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${typeColor.bg} ${typeColor.text}`}>
                              {TYPE_LABELS[report.type as ReportType] || report.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-ink-400">
                            <span>Generated {formatDate(report.generatedAt)}</span>
                            <span>By {report.generatedBy}</span>
                            <span>{Object.keys(report.snapshot).length} section{Object.keys(report.snapshot).length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this generated report?')) {
                                deleteReport(report.id);
                                if (expandedReport === report.id) setExpandedReport(null);
                              }
                            }}
                            className="px-3 py-1.5 text-red-400 hover:text-red-600 text-xs font-medium"
                          >
                            Delete
                          </button>
                          <svg
                            className={`w-4 h-4 text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded report viewer */}
                    {isExpanded && (
                      <div className="border-t border-ink-100 px-4 pb-5 pt-4">
                        <ReportViewer snapshot={report.snapshot} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ CONFIG EDITOR MODAL ═══════════════ */}
      {showModal && (
        <Modal
          title={editingConfigId ? 'Edit Report Config' : 'New Report Config'}
          onClose={() => setShowModal(false)}
          onSave={saveConfig}
          saveLabel={editingConfigId ? 'Save Changes' : 'Create Config'}
          wide
        >
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">Report Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Monthly Board Packet"
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Report Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(prev => ({ ...prev, type: e.target.value as ReportType }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                >
                  {(Object.keys(TYPE_LABELS) as ReportType[]).map(t => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Schedule</label>
                <select
                  value={form.schedule}
                  onChange={e => setForm(prev => ({ ...prev, schedule: e.target.value as Schedule }))}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
                >
                  {(Object.keys(SCHEDULE_LABELS) as Schedule[]).map(s => (
                    <option key={s} value={s}>{SCHEDULE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sections */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-ink-700">Report Sections</label>
                <span className="text-[10px] text-ink-400">
                  {form.sections.filter(s => s.enabled).length} of {form.sections.length} enabled
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {form.sections.map(section => (
                  <label
                    key={section.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      section.enabled
                        ? 'bg-sage-50 border-sage-200 text-ink-800'
                        : 'bg-white border-ink-100 text-ink-400 hover:border-ink-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={() => toggleSection(section.id)}
                      className="w-4 h-4 rounded border-ink-300 text-sage-600 focus:ring-sage-500"
                    />
                    <span className="text-sm font-medium">{section.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Report Viewer Component ──────────────────────────

function ReportViewer({ snapshot }: { snapshot: Record<string, any> }) {
  const sectionOrder = ['financial', 'compliance', 'maintenance', 'issues', 'meetings', 'delinquency', 'vendor', 'property_log'];
  const sectionLabels: Record<string, string> = {
    financial: 'Financial Summary',
    compliance: 'Compliance Status',
    maintenance: 'Maintenance & Work Orders',
    issues: 'Open Issues & Cases',
    meetings: 'Meetings',
    delinquency: 'Delinquency Report',
    vendor: 'Vendor Activity',
    property_log: 'Property Log',
  };

  const presentSections = sectionOrder.filter(s => snapshot[s]);

  if (presentSections.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-4">No data in this report snapshot.</p>;
  }

  return (
    <div className="space-y-5">
      {presentSections.map(sectionId => (
        <div key={sectionId}>
          <h4 className="text-xs text-ink-400 uppercase tracking-wider font-bold mb-3 border-b border-ink-100 pb-1.5">
            {sectionLabels[sectionId]}
          </h4>
          {sectionId === 'financial' && <FinancialSection data={snapshot.financial} />}
          {sectionId === 'compliance' && <ComplianceSection data={snapshot.compliance} />}
          {sectionId === 'maintenance' && <MaintenanceSection data={snapshot.maintenance} />}
          {sectionId === 'issues' && <IssuesSection data={snapshot.issues} />}
          {sectionId === 'meetings' && <MeetingsSection data={snapshot.meetings} />}
          {sectionId === 'delinquency' && <DelinquencySection data={snapshot.delinquency} />}
          {sectionId === 'vendor' && <VendorSection data={snapshot.vendor} />}
          {sectionId === 'property_log' && <PropertyLogSection data={snapshot.property_log} />}
        </div>
      ))}
    </div>
  );
}

// ─── Section Renderers ────────────────────────────────

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-ink-50 rounded-lg p-3">
      <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-lg font-bold text-ink-900 mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-ink-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FinancialSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricBox label="Operating Cash" value={fmt(data.operatingCash)} />
        <MetricBox label="Reserve Fund" value={fmt(data.reserveFund)} />
        <MetricBox label="Total Assets" value={fmt(data.totalAssets)} />
        <MetricBox label="Total Equity" value={fmt(data.totalEquity)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricBox label="Monthly Expected" value={fmt(data.monthlyExpected)} />
        <MetricBox label="Monthly Collected" value={fmt(data.monthlyCollected)} />
        <MetricBox label="Collection Rate" value={`${data.collectionRate}%`} />
        <MetricBox label="Total Units" value={String(data.totalUnits)} />
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-400">
        <span>{data.budgetCategories} budget categories</span>
        <span>{data.overBudget} over budget</span>
        <span>{data.underBudget} under/at budget</span>
      </div>
    </div>
  );
}

function ComplianceSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricBox label="Total Filings" value={String(data.totalFilings)} />
        <MetricBox label="Pending" value={String(data.pending)} />
        <MetricBox label="Filed" value={String(data.filed)} />
        <MetricBox label="Overdue" value={String(data.overdue)} />
      </div>
      {data.filings && data.filings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Filing</th>
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Status</th>
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Due Date</th>
                <th className="text-left py-1.5 text-ink-400 font-semibold">Responsible</th>
              </tr>
            </thead>
            <tbody>
              {data.filings.map((f: any, i: number) => (
                <tr key={i} className="border-b border-ink-50">
                  <td className="py-1.5 pr-3 text-ink-700 font-medium">{f.name}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      f.status === 'filed' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-500">{formatDate(f.dueDate)}</td>
                  <td className="py-1.5 text-ink-500">{f.responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-400">{data.communicationsSent} communications sent</p>
    </div>
  );
}

function MaintenanceSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Total Work Orders" value={String(data.totalWorkOrders)} />
        <MetricBox label="Open" value={String(data.open)} />
        <MetricBox label="Paid/Closed" value={String(data.paid)} />
      </div>
      {data.openItems && data.openItems.length > 0 && (
        <div>
          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Open Work Orders</p>
          <div className="space-y-1">
            {data.openItems.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="font-medium text-ink-700">{item.title}</span>
                  <span className="text-ink-400 ml-2">{item.vendor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ink-500">{fmt(item.amount)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IssuesSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricBox label="Total Cases" value={String(data.totalCases)} />
        <MetricBox label="Open" value={String(data.open)} />
        <MetricBox label="Closed" value={String(data.closed)} />
        <MetricBox label="Submitted Issues" value={String(data.submittedIssues)} />
      </div>
      {/* Priority breakdown */}
      <div className="flex items-center gap-3 text-xs">
        {data.urgent > 0 && (
          <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-semibold">
            {data.urgent} urgent
          </span>
        )}
        {data.high > 0 && (
          <span className="px-2 py-1 rounded bg-orange-100 text-orange-700 font-semibold">
            {data.high} high
          </span>
        )}
        {data.medium > 0 && (
          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-semibold">
            {data.medium} medium
          </span>
        )}
        {data.low > 0 && (
          <span className="px-2 py-1 rounded bg-ink-100 text-ink-600 font-semibold">
            {data.low} low
          </span>
        )}
      </div>
      {data.openCases && data.openCases.length > 0 && (
        <div>
          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Open Cases</p>
          <div className="space-y-1">
            {data.openCases.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="font-medium text-ink-700">{c.title}</span>
                  {c.unit && <span className="text-ink-400 ml-2">Unit {c.unit}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ink-400">{formatDate(c.created)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    c.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                    c.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    c.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-ink-100 text-ink-600'
                  }`}>
                    {c.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingsSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Total Meetings" value={String(data.totalMeetings)} />
        <MetricBox label="Upcoming" value={String(data.upcomingCount)} />
        <MetricBox label="Completed" value={String(data.completedCount)} />
      </div>
      {data.upcoming && data.upcoming.length > 0 && (
        <div>
          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Upcoming Meetings</p>
          <div className="space-y-1">
            {data.upcoming.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-accent-50 rounded flex flex-col items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-accent-600 leading-none">
                      {new Date(m.date + 'T12:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                    </span>
                    <span className="text-xs font-bold text-accent-800 leading-none">
                      {new Date(m.date + 'T12:00').getDate()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-ink-700">{m.title}</span>
                    <span className="text-ink-400 ml-2">{m.time}</span>
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-50 text-accent-700 font-semibold">
                  {m.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DelinquencySection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Delinquent Units" value={`${data.delinquentUnits} of ${data.totalUnits}`} />
        <MetricBox label="Total Owed" value={fmt(data.totalOwed)} />
        <MetricBox
          label="Delinquency Rate"
          value={`${data.totalUnits > 0 ? Math.round((data.delinquentUnits / data.totalUnits) * 100) : 0}%`}
        />
      </div>
      {data.units && data.units.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Unit</th>
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Owner</th>
                <th className="text-right py-1.5 text-ink-400 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.units.map((u: any, i: number) => (
                <tr key={i} className="border-b border-ink-50">
                  <td className="py-1.5 pr-3 text-ink-700 font-medium">{u.unit}</td>
                  <td className="py-1.5 pr-3 text-ink-500">{u.owner}</td>
                  <td className="py-1.5 text-right text-red-600 font-semibold">{fmt(u.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VendorSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Total Vendors" value={String(data.totalVendors)} />
        <MetricBox label="Active" value={String(data.active)} />
        <MetricBox label="Inactive" value={String(data.inactive)} />
      </div>
      {data.vendors && data.vendors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100">
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Vendor</th>
                <th className="text-left py-1.5 pr-3 text-ink-400 font-semibold">Service</th>
                <th className="text-left py-1.5 text-ink-400 font-semibold">Contract</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.map((v: any, i: number) => (
                <tr key={i} className="border-b border-ink-50">
                  <td className="py-1.5 pr-3 text-ink-700 font-medium">{v.name}</td>
                  <td className="py-1.5 pr-3 text-ink-500">{v.service}</td>
                  <td className="py-1.5 text-ink-500">{v.contract || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PropertyLogSection({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Total Logs" value={String(data.totalLogs)} />
        <MetricBox label="Open" value={String(data.open)} />
        <MetricBox label="Resolved" value={String(data.resolved)} />
      </div>
      {data.recentLogs && data.recentLogs.length > 0 && (
        <div>
          <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1.5">Recent Entries</p>
          <div className="space-y-1">
            {data.recentLogs.map((l: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="font-medium text-ink-700">{l.title}</span>
                  <span className="text-ink-400 ml-2">{formatDate(l.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-semibold">
                    {l.type}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    l.status === 'resolved' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {l.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
