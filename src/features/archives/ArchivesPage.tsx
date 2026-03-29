import { useState, useRef, useEffect, useMemo } from 'react';
import { useArchiveStore, type ArchiveSnapshot } from '@/store/useArchiveStore';
import { useReportsStore, type GeneratedReport, type ReportType } from '@/store/useReportsStore';
import { useReportStore } from '@/store/useReportStore';
import type { ReportType as FullReportType, ReportCategory } from '@/lib/services/reports';
import { useAuthStore } from '@/store/useAuthStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { generateReportSnapshot } from '@/features/archives/reports/reportGenerators';
import CaseReportRenderer from '@/features/archives/reports/renderers/CaseReportRenderer';
import FinancialStatementRenderer from '@/features/archives/reports/renderers/FinancialStatementRenderer';
import BoardReportRenderer from '@/features/archives/reports/renderers/BoardReportRenderer';
import SalesPackageRenderer from '@/features/archives/reports/renderers/SalesPackageRenderer';
import { printReport } from '@/lib/printReport';

// Map wizard report types → generator types + categories
const GENERATOR_MAP: Record<ReportType, { generatorType: FullReportType; category: ReportCategory }> = {
  board_packet:        { generatorType: 'board_packet',            category: 'board_governance' },
  financial_statement: { generatorType: 'financial_snapshot',      category: 'board_governance' },
  delinquency:         { generatorType: 'collections_delinquency', category: 'case_analysis' },
  compliance_summary:  { generatorType: 'compliance_report',       category: 'board_governance' },
  meeting_minutes:     { generatorType: 'board_packet',            category: 'board_governance' },
  annual_report:       { generatorType: 'board_packet',            category: 'board_governance' },
};


// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number | undefined) =>
  '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Fiscal year helpers ─────────────────────────────────────────────────────
/** Given a fiscal year-end in MM-DD format and a label year, return the period start/end.
 *  E.g. fiscalYearEnd='06-30', year=2025 → FY 2025 = Jul 1 2024 – Jun 30 2025
 *       fiscalYearEnd='12-31', year=2025 → FY 2025 = Jan 1 2025 – Dec 31 2025 */
function getFiscalPeriod(fiscalYearEnd: string, year: number) {
  const [mm, dd] = fiscalYearEnd.split('-').map(Number);
  const isCalendarYear = mm === 12 && dd === 31;
  if (isCalendarYear) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  // FY ends on mm/dd of the label year; starts the day after that in the prior year
  const endDate = new Date(year, mm - 1, dd);
  const startDate = new Date(year - 1, mm - 1, dd + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: fmt(startDate), end: fmt(endDate) };
}

function formatFiscalLabel(fiscalYearEnd: string, year: number) {
  const { start, end } = getFiscalPeriod(fiscalYearEnd, year);
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `FY ${year} (${f(s)} – ${f(e)})`;
}

const LAUNCH_YEAR = 2025;

// ─── Archive section nav ─────────────────────────────────────────────────────
type ArchiveSection = 'overview' | 'compliance' | 'refresh' | 'filings' | 'meetings' | 'communications' | 'financial' | 'insurance' | 'legal' | 'board';

const ARCHIVE_SECTIONS: { id: ArchiveSection; label: string; icon: string }[] = [
  { id: 'overview',        label: 'Overview',          icon: '📊' },
  { id: 'compliance',      label: 'Compliance',        icon: '✅' },
  { id: 'refresh',         label: 'Regulatory Refresh', icon: '🔄' },
  { id: 'filings',         label: 'Filings',           icon: '📅' },
  { id: 'meetings',        label: 'Meetings',          icon: '🗓' },
  { id: 'communications',  label: 'Communications',    icon: '📨' },
  { id: 'financial',       label: 'Fiscal Snapshot',   icon: '💰' },
  { id: 'insurance',       label: 'Insurance',         icon: '🛡' },
  { id: 'legal',           label: 'Legal Docs',        icon: '⚖' },
  { id: 'board',           label: 'Board',             icon: '👥' },
];

// ─── Report metadata ─────────────────────────────────────────────────────────
const REPORT_META: Record<ReportType, { icon: string; label: string; desc: string; badgeClass: string; bgClass: string }> = {
  board_packet:        { icon: '📋', label: 'Board Packet',           desc: 'Meeting prep — agenda, financials, open cases, upcoming deadlines.',      badgeClass: 'bg-accent-100 text-accent-700',  bgClass: 'bg-accent-50' },
  financial_statement: { icon: '💰', label: 'Financial Statement',    desc: 'Budget vs. actual, collection rate, reserve balance, AR aging.',          badgeClass: 'bg-sage-100 text-sage-700',      bgClass: 'bg-sage-50' },
  delinquency:         { icon: '⚠️',  label: 'Delinquency Report',    desc: 'Outstanding balances by unit, late fees, and payment history.',           badgeClass: 'bg-red-100 text-red-700',        bgClass: 'bg-red-50' },
  compliance_summary:  { icon: '✅', label: 'Compliance Summary',     desc: 'Runbook health score, open items, filings due, regulatory notes.',        badgeClass: 'bg-amber-100 text-amber-700',    bgClass: 'bg-amber-50' },
  meeting_minutes:     { icon: '🗓', label: 'Meeting Minutes Packet', desc: 'Minutes, attendance, votes, and resolutions for a period.',              badgeClass: 'bg-mist-100 text-ink-600',       bgClass: 'bg-mist-50' },
  annual_report:       { icon: '📊', label: 'Annual Report',          desc: 'Full-year summary for distribution to unit owners and stakeholders.',     badgeClass: 'bg-ink-100 text-ink-700',        bgClass: 'bg-ink-50' },
};

