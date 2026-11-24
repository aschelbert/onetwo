import type { Panel } from '../RecordAction';
import { BID_REQUEST_PANELS } from './BidRequestPanels';
import { REPAIR_PANELS } from './RepairPanels';
import { INSPECTION_PANELS } from './InspectionPanels';
import { FIRE_NOTICE_PANELS } from './FireNoticePanels';
import { RECORDS_REQUEST_PANELS } from './RecordsRequestPanels';
import { BUDGET_AMENDMENT_PANELS } from './BudgetAmendmentPanels';
import { PAYROLL_FILING_PANELS } from './PayrollFilingPanels';
import { UTILITY_SPIKE_PANELS } from './UtilitySpikePanels';
import { BENCHMARKING_PANELS } from './BenchmarkingPanels';
import { RESERVE_REVIEW_PANELS } from './ReserveReviewPanels';

/** The work for each step of each record-backed action, by kind and step key. */
export const PANELS: Record<string, Record<string, Panel>> = {
  'bid-request': BID_REQUEST_PANELS,
  repair: REPAIR_PANELS,
  inspection: INSPECTION_PANELS,
  'fire-notice': FIRE_NOTICE_PANELS,
  'records-request': RECORDS_REQUEST_PANELS,
  'budget-amendment': BUDGET_AMENDMENT_PANELS,
  'payroll-filing': PAYROLL_FILING_PANELS,
  'utility-spike': UTILITY_SPIKE_PANELS,
  benchmarking: BENCHMARKING_PANELS,
  'reserve-review': RESERVE_REVIEW_PANELS,
};
