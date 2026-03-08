import { useState } from 'react';
import { useReportStore } from '@/store/useReportStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { CATEGORIES, getReportsByCategory, type ReportTypeMeta } from './reportCategories';
import { generateReportSnapshot } from './reportGenerators';
import type { ReportCategory, ReportType } from '@/lib/services/reports';

interface Props {
  onGenerated: () => void; // switch to History view after generating
}

export default function ReportCatalog({ onGenerated }: Props) {
  const { addReport } = useReportStore();
  const { currentUser } = useAuthStore();
  const units = useFinancialStore(s => s.units);
  const [unitSelector, setUnitSelector] = useState<{ type: ReportType; category: ReportCategory } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState('');

  function handleGenerate(meta: ReportTypeMeta) {
    if (meta.requiresUnit) {
      setUnitSelector({ type: meta.type, category: meta.category });
      setSelectedUnit(units.length > 0 ? units[0].number : '');
      return;
    }
    doGenerate(meta.type, meta.category, meta.label);
  }

  function doGenerate(type: ReportType, category: ReportCategory, label: string, unitNumber?: string) {
    const today = new Date().toISOString().split('T')[0];
    const snapshot = generateReportSnapshot(type, unitNumber);
    const name = unitNumber ? `${label} — Unit ${unitNumber} — ${today}` : `${label} — ${today}`;
    addReport({
      configId: '',
      name,
      type,
      category,
      generatedAt: today,
      generatedBy: currentUser?.name || 'Board Member',
      snapshot,
    });
    setUnitSelector(null);
    onGenerated();
  }

  function handleUnitConfirm() {
    if (!unitSelector || !selectedUnit) return;
    const meta = getReportsByCategory(unitSelector.category).find(r => r.type === unitSelector.type);
    if (meta) doGenerate(meta.type, meta.category, meta.label, selectedUnit);
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
                    onClick={() => handleGenerate(meta)}
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

      {/* Unit selector modal for resale cert */}
      {unitSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUnitSelector(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-ink-900 mb-3">Select Unit</h3>
            <p className="text-xs text-ink-500 mb-4">Choose the unit for the resale / estoppel certificate.</p>
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm mb-4"
            >
              {units.map(u => (
                <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setUnitSelector(null)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm text-ink-600 hover:bg-ink-50">Cancel</button>
              <button onClick={handleUnitConfirm} className="flex-1 px-3 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium hover:bg-ink-800">Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
