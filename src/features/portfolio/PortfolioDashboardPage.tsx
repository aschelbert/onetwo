import { usePMContext } from '@/components/PMProvider';
import { LayoutDashboard, Building2, CheckCircle } from 'lucide-react';

export default function PortfolioDashboardPage() {
  const { company, buildings, activeBuildingId } = usePMContext();

  const activeBuilding = activeBuildingId
    ? buildings.find(b => b.tenantId === activeBuildingId)
    : null;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-ink-900">Portfolio Dashboard</h1>
        <p className="text-sm text-ink-500 mt-1">{company.name}</p>
      </div>

      {/* Verification card */}
      <div className="bg-white rounded-xl border border-ink-100 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-sage-100 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-sage-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Routing Verified</h2>
            <p className="text-sm text-ink-500 mt-1">
              The Property Portfolio module is connected and rendering correctly.
              PM auth routing, context provider, and layout shell are all working.
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-ink-100 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-navy-600" />
            <span className="text-sm font-medium text-ink-500">Buildings</span>
          </div>
          <p className="text-2xl font-bold text-ink-900">{buildings.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-ink-100 p-5">
          <div className="flex items-center gap-3 mb-2">
            <LayoutDashboard className="w-5 h-5 text-navy-600" />
            <span className="text-sm font-medium text-ink-500">Active Filter</span>
          </div>
          <p className="text-lg font-bold text-ink-900 truncate">
            {activeBuilding ? activeBuilding.name : 'All Buildings'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-ink-100 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-navy-600" />
            <span className="text-sm font-medium text-ink-500">Total Units</span>
          </div>
          <p className="text-2xl font-bold text-ink-900">
            {activeBuilding
              ? activeBuilding.totalUnits
              : buildings.reduce((sum, b) => sum + b.totalUnits, 0)}
          </p>
        </div>
      </div>

      {/* Placeholder */}
      <div className="bg-white rounded-xl border border-ink-100 p-8 text-center">
        <p className="text-ink-400 text-sm">
          Milestone 3 content — Case Queue, Compliance, Task Tracking, and more — will render here.
        </p>
      </div>
    </div>
  );
}
