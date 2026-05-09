import React, { useState, useMemo } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import type { BuildingAsset, AssetCategory, AssetCondition, MaintenanceSchedule } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import VendorsTab from './VendorsTab';

// ── Helpers ──────────────────────────────────────

const fmt = (n: number) => '$' + n.toLocaleString();

const CURRENT_YEAR = new Date().getFullYear();

const CATEGORIES: AssetCategory[] = ['Mechanical', 'Amenity', 'Safety', 'Technology', 'Common Area', 'Landscaping'];

const CAT_COLORS: Record<AssetCategory, string> = {
  Mechanical: 'bg-purple-100 text-purple-700',
  Amenity: 'bg-mist-100 text-mist-700',
  Safety: 'bg-red-100 text-red-700',
  Technology: 'bg-cyan-50 text-cyan-700',
  'Common Area': 'bg-ink-100 text-ink-600',
  Landscaping: 'bg-sage-100 text-sage-700',
};

// Maintenance category colors (lifted from MaintenanceScheduleTab)
const CAT_COLORS_MAINT: Record<string, string> = {
  HVAC: 'bg-blue-100 text-blue-700',
  Elevator: 'bg-purple-100 text-purple-700',
  'Fire Safety': 'bg-red-100 text-red-700',
  Plumbing: 'bg-cyan-100 text-cyan-700',
  Electrical: 'bg-yellow-100 text-yellow-700',
  General: 'bg-ink-100 text-ink-600',
};
const AMENITY_MAINT_COLOR = 'bg-accent-100 text-accent-700';

const STATUS_CONFIG: Record<MaintenanceSchedule['status'], { label: string; color: string; dot: string }> = {
  'on-track': { label: 'On Track', color: 'bg-sage-100 text-sage-700', dot: 'bg-sage-500' },
  'due-soon': { label: 'Due Soon', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  completed: { label: 'Completed', color: 'bg-mist-100 text-mist-700', dot: 'bg-mist-500' },
};

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-Annual',
  annual: 'Annual',
};

const CONDITION_DOT: Record<AssetCondition, string> = {
  Excellent: 'bg-sage-500',
  Good: 'bg-mist-500',
  Fair: 'bg-yellow-500',
  Poor: 'bg-accent-500',
  Critical: 'bg-accent-500',
};

const CONDITION_TEXT: Record<AssetCondition, string> = {
  Excellent: 'text-sage-700',
  Good: 'text-mist-700',
  Fair: 'text-yellow-700',
  Poor: 'text-accent-700',
  Critical: 'text-red-700',
};

function futureReplacementCost(asset: BuildingAsset): number {
  return Math.round(asset.replacementCostToday * Math.pow(1 + asset.inflationRate / 100, asset.remainingLifeYears));
}

function totalAnnualCost(asset: BuildingAsset): number {
  return asset.annualMaintenanceCost + asset.annualOperatingCost;
}

// ── Component ────────────────────────────────────

interface Props {
  store: ReturnType<typeof useBuildingStore.getState>;
  isBoard: boolean;
  openAdd: () => void;
  openEdit: (id: string, data: Record<string, string>) => void;
  openAddMaint: (assetId: string) => void;
  openEditMaint: (id: string, data: Record<string, string>) => void;
  navigateToTab?: (tab: string) => void;
}

