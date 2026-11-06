import { useMemo } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { useTenantContext } from '@/components/TenantProvider';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { todayIso } from '../runbook/adapters';
import type { BuildingSnapshot } from './metrics';

/** Collect the Building snapshot from the building, compliance, vendor and financial stores. */
export function useBuildingSnapshot(today: string = todayIso()): BuildingSnapshot {
  const tenant = useTenantContext();
  const building = useBuildingStore();
  const completions = useComplianceStore(s => s.completions);
  const filings = useComplianceStore(s => s.filings);
  const contracts = useVendorTrackerStore(s => s.contracts);
  const workOrders = useFinancialStore(s => s.workOrders);

  const obligations = useMemo(() => refreshComplianceRequirements({
    state: building.address.state,
    legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: building.board.length,
    hasManagement: !!building.management.company,
  }).categories.flatMap(c => c.items), [building.address.state, building.legalDocuments, building.insurance, building.board.length, building.management.company]);

  return useMemo(() => ({
    today,
    name: tenant.name,
    address: building.address,
    details: { yearBuilt: building.details.yearBuilt, totalUnits: building.details.totalUnits, floors: building.details.floors, fiscalYearEnd: building.details.fiscalYearEnd, entityType: building.details.entityType },
    managementCompany: building.management.company,
    counselCount: building.legalCounsel.length,
    board: building.board,
    legalDocuments: building.legalDocuments,
    insurance: building.insurance,
    vendors: building.vendors,
    contracts,
    workOrders,
    obligations,
    completions,
    filings,
  }), [today, tenant.name, building.address, building.details, building.management.company, building.legalCounsel.length, building.board, building.legalDocuments, building.insurance, building.vendors, contracts, workOrders, obligations, completions, filings]);
}
