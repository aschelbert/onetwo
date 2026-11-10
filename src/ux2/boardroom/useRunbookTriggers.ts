/**
 * Runs the wired runbooks (month close, collections, insurance renewal,
 * year-end close, annual budget, filings, annual meeting, board meeting
 * cycle, inspections, 1099s, owner disclosure, resident requests, moves,
 * amenity bookings, vendor bids, work orders, spending requests) when a board member or manager opens the app, and
 * again as the data they watch changes (a payment lands, the books close, a
 * policy is renewed), so each case's automated steps tick as the work lands.
 * Everything it calls is idempotent (one case per trigger, a done step stays
 * done), so re-running is harmless. The database runs the same jobs every
 * morning; this is the fallback and either side finds the other's case.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { runMonthClose } from './monthClose';
import { runCollections } from './collections';
import { runInsuranceRenewal } from './insuranceRenewal';
import { runYearEndClose } from './yearEndClose';
import { runAnnualBudget } from './annualBudget';
import { runFilings } from './filings';
import { runAnnualMeeting, runBoardMeeting } from './meetings';
import { runBoilerFire, runElevatorInspection } from './inspections';
import { runForm1099 } from './form1099';
import { runOwnerDisclosure } from './ownerDisclosure';
import { runResidentRequest } from './residentRequest';
import { runMoves } from './moves';
import { runAmenityBooking } from './amenityBooking';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { runVendorBids } from './vendorBids';
import { runWorkOrders } from './workOrders';
import { runSpendingRequests } from './spendingRequest';
import { useMeetingsStore } from '@/store/useMeetingsStore';

/** Every wired runbook, once; each guards itself. */
export function runRunbookTriggers(today?: string): void {
  for (const [name, run] of [['month close', runMonthClose], ['collections', runCollections], ['insurance renewal', runInsuranceRenewal], ['year-end close', runYearEndClose], ['annual budget', runAnnualBudget], ['filings', runFilings], ['annual meeting', runAnnualMeeting], ['board meeting cycle', runBoardMeeting], ['elevator inspection', runElevatorInspection], ['boiler and fire systems', runBoilerFire], ['1099 filing', runForm1099], ['owner disclosure', runOwnerDisclosure], ['resident request', runResidentRequest], ['move in or out', runMoves], ['amenity booking', runAmenityBooking], ['vendor bids', runVendorBids], ['work order', runWorkOrders], ['spending request', runSpendingRequests]] as const) {
    try { run(today); } catch (err) { console.error(`[runbooks] ${name} failed:`, err); }
  }
}

export function useRunbookTriggers(enabled = true) {
  const role = useAuthStore(s => s.currentRole);
  const casesLoaded = useIssuesStore(s => s.casesLoaded);
  const startDay = useFinancialStore(s => s.monthCloseStartDay);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const invoices = useFinancialStore(s => s.unitInvoices);
  const units = useFinancialStore(s => s.units);
  const off = useFinancialStore(s => s.runbooksOff);
  const monthCloseEnabled = useFinancialStore(s => s.monthCloseEnabled);
  const insurance = useBuildingStore(s => s.insurance);
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd);
  const ledgerCount = useFinancialStore(s => s.generalLedger.length);
  const reserveAnnual = useFinancialStore(s => s.annualReserveContribution);
  const announcements = useComplianceStore(s => s.announcements);
  const filings = useComplianceStore(s => s.filings);
  const communications = useComplianceStore(s => s.communications);
  const meetings = useMeetingsStore(s => s.meetings);
  const cadence = useBuildingStore(s => s.details?.boardMeetingEveryDays);
  const schedules = useBuildingStore(s => s.maintenanceSchedules);
  const vendors = useBuildingStore(s => s.vendors);
  const workOrders = useFinancialStore(s => s.workOrders);
  const issues = useIssuesStore(s => s.issues);
  const moveEvents = useFinancialStore(s => s.moveEvents);
  const reservations = useAmenitiesStore(s => s.reservations);
  const approvals = useSpendingStore(s => s.approvals);
  const caseCount = useIssuesStore(s => s.cases);
  useEffect(() => {
    if (!enabled || !casesLoaded) return;
    if (role !== 'BOARD_MEMBER' && role !== 'PROPERTY_MANAGER' && role !== 'PM_COMPANY') return;
    runRunbookTriggers();
  }, [enabled, casesLoaded, role, startDay, closedThrough, invoices, units, off, monthCloseEnabled, insurance, fiscalYearEnd, ledgerCount, reserveAnnual, announcements, filings, communications, meetings, cadence, schedules, vendors, workOrders, issues, moveEvents, reservations, approvals, caseCount]);
}

/** The old name, for the month close alone. */
export const useMonthClose = useRunbookTriggers;
