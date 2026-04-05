import { useState, useMemo } from 'react';
import { useReportStore } from '@/store/useReportStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { CATEGORIES, getReportsByCategory, type ReportTypeMeta } from './reportCategories';
import { generateReportSnapshot } from './reportGenerators';
import type { ReportCategory, ReportType } from '@/lib/services/reports';

interface Props {
  onGenerated: () => void; // switch to History view after generating
}

type PeriodPreset = 'current_month' | 'last_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'current_quarter' | 'ytd' | 'full_year' | 'prev_year' | 'custom';

// Compute the current fiscal year start/end from the FY end date (MM-DD).
// If FY ends 12-31 → FY 2026 = Jan 1 2026 – Dec 31 2026
// If FY ends 06-30 → FY 2026 = Jul 1 2025 – Jun 30 2026 (the FY ending in 2026)
function getFiscalYearBounds(fyEnd: string, referenceYear: number): { start: string; end: string } {
  const [mm, dd] = fyEnd.split('-').map(Number);
  const endDate = `${referenceYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  // Start is the day after the end of the previous FY
  const isCalendarYear = mm === 12 && dd === 31;
  if (isCalendarYear) {
    return { start: `${referenceYear}-01-01`, end: endDate };
  }
  // FY start = month after FY end of previous year, day 1
  const startMonth = mm + 1 > 12 ? 1 : mm + 1;
  const startYear = mm + 1 > 12 ? referenceYear : referenceYear - 1;
  return {
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-01`,
    end: endDate,
  };
}

// Determine which fiscal year "today" falls in
function getCurrentFiscalYear(fyEnd: string): number {
  const now = new Date();
  const [mm, dd] = fyEnd.split('-').map(Number);
  const fyEndThisYear = new Date(now.getFullYear(), mm - 1, dd);
  // If today is past the FY end date this calendar year, the current FY ends next year
  return now > fyEndThisYear ? now.getFullYear() + 1 : now.getFullYear();
}

