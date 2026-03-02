// src/store/resetStores.ts
// Clears all seed/demo data from Zustand stores for real Supabase tenants.
// Called in TenantProvider BEFORE schema probe and loadFromDb() calls so that
// new buildings start with a clean slate even if the operational schema isn't ready yet.

import { useBuildingStore } from './useBuildingStore';
import { useFinancialStore } from './useFinancialStore';
import { useMeetingsStore } from './useMeetingsStore';
import { useComplianceStore } from './useComplianceStore';
import { useIssuesStore } from './useIssuesStore';
import { useVendorTrackerStore } from './useVendorTrackerStore';
import { useSpendingStore } from './useSpendingStore';
import { usePropertyLogStore } from './usePropertyLogStore';
import { useReportStore } from './useReportStore';
import { useScorecardStore } from './useScorecardStore';
import { useCommunicationsStore } from './useCommunicationsStore';

export function resetStoresForRealTenant() {
  useBuildingStore.setState({
    board: [],
    management: {
      company: '', contact: '', title: '', email: '', phone: '',
      emergency: '', address: '', hours: '', afterHours: '',
    },
    legalCounsel: [],
    legalDocuments: [],
    insurance: [],
    vendors: [],
  });

  useFinancialStore.setState({
    units: [],
    budgetCategories: [],
    reserveItems: [],
    generalLedger: [],
    workOrders: [],
    unitInvoices: [],
    hoaDueDay: 15,
    annualReserveContribution: 0,
  });

  useMeetingsStore.setState({ meetings: [] });

  useComplianceStore.setState({
    completions: {},
    filings: [],
    communications: [],
    announcements: [],
    itemAttachments: {},
  });

  useIssuesStore.setState({
    cases: [],
    issues: [],
    nextCaseNum: 1,
    nextIssueNum: 1,
    nextCommNum: 1,
  });

  useVendorTrackerStore.setState({ bids: [], reviews: [], contracts: [] });

  useSpendingStore.setState({ approvals: [] });

  usePropertyLogStore.setState({ logs: [] });

  useReportStore.setState({ configs: [], reports: [] });

  useScorecardStore.setState({ entries: [], reviews: [] });

  useCommunicationsStore.setState({ communications: [] });
}