const REPORT_SECTIONS: Record<ReportType, { id: string; label: string; desc: string }[]> = {
  board_packet: [
    { id: 'cover',     label: 'Cover Page',         desc: 'Meeting date and board details' },
    { id: 'financial', label: 'Financial Summary',  desc: 'Budget vs. actual and collection rate' },
    { id: 'cases',     label: 'Open Cases',         desc: 'Active enforcement and maintenance cases' },
    { id: 'deadlines', label: 'Upcoming Deadlines', desc: 'Filings and compliance items due soon' },
    { id: 'minutes',   label: 'Previous Minutes',   desc: 'Last meeting notes and votes' },
    { id: 'agenda',    label: 'Draft Agenda',       desc: 'Proposed agenda for upcoming meeting' },
  ],
  financial_statement: [
    { id: 'income',    label: 'Income & Collections', desc: 'Assessment income and collection rate' },
    { id: 'expenses',  label: 'Expense Detail',       desc: 'Actuals vs. budget by category' },
    { id: 'reserve',   label: 'Reserve Summary',      desc: 'Balance, funded %, and schedule' },
    { id: 'cashflow',  label: 'Cash Flow',            desc: 'Monthly cash in and out' },
    { id: 'variance',  label: 'Variance Analysis',    desc: 'Budget vs. actual with explanations' },
  ],
  delinquency: [
    { id: 'summary',  label: 'Delinquency Summary', desc: 'Total AR and delinquency rate' },
    { id: 'units',    label: 'Unit-by-Unit Detail',  desc: 'Outstanding balances by unit' },
    { id: 'aging',    label: 'Aging Schedule',       desc: '30 / 60 / 90+ day breakdown' },
    { id: 'payments', label: 'Payment History',      desc: 'Recent payments received' },
  ],
  compliance_summary: [
    { id: 'score',   label: 'Health Score',     desc: 'Runbook completion rate and grade' },
    { id: 'open',    label: 'Open Items',       desc: 'Incomplete checklist items' },
    { id: 'filings', label: 'Filings Due',      desc: 'Upcoming regulatory deadlines' },
    { id: 'notes',   label: 'Regulatory Notes', desc: 'Jurisdiction-specific guidance' },
  ],
  meeting_minutes: [
    { id: 'index',       label: 'Meeting Index',   desc: 'All meetings in the period' },
    { id: 'detail',      label: 'Minutes Detail',  desc: 'Full minutes with attendance and votes' },
    { id: 'resolutions', label: 'Resolution Log',  desc: 'All passed and failed resolutions' },
    { id: 'signature',   label: 'Signature Page',  desc: 'Approval signature block' },
  ],
  annual_report: [
    { id: 'exec',       label: 'Executive Summary',   desc: 'Year in review for unit owners' },
    { id: 'financial',  label: 'Financial Highlights', desc: 'Key metrics and budget performance' },
    { id: 'governance', label: 'Governance Summary',  desc: 'Meetings, compliance, filings' },
    { id: 'capital',    label: 'Capital Projects',    desc: 'Completed and planned work' },
    { id: 'reserve',    label: 'Reserve Status',      desc: 'Funding level and upcoming needs' },
    { id: 'message',    label: 'Board Message',       desc: 'Letter from the board' },
  ],
};

function buildPeriodPresets(fiscalYearEnd: string) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const y = now.getFullYear();

  // This month / Last month (always calendar-based)
  const thisMonthFrom = `${y}-${pad(now.getMonth() + 1)}-01`;
  const lm = new Date(y, now.getMonth() - 1, 1);
  const lmEnd = new Date(y, now.getMonth(), 0);
  const lastMonthFrom = fmtD(lm);
  const lastMonthTo = fmtD(lmEnd);

  // Fiscal year boundaries
  const [mm, dd] = fiscalYearEnd.split('-').map(Number);
  const isCalendarYear = mm === 12 && dd === 31;

  // Determine which FY "today" falls in (the year the FY ends)
  const fyEndThisYear = new Date(y, mm - 1, dd);
  const currentFYEnd = now > fyEndThisYear ? y + 1 : y;

  const fyBounds = (endYear: number) => {
    if (isCalendarYear) return { start: `${endYear}-01-01`, end: `${endYear}-12-31` };
    const startMonth = mm + 1 > 12 ? 1 : mm + 1;
    const startYear = mm + 1 > 12 ? endYear : endYear - 1;
    return {
      start: `${startYear}-${pad(startMonth)}-01`,
      end: `${endYear}-${pad(mm)}-${pad(dd)}`,
    };
  };

  const fy = fyBounds(currentFYEnd);
  const py = fyBounds(currentFYEnd - 1);

  // Fiscal quarters: divide the FY into 4 equal 3-month spans
  const fyStart = new Date(fy.start + 'T00:00:00');
  const quarters = Array.from({ length: 4 }, (_, qi) => {
    const qStart = new Date(fyStart.getFullYear(), fyStart.getMonth() + qi * 3, fyStart.getDate());
    const qEnd = new Date(fyStart.getFullYear(), fyStart.getMonth() + (qi + 1) * 3, fyStart.getDate() - 1);
    return { label: `Q${qi + 1}`, from: fmtD(qStart), to: fmtD(qEnd) };
  });

  return [
    { label: 'This Month', from: thisMonthFrom, to: today },
    { label: 'Last Month', from: lastMonthFrom, to: lastMonthTo },
    ...quarters,
    { label: 'YTD', from: fy.start, to: today },
    { label: 'FY',  from: fy.start, to: fy.end },
    { label: 'PY',  from: py.start, to: py.end },
  ];
}