function getPresetDates(preset: PeriodPreset, fyEnd: string): { start: string; end: string; label: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const pad = (n: number) => String(n).padStart(2, '0');
  const currentFY = getCurrentFiscalYear(fyEnd);
  const isCalendarFY = fyEnd === '12-31';

  switch (preset) {
    case 'current_month': {
      const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      return { start, end: today, label: `${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()}` };
    }
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}-01`;
      const end = `${lmEnd.getFullYear()}-${pad(lmEnd.getMonth() + 1)}-${pad(lmEnd.getDate())}`;
      return { start, end, label: `${lm.toLocaleString('en-US', { month: 'short' })} ${lm.getFullYear()}` };
    }
    case 'q1': case 'q2': case 'q3': case 'q4': {
      const qIdx = parseInt(preset[1]) - 1;
      const yr = now.getFullYear();
      const qStart = `${yr}-${pad(qIdx * 3 + 1)}-01`;
      const qEndMonth = qIdx * 3 + 3;
      const qEndDay = new Date(yr, qEndMonth, 0).getDate();
      const qEnd = `${yr}-${pad(qEndMonth)}-${pad(qEndDay)}`;
      return { start: qStart, end: qEnd, label: `Q${qIdx + 1} ${yr}` };
    }
    case 'current_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = `${now.getFullYear()}-${pad(q * 3 + 1)}-01`;
      return { start, end: today, label: `Q${q + 1} ${now.getFullYear()}` };
    }
    case 'ytd': {
      const fy = getFiscalYearBounds(fyEnd, currentFY);
      const label = isCalendarFY ? `YTD ${currentFY}` : `FYTD ${currentFY}`;
      return { start: fy.start, end: today, label };
    }
    case 'full_year': {
      const fy = getFiscalYearBounds(fyEnd, currentFY);
      const label = isCalendarFY ? `Full Year ${currentFY}` : `FY ${currentFY}`;
      return { ...fy, label };
    }
    case 'prev_year': {
      const fy = getFiscalYearBounds(fyEnd, currentFY - 1);
      const label = isCalendarFY ? `Full Year ${currentFY - 1}` : `FY ${currentFY - 1}`;
      return { ...fy, label };
    }
    case 'custom':
      return { start: getFiscalYearBounds(fyEnd, currentFY).start, end: today, label: 'Custom' };
  }
}

function formatPeriodLabel(preset: PeriodPreset, start: string, end: string, fyEnd: string): string {
  if (preset !== 'custom') return getPresetDates(preset, fyEnd).label;
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function ReportCatalog({ onGenerated }: Props) {
  const { addReport } = useReportStore();
  const { currentUser } = useAuthStore();
  const units = useFinancialStore(s => s.units);
  const fiscalYearEnd = useBuildingStore(s => s.details.fiscalYearEnd) || '12-31';

  // Generation modal state
  const [modal, setModal] = useState<ReportTypeMeta | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');

  const isCalendarFY = fiscalYearEnd === '12-31';
  const currentFY = getCurrentFiscalYear(fiscalYearEnd);

  const presetOptions: { value: PeriodPreset; label: string }[] = useMemo(() => [
    { value: 'current_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'current_quarter', label: 'Current Quarter' },
    { value: 'q1', label: 'Q1' },
    { value: 'q2', label: 'Q2' },
    { value: 'q3', label: 'Q3' },
    { value: 'q4', label: 'Q4' },
    { value: 'ytd', label: isCalendarFY ? 'Year-to-Date' : 'FY-to-Date' },
    { value: 'full_year', label: isCalendarFY ? `Full Year ${currentFY}` : `FY ${currentFY}` },
    { value: 'prev_year', label: isCalendarFY ? `Full Year ${currentFY - 1}` : `FY ${currentFY - 1}` },
    { value: 'custom', label: 'Custom' },
  ], [isCalendarFY, currentFY]);

  const periodDates = useMemo(() => {
    if (preset === 'custom') return { start: customStart, end: customEnd };
    return getPresetDates(preset, fiscalYearEnd);
  }, [preset, customStart, customEnd, fiscalYearEnd]);

  function openModal(meta: ReportTypeMeta) {
    const defaults = getPresetDates('ytd', fiscalYearEnd);
    setPreset('ytd');
    setCustomStart(defaults.start);
    setCustomEnd(defaults.end);
    if (meta.requiresUnit) {
      setSelectedUnit(units.length > 0 ? units[0].number : '');
    }
    setModal(meta);
  }

  function handleGenerate() {
    if (!modal) return;
    const { start, end } = periodDates;
    const periodLabel = formatPeriodLabel(preset, start, end, fiscalYearEnd);
    const today = new Date().toISOString().split('T')[0];
    const unitNumber = modal.requiresUnit ? selectedUnit : undefined;

    const snapshot = generateReportSnapshot(modal.type, { unitNumber, periodStart: start, periodEnd: end });

    const nameParts = [modal.label];
    if (unitNumber) nameParts[0] += ` — Unit ${unitNumber}`;
    nameParts.push(periodLabel, today);
    const name = nameParts.join(' — ');

    addReport({
      configId: '',
      name,
      type: modal.type,
      category: modal.category,
      generatedAt: today,
      generatedBy: currentUser?.name || 'Board Member',
      snapshot,
      periodStart: start,
      periodEnd: end,
    });
    setModal(null);
    onGenerated();
  }

  return (
    <div className="space-y-6">
      {CATEGORIES.map(cat => {
        const types = getReportsByCategory(cat.id);
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-bold text-ink-900">{cat.label}</h4>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cat.color.bg} ${cat.color.text}`}>{types.length} reports</span>
            </div>
            <p className="text-xs text-ink-400 mb-3">{cat.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {types.map(meta => (
                <div key={meta.type} className={`rounded-xl border p-4 ${cat.color.border} ${cat.color.bg} hover:shadow-sm transition-all`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{meta.label}</p>
                      <p className="text-xs text-ink-500 mt-0.5">{meta.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openModal(meta)}
                    className="mt-3 w-full px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Generation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-md mx-4 p-6">
            <h3 className="text-base font-bold text-ink-900 mb-1">Generate Report</h3>
            <p className="text-sm text-ink-700 font-medium">{modal.label}</p>
            <p className="text-xs text-ink-400 mt-0.5 mb-5">{modal.description}</p>

            {/* Period selector */}
            <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-2">Report Period</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {presetOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setPreset(opt.value);
                    if (opt.value !== 'custom') {
                      const d = getPresetDates(opt.value, fiscalYearEnd);
                      setCustomStart(d.start);
                      setCustomEnd(d.end);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    preset === opt.value
                      ? 'bg-ink-900 text-white'
                      : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {preset === 'custom' && (
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Period summary */}
            {preset !== 'custom' && (
              <p className="text-xs text-ink-400 mb-4">
                {(() => {
                  const d = getPresetDates(preset, fiscalYearEnd);
                  const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return `${fmt(d.start)} – ${fmt(d.end)}`;
                })()}
              </p>
            )}

            {/* Unit selector for resale cert */}
            {modal.requiresUnit && (
              <div className="mb-4">
                <label className="block text-[10px] text-ink-400 uppercase font-semibold mb-1">Unit</label>
                <select
                  value={selectedUnit}
                  onChange={e => setSelectedUnit(e.target.value)}
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
                >
                  {units.map(u => (
                    <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-600 hover:bg-ink-50">Cancel</button>
              <button
                onClick={handleGenerate}
                disabled={preset === 'custom' && (!customStart || !customEnd)}
                className="flex-1 px-3 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