export default function AssetsTab({ store, isBoard, openAdd, openEdit, openAddMaint, openEditMaint, navigateToTab }: Props) {
  const assets = store.assets;
  const finStore = useFinancialStore();
  const spendingStore = useSpendingStore();
  const amenitiesStore = useAmenitiesStore();

  // ── Local state ──
  const [subView, setSubView] = useState<'registry' | 'calendar' | 'capital' | 'vendors'>('registry');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  // ── Derived data ──
  const topLevelAssets = useMemo(() => assets.filter(a => a.parentAssetId === null), [assets]);
  const getChildren = (parentId: string) => assets.filter(a => a.parentAssetId === parentId);

  const filteredAssets = useMemo(() => {
    let list = topLevelAssets;
    if (categoryFilter !== 'all') list = list.filter(a => a.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    }
    return list;
  }, [topLevelAssets, categoryFilter, search]);

  // Attention assets: remaining life <= 3 OR condition Poor/Critical
  const attentionAssets = useMemo(() =>
    assets.filter(a => a.remainingLifeYears <= 3 || a.condition === 'Poor' || a.condition === 'Critical'),
    [assets],
  );

  // KPIs
  const totalAssets = assets.length;
  const totalReplacementCost = useMemo(() => assets.reduce((s, a) => s + a.replacementCostToday, 0), [assets]);
  const totalAnnualMaint = useMemo(() => assets.reduce((s, a) => s + a.annualMaintenanceCost, 0), [assets]);
  const reserveFundedPct = useMemo(() => {
    const linkedReserveAssets = assets.filter(a => a.reserveItemId);
    if (linkedReserveAssets.length === 0) return 0;
    let totalFunding = 0;
    let totalEstimated = 0;
    linkedReserveAssets.forEach(a => {
      const ri = finStore.reserveItems.find(r => r.id === a.reserveItemId);
      if (ri) {
        totalFunding += ri.currentFunding;
        totalEstimated += ri.estimatedCost;
      }
    });
    return totalEstimated > 0 ? Math.round((totalFunding / totalEstimated) * 100) : 0;
  }, [assets, finStore.reserveItems]);

  // ── Cross-module resolution helpers ──
  const resolveModuleCounts = (asset: BuildingAsset) => {
    const ms = store.maintenanceSchedules.filter(m => asset.maintenanceScheduleIds.includes(m.id));
    const wo = finStore.workOrders.filter(w => asset.workOrderIds.includes(w.id));
    const vendors = store.vendors.filter(v => asset.vendorIds.includes(v.id));
    const insurance = store.insurance.filter(p => asset.insurancePolicyIds.includes(p.id));
    const reserve = finStore.reserveItems.find(r => r.id === asset.reserveItemId);
    const amenity = amenitiesStore.configs.find(c => c.id === asset.amenityConfigId);
    const approvals = spendingStore.approvals.filter(a => asset.spendingApprovalIds.includes(a.id));
    const budget = finStore.budgetCategories.find(c => c.id === asset.budgetCategoryId);
    return { ms, wo, vendors, insurance, reserve, amenity, approvals, budget };
  };

  // Reservable amenity assets
  const reservableAmenities = useMemo(() => {
    return assets.filter(a => {
      if (!a.amenityConfigId) return false;
      const cfg = amenitiesStore.configs.find(c => c.id === a.amenityConfigId);
      return cfg?.reservable;
    });
  }, [assets, amenitiesStore.configs]);

  // ═══════════════════════════════════════════════
  // ASSET DETAIL VIEW
  // ═══════════════════════════════════════════════
  const selectedAsset = selectedAssetId ? assets.find(a => a.id === selectedAssetId) : null;

  if (selectedAsset) {
    const mod = resolveModuleCounts(selectedAsset);
    const frc = futureReplacementCost(selectedAsset);
    const children = getChildren(selectedAsset.id);

    return (
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-ink-400">
          <button onClick={() => setSelectedAssetId(null)} className="hover:text-accent-600 font-medium">The Building</button>
          <span>/</span>
          <button onClick={() => setSelectedAssetId(null)} className="hover:text-accent-600 font-medium">Assets</button>
          <span>/</span>
          <span className="text-ink-700 font-semibold">{selectedAsset.name}</span>
        </div>

        {/* Header card */}
        <div className="bg-gradient-to-r from-mist-50 via-white to-accent-50 border-2 border-mist-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-xl font-bold text-ink-900">{selectedAsset.name}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${CAT_COLORS[selectedAsset.category]}`}>{selectedAsset.category}</span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[selectedAsset.condition]}`} />
                  <span className={`text-xs font-semibold ${CONDITION_TEXT[selectedAsset.condition]}`}>{selectedAsset.condition}</span>
                </span>
              </div>
              <p className="text-sm text-ink-500 mt-1">{selectedAsset.location}</p>
              {selectedAsset.notes && <p className="text-xs text-ink-400 mt-1">{selectedAsset.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBoard && (
                <button
                  onClick={() => openEdit(selectedAsset.id, {
                    name: selectedAsset.name,
                    category: selectedAsset.category,
                    location: selectedAsset.location,
                    condition: selectedAsset.condition,
                    installedDate: selectedAsset.installedDate,
                    originalCost: String(selectedAsset.originalCost),
                    usefulLifeYears: String(selectedAsset.usefulLifeYears),
                    remainingLifeYears: String(selectedAsset.remainingLifeYears),
                    replacementCostToday: String(selectedAsset.replacementCostToday),
                    inflationRate: String(selectedAsset.inflationRate),
                    criticality: selectedAsset.criticality,
                    annualMaintenanceCost: String(selectedAsset.annualMaintenanceCost),
                    annualOperatingCost: String(selectedAsset.annualOperatingCost),
                    notes: selectedAsset.notes,
                    insuredValue: String(selectedAsset.insuredValue),
                  })}
                  className="text-xs text-accent-600 font-medium hover:text-accent-700"
                >Edit</button>
              )}
              <button onClick={() => setSelectedAssetId(null)} className="text-xs text-ink-500 hover:text-ink-700 font-medium">Back to Assets</button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Original Cost</p>
              <p className="text-lg font-bold text-ink-900">{fmt(selectedAsset.originalCost)}</p>
              <p className="text-[11px] text-ink-400 mt-0.5">installed {selectedAsset.installedDate}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Replacement Today</p>
              <p className="text-lg font-bold text-ink-900">{fmt(selectedAsset.replacementCostToday)}</p>
              <p className="text-[11px] text-ink-400 mt-0.5">future: {fmt(frc)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Remaining Life</p>
              <p className={`text-lg font-bold ${selectedAsset.remainingLifeYears <= 3 ? 'text-accent-600' : 'text-ink-900'}`}>{selectedAsset.remainingLifeYears} yr</p>
              <p className="text-[11px] text-ink-400 mt-0.5">of {selectedAsset.usefulLifeYears} yr total</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Annual Cost</p>
              <p className="text-lg font-bold text-ink-900">{fmt(totalAnnualCost(selectedAsset))}</p>
              <p className="text-[11px] text-ink-400 mt-0.5">maint + est. ops</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Criticality</p>
              <p className={`text-lg font-bold ${selectedAsset.criticality === 'Critical' ? 'text-red-600' : selectedAsset.criticality === 'High' ? 'text-accent-600' : 'text-ink-900'}`}>{selectedAsset.criticality}</p>
              <p className="text-[11px] text-ink-400 mt-0.5">{selectedAsset.inflationRate}% inflation</p>
            </div>
          </div>
        </div>

        {/* Integration Hub */}
        <div>
          <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Integration Hub</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Maintenance', count: mod.ms.length, color: 'bg-purple-50 border-purple-100' },
              { label: 'Work Orders', count: mod.wo.length, color: 'bg-yellow-50 border-yellow-100' },
              { label: 'Vendors', count: mod.vendors.length, color: 'bg-cyan-50 border-cyan-100' },
              { label: 'Insurance', count: mod.insurance.length, color: 'bg-red-50 border-red-100' },
              { label: 'Reserve Item', count: mod.reserve ? 1 : 0, color: 'bg-sage-50 border-sage-100' },
              { label: 'Amenity Config', count: mod.amenity ? 1 : 0, color: 'bg-mist-50 border-mist-100' },
              { label: 'Approvals', count: mod.approvals.length, color: 'bg-accent-50 border-accent-100' },
              { label: 'Budget Category', count: mod.budget ? 1 : 0, color: 'bg-ink-50 border-ink-100' },
            ].map(tile => (
              <div key={tile.label} className={`rounded-lg p-3 border ${tile.color}`}>
                <p className="text-xs text-ink-500">{tile.label}</p>
                <p className="text-lg font-bold text-ink-900">{tile.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            {/* Lifecycle Details */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Lifecycle Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Installed</span><span className="font-medium text-ink-800">{selectedAsset.installedDate}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Useful Life</span><span className="font-medium text-ink-800">{selectedAsset.usefulLifeYears} years</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Remaining Life</span><span className={`font-medium ${selectedAsset.remainingLifeYears <= 3 ? 'text-accent-600' : 'text-ink-800'}`}>{selectedAsset.remainingLifeYears} years</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Est. Replacement Year</span><span className="font-medium text-ink-800">{CURRENT_YEAR + Math.round(selectedAsset.remainingLifeYears)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Inflation Rate</span><span className="font-medium text-ink-800">{selectedAsset.inflationRate}%</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Future Replacement Cost</span><span className="font-bold text-ink-900">{fmt(frc)}</span></div>
                {selectedAsset.insuredValue > 0 && (
                  <div className="flex justify-between"><span className="text-ink-500">Insured Value</span><span className="font-medium text-ink-800">{fmt(selectedAsset.insuredValue)}</span></div>
                )}
              </div>
              <p className="text-[11px] text-ink-400 mt-3 italic">Operating costs are estimates. Actual costs are tracked through vendor invoices.</p>
            </div>

            {/* Sub-components */}
            {children.length > 0 && (
              <div className="bg-white border border-ink-100 rounded-xl p-4">
                <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Sub-Components ({children.length})</h4>
                <div className="space-y-2">
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedAssetId(child.id)}
                      className="w-full text-left rounded-lg border border-ink-100 p-3 hover:shadow-sm transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-ink-300 text-xs">&boxur;</span>
                        <span className="text-sm font-medium text-ink-900">{child.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${CAT_COLORS[child.category]}`}>{child.category}</span>
                        <span className="flex items-center gap-1 ml-auto">
                          <span className={`w-1.5 h-1.5 rounded-full ${CONDITION_DOT[child.condition]}`} />
                          <span className="text-[10px] text-ink-500">{child.condition}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Maintenance Schedules */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Maintenance Schedules ({mod.ms.length})</h4>
                {isBoard && (
                  <button onClick={() => openAddMaint(selectedAsset.id)} className="px-3 py-1.5 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-xs font-medium">+ Add Task</button>
                )}
              </div>
              {mod.ms.length === 0 && <p className="text-xs text-ink-400 italic">No linked maintenance schedules.</p>}
              {mod.ms.map(m => {
                const st = STATUS_CONFIG[m.status];
                const catColor = CAT_COLORS_MAINT[m.category] || AMENITY_MAINT_COLOR;
                return (
                  <div key={m.id} className={`rounded-xl border p-4 mb-2 transition-all ${m.status === 'overdue' ? 'border-red-200 bg-red-50 bg-opacity-40' : m.status === 'due-soon' ? 'border-yellow-200 bg-yellow-50 bg-opacity-40' : 'border-ink-100 bg-white hover:shadow-sm'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-ink-900">{m.task}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catColor}`}>{m.category}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${st.color}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${st.dot} mr-1`} />
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-ink-500 flex-wrap">
                          <span>Frequency: <strong className="text-ink-700">{FREQ_LABELS[m.frequency] || m.frequency}</strong></span>
                          {m.vendor && <span>Vendor: <strong className="text-ink-700">{m.vendor}</strong></span>}
                          <span>Est. Cost: <strong className="text-ink-700">{m.estimatedCost}</strong></span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs">
                          <span className="text-ink-400">Last completed: <strong className={m.lastCompleted ? 'text-ink-700' : 'text-ink-300'}>{m.lastCompleted || 'Never'}</strong></span>
                          <span className={`${m.status === 'overdue' ? 'text-red-600 font-semibold' : m.status === 'due-soon' ? 'text-yellow-600 font-semibold' : 'text-ink-400'}`}>
                            Next due: <strong>{m.nextDue || 'TBD'}</strong>
                          </span>
                        </div>
                        {m.notes && <p className="text-xs text-ink-400 mt-1.5">{m.notes}</p>}
                      </div>
                      {isBoard && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openEditMaint(m.id, {
                              task: m.task, category: m.category, frequency: m.frequency,
                              vendor: m.vendor, lastCompleted: m.lastCompleted, nextDue: m.nextDue,
                              estimatedCost: m.estimatedCost, notes: m.notes, status: m.status,
                            })}
                            className="text-xs text-accent-600 font-medium hover:text-accent-700"
                          >Edit</button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove "${m.task}"?`)) {
                                store.unlinkScheduleFromAsset(selectedAsset.id, m.id);
                                store.removeMaintenanceSchedule(m.id);
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-600"
                          >Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isBoard && (
                <button onClick={() => openAddMaint(selectedAsset.id)} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium mt-2">
                  + Add Maintenance Task
                </button>
              )}
            </div>

            {/* Work Orders */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Work Orders ({mod.wo.length})</h4>
              {mod.wo.length === 0 && <p className="text-xs text-ink-400 italic">No linked work orders.</p>}
              {mod.wo.map(w => (
                <div key={w.id} className="border border-ink-100 rounded-lg p-3 mb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-ink-400">{w.id}</span>
                      <span className="text-sm font-medium text-ink-900">{w.title}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${w.status === 'paid' ? 'bg-sage-100 text-sage-700' : w.status === 'draft' ? 'bg-ink-100 text-ink-500' : 'bg-yellow-100 text-yellow-700'}`}>{w.status}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-ink-500">
                    <span>{w.vendor}</span>
                    <span className="font-bold text-ink-700">{fmt(w.amount)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Spending Approvals */}
            {mod.approvals.length > 0 && (
              <div className="bg-white border border-ink-100 rounded-xl p-4">
                <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Spending History ({mod.approvals.length})</h4>
                {mod.approvals.map(a => (
                  <div key={a.id} className="border border-ink-100 rounded-lg p-3 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink-900">{a.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${a.status === 'approved' ? 'bg-sage-100 text-sage-700' : a.status === 'denied' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{a.status}</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-ink-500">
                      <span className="font-bold text-ink-700">{fmt(a.amount)}</span>
                      <span>Source: {a.fundingSource || 'TBD'}</span>
                      {a.vendorName && <span>Vendor: {a.vendorName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Warranties */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Warranties ({selectedAsset.warranties.length})</h4>
              {selectedAsset.warranties.length === 0 && <p className="text-xs text-ink-400 italic">No warranties on file.</p>}
              {selectedAsset.warranties.map(w => {
                const expired = new Date(w.expires) < new Date();
                return (
                  <div key={w.id} className={`border rounded-lg p-3 mb-2 ${expired ? 'border-red-200 bg-red-50 bg-opacity-40' : 'border-sage-200 bg-sage-50 bg-opacity-40'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink-900">{w.description}</span>
                      {expired ? (
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700">Expired</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-sage-100 text-sage-700">Active</span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-ink-500">
                      <span>Type: <strong className="text-ink-700">{w.type}</strong></span>
                      <span>Vendor: <strong className="text-ink-700">{w.vendorName}</strong></span>
                      <span>Expires: <strong className={expired ? 'text-red-600' : 'text-ink-700'}>{w.expires}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Linked Vendors */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Linked Vendors ({mod.vendors.length})</h4>
                {isBoard && (() => {
                  const unlinkedVendors = store.vendors.filter(v => v.status === 'active' && !selectedAsset.vendorIds.includes(v.id));
                  if (unlinkedVendors.length === 0) return null;
                  return (
                    <div className="relative">
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) {
                            store.updateAsset(selectedAsset.id, { vendorIds: [...selectedAsset.vendorIds, e.target.value] });
                          }
                        }}
                        className="text-xs px-2 py-1.5 border border-ink-200 rounded-lg bg-white text-ink-700 cursor-pointer"
                      >
                        <option value="">+ Link Vendor</option>
                        {unlinkedVendors.map(v => <option key={v.id} value={v.id}>{v.name} — {v.service}</option>)}
                      </select>
                    </div>
                  );
                })()}
              </div>
              {mod.vendors.length === 0 && <p className="text-xs text-ink-400 italic">No vendors linked to this asset.</p>}
              {mod.vendors.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-cyan-50 rounded-lg px-3 py-2 border border-cyan-100 mb-1.5">
                  <div>
                    <span className="text-sm font-medium text-ink-900">{v.name}</span>
                    <div className="flex gap-3 text-xs text-ink-500 mt-0.5">
                      <span>{v.service}</span>
                      <span>{v.phone}</span>
                      {v.email && <span>{v.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => navigateToTab?.('vendors')} className="text-[10px] text-accent-600 hover:text-accent-700 font-medium">View</button>
                    {isBoard && (
                      <button
                        onClick={() => {
                          if (confirm(`Unlink ${v.name} from this asset?`))
                            store.updateAsset(selectedAsset.id, { vendorIds: selectedAsset.vendorIds.filter(id => id !== v.id) });
                        }}
                        className="text-[10px] text-red-400 hover:text-red-600"
                      >Unlink</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Linked Insurance */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider">Insurance Coverage ({mod.insurance.length})</h4>
                {isBoard && (() => {
                  const unlinkedPolicies = store.insurance.filter(p => !selectedAsset.insurancePolicyIds.includes(p.id));
                  if (unlinkedPolicies.length === 0) return null;
                  return (
                    <div className="relative">
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) {
                            store.updateAsset(selectedAsset.id, { insurancePolicyIds: [...selectedAsset.insurancePolicyIds, e.target.value] });
                          }
                        }}
                        className="text-xs px-2 py-1.5 border border-ink-200 rounded-lg bg-white text-ink-700 cursor-pointer"
                      >
                        <option value="">+ Link Policy</option>
                        {unlinkedPolicies.map(p => <option key={p.id} value={p.id}>{p.type} — {p.carrier}</option>)}
                      </select>
                    </div>
                  );
                })()}
              </div>
              {mod.insurance.length === 0 && <p className="text-xs text-ink-400 italic">No insurance policies linked to this asset.</p>}
              {mod.insurance.map(p => {
                const expired = new Date(p.expires) < new Date();
                return (
                  <div key={p.id} className={`flex items-center justify-between rounded-lg px-3 py-2 border mb-1.5 ${expired ? 'bg-red-50 border-red-200' : 'bg-red-50 bg-opacity-40 border-red-100'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{p.type}</span>
                        {expired && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-red-100 text-red-700">Expired</span>}
                      </div>
                      <div className="flex gap-3 text-xs text-ink-500 mt-0.5">
                        <span>{p.carrier}</span>
                        <span>{p.coverage}</span>
                        <span>Expires: {p.expires}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => navigateToTab?.('insurance')} className="text-[10px] text-accent-600 hover:text-accent-700 font-medium">View</button>
                      {isBoard && (
                        <button
                          onClick={() => {
                            if (confirm(`Unlink ${p.type} policy from this asset?`))
                              store.updateAsset(selectedAsset.id, { insurancePolicyIds: selectedAsset.insurancePolicyIds.filter(id => id !== p.id) });
                          }}
                          className="text-[10px] text-red-400 hover:text-red-600"
                        >Unlink</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Financial & Module Links */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Financial & Module Links</h4>
              <div className="space-y-2 text-sm">
                {mod.reserve && (
                  <button onClick={() => navigateToTab?.('units')} className="w-full text-left bg-sage-50 rounded-lg p-3 border border-sage-100 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-ink-400">Reserve Item</p>
                      <span className="text-[10px] text-accent-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Go to Reserves &rarr;</span>
                    </div>
                    <p className="font-bold text-ink-900">{mod.reserve.name}</p>
                    <div className="flex gap-3 text-xs text-ink-500 mt-1">
                      <span>Funded: <strong className="text-sage-700">{fmt(mod.reserve.currentFunding)}</strong></span>
                      <span>Needed: <strong className="text-ink-700">{fmt(mod.reserve.estimatedCost)}</strong></span>
                      <span>{mod.reserve.estimatedCost > 0 ? Math.round((mod.reserve.currentFunding / mod.reserve.estimatedCost) * 100) : 100}% funded</span>
                    </div>
                  </button>
                )}
                {mod.budget && (
                  <button onClick={() => navigateToTab?.('units')} className="w-full text-left bg-mist-50 rounded-lg p-3 border border-mist-100 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-ink-400">Budget Category</p>
                      <span className="text-[10px] text-accent-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Go to Budget &rarr;</span>
                    </div>
                    <p className="font-bold text-ink-900">{mod.budget.name}</p>
                    <div className="flex gap-3 text-xs text-ink-500 mt-1">
                      <span>Budgeted: <strong className="text-ink-700">{fmt(mod.budget.budgeted)}</strong></span>
                      <span>Spent: <strong className="text-ink-700">{fmt(mod.budget.expenses.reduce((s, e) => s + e.amount, 0))}</strong></span>
                    </div>
                  </button>
                )}
                {mod.amenity && (
                  <div className="bg-mist-50 rounded-lg p-3 border border-mist-100">
                    <p className="text-xs text-ink-400">Amenity Config</p>
                    <p className="font-bold text-ink-900">{mod.amenity.name}</p>
                    <div className="flex gap-3 text-xs text-ink-500 mt-1">
                      <span>Reservable: <strong className="text-ink-700">{mod.amenity.reservable ? 'Yes' : 'No'}</strong></span>
                      {mod.amenity.reservationFee > 0 && <span>Fee: <strong className="text-ink-700">{fmt(mod.amenity.reservationFee)}</strong></span>}
                      {mod.amenity.capacity > 0 && <span>Capacity: <strong className="text-ink-700">{mod.amenity.capacity}</strong></span>}
                    </div>
                  </div>
                )}
                {selectedAsset.glAccountNum && (
                  <div className="flex justify-between px-1">
                    <span className="text-ink-500">GL Account</span>
                    <span className="font-mono text-ink-700">{selectedAsset.glAccountNum}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Condition History */}
            <div className="bg-white border border-ink-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Condition History ({selectedAsset.conditionHistory.length})</h4>
              {selectedAsset.conditionHistory.length === 0 && <p className="text-xs text-ink-400 italic">No condition assessments recorded.</p>}
              <div className="space-y-2">
                {selectedAsset.conditionHistory.map((ch, i) => (
                  <div key={i} className="border border-ink-100 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[ch.condition]}`} />
                        <span className={`text-sm font-semibold ${CONDITION_TEXT[ch.condition]}`}>{ch.condition}</span>
                      </div>
                      <span className="text-xs text-ink-400">{ch.date}</span>
                    </div>
                    <p className="text-xs text-ink-500 mt-1">by {ch.assessedBy}</p>
                    {ch.notes && <p className="text-xs text-ink-400 mt-0.5">{ch.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // MAIN VIEW (Registry or Capital Planning)
  // ═══════════════════════════════════════════════

  return (
    <div className="space-y-5">
      {/* Sub-nav pills */}
      <div className="flex items-center gap-1 bg-mist-50 rounded-lg p-1">
        <button
          onClick={() => setSubView('registry')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${subView === 'registry' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
        >
          All Assets
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${subView === 'registry' ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-600'}`}>{totalAssets}</span>
        </button>
        <button
          onClick={() => setSubView('calendar')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${subView === 'calendar' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
        >
          Maintenance Calendar
        </button>
        <button
          onClick={() => setSubView('capital')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${subView === 'capital' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
        >
          Capital Planning
        </button>
        <button
          onClick={() => setSubView('vendors')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${subView === 'vendors' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
        >
          Vendors
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${subView === 'vendors' ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-600'}`}>{store.vendors.filter(v => v.status === 'active').length}</span>
        </button>
      </div>

      {/* ═══════ REGISTRY VIEW ═══════ */}
      {subView === 'registry' && (
        <div className="space-y-5">
          {/* Attention panel */}
          {attentionAssets.length > 0 && (
            <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-accent-800 mb-2">Needs Attention ({attentionAssets.length})</h4>
              <p className="text-xs text-accent-600 mb-3">Assets nearing end of life or in poor/critical condition</p>
              <div className="space-y-1.5">
                {attentionAssets.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-accent-100 cursor-pointer hover:shadow-sm" onClick={() => setSelectedAssetId(a.id)}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[a.condition]}`} />
                      <span className="text-sm font-medium text-ink-900">{a.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${CAT_COLORS[a.category]}`}>{a.category}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-ink-500">{a.remainingLifeYears} yr remaining</span>
                      <span className={`font-semibold ${CONDITION_TEXT[a.condition]}`}>{a.condition}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Total Assets</p>
              <p className="text-lg font-bold text-ink-900">{totalAssets}</p>
              <p className="text-[11px] text-ink-400 mt-1">{topLevelAssets.length} top-level</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Replacement Total</p>
              <p className="text-lg font-bold text-ink-900">{fmt(totalReplacementCost)}</p>
              <p className="text-[11px] text-ink-400 mt-1">current value</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Annual Maintenance</p>
              <p className="text-lg font-bold text-ink-900">{fmt(totalAnnualMaint)}</p>
              <p className="text-[11px] text-ink-400 mt-1">all assets</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-ink-100">
              <p className="text-xs text-ink-400">Reserve Funded</p>
              <p className={`text-lg font-bold ${reserveFundedPct >= 80 ? 'text-sage-600' : reserveFundedPct >= 50 ? 'text-yellow-600' : 'text-accent-600'}`}>{reserveFundedPct}%</p>
              <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${reserveFundedPct >= 80 ? 'bg-sage-500' : reserveFundedPct >= 50 ? 'bg-yellow-500' : 'bg-accent-500'}`} style={{ width: `${Math.min(reserveFundedPct, 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Maintenance Health Dashboard */}
          {(() => {
            const schedules = store.maintenanceSchedules;
            const total = schedules.length;
            const onTrack = schedules.filter(s => s.status === 'on-track' || s.status === 'completed').length;
            const overdue = schedules.filter(s => s.status === 'overdue').length;
            const dueSoon = schedules.filter(s => s.status === 'due-soon').length;
            const score = total > 0 ? Math.round((onTrack / total) * 100) : 100;
            const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
            const gc = score >= 80 ? 'sage' : score >= 60 ? 'yellow' : 'red';
            const totalCost = schedules.reduce((s, m) => {
              const num = parseFloat(m.estimatedCost.replace(/[^0-9.]/g, ''));
              return s + (isNaN(num) ? 0 : num);
            }, 0);
            // Unlinked schedules warning
            const allLinkedIds = new Set(assets.flatMap(a => a.maintenanceScheduleIds));
            const unlinkedSchedules = schedules.filter(s => !allLinkedIds.has(s.id));

            return (
              <div className={`bg-gradient-to-br ${gc === 'sage' ? 'from-sage-50 to-sage-100 border-sage-200' : gc === 'yellow' ? 'from-yellow-50 to-yellow-100 border-yellow-200' : 'from-red-50 to-red-100 border-red-200'} border-2 rounded-xl p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-display text-xl font-bold text-ink-900">Maintenance Health</h3>
                    <p className="text-sm text-ink-500 mt-0.5">Preventive maintenance compliance score</p>
                  </div>
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${gc === 'sage' ? 'text-sage-600' : gc === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>{grade}</div>
                    <p className={`text-sm font-bold ${gc === 'sage' ? 'text-sage-600' : gc === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`}>{score}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-ink-100">
                    <p className="text-xs text-ink-400">Total Tasks</p>
                    <p className="text-lg font-bold text-ink-900">{total}</p>
                    <p className="text-[11px] text-ink-400 mt-1">scheduled items</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-ink-100">
                    <p className="text-xs text-ink-400">On Track</p>
                    <p className="text-lg font-bold text-sage-600">{onTrack}<span className="text-sm font-normal text-ink-400">/{total}</span></p>
                    <div className="mt-1.5 h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div className={`h-full ${gc === 'sage' ? 'bg-sage-500' : gc === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'} rounded-full`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-ink-100">
                    <p className="text-xs text-ink-400">Overdue</p>
                    <p className={`text-lg font-bold ${overdue > 0 ? 'text-red-600' : 'text-sage-600'}`}>{overdue}</p>
                    <p className="text-[11px] text-ink-400 mt-1">{dueSoon > 0 ? `${dueSoon} due soon` : 'none upcoming'}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-ink-100">
                    <p className="text-xs text-ink-400">Est. Annual Cost</p>
                    <p className="text-lg font-bold text-ink-900">${totalCost.toLocaleString()}</p>
                    <p className="text-[11px] text-ink-400 mt-1">per cycle total</p>
                  </div>
                </div>
                {unlinkedSchedules.length > 0 && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-yellow-700">⚠ {unlinkedSchedules.length} Unlinked Schedule{unlinkedSchedules.length > 1 ? 's' : ''}</p>
                    <p className="text-[11px] text-yellow-600 mt-0.5">
                      {unlinkedSchedules.map(s => s.task).join(', ')} — not associated with any asset
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Category filter tabs + search + Add button */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === 'all' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
              >All</button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === cat ? 'bg-ink-900 text-white' : `${CAT_COLORS[cat]} hover:opacity-80`}`}
                >{cat}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search assets..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="px-3 py-1.5 border border-ink-200 rounded-lg text-sm w-48"
              />
              {isBoard && (
                <button onClick={openAdd} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Asset</button>
              )}
            </div>
          </div>

          {/* Asset registry table */}
          <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50">
                    <th className="text-left py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Asset</th>
                    <th className="text-left py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Category</th>
                    <th className="text-left py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Location</th>
                    <th className="text-center py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Condition</th>
                    <th className="text-right py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Replace $</th>
                    <th className="text-center py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Life Left</th>
                    <th className="text-left py-2.5 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider">Linked Modules</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-ink-400 text-sm">
                        {search || categoryFilter !== 'all' ? 'No assets match your filters.' : 'No assets registered yet.'}
                      </td>
                    </tr>
                  )}
                  {filteredAssets.map(asset => {
                    const children = getChildren(asset.id);
                    const mod = resolveModuleCounts(asset);
                    const linkedPills: { label: string; color: string }[] = [];
                    if (mod.ms.length) linkedPills.push({ label: `${mod.ms.length} Maint`, color: 'bg-purple-100 text-purple-700' });
                    if (mod.wo.length) linkedPills.push({ label: `${mod.wo.length} WO`, color: 'bg-yellow-100 text-yellow-700' });
                    if (mod.vendors.length) linkedPills.push({ label: `${mod.vendors.length} Vendor`, color: 'bg-cyan-50 text-cyan-700' });
                    if (mod.insurance.length) linkedPills.push({ label: `${mod.insurance.length} Ins`, color: 'bg-red-100 text-red-700' });
                    if (mod.reserve) linkedPills.push({ label: 'Reserve', color: 'bg-sage-100 text-sage-700' });
                    if (mod.amenity) linkedPills.push({ label: 'Amenity', color: 'bg-mist-100 text-mist-700' });
                    if (mod.approvals.length) linkedPills.push({ label: `${mod.approvals.length} Appr`, color: 'bg-accent-100 text-accent-700' });

                    return (
                      <React.Fragment key={asset.id}>
                        <tr
                          className="border-b border-ink-50 hover:bg-mist-50 cursor-pointer transition-colors"
                          onClick={() => setSelectedAssetId(asset.id)}
                        >
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-ink-900">{asset.name}</span>
                            {children.length > 0 && <span className="text-[10px] text-ink-400 ml-1">({children.length} sub)</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${CAT_COLORS[asset.category]}`}>{asset.category}</span>
                          </td>
                          <td className="py-2.5 px-3 text-ink-500">{asset.location}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="flex items-center justify-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[asset.condition]}`} />
                              <span className={`text-xs font-medium ${CONDITION_TEXT[asset.condition]}`}>{asset.condition}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-ink-900">{fmt(asset.replacementCostToday)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-xs font-bold ${asset.remainingLifeYears <= 3 ? 'text-accent-600' : 'text-ink-700'}`}>{asset.remainingLifeYears} yr</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {linkedPills.map((p, i) => (
                                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${p.color}`}>{p.label}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                        {/* Sub-component rows */}
                        {children.map(child => (
                          <tr
                            key={child.id}
                            className="border-b border-ink-50 hover:bg-mist-50 cursor-pointer transition-colors bg-ink-50 bg-opacity-30"
                            onClick={() => setSelectedAssetId(child.id)}
                          >
                            <td className="py-2 px-3 pl-8">
                              <span className="text-ink-300 mr-1">&boxur;</span>
                              <span className="text-ink-700">{child.name}</span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${CAT_COLORS[child.category]}`}>{child.category}</span>
                            </td>
                            <td className="py-2 px-3 text-ink-400 text-xs">{child.location}</td>
                            <td className="py-2 px-3 text-center">
                              <span className="flex items-center justify-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${CONDITION_DOT[child.condition]}`} />
                                <span className={`text-[10px] ${CONDITION_TEXT[child.condition]}`}>{child.condition}</span>
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-xs text-ink-500">{fmt(child.replacementCostToday)}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`text-[10px] font-bold ${child.remainingLifeYears <= 3 ? 'text-accent-600' : 'text-ink-500'}`}>{child.remainingLifeYears} yr</span>
                            </td>
                            <td className="py-2 px-3"></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reservable Amenities strip */}
          {reservableAmenities.length > 0 && (
            <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-2">Reservable Amenity Assets</h4>
              <p className="text-xs text-ink-500 mb-3">These assets have amenity configurations with active reservation capability.</p>
              <div className="flex flex-wrap gap-2">
                {reservableAmenities.map(a => {
                  const cfg = amenitiesStore.configs.find(c => c.id === a.amenityConfigId);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAssetId(a.id)}
                      className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-mist-200 hover:shadow-sm transition-all cursor-pointer"
                    >
                      {cfg && <span>{cfg.icon}</span>}
                      <span className="text-sm font-medium text-ink-900">{a.name}</span>
                      {cfg && cfg.reservationFee > 0 && <span className="text-[10px] text-mist-600 font-medium">{fmt(cfg.reservationFee)}/res</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add asset dashed button */}
          {isBoard && (
            <button onClick={openAdd} className="w-full py-3 border-2 border-dashed border-ink-200 rounded-xl text-sm text-ink-500 hover:border-accent-300 hover:text-accent-600 transition-colors font-medium">
              + Add Building Asset
            </button>
          )}
        </div>
      )}

      {/* ═══════ MAINTENANCE CALENDAR VIEW ═══════ */}
      {subView === 'calendar' && <MaintenanceCalendarView store={store} />}

      {/* ═══════ VENDORS VIEW ═══════ */}
      {subView === 'vendors' && <VendorsTab />}

      {/* ═══════ CAPITAL PLANNING VIEW ═══════ */}
      {subView === 'capital' && <CapitalPlanningView assets={assets} finStore={finStore} spendingStore={spendingStore} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Capital Planning sub-view
// ═══════════════════════════════════════════════════

function CapitalPlanningView({
  assets,
  finStore,
  spendingStore,
}: {
  assets: BuildingAsset[];
  finStore: ReturnType<typeof useFinancialStore.getState>;
  spendingStore: ReturnType<typeof useSpendingStore.getState>;
}) {
  const reserveItems = finStore.reserveItems;
  const annualContribution = finStore.annualReserveContribution;

  // Approaching replacement (< 5 years)
  const approachingReplacement = useMemo(() =>
    [...assets].filter(a => a.remainingLifeYears < 5).sort((a, b) => a.remainingLifeYears - b.remainingLifeYears),
    [assets],
  );

  // Reserve fund status
  const reserveStatus = useMemo(() => {
    return reserveItems.filter(r => !r.isContingency).map(r => {
      const gap = r.estimatedCost - r.currentFunding;
      const pct = r.estimatedCost > 0 ? Math.round((r.currentFunding / r.estimatedCost) * 100) : 100;
      const annualNeeded = r.yearsRemaining > 0 ? Math.round(gap / r.yearsRemaining) : 0;
      return { ...r, gap, pct, annualNeeded };
    });
  }, [reserveItems]);

  const totalReserveFunding = reserveItems.reduce((s, r) => s + r.currentFunding, 0);
  const totalReserveNeeded = reserveItems.filter(r => !r.isContingency).reduce((s, r) => s + r.estimatedCost, 0);
  const overallFundedPct = totalReserveNeeded > 0 ? Math.round((totalReserveFunding / totalReserveNeeded) * 100) : 100;

  // Recommended annual contribution
  const recommendedAnnual = useMemo(() => {
    let total = 0;
    reserveItems.filter(r => !r.isContingency).forEach(r => {
      if (r.yearsRemaining > 0) {
        total += (r.estimatedCost - r.currentFunding) / r.yearsRemaining;
      }
    });
    return Math.round(total);
  }, [reserveItems]);

  // 30-year forecast
  const forecast = useMemo(() => {
    const rows: { year: number; replacements: string[]; cost: number; cumulativeCost: number; cumulativeContrib: number; balance: number }[] = [];
    let cumulativeCost = 0;
    let cumulativeContrib = 0;

    for (let yr = 0; yr < 30; yr++) {
      const targetYear = CURRENT_YEAR + yr;
      const due = assets.filter(a => {
        const repYear = CURRENT_YEAR + Math.round(a.remainingLifeYears);
        return repYear === targetYear;
      });
      const yearCost = due.reduce((s, a) => s + Math.round(a.replacementCostToday * Math.pow(1 + a.inflationRate / 100, yr)), 0);
      cumulativeCost += yearCost;
      cumulativeContrib += annualContribution;
      rows.push({
        year: targetYear,
        replacements: due.map(a => a.name),
        cost: yearCost,
        cumulativeCost,
        cumulativeContrib,
        balance: cumulativeContrib - cumulativeCost,
      });
    }
    return rows;
  }, [assets, annualContribution]);

  // Funding gap analysis
  const fundingGap = useMemo(() => {
    const totalFutureReplacements = assets.reduce((s, a) => s + futureReplacementCost(a), 0);
    const thirtyYearContrib = annualContribution * 30;
    const gap = totalFutureReplacements - thirtyYearContrib - totalReserveFunding;
    return { totalFutureReplacements, thirtyYearContrib, totalReserveFunding, gap };
  }, [assets, annualContribution, totalReserveFunding]);

  // Active capital approvals
  const capitalApprovals = useMemo(() =>
    spendingStore.approvals.filter(a => a.category === 'capital'),
    [spendingStore.approvals],
  );

  // Deferred risk
  const deferredRiskAssets = useMemo(() =>
    assets.filter(a => a.remainingLifeYears <= 0 || (a.condition === 'Poor' || a.condition === 'Critical')),
    [assets],
  );

  return (
    <div className="space-y-5">
      {/* Data flow diagram */}
      <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-ink-800 mb-2">Capital Planning Data Flow</h4>
        <div className="flex items-center gap-2 flex-wrap text-xs text-ink-500">
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">Asset Registry</span>
          <span>&rarr;</span>
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">Lifecycle Data</span>
          <span>&rarr;</span>
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">30-Year Forecast</span>
          <span>&rarr;</span>
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">Reserve Fund</span>
          <span>&rarr;</span>
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">Budget</span>
          <span>&rarr;</span>
          <span className="bg-white px-2 py-1 rounded border border-ink-100 font-medium text-ink-700">Spending Approvals</span>
        </div>
      </div>

      {/* Reserve Fund Status */}
      <div className={`bg-gradient-to-br ${overallFundedPct >= 80 ? 'from-sage-50 to-sage-100 border-sage-200' : overallFundedPct >= 50 ? 'from-yellow-50 to-yellow-100 border-yellow-200' : 'from-accent-50 to-accent-100 border-accent-200'} border-2 rounded-xl p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900">Reserve Fund Status</h3>
            <p className="text-sm text-ink-500 mt-0.5">Current funding vs estimated replacement needs</p>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold ${overallFundedPct >= 80 ? 'text-sage-600' : overallFundedPct >= 50 ? 'text-yellow-600' : 'text-accent-600'}`}>{overallFundedPct}%</div>
            <p className="text-xs text-ink-400">funded</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Total Funded</p>
            <p className="text-lg font-bold text-sage-600">{fmt(totalReserveFunding)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Total Needed</p>
            <p className="text-lg font-bold text-ink-900">{fmt(totalReserveNeeded)}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-ink-100">
            <p className="text-xs text-ink-400">Shortfall</p>
            <p className={`text-lg font-bold ${totalReserveNeeded - totalReserveFunding > 0 ? 'text-accent-600' : 'text-sage-600'}`}>{fmt(Math.max(0, totalReserveNeeded - totalReserveFunding))}</p>
          </div>
        </div>
        <div className="space-y-2">
          {reserveStatus.map(r => (
            <div key={r.id} className="bg-white rounded-lg p-3 border border-ink-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-ink-900">{r.name}</span>
                <span className="text-xs text-ink-500">{r.pct}% funded</span>
              </div>
              <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${r.pct >= 80 ? 'bg-sage-500' : r.pct >= 50 ? 'bg-yellow-500' : 'bg-accent-500'}`} style={{ width: `${Math.min(r.pct, 100)}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-ink-400">
                <span>Current: {fmt(r.currentFunding)}</span>
                <span>Needed: {fmt(r.estimatedCost)}</span>
                <span>Gap: {fmt(r.gap)}</span>
                {r.annualNeeded > 0 && <span className="font-medium text-ink-600">{fmt(r.annualNeeded)}/yr needed</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Annual Contribution */}
      <div className={`rounded-xl p-4 border ${annualContribution >= recommendedAnnual ? 'bg-sage-50 border-sage-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <h4 className="text-sm font-bold text-ink-800 mb-2">Recommended Annual Contribution</h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-ink-400">Current Annual</p>
            <p className="text-lg font-bold text-ink-900">{fmt(annualContribution)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Recommended</p>
            <p className={`text-lg font-bold ${annualContribution >= recommendedAnnual ? 'text-sage-600' : 'text-accent-600'}`}>{fmt(recommendedAnnual)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Difference</p>
            <p className={`text-lg font-bold ${annualContribution >= recommendedAnnual ? 'text-sage-600' : 'text-accent-600'}`}>
              {annualContribution >= recommendedAnnual ? '+' : ''}{fmt(annualContribution - recommendedAnnual)}
            </p>
          </div>
        </div>
      </div>

      {/* Approaching Replacement alerts */}
      {approachingReplacement.length > 0 && (
        <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
          <h4 className="text-sm font-bold text-accent-800 mb-2">Approaching Replacement ({approachingReplacement.length})</h4>
          <p className="text-xs text-accent-600 mb-3">Assets with less than 5 years of remaining useful life</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-accent-200">
                  <th className="text-left py-2 px-2 text-xs font-bold text-ink-600 uppercase">Asset</th>
                  <th className="text-center py-2 px-2 text-xs font-bold text-ink-600 uppercase">Years Left</th>
                  <th className="text-center py-2 px-2 text-xs font-bold text-ink-600 uppercase">Condition</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-ink-600 uppercase">Replace $</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-ink-600 uppercase">Future $</th>
                </tr>
              </thead>
              <tbody>
                {approachingReplacement.map(a => (
                  <tr key={a.id} className="border-b border-accent-100">
                    <td className="py-2 px-2">
                      <span className="font-medium text-ink-900">{a.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ml-1 ${CAT_COLORS[a.category]}`}>{a.category}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`font-bold ${a.remainingLifeYears <= 2 ? 'text-red-600' : 'text-accent-600'}`}>{a.remainingLifeYears}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="flex items-center justify-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[a.condition]}`} />
                        <span className={`text-xs ${CONDITION_TEXT[a.condition]}`}>{a.condition}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-ink-900">{fmt(a.replacementCostToday)}</td>
                    <td className="py-2 px-2 text-right font-bold text-ink-900">{fmt(futureReplacementCost(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* 30-Year Forecast table */}
          <div className="bg-white border border-ink-100 rounded-xl p-4">
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">30-Year Replacement Forecast</h4>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-ink-200">
                    <th className="text-left py-2 px-2 font-bold text-ink-600 uppercase">Year</th>
                    <th className="text-left py-2 px-2 font-bold text-ink-600 uppercase">Replacements</th>
                    <th className="text-right py-2 px-2 font-bold text-ink-600 uppercase">Cost</th>
                    <th className="text-right py-2 px-2 font-bold text-ink-600 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map(row => (
                    <tr key={row.year} className={`border-b border-ink-50 ${row.cost > 0 ? 'bg-yellow-50 bg-opacity-50' : ''} ${row.balance < 0 ? 'bg-red-50 bg-opacity-40' : ''}`}>
                      <td className="py-1.5 px-2 font-medium text-ink-700">{row.year}</td>
                      <td className="py-1.5 px-2 text-ink-500">
                        {row.replacements.length > 0 ? row.replacements.join(', ') : <span className="text-ink-300">&mdash;</span>}
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium text-ink-900">{row.cost > 0 ? fmt(row.cost) : <span className="text-ink-300">&mdash;</span>}</td>
                      <td className={`py-1.5 px-2 text-right font-bold ${row.balance < 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Capital Projects */}
          <div className="bg-white border border-ink-100 rounded-xl p-4">
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Active Capital Projects ({capitalApprovals.length})</h4>
            {capitalApprovals.length === 0 && <p className="text-xs text-ink-400 italic">No active capital spending requests.</p>}
            {capitalApprovals.map(a => (
              <div key={a.id} className="border border-ink-100 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{a.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${a.status === 'approved' ? 'bg-sage-100 text-sage-700' : a.status === 'denied' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{a.status}</span>
                  </div>
                  <span className="text-sm font-bold text-ink-900">{fmt(a.amount)}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-ink-500">
                  <span>{a.requestedBy}</span>
                  {a.fundingSource && <span>Source: <strong className="text-ink-700">{a.fundingSource}</strong></span>}
                  {a.priority === 'urgent' && <span className="text-red-600 font-semibold">Urgent</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Funding Gap Analysis */}
          <div className={`rounded-xl p-4 border ${fundingGap.gap > 0 ? 'bg-accent-50 border-accent-200' : 'bg-sage-50 border-sage-200'}`}>
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Funding Gap Analysis</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Total Future Replacements</span>
                <span className="font-bold text-ink-900">{fmt(fundingGap.totalFutureReplacements)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">30-Year Contributions</span>
                <span className="font-medium text-sage-600">{fmt(fundingGap.thirtyYearContrib)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Current Reserve Balance</span>
                <span className="font-medium text-sage-600">{fmt(fundingGap.totalReserveFunding)}</span>
              </div>
              <div className="border-t border-ink-200 pt-2 flex justify-between">
                <span className="font-bold text-ink-800">Projected Gap / Surplus</span>
                <span className={`font-bold text-lg ${fundingGap.gap > 0 ? 'text-accent-600' : 'text-sage-600'}`}>
                  {fundingGap.gap > 0 ? '-' : '+'}{fmt(Math.abs(fundingGap.gap))}
                </span>
              </div>
            </div>
          </div>

          {/* Budget Integration */}
          <div className="bg-mist-50 border border-mist-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Budget Integration</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Annual Reserve Contribution</span>
                <span className="font-bold text-ink-900">{fmt(annualContribution)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Annual Maintenance (All Assets)</span>
                <span className="font-medium text-ink-700">{fmt(assets.reduce((s, a) => s + a.annualMaintenanceCost, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Annual Operating (All Assets)</span>
                <span className="font-medium text-ink-700">{fmt(assets.reduce((s, a) => s + a.annualOperatingCost, 0))}</span>
              </div>
              <div className="border-t border-mist-200 pt-2 flex justify-between">
                <span className="font-bold text-ink-800">Total Annual Asset Cost</span>
                <span className="font-bold text-ink-900">{fmt(assets.reduce((s, a) => s + totalAnnualCost(a), 0) + annualContribution)}</span>
              </div>
            </div>
          </div>

          {/* Deferred Risk */}
          {deferredRiskAssets.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-2">Deferred Replacement Risk ({deferredRiskAssets.length})</h4>
              <p className="text-xs text-red-600 mb-3">Assets past useful life or in poor/critical condition create compounding financial and safety risk.</p>
              <div className="space-y-2">
                {deferredRiskAssets.map(a => (
                  <div key={a.id} className="bg-white rounded-lg p-3 border border-red-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[a.condition]}`} />
                        <span className="text-sm font-medium text-ink-900">{a.name}</span>
                      </div>
                      <span className="text-xs font-bold text-red-600">{fmt(a.replacementCostToday)}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-ink-500">
                      <span>{a.condition}</span>
                      <span>{a.remainingLifeYears <= 0 ? 'Past end of life' : `${a.remainingLifeYears} yr left`}</span>
                      <span>Criticality: {a.criticality}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-module link buttons */}
          <div className="bg-white border border-ink-100 rounded-xl p-4">
            <h4 className="text-sm font-bold text-ink-800 uppercase tracking-wider mb-3">Related Modules</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Reserve Fund', desc: 'View reserve items & funding', color: 'bg-sage-50 border-sage-100 hover:bg-sage-100' },
                { label: 'Budget', desc: 'Operating budget categories', color: 'bg-mist-50 border-mist-100 hover:bg-mist-100' },
                { label: 'Spending Approvals', desc: 'Capital project approvals', color: 'bg-accent-50 border-accent-100 hover:bg-accent-100' },
                { label: 'Maintenance', desc: 'Scheduled maintenance tasks', color: 'bg-purple-50 border-purple-100 hover:bg-purple-100' },
                { label: 'Insurance', desc: 'Asset insurance coverage', color: 'bg-red-50 border-red-100 hover:bg-red-100' },
                { label: 'Vendors', desc: 'Service providers', color: 'bg-cyan-50 border-cyan-100 hover:bg-cyan-100' },
              ].map(link => (
                <div key={link.label} className={`rounded-lg p-3 border cursor-pointer transition-colors ${link.color}`}>
                  <p className="text-sm font-medium text-ink-900">{link.label}</p>
                  <p className="text-[10px] text-ink-400 mt-0.5">{link.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Maintenance Calendar sub-view
// ═══════════════════════════════════════════════════

function MaintenanceCalendarView({
  store,
}: {
  store: ReturnType<typeof useBuildingStore.getState>;
}) {
  const [viewMode, setViewMode] = useState<'12-month' | 'monthly-list' | 'timeline'>('12-month');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Project all maintenance events for the selected year
  const calendarEvents = useMemo(() => {
    const events: { date: Date; month: number; task: string; assetName: string; category: string; status: string; frequency: string; vendor: string; cost: string; scheduleId: string; isOverdue: boolean }[] = [];

    const freqMonths: Record<string, number> = { monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12 };

    store.maintenanceSchedules.forEach(schedule => {
      // Find owning asset
      const owningAsset = store.assets.find(a => a.maintenanceScheduleIds.includes(schedule.id));
      const assetName = owningAsset?.name || 'Unlinked';

      const nextDueDate = new Date(schedule.nextDue);
      if (isNaN(nextDueDate.getTime())) return;

      const intervalMonths = freqMonths[schedule.frequency] || 12;

      // Project occurrences forward and backward from nextDue to cover selected year
      const yearStart = new Date(selectedYear, 0, 1);
      const yearEnd = new Date(selectedYear, 11, 31);

      // Go backward from nextDue
      const occurrences: Date[] = [];
      let d = new Date(nextDueDate);
      // Go backward until before yearStart
      while (d >= yearStart) {
        if (d <= yearEnd) occurrences.push(new Date(d));
        d = new Date(d);
        d.setMonth(d.getMonth() - intervalMonths);
      }
      // Go forward from nextDue
      d = new Date(nextDueDate);
      d.setMonth(d.getMonth() + intervalMonths);
      while (d <= yearEnd) {
        if (d >= yearStart) occurrences.push(new Date(d));
        d = new Date(d);
        d.setMonth(d.getMonth() + intervalMonths);
      }

      occurrences.forEach(occ => {
        const isOverdue = occ < new Date() && schedule.status !== 'completed';
        events.push({
          date: occ,
          month: occ.getMonth(),
          task: schedule.task,
          assetName,
          category: schedule.category,
          status: isOverdue ? 'overdue' : schedule.status,
          frequency: schedule.frequency,
          vendor: schedule.vendor,
          cost: schedule.estimatedCost,
          scheduleId: schedule.id,
          isOverdue,
        });
      });
    });

    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    return events;
  }, [store.maintenanceSchedules, store.assets, selectedYear]);

  // Group by month
  const eventsByMonth = useMemo(() => {
    const grouped: Record<number, typeof calendarEvents> = {};
    for (let m = 0; m < 12; m++) grouped[m] = [];
    calendarEvents.forEach(e => grouped[e.month].push(e));
    return grouped;
  }, [calendarEvents]);

  // KPIs
  const totalEvents = calendarEvents.length;
  const totalCost = useMemo(() => calendarEvents.reduce((s, e) => {
    const num = parseFloat(e.cost.replace(/[^0-9.]/g, ''));
    return s + (isNaN(num) ? 0 : num);
  }, 0), [calendarEvents]);
  const overdueCount = calendarEvents.filter(e => e.isOverdue).length;
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingCount = calendarEvents.filter(e => e.date >= now && e.date <= thirtyDaysOut).length;

  // Unique schedules for timeline view
  const uniqueSchedules = useMemo(() => {
    const map = new Map<string, { scheduleId: string; task: string; assetName: string; frequency: string; category: string }>();
    calendarEvents.forEach(e => {
      if (!map.has(e.scheduleId)) {
        map.set(e.scheduleId, { scheduleId: e.scheduleId, task: e.task, assetName: e.assetName, frequency: e.frequency, category: e.category });
      }
    });
    return Array.from(map.values());
  }, [calendarEvents]);

  return (
    <div className="space-y-5">
      {/* Year selector + view mode toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedYear(y => y - 1)} className="px-2 py-1 bg-ink-100 rounded hover:bg-ink-200 text-sm font-medium text-ink-700">&larr;</button>
          <span className="text-lg font-bold text-ink-900 min-w-[4rem] text-center">{selectedYear}</span>
          <button onClick={() => setSelectedYear(y => y + 1)} className="px-2 py-1 bg-ink-100 rounded hover:bg-ink-200 text-sm font-medium text-ink-700">&rarr;</button>
        </div>
        <div className="flex items-center gap-1 bg-mist-50 rounded-lg p-1">
          {([['12-month', '12-Month Grid'], ['monthly-list', 'Monthly List'], ['timeline', 'Timeline']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 border border-ink-100">
          <p className="text-xs text-ink-400">Total Events This Year</p>
          <p className="text-lg font-bold text-ink-900">{totalEvents}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-ink-100">
          <p className="text-xs text-ink-400">Est. Total Cost</p>
          <p className="text-lg font-bold text-ink-900">${totalCost.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-ink-100">
          <p className="text-xs text-ink-400">Overdue Tasks</p>
          <p className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-sage-600'}`}>{overdueCount}</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-ink-100">
          <p className="text-xs text-ink-400">Upcoming (30 days)</p>
          <p className="text-lg font-bold text-ink-900">{upcomingCount}</p>
        </div>
      </div>

      {/* ── 12-Month Grid ── */}
      {viewMode === '12-month' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {MONTH_NAMES.map((name, i) => {
            const monthEvents = eventsByMonth[i];
            const hasOverdue = monthEvents.some(e => e.isOverdue);
            return (
              <div key={i} className={`rounded-xl border p-3 ${hasOverdue ? 'border-red-200 bg-red-50 bg-opacity-40' : 'border-ink-100 bg-white'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-ink-800">{name}</span>
                  {monthEvents.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${hasOverdue ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-600'}`}>{monthEvents.length}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {monthEvents.map((e, j) => {
                    const catColor = CAT_COLORS_MAINT[e.category] || AMENITY_MAINT_COLOR;
                    const statusCfg = STATUS_CONFIG[e.status as keyof typeof STATUS_CONFIG];
                    const dotColor = statusCfg?.dot || (e.isOverdue ? 'bg-red-500' : 'bg-ink-300');
                    return (
                      <span key={j} className={`w-2.5 h-2.5 rounded-full ${dotColor}`} title={`${e.task} (${e.assetName})`} />
                    );
                  })}
                </div>
                {monthEvents.length === 0 && <p className="text-[10px] text-ink-300 italic">No events</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Monthly List ── */}
      {viewMode === 'monthly-list' && (
        <div className="space-y-4">
          {MONTH_NAMES.map((name, i) => {
            const monthEvents = eventsByMonth[i];
            return (
              <div key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-bold text-ink-800">{name}</h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-ink-100 text-ink-600">{monthEvents.length}</span>
                </div>
                {monthEvents.length === 0 && <p className="text-xs text-ink-300 italic ml-1">No scheduled events</p>}
                {monthEvents.map((e, j) => {
                  const catColor = CAT_COLORS_MAINT[e.category] || AMENITY_MAINT_COLOR;
                  const statusCfg = STATUS_CONFIG[e.status as keyof typeof STATUS_CONFIG];
                  const statusColor = statusCfg?.color || 'bg-ink-100 text-ink-600';
                  const statusLabel = statusCfg?.label || e.status;
                  return (
                    <div key={j} className={`flex items-center justify-between rounded-lg border px-3 py-2 mb-1.5 ${e.isOverdue ? 'border-red-200 bg-red-50 bg-opacity-40' : 'border-ink-100 bg-white'}`}>
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        <span className="text-xs text-ink-400 font-mono w-20 shrink-0">{e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span className="text-sm font-medium text-ink-900 truncate">{e.task}</span>
                        <span className="text-xs text-ink-500 truncate">{e.assetName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catColor}`}>{e.category}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusColor}`}>{statusLabel}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-ink-500 shrink-0 ml-2">
                        <span>{FREQ_LABELS[e.frequency] || e.frequency}</span>
                        {e.vendor && <span>{e.vendor}</span>}
                        <span className="font-medium text-ink-700">{e.cost}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Timeline / Gantt ── */}
      {viewMode === 'timeline' && (
        <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50">
                  <th className="text-left py-2 px-3 text-xs font-bold text-ink-600 uppercase tracking-wider min-w-[200px] sticky left-0 bg-ink-50 z-10">Task</th>
                  {MONTH_NAMES.map((name, i) => (
                    <th key={i} className="text-center py-2 px-1 text-[10px] font-bold text-ink-500 uppercase w-16">{name.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uniqueSchedules.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-6 text-ink-400 text-sm">No maintenance schedules to display.</td></tr>
                )}
                {uniqueSchedules.map(sched => {
                  const catColor = CAT_COLORS_MAINT[sched.category] || AMENITY_MAINT_COLOR;
                  // Which months have an occurrence?
                  const monthHits = new Set<number>();
                  const monthOverdue = new Set<number>();
                  calendarEvents.filter(e => e.scheduleId === sched.scheduleId).forEach(e => {
                    monthHits.add(e.month);
                    if (e.isOverdue) monthOverdue.add(e.month);
                  });
                  return (
                    <tr key={sched.scheduleId} className="border-b border-ink-50 hover:bg-mist-50">
                      <td className="py-2 px-3 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-ink-900 truncate max-w-[120px]">{sched.task}</span>
                          <span className="text-[10px] text-ink-400 truncate max-w-[80px]">{sched.assetName}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${catColor}`}>{FREQ_LABELS[sched.frequency] || sched.frequency}</span>
                        </div>
                      </td>
                      {Array.from({ length: 12 }, (_, m) => (
                        <td key={m} className="text-center py-2 px-1">
                          {monthHits.has(m) && (
                            <span className={`inline-block w-3 h-3 rounded-full ${monthOverdue.has(m) ? 'bg-red-500' : catColor.split(' ')[0].replace('text-', 'bg-').replace('100', '500')}`} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
