// src/store/resetStores.ts
// Clears all seed/demo data from Zustand stores for real Supabase tenants.
// Called in TenantProvider BEFORE schema probe and loadFromDb() calls so that
// new buildings start with a clean slate even if the operational schema isn't ready yet.

import { useBuildingStore } from './useBuildingStore';
import { useFinancialStore } from './useFinancialStore';
import { DEFAULT_GL_MAPPING } from '@/lib/financial-logic';
import { useMeetingsStore } from './useMeetingsStore';
import { useComplianceStore } from './useComplianceStore';
import { useIssuesStore } from './useIssuesStore';
import { useVendorTrackerStore } from './useVendorTrackerStore';
import { useSpendingStore } from './useSpendingStore';
import { usePropertyLogStore } from './usePropertyLogStore';
import { useReportStore } from './useReportStore';
import { useScorecardStore } from './useScorecardStore';
import { useCommunicationsStore } from './useCommunicationsStore';
import { useAmenitiesStore } from './useAmenitiesStore';
import { usePayrollStore } from './usePayrollStore';
import { useTaskTrackingStore } from './useTaskTrackingStore';
import { useFeeScheduleStore } from './useFeeScheduleStore';
import { useLetterStore } from './useLetterStore';
import { useCaseDockStore } from '@/ux2/shell/caseDock';
import { useSetupStore } from '@/features/setup/useSetupStore';

export function resetStoresForRealTenant() {
  // The case dock remembers case ids per browser; another building's ids mean nothing here.
  useCaseDockStore.getState().reset();
  useSetupStore.getState().reset();

  useBuildingStore.setState({
    name: '',
    address: { street: '', city: '', state: '', zip: '' },
    details: {
      yearBuilt: '', totalUnits: 0, floors: 0, type: '', sqft: '',
      lotSize: '', parking: '', architect: '', contractor: '',
      amenities: [], entityType: 'incorporated' as const, fiscalYearEnd: '12-31',
    },
    board: [],
    management: {
      company: '', contact: '', title: '', email: '', phone: '',
      emergency: '', address: '', hours: '', afterHours: '',
    },
    legalCounsel: [],
    legalDocuments: [],
    insurance: [],
    vendors: [],
    assets: [],
    governingClauses: [],
  });

  // The financial store is persisted under one localStorage key for every
  // building opened in this browser, so per-building settings have to be
  // cleared here too, or the previous building's Stripe account, billing
  // automation and late-fee rules show up on a building that has none.
  // loadFromSupabase() only overwrites them when a financial_settings row
  // exists, which a freshly provisioned building does not have yet.
  useFinancialStore.setState({
    units: [],
    budgetCategories: [],
    reserveItems: [],
    generalLedger: [],
    workOrders: [],
    unitInvoices: [],
    unitDocuments: [],
    moveEvents: [],
    hoaDueDay: 15,
    annualReserveContribution: 0,
    stripeConnectId: null,
    stripeOnboardingComplete: false,
    autoBillingEnabled: false,
    lastBillingRun: null,
    lateFeeEnabled: false,
    lateFeeAmount: 25,
    lateFeeGraceDays: 15,
    lastLateFeeRun: null,
    closedThrough: null,
    autoReserveTransfer: true,
    paymentOrder: 'dues-first',
    glAccountMapping: { ...DEFAULT_GL_MAPPING },
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

  useAmenitiesStore.setState({ configs: [], reservations: [], notifications: [] });

  usePayrollStore.setState({ staff: [], timeEntries: [], payRuns: [], form1099s: [] });

  useTaskTrackingStore.setState({ tasks: [] });

  // The fee schedule shows the defaults until the building's own rows load.
  useFeeScheduleStore.getState().reset();

  // Letter templates show the built-ins until the building's own rows load; its letters are its own.
  useLetterStore.getState().reset();
  // Note: stripeAccountId, stripeOnboardingComplete on staff, and paymentMethod,
  // stripeTransferId, withholdingGlEntryId on payRuns are cleared when arrays empty.
}
