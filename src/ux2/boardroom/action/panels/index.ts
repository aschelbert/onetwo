import type { Panel } from '../RecordAction';
import { BID_REQUEST_PANELS } from './BidRequestPanels';
import { REPAIR_PANELS } from './RepairPanels';
import { INSPECTION_PANELS } from './InspectionPanels';

/** The work for each step of each record-backed action, by kind and step key. */
export const PANELS: Record<string, Record<string, Panel>> = {
  'bid-request': BID_REQUEST_PANELS,
  repair: REPAIR_PANELS,
  inspection: INSPECTION_PANELS,
};