// ─── Shared UI components ────────────────────────────────────────────────────
function SlideOver({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black bg-opacity-40 z-[60]" onClick={onClose} />}
      <div className={`fixed top-[61px] bottom-0 right-0 w-[520px] max-w-[95vw] bg-white shadow-2xl z-[70] flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {children}
      </div>
    </>
  );
}

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center mb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            {i > 0 && <div className={`h-px flex-1 mx-2 ${done ? 'bg-ink-900' : 'bg-ink-200'}`} />}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? 'bg-ink-900 text-white' : active ? 'bg-accent-600 text-white' : 'bg-ink-200 text-ink-500'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs font-semibold ${done ? 'text-ink-900' : active ? 'text-accent-600' : 'text-ink-400'}`}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ label, val, sub }: { label: string; val: string; sub?: string }) {
  return (
    <div className="bg-mist-50 rounded-lg p-3 border border-mist-100">
      <p className="text-[11px] text-ink-400">{label}</p>
      <p className="text-lg font-bold text-ink-900 mt-0.5">{val}</p>
      {sub && <p className="text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}

// ─── Header three-dot menu ───────────────────────────────────────────────────
function HeaderMenu({ onNewReport, onNewArchive }: { onNewReport: () => void; onNewArchive: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-lg bg-white bg-opacity-15 hover:bg-opacity-25 border border-white border-opacity-25 flex items-center justify-center text-white text-lg transition-colors"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-11 bg-white border border-ink-200 rounded-xl shadow-lg min-w-[180px] z-50 overflow-hidden">
          <button
            onClick={() => { onNewReport(); setOpen(false); }}
            className="w-full text-left px-4 py-3 text-sm font-medium text-ink-700 hover:bg-mist-50 flex items-center gap-2.5"
          >
            <span>📄</span> New Report
          </button>
          <div className="border-t border-ink-100" />
          <button
            onClick={() => { onNewArchive(); setOpen(false); }}
            className="w-full text-left px-4 py-3 text-sm font-medium text-ink-700 hover:bg-mist-50 flex items-center gap-2.5"
          >
            <span>📦</span> New Archive
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
type PageTab = 'reports' | 'archives';

export default function ArchivesPage() {
  // Page tab
  const [pageTab, setPageTab] = useState<PageTab>('reports');

  // Stores
  const archiveStore = useArchiveStore();
  const reportsStore = useReportsStore();
  const reportStore = useReportStore();
  const { currentRole, currentUser } = useAuthStore();
  const comp = useComplianceStore();
  const mtg = useMeetingsStore();
  const building = useBuildingStore();
  const finStore = useFinancialStore();

  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';

  // ── Archive state ──────────────────────────────────────────────────────────
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [archiveSection, setArchiveSection] = useState<ArchiveSection>('overview');
  const [showCreateArchiveModal, setShowCreateArchiveModal] = useState(false);
  const [archiveYear, setArchiveYear] = useState(String(new Date().getFullYear() - 1));
  const selected = archiveStore.archives.find(a => a.id === selectedArchiveId);

  // ── Report slide-over state ────────────────────────────────────────────────
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [reportStep, setReportStep] = useState(1);
  const [reportType, setReportType] = useState<ReportType>('board_packet');
  const fiscalYearEnd = building.details.fiscalYearEnd || '12-31';
  const periodPresets = useMemo(() => buildPeriodPresets(fiscalYearEnd), [fiscalYearEnd]);
  const ytdPreset = periodPresets.find(p => p.label === 'YTD')!;
  const [reportFrom, setReportFrom] = useState(ytdPreset.from);
  const [reportTo, setReportTo] = useState(ytdPreset.to);
  const [reportPeriodLabel, setReportPeriodLabel] = useState('YTD');
  const [reportSections, setReportSections] = useState<Set<string>>(new Set(REPORT_SECTIONS.board_packet.map(s => s.id)));
  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');
  const [reportDone, setReportDone] = useState<GeneratedReport | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const openReportPanel = () => {
    setReportType('board_packet');
    setReportStep(1);
    setReportSections(new Set(REPORT_SECTIONS.board_packet.map(s => s.id)));
    setReportFrom(ytdPreset.from);
    setReportTo(ytdPreset.to);
    setReportPeriodLabel('YTD');
    setReportDone(null);
    setShowReportPanel(true);
  };

  const selectReportType = (t: ReportType) => {
    setReportType(t);
    setReportSections(new Set(REPORT_SECTIONS[t].map(s => s.id)));
  };

  const selectPreset = (p: typeof periodPresets[0]) => {
    setReportFrom(p.from);
    setReportTo(p.to);
    setReportPeriodLabel(p.label);
  };

  const toggleSection = (id: string) => {
    setReportSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleGenerateReport = () => {
    const meta = REPORT_META[reportType];
    const mapping = GENERATOR_MAP[reportType];
    const snapshot = generateReportSnapshot(mapping.generatorType, {
      periodStart: reportFrom,
      periodEnd: reportTo,
    });
    const today = new Date().toISOString();
    const userName = currentUser?.name || 'Board Member';

    // Save to legacy store (for local display list)
    const report: GeneratedReport = {
      id: 'rpt_' + Date.now(),
      name: `${meta.label} — ${reportPeriodLabel}`,
      type: reportType,
      periodStart: reportFrom,
      periodEnd: reportTo,
      periodLabel: reportPeriodLabel,
      sections: [...reportSections],
      generatedAt: today,
      generatedBy: userName,
    };
    reportsStore.addReport(report);

    // Save to canonical report store (with snapshot for rendering)
    useReportStore.getState().addReport({
      configId: '',
      name: `${meta.label} — ${reportPeriodLabel}`,
      type: mapping.generatorType,
      category: mapping.category,
      generatedAt: today,
      generatedBy: userName,
      snapshot,
      periodStart: reportFrom,
      periodEnd: reportTo,
    });

    setReportDone(report);
    setReportStep(4);
  };

  // ── Archive creation (existing logic unchanged) ────────────────────────────
  const handleCreateArchive = () => {
    const year = parseInt(archiveYear) || new Date().getFullYear() - 1;
    const { start: pStart, end: pEnd } = getFiscalPeriod(building.details.fiscalYearEnd, year);

    const refreshResult = refreshComplianceRequirements({
      state: building.address.state,
      legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
      insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
      boardCount: building.board.length,
      hasManagement: !!building.management.company,
    });

    const catScores = refreshResult.categories.map(c => {
      const passed = c.items.filter(i => comp.completions[i.id]).length;
      return { pct: c.items.length > 0 ? Math.round((passed / c.items.length) * 100) : 100, weight: c.weight };
    });
    const totalWeight = catScores.reduce((s, c) => s + c.weight, 0);
    const healthIndex = Math.round(catScores.reduce((s, c) => s + (c.pct * c.weight) / totalWeight, 0));
    const grade = healthIndex >= 90 ? 'A' : healthIndex >= 80 ? 'B' : healthIndex >= 70 ? 'C' : healthIndex >= 60 ? 'D' : 'F';

    refreshResult.categories.forEach(cat => {
      cat.items.forEach(item => {
        if (item.autoPass && !comp.completions[item.id]) comp.setCompletion(item.id, true);
      });
    });

    const metrics = finStore.getIncomeMetrics();
    const occupiedUnits = finStore.units.filter(u => u.status === 'ACTIVE');
    const totalChecklistItems = refreshResult.categories.reduce((s, c) => s + c.items.length, 0);

    const snapshot: ArchiveSnapshot = {
      id: 'arc_' + Date.now(),
      label: formatFiscalLabel(building.details.fiscalYearEnd, year),
      periodStart: pStart,
      periodEnd: pEnd,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || 'Board Member',
      compliance: { runbookCompletions: { ...comp.completions }, healthIndex, grade },
      regulatoryRefresh: {
        refreshedAt: refreshResult.refreshedAt,
        jurisdiction: refreshResult.jurisdiction,
        documentsDetected: refreshResult.documentsDetected,
        regulatoryNotes: refreshResult.regulatoryNotes,
        categoryCount: refreshResult.categories.length,
        totalChecklistItems,
      },
      filings: comp.filings.filter(fi => fi.dueDate >= pStart && fi.dueDate <= pEnd).map(fi => ({ ...fi, attachments: [...fi.attachments] })),
      meetings: mtg.meetings.filter(m => m.date >= pStart && m.date <= pEnd).map(m => ({ ...m, votes: [...m.votes], attendees: { ...m.attendees }, agenda: [...m.agenda] })),
      communications: comp.communications.filter(c => c.date >= pStart && c.date <= pEnd).map(c => ({ ...c })),
      financial: {
        collectionRate: metrics.collectionRate || 0,
        totalBudgeted: metrics.annualExpected || 0,
        totalActual: metrics.annualCollected || 0,
        reserveBalance: 245000,
        totalAR: finStore.units.reduce((s, u) => s + u.balance, 0),
        monthlyRevenue: finStore.units.reduce((s, u) => s + u.monthlyFee, 0),
        unitCount: finStore.units.length,
        occupiedCount: occupiedUnits.length,
        delinquentCount: occupiedUnits.filter(u => u.balance > 0).length,
      },
      insurance: building.insurance.map(p => ({ type: p.type, carrier: p.carrier, policyNumber: p.policyNum, coverage: p.coverage, premium: p.premium, expires: p.expires, status: new Date(p.expires) > new Date(pEnd) ? 'active' : 'expired' })),
      legalDocuments: building.legalDocuments.map(d => ({ name: d.name, version: d.version, status: d.status, attachments: (d.attachments || []).map(a => ({ name: a.name, size: a.size })) })),
      board: building.board.map(b => ({ name: b.name, role: b.role, term: b.term })),
    };

    archiveStore.addArchive(snapshot);
    setShowCreateArchiveModal(false);
    alert(`✅ Archive created for FY ${year}.\n\nRegulatory refresh completed:\n• Jurisdiction: ${refreshResult.jurisdiction}\n• Documents detected: ${refreshResult.documentsDetected.length}\n• Compliance items: ${totalChecklistItems}\n• ${refreshResult.regulatoryNotes.length} regulatory notes`);
  };

  // ── Filtered reports ───────────────────────────────────────────────────────
  const filteredReports = typeFilter === 'all'
    ? reportsStore.reports
    : reportsStore.reports.filter(r => r.type === typeFilter);

  // ── Page header ────────────────────────────────────────────────────────────
  const backLabel = selectedArchiveId ? (
    <button onClick={() => setSelectedArchiveId(null)} className="text-accent-200 hover:text-white text-sm mb-2 inline-flex items-center gap-1">
      ← Back to Archives
    </button>
  ) : null;

  return (
    <div className="space-y-0">
      {/* ── Gradient header ── */}
      <div className="rounded-t-xl p-8 text-white shadow-sm" style={{ background: 'linear-gradient(to right, rgb(21, 94, 117), #991b1b)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            {backLabel}
            <h2 className="font-display text-2xl font-bold">📦 Archives</h2>
          </div>
          {/* Three-dot menu with create actions */}
          {!selectedArchiveId && isBoard && (
            <HeaderMenu
              onNewReport={openReportPanel}
              onNewArchive={() => { setArchiveYear(String(new Date().getFullYear() - 1)); setShowCreateArchiveModal(true); }}
            />
          )}
        </div>
      </div>

      {/* ── Tab bar (hidden when viewing an archive detail) ── */}
      {!selectedArchiveId && (
        <div className="bg-white border-x border-ink-100 border-b overflow-x-auto">
          <div className="flex min-w-max px-4">
            {([
              { id: 'reports' as PageTab,  label: '📄 Reports',              count: reportsStore.reports.length },
              { id: 'archives' as PageTab, label: '📦 Governance Archives',  count: archiveStore.archives.length },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setPageTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${pageTab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pageTab === t.id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {/* ────── REPORTS TAB ────── */}
        {!selectedArchiveId && pageTab === 'reports' && (
          <div>
            {/* Filter bar */}
            {reportsStore.reports.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-5">
                {(['all', 'board_packet', 'financial_statement', 'delinquency', 'compliance_summary', 'meeting_minutes', 'annual_report'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${typeFilter === f ? 'bg-ink-900 text-white border-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}
                  >
                    {f === 'all' ? 'All' : REPORT_META[f].label}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {reportsStore.reports.length === 0 && (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">📄</p>
                <h3 className="text-base font-bold text-ink-900 mb-2">No reports yet</h3>
                <p className="text-sm text-ink-500 max-w-sm mx-auto mb-5">
                  Generate board packets, financial statements, delinquency reports, and more — all in one place.
                </p>
                {isBoard && (
                  <button onClick={openReportPanel} className="px-5 py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">
                    + New Report
                  </button>
                )}
              </div>
            )}

            {/* Report list */}
            {filteredReports.length > 0 && (
              <div className="grid gap-3">
                {filteredReports.map(r => {
                  const meta = REPORT_META[r.type];
                  const isExpanded = expandedReportId === r.id;
                  // Find matching canonical report (with snapshot) by name
                  const canonical = reportStore.reports.find(cr => cr.name === r.name && cr.generatedAt === r.generatedAt);
                  return (
                    <div key={r.id} className={`border rounded-xl transition-all ${isExpanded ? 'border-ink-200 shadow-sm' : 'border-ink-100 hover:border-accent-200 hover:shadow-sm'}`}>
                      <div
                        className="p-4 flex items-center gap-4 cursor-pointer"
                        onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${meta.bgClass}`}>
                          {meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-ink-900 truncate">{r.name}</p>
                          <p className="text-xs text-ink-500 mt-0.5">
                            Generated {new Date(r.generatedAt).toLocaleDateString()} · by {r.generatedBy} · {r.sections.length} sections
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-lg font-semibold whitespace-nowrap flex-shrink-0 ${meta.badgeClass}`}>
                          {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isBoard && (
                            <button
                              onClick={e => { e.stopPropagation(); if (confirm('Delete this report?')) { reportsStore.deleteReport(r.id); if (canonical) reportStore.deleteReport(canonical.id); if (isExpanded) setExpandedReportId(null); } }}
                              className="text-xs text-red-400 hover:text-red-600 px-1"
                            >
                              ×
                            </button>
                          )}
                          <svg className={`w-4 h-4 text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-ink-100 px-4 pb-5 pt-4">
                          <div className="flex justify-end mb-3 no-print">
                            <button
                              onClick={() => printReport(document.querySelector(`[data-report-print="${r.id}"]`) as HTMLElement)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800 transition-colors"
                            >
                              Export PDF
                            </button>
                          </div>
                          <div className="print-report-root" data-report-print={r.id}>
                            {canonical?.snapshot ? (
                              (() => {
                                const cat = canonical.category;
                                if (cat === 'case_analysis') return <CaseReportRenderer type={canonical.type} snapshot={canonical.snapshot} />;
                                if (cat === 'financial_statements') return <FinancialStatementRenderer type={canonical.type} snapshot={canonical.snapshot} />;
                                if (cat === 'board_governance') return <BoardReportRenderer type={canonical.type} snapshot={canonical.snapshot} />;
                                if (cat === 'sales_package') return <SalesPackageRenderer type={canonical.type} snapshot={canonical.snapshot} />;
                                return <p className="text-sm text-ink-400">Unknown report category.</p>;
                              })()
                            ) : (
                              <div className="text-center py-8 text-ink-400">
                                <p className="text-sm">Report data unavailable. Try regenerating this report.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* No matches for current filter */}
            {reportsStore.reports.length > 0 && filteredReports.length === 0 && (
              <p className="text-sm text-ink-400 text-center py-8">No {typeFilter !== 'all' ? REPORT_META[typeFilter as ReportType].label : ''} reports yet.</p>
            )}
          </div>
        )}

        {/* ────── ARCHIVES TAB ────── */}
        {!selectedArchiveId && pageTab === 'archives' && (
          <div>
            {archiveStore.archives.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">📦</p>
                <h3 className="text-base font-bold text-ink-900 mb-2">No governance archives yet</h3>
                <p className="text-sm text-ink-500 max-w-md mx-auto mb-5">
                  {isBoard
                    ? 'Create an annual archive to capture a permanent, read-only snapshot of all compliance, financial, and governance records for a fiscal year.'
                    : 'Your board has not yet created any annual archives.'}
                </p>
                {isBoard && (
                  <button onClick={() => { setArchiveYear(String(new Date().getFullYear() - 1)); setShowCreateArchiveModal(true); }} className="px-6 py-3 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">
                    + Create Your First Archive
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {archiveStore.archives.map(a => (
                  <div
                    key={a.id}
                    className="border border-ink-100 rounded-xl hover:border-accent-200 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => { setSelectedArchiveId(a.id); setArchiveSection('overview'); }}
                  >
                    <div className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center text-2xl">📦</div>
                        <div>
                          <h3 className="font-bold text-ink-900">{a.label}</h3>
                          <p className="text-xs text-ink-500">Created {new Date(a.createdAt).toLocaleDateString()} by {a.createdBy}</p>
                          {a.regulatoryRefresh && (
                            <p className="text-[10px] text-accent-600 mt-0.5">🔄 {a.regulatoryRefresh.jurisdiction} · {a.regulatoryRefresh.documentsDetected.length} docs · {a.regulatoryRefresh.totalChecklistItems} checklist items</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="text-center"><p className="text-xs text-ink-400">Health</p><p className="text-sm font-bold text-ink-900">{a.compliance.grade}</p></div>
                          <div className="text-center"><p className="text-xs text-ink-400">Meetings</p><p className="text-sm font-bold text-ink-900">{a.meetings.length}</p></div>
                          <div className="text-center"><p className="text-xs text-ink-400">Filings</p><p className="text-sm font-bold text-ink-900">{a.filings.length}</p></div>
                          <div className="text-center"><p className="text-xs text-ink-400">Comms</p><p className="text-sm font-bold text-ink-900">{a.communications.length}</p></div>
                        </div>
                        {isBoard && (
                          <button
                            onClick={e => { e.stopPropagation(); if (confirm('Delete this archive? This cannot be undone.')) archiveStore.deleteArchive(a.id); }}
                            className="text-xs text-red-400 hover:text-red-600 ml-2"
                          >Delete</button>
                        )}
                        <span className="text-accent-400 text-lg">→</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────── ARCHIVE DETAIL VIEW ────── */}
        {selectedArchiveId && selected && (
          <ArchiveDetail archive={selected} section={archiveSection} setSection={setArchiveSection} />
        )}
      </div>

      {/* ── Report slide-over ── */}
      <SlideOver open={showReportPanel} onClose={() => setShowReportPanel(false)}>
        <div className="flex items-center justify-between p-5 border-b border-ink-100 flex-shrink-0">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">New Report</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              {reportStep === 1 ? 'Choose a type and period.' : reportStep === 2 ? 'Select sections to include.' : reportStep === 3 ? 'Review before generating.' : 'Your report is ready.'}
            </p>
          </div>
          <button onClick={() => setShowReportPanel(false)} className="p-1.5 hover:bg-ink-100 rounded-lg text-ink-400 hover:text-ink-700 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {reportStep < 4 && <StepBar steps={['Type & Period', 'Sections', 'Review']} current={reportStep} />}

          {/* Step 1: Type + Period */}
          {reportStep === 1 && (
            <div>
              <p className="text-xs font-bold text-ink-600 uppercase tracking-wide mb-3">Report Type</p>
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {(Object.keys(REPORT_META) as ReportType[]).map(t => {
                  const m = REPORT_META[t];
                  return (
                    <button
                      key={t}
                      onClick={() => selectReportType(t)}
                      className={`border rounded-xl p-3.5 text-left transition-all ${reportType === t ? 'border-accent-600 bg-accent-50 shadow-sm' : 'border-ink-200 hover:border-ink-400'}`}
                    >
                      <span className="text-xl block mb-2">{m.icon}</span>
                      <p className="text-xs font-bold text-ink-900 mb-1">{m.label}</p>
                      <p className="text-[11px] text-ink-500 leading-snug">{m.desc}</p>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs font-bold text-ink-600 uppercase tracking-wide mb-3">Period</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {periodPresets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => selectPreset(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${reportPeriodLabel === p.label ? 'bg-ink-900 text-white border-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold text-ink-500 w-9">From</label>
                <input type="date" value={reportFrom} onChange={e => { setReportFrom(e.target.value); setReportPeriodLabel('Custom'); }} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                <span className="text-ink-400 text-xs">→</span>
                <label className="text-xs font-semibold text-ink-500 w-5">To</label>
                <input type="date" value={reportTo} onChange={e => { setReportTo(e.target.value); setReportPeriodLabel('Custom'); }} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm" />
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-50 border border-accent-200 rounded-full text-xs font-semibold text-accent-800">
                <span>📅</span> {fmtDate(reportFrom)} – {fmtDate(reportTo)}
              </div>
            </div>
          )}

          {/* Step 2: Sections */}
          {reportStep === 2 && (
            <div>
              <p className="text-xs text-ink-500 bg-mist-50 border border-mist-100 rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
                Sections are pre-selected for <strong className="text-ink-800">{REPORT_META[reportType].label}</strong>. Uncheck any you don't need.
              </p>
              <div className="space-y-1.5">
                {REPORT_SECTIONS[reportType].map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-mist-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={reportSections.has(s.id)}
                      onChange={() => toggleSection(s.id)}
                      className="w-4 h-4 accent-ink-900"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{s.label}</p>
                      <p className="text-xs text-ink-500">{s.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {reportStep === 3 && (
            <div>
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-4 mb-4">
                <p className="text-[10px] font-bold text-accent-700 uppercase tracking-wide mb-1">Report</p>
                <p className="text-base font-bold text-ink-900">{REPORT_META[reportType].label}</p>
                <p className="text-xs text-ink-500 mt-1">{fmtDate(reportFrom)} – {fmtDate(reportTo)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Type',         val: REPORT_META[reportType].label },
                  { label: 'Sections',     val: `${reportSections.size} included` },
                  { label: 'Format',       val: 'PDF' },
                  { label: 'Generated by', val: currentUser?.name || 'Board Member' },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-mist-50 border border-mist-100 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-bold text-ink-900 mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700 leading-relaxed">
                  This report will be generated from live data as of today. The period covered is {fmtDate(reportFrom)} – {fmtDate(reportTo)}.
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="mt-3 w-full py-2 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors"
              >
                Export PDF (Preview)
              </button>
            </div>
          )}

          {/* Step 4: Done */}
          {reportStep === 4 && reportDone && (
            <div className="text-center py-8">
              <p className="text-5xl mb-4">📄</p>
              <h3 className="font-display text-xl font-bold text-ink-900 mb-2">{reportDone.name}</h3>
              <p className="text-sm text-ink-500 mb-4 leading-relaxed">
                Your report has been generated and saved to Reports.<br/>Download it any time from the Reports tab.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-sage-100 rounded-full text-xs font-semibold text-sage-700">
                ✓ {reportDone.sections.length} sections · Saved to Reports
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-ink-100 flex gap-3 flex-shrink-0">
          {reportStep === 1 && (
            <>
              <button onClick={() => setShowReportPanel(false)} className="flex-1 py-2.5 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors">Cancel</button>
              <button onClick={() => setReportStep(2)} className="flex-[2] py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 transition-colors">Choose Sections →</button>
            </>
          )}
          {reportStep === 2 && (
            <>
              <button onClick={() => setReportStep(1)} className="flex-1 py-2.5 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors">← Back</button>
              <button onClick={() => setReportStep(3)} disabled={reportSections.size === 0} className="flex-[2] py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 disabled:opacity-40 transition-colors">Review →</button>
            </>
          )}
          {reportStep === 3 && (
            <>
              <button onClick={() => setReportStep(2)} className="flex-1 py-2.5 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors">← Back</button>
              <button onClick={handleGenerateReport} className="flex-[2] py-2.5 bg-accent-700 text-white rounded-lg text-sm font-semibold hover:bg-accent-800 transition-colors">Generate Report</button>
            </>
          )}
          {reportStep === 4 && (
            <>
              <button onClick={() => setShowReportPanel(false)} className="flex-1 py-2.5 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors">Close</button>
              <button onClick={() => window.print()} className="flex-[2] py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 transition-colors">Export PDF</button>
            </>
          )}
        </div>
      </SlideOver>

      {/* ── Archive create slide-over ── */}
      <SlideOver open={showCreateArchiveModal} onClose={() => setShowCreateArchiveModal(false)}>
        <div className="flex items-center justify-between p-5 border-b border-ink-100 flex-shrink-0">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">📦 Create Annual Archive</h3>
            <p className="text-xs text-ink-500 mt-0.5">Capture a permanent, read-only governance snapshot.</p>
          </div>
          <button onClick={() => setShowCreateArchiveModal(false)} className="p-1.5 hover:bg-ink-100 rounded-lg text-ink-400 hover:text-ink-700 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-ink-700">Create a permanent read-only snapshot of all compliance, financial, and governance records for a fiscal year.</p>
          <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔄</span><h4 className="text-sm font-bold text-accent-800">Automatic Regulatory Refresh</h4></div>
            <p className="text-xs text-accent-700">When you create this archive, the system will automatically check current local regulations for <strong>{building.address.state}</strong> and cross-reference all uploaded legal documents to ensure compliance requirements are accurate.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Fiscal Year</label>
            <select value={archiveYear} onChange={e => setArchiveYear(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
              {Array.from({ length: new Date().getFullYear() - LAUNCH_YEAR + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{formatFiscalLabel(building.details.fiscalYearEnd, y)}</option>
              ))}
            </select>
          </div>
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-ink-900">What gets archived:</p>
            {[
              ['✅', 'Compliance Runbook', 'All checklist completions and health score'],
              ['🔄', 'Regulatory Refresh', 'Jurisdiction check, detected documents, updated requirements'],
              ['📅', 'Filings & Deadlines', 'All filings with statuses and proof documents'],
              ['🗓', 'Meetings', 'Agendas, minutes, attendance, and vote results'],
              ['📨', 'Communications', 'Owner communication log'],
              ['💰', 'Fiscal Lens Snapshot', 'Collection rate, budget vs actual, reserve balance'],
              ['🛡', 'Insurance + Legal Docs', 'Policy records and document versions'],
              ['👥', 'Board Composition', 'Members, roles, and terms'],
            ].map(([icon, label, desc]) => (
              <div key={label as string} className="flex items-start gap-2">
                <span className="text-sm">{icon}</span>
                <div><span className="text-xs font-semibold text-ink-800">{label}</span><span className="text-xs text-ink-400 ml-1">— {desc}</span></div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800"><strong>Note:</strong> Archives are read-only snapshots visible to all users for transparency and auditing.</p>
          </div>
        </div>

        <div className="p-5 border-t border-ink-100 flex gap-3 flex-shrink-0">
          <button onClick={() => setShowCreateArchiveModal(false)} className="flex-1 py-2.5 border border-ink-200 rounded-lg text-sm font-medium text-ink-700 hover:bg-mist-50 transition-colors">Cancel</button>
          <button onClick={handleCreateArchive} className="flex-[2] py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800 transition-colors">Create Archive</button>
        </div>
      </SlideOver>
    </div>
  );
}

// ─── Archive detail view (extracted to keep main component clean) ─────────────
function ArchiveDetail({ archive, section, setSection }: { archive: ArchiveSnapshot; section: ArchiveSection; setSection: (s: ArchiveSection) => void }) {
  const a = archive;
  return (
    <>
      {/* Section tab nav */}
      <div className="-mx-6 -mt-6 mb-6 border-b border-ink-100 overflow-x-auto">
        <div className="flex min-w-max px-4">
          {ARCHIVE_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${section === s.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label="Compliance Grade" val={a.compliance.grade} sub={`${a.compliance.healthIndex}%`} />
            <Card label="Meetings Held" val={String(a.meetings.filter(m => m.status === 'COMPLETED').length)} sub={`${a.meetings.length} total`} />
            <Card label="Filings Complete" val={String(a.filings.filter(f => f.status === 'filed').length)} sub={`of ${a.filings.length}`} />
            <Card label="Collection Rate" val={`${a.financial.collectionRate}%`} sub={fmt(a.financial.totalAR) + ' AR'} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label="Budget" val={fmt(a.financial.totalBudgeted)} sub={`Actual: ${fmt(a.financial.totalActual)}`} />
            <Card label="Units" val={`${a.financial.occupiedCount}/${a.financial.unitCount}`} sub={`${a.financial.delinquentCount} delinquent`} />
            <Card label="Insurance" val={String(a.insurance.length)} sub={`${a.insurance.filter(p => p.status === 'active').length} active`} />
            <Card label="Board Members" val={String(a.board.length)} />
          </div>
          {a.regulatoryRefresh && (
            <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔄</span><h4 className="text-sm font-bold text-accent-800">Regulatory Refresh at Archive Time</h4></div>
              <p className="text-xs text-accent-700">Jurisdiction: <strong>{a.regulatoryRefresh.jurisdiction}</strong> · {a.regulatoryRefresh.categoryCount} categories · {a.regulatoryRefresh.totalChecklistItems} checklist items · {a.regulatoryRefresh.documentsDetected.length} documents detected</p>
              {a.regulatoryRefresh.documentsDetected.length > 0 && <p className="text-xs text-accent-600 mt-1">Documents: {a.regulatoryRefresh.documentsDetected.join(', ')}</p>}
            </div>
          )}
        </div>
      )}

      {section === 'compliance' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Compliance Runbook Snapshot</h3>
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-3xl font-bold ${a.compliance.healthIndex >= 80 ? 'text-sage-600' : a.compliance.healthIndex >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{a.compliance.grade}</span>
            <span className="text-sm text-ink-500">Health Index: {a.compliance.healthIndex}%</span>
          </div>
          <div className="bg-mist-50 rounded-xl border border-mist-200 p-4 space-y-2">
            <p className="text-xs font-bold text-ink-800 mb-2">Checklist Item Status</p>
            {Object.entries(a.compliance.runbookCompletions).map(([id, done]) => (
              <div key={id} className="flex items-center gap-2 text-xs">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${done ? 'bg-sage-100 text-sage-600' : 'bg-red-100 text-red-600'}`}>{done ? '✓' : '✗'}</span>
                <span className="font-mono text-ink-500">{id}</span>
                <span className={done ? 'text-sage-600' : 'text-red-600'}>{done ? 'Complete' : 'Incomplete'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'refresh' && (
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-ink-900">🔄 Regulatory Refresh Report</h3>
          {a.regulatoryRefresh ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card label="Jurisdiction" val={a.regulatoryRefresh.jurisdiction} />
                <Card label="Categories" val={String(a.regulatoryRefresh.categoryCount)} />
                <Card label="Checklist Items" val={String(a.regulatoryRefresh.totalChecklistItems)} />
                <Card label="Docs Detected" val={String(a.regulatoryRefresh.documentsDetected.length)} />
              </div>
              {a.regulatoryRefresh.documentsDetected.length > 0 && (
                <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-sage-800 mb-2">📄 Documents Detected</p>
                  <div className="flex flex-wrap gap-2">{a.regulatoryRefresh.documentsDetected.map(d => <span key={d} className="text-xs bg-sage-100 text-sage-700 px-2.5 py-1 rounded-lg font-medium">✓ {d}</span>)}</div>
                </div>
              )}
              {a.regulatoryRefresh.regulatoryNotes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-800 mb-2">📋 Regulatory Notes</p>
                  <div className="space-y-1.5">{a.regulatoryRefresh.regulatoryNotes.map((n, i) => <p key={i} className="text-xs text-amber-700">{n}</p>)}</div>
                </div>
              )}
              <p className="text-[10px] text-ink-400">Refresh performed: {new Date(a.regulatoryRefresh.refreshedAt).toLocaleString()}</p>
            </>
          ) : <p className="text-sm text-ink-400 p-4">No regulatory refresh data available for this archive.</p>}
        </div>
      )}

      {section === 'filings' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Filings & Deadlines ({a.filings.length})</h3>
          {a.filings.length === 0 ? <p className="text-sm text-ink-400 p-4">No filings for this period.</p> :
          <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
            {a.filings.map(fi => (
              <div key={fi.id} className={`p-4 ${fi.status === 'filed' ? 'bg-sage-50 bg-opacity-50' : 'bg-red-50 bg-opacity-30'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink-900">{fi.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${fi.status === 'filed' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{fi.status === 'filed' ? '✓ Filed' : 'Not Filed'}</span>
                </div>
                <p className="text-xs text-ink-500 mt-1">Due: {fi.dueDate} · {fi.responsible}{fi.filedDate ? ` · Filed: ${fi.filedDate}` : ''}</p>
                {fi.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{fi.attachments.map(att => <span key={att.name} className="text-[10px] bg-mist-50 border border-mist-200 rounded px-2 py-0.5">📎 {att.name}</span>)}</div>}
              </div>
            ))}
          </div>}
        </div>
      )}

      {section === 'meetings' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Meetings ({a.meetings.length})</h3>
          {a.meetings.length === 0 ? <p className="text-sm text-ink-400 p-4">No meetings for this period.</p> :
          <div className="space-y-4">
            {a.meetings.sort((x, y) => y.date.localeCompare(x.date)).map(m => (
              <div key={m.id} className="border border-ink-100 rounded-xl overflow-hidden">
                <div className="p-4 bg-mist-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-ink-900">{m.title}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${m.status === 'COMPLETED' ? 'bg-sage-100 text-sage-700' : 'bg-accent-100 text-accent-700'}`}>{m.status}</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{m.date} · {m.time} · {m.location}</p>
                </div>
                {(m.agenda.length > 0 || m.minutes) && (
                  <div className="p-4 space-y-2">
                    {m.agenda.length > 0 && <div><p className="text-xs font-bold text-ink-700 mb-1">Agenda</p><ul className="text-xs text-ink-600 space-y-0.5">{m.agenda.map((ag, i) => <li key={i}>• {ag}</li>)}</ul></div>}
                    {m.minutes && <div><p className="text-xs font-bold text-ink-700 mb-1">Minutes</p><pre className="text-xs text-ink-600 whitespace-pre-wrap bg-white rounded-lg border border-ink-100 p-3">{m.minutes}</pre></div>}
                  </div>
                )}
              </div>
            ))}
          </div>}
        </div>
      )}

      {section === 'communications' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Communications ({a.communications.length})</h3>
          {a.communications.length === 0 ? <p className="text-sm text-ink-400 p-4">No communications.</p> :
          <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
            {a.communications.map(c => (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink-900">{c.subject}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{c.type}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === 'sent' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{c.status}</span>
                </div>
                <p className="text-xs text-ink-500 mt-1">{c.date} · {c.method} · {c.recipients}</p>
              </div>
            ))}
          </div>}
        </div>
      )}

      {section === 'financial' && (
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-ink-900">Fiscal Lens Snapshot</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card label="Collection Rate" val={`${a.financial.collectionRate}%`} />
            <Card label="Total Budgeted" val={fmt(a.financial.totalBudgeted)} />
            <Card label="Total Actual" val={fmt(a.financial.totalActual)} sub={`Variance: ${fmt(a.financial.totalBudgeted - a.financial.totalActual)}`} />
            <Card label="Reserve Balance" val={fmt(a.financial.reserveBalance)} />
            <Card label="Total Receivable" val={fmt(a.financial.totalAR)} />
            <Card label="Monthly Revenue" val={fmt(a.financial.monthlyRevenue)} />
          </div>
        </div>
      )}

      {section === 'insurance' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Insurance Policies ({a.insurance.length})</h3>
          {a.insurance.length === 0 ? <p className="text-sm text-ink-400 p-4">No insurance records.</p> :
          <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
            {a.insurance.map((p, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{p.type}</p><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${p.status === 'active' ? 'bg-sage-100 text-sage-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span></div>
                <p className="text-xs text-ink-500 mt-1">{p.carrier} · Policy #{p.policyNumber} · {p.coverage} · Expires: {p.expires}</p>
              </div>
            ))}
          </div>}
        </div>
      )}

      {section === 'legal' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Legal & Governing Documents ({a.legalDocuments.length})</h3>
          {a.legalDocuments.length === 0 ? <p className="text-sm text-ink-400 p-4">No documents.</p> :
          <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
            {a.legalDocuments.map((d, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center gap-2"><p className="text-sm font-bold text-ink-900">{d.name}</p><span className="text-xs text-ink-400">v{d.version}</span><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${d.status === 'current' ? 'bg-sage-100 text-sage-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.status}</span></div>
                {d.attachments.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{d.attachments.map(att => <span key={att.name} className="text-[10px] bg-mist-50 border border-mist-200 rounded px-2 py-0.5">📎 {att.name}</span>)}</div>}
              </div>
            ))}
          </div>}
        </div>
      )}

      {section === 'board' && (
        <div className="space-y-3">
          <h3 className="font-display text-lg font-bold text-ink-900">Board Composition ({a.board.length})</h3>
          {a.board.length === 0 ? <p className="text-sm text-ink-400 p-4">No board data.</p> :
          <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
            {a.board.map((b, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div><p className="text-sm font-bold text-ink-900">{b.name}</p><p className="text-xs text-ink-500">{b.role}</p></div>
                <span className="text-xs text-ink-400">Term: {b.term}</span>
              </div>
            ))}
          </div>}
        </div>
      )}
    </>
  );
}
