/**
 * Parity flow manifest — the flows every phase must keep working, with the
 * step count a person needs in production and in the redesign. A redesign
 * count above production is a UX regression and fails the parity test.
 *
 * `after` names what must be equal once the flow has run on either screen.
 * `phase` is the migration phase that owns the flow's new screen.
 * `prodSteps` is null for flows production does not have.
 */
export type ParityRole = 'Treasurer' | 'Secretary' | 'President' | 'Board member' | 'Owner' | 'Admin';

export interface ParityFlow {
  id: string;
  name: string;
  role: ParityRole | ParityRole[];
  prodSteps: number | null;
  redesignSteps: number;
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  after: string[];
  integration?: 'stripe' | 'chargebee' | 'mail' | 'email' | 'calendar';
}

export const PARITY_FLOWS: ParityFlow[] = [
  { id: 'record-check', name: 'Record a dues payment by check', role: 'Treasurer', prodSteps: 3, redesignSteps: 3, phase: 2, after: ['unit_invoices.status', 'ledger entries', 'owner receipt email'] },
  { id: 'owner-pays-card', name: 'Owner pays an invoice by card', role: 'Owner', prodSteps: 4, redesignSteps: 3, phase: 2, after: ['Stripe charge', 'webhook ledger entry', 'invoice closed'], integration: 'stripe' },
  { id: 'owner-autopay', name: 'Owner sets up autopay', role: 'Owner', prodSteps: 4, redesignSteps: 3, phase: 2, after: ['saved payment method', 'autopay flag persists'], integration: 'stripe' },
  { id: 'refund', name: 'Refund a payment', role: 'Treasurer', prodSteps: 3, redesignSteps: 2, phase: 2, after: ['Stripe refund', 'reversing ledger entry'], integration: 'stripe' },
  { id: 'approve-bill', name: 'Approve a bill and pay', role: 'Treasurer', prodSteps: 3, redesignSteps: 2, phase: 2, after: ['work_orders.status', 'GL posting'] },
  { id: 'spending-decision', name: 'Decide a spending request', role: 'Board member', prodSteps: 4, redesignSteps: 2, phase: 2, after: ['spending_approvals vote', 'case decision trail'] },
  { id: 'reserve-contribution', name: 'Change the reserve contribution', role: 'Treasurer', prodSteps: 3, redesignSteps: 2, phase: 2, after: ['budget allocation', 'reserve projection'] },
  { id: 'statement-packet', name: 'Generate the monthly statement packet', role: 'Treasurer', prodSteps: 3, redesignSteps: 2, phase: 2, after: ['report rows', 'PDF bytes'] },
  { id: 'mark-filed', name: 'Mark a filing filed with proof', role: 'Secretary', prodSteps: 3, redesignSteps: 2, phase: 3, after: ['regulatory_filings.status', 'attachment'] },
  { id: 'schedule-meeting', name: 'Schedule a meeting with notice', role: 'Secretary', prodSteps: 5, redesignSteps: 4, phase: 4, after: ['meetings row', 'notice sent', 'calendar feed entry'], integration: 'calendar' },
  { id: 'approve-minutes', name: 'Approve minutes', role: 'President', prodSteps: 3, redesignSteps: 2, phase: 4, after: ['minutes status', 'posted to owners'] },
  { id: 'owner-vote', name: 'Create, open and certify an owner vote', role: 'Secretary', prodSteps: 6, redesignSteps: 5, phase: 4, after: ['elections rows', 'ballots', 'certification'] },
  { id: 'board-vote', name: 'Cast a board vote', role: 'Board member', prodSteps: 3, redesignSteps: 1, phase: 5, after: ['vote recorded on the case', 'Community › Votes outcome'] },
  { id: 'create-case', name: 'Create a case from a situation', role: 'Treasurer', prodSteps: 4, redesignSteps: 4, phase: 5, after: ['cases row', 'case_steps rows'] },
  { id: 'demand-letter', name: 'Send a demand letter', role: 'Treasurer', prodSteps: 4, redesignSteps: 3, phase: 5, after: ['generated_letters', 'LetterStream job', 'status'], integration: 'mail' },
  { id: 'owner-request', name: 'Submit and answer an owner request', role: ['Owner', 'Board member'], prodSteps: 5, redesignSteps: 4, phase: 5, after: ['issues row', 'SLA', 'status email'], integration: 'email' },
  { id: 'post-notice', name: 'Post a notice', role: 'Board member', prodSteps: 3, redesignSteps: 2, phase: 4, after: ['announcements row', 'digest'], integration: 'email' },
  { id: 'invite-user', name: 'Invite a user', role: 'Admin', prodSteps: 3, redesignSteps: 3, phase: 6, after: ['invite email', 'pending row'], integration: 'email' },
  { id: 'change-tier', name: 'Change subscription tier', role: 'Admin', prodSteps: 3, redesignSteps: 2, phase: 6, after: ['Chargebee subscription', 'tenant tier'], integration: 'chargebee' },
  { id: 'resale-certificate', name: 'Request a resale certificate', role: 'Owner', prodSteps: null, redesignSteps: 1, phase: 3, after: ['runbook instance', 'packet', 'certificate draft'] },
];

/** Flows whose redesign step count is worse than production. Must be empty. */
export function regressions(flows: ParityFlow[] = PARITY_FLOWS): ParityFlow[] {
  return flows.filter(f => f.prodSteps !== null && f.redesignSteps > f.prodSteps);
}

/** Flows that touch an integration and therefore need a sandbox smoke test. */
export function integrationFlows(flows: ParityFlow[] = PARITY_FLOWS): ParityFlow[] {
  return flows.filter(f => f.integration);
}
