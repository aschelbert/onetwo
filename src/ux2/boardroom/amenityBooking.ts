/**
 * The amenity booking runbook, wired: a booking that needs the board
 * (status pending approval under Community › Amenities) gets one case:
 * approve or deny, invoice the fee and deposit, the day itself, the deposit
 * back. The app ticks the decision and the invoicing as the amenities page
 * does them; a booking with no deposit skips the refund. Bookings the app
 * approves on its own never need a case.
 *
 * Bookings live only in the app today (no database table), so this runbook
 * runs when a board member opens the app and has no morning twin.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAmenitiesStore, type Reservation } from '@/store/useAmenitiesStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const AMENITY_BOOKING_ID = 'amenity-booking';
export const AMENITY_BOOKING_SIT = 'runbook-amenity-booking';
export const bookingSourceId = (reservationId: string) => `${AMENITY_BOOKING_ID}:${reservationId}`;

export const STEP = { decide: 0, invoice: 1, day: 2, deposit: 3 } as const;

export const bookingCase = (cases: CaseTrackerCase[], reservationId: string) => cases.find(c => c.source === 'runbook' && c.sourceId === bookingSourceId(reservationId));
export const bookingNeedsBoard = (r: Reservation) => r.status === 'pending_approval';

export function bookingSteps(r: Reservation): { s: string; detail?: string; ck?: string[] }[] {
  const who = r.reservedByName || 'the owner';
  const unit = r.reservedByUnit ? ` (Unit ${r.reservedByUnit})` : '';
  return [
    { s: `Approve or deny ${who}'s ${r.amenityName} booking for ${r.date}`, detail: `Community › Amenities › Reservations. ${r.startTime} to ${r.endTime}${r.notes ? `; ${r.notes}` : ''}. This step ticks itself when the booking is approved or denied.` },
    { s: r.fee > 0 || r.deposit > 0 ? `Invoice ${who}${unit}: ${r.fee > 0 ? `the ${fmt(r.fee)} fee` : ''}${r.fee > 0 && r.deposit > 0 ? ' and ' : ''}${r.deposit > 0 ? `the ${fmt(r.deposit)} deposit` : ''}` : 'No fee or deposit to invoice', detail: 'The amenities page invoices on approval. This step ticks itself when the invoices exist.' },
    { s: `${r.date}: access and setup, then check the space afterwards`, ck: ['Access or key arranged', 'Space checked and any damage photographed'] },
    { s: r.deposit > 0 ? `Return the ${fmt(r.deposit)} deposit, or charge the damage against it` : 'No deposit to return', detail: r.deposit > 0 ? 'Refund from the unit ledger, or keep it with the damage noted on this action.' : 'This step ticks itself: there is no deposit.' },
  ];
}

/** Tick the steps the app can see: the decision, the invoices, a booking with nothing to refund. */
export function syncBookingCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${AMENITY_BOOKING_ID}:`)) return;
  const r = useAmenitiesStore.getState().reservations.find(x => x.id === c.sourceId!.slice(AMENITY_BOOKING_ID.length + 1));
  if (!r) return;
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.decide].done && r.status !== 'pending_approval') complete(c.id, STEP.decide);
  const invoiced = (r.fee <= 0 || !!r.invoiceId) && (r.deposit <= 0 || !!r.depositInvoiceId);
  if (!c.steps[STEP.invoice].done && (invoiced || r.status === 'denied' || r.status === 'cancelled')) complete(c.id, STEP.invoice);
  if (!c.steps[STEP.deposit].done && (r.deposit <= 0 || r.status === 'denied' || r.status === 'cancelled')) complete(c.id, STEP.deposit);
}

export interface BookingRun { opened: string[] }

export function runAmenityBooking(today: string = todayIso()): BookingRun {
  const fin = useFinancialStore.getState();
  const out: BookingRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${AMENITY_BOOKING_ID}:`)) syncBookingCase(c);
  if (fin.runbooksOff.includes(AMENITY_BOOKING_ID)) return out;
  for (const r of useAmenitiesStore.getState().reservations) {
    if (!bookingNeedsBoard(r)) continue;
    if (bookingCase(useIssuesStore.getState().cases, r.id)) continue;
    const id = useIssuesStore.getState().createCase({
      catId: 'operations',
      sitId: AMENITY_BOOKING_SIT,
      approach: 'pre',
      title: `Amenity booking · ${r.amenityName} · ${r.date}${r.reservedByUnit ? ` · Unit ${r.reservedByUnit}` : ''}`,
      unit: r.reservedByUnit || '',
      owner: r.reservedByName || '',
      priority: 'medium',
      notes: `Opened by the Amenity booking runbook on ${today}: ${r.reservedByName || 'an owner'}${r.reservedByUnit ? ` (Unit ${r.reservedByUnit})` : ''} asked for ${r.amenityName} on ${r.date}, ${r.startTime} to ${r.endTime}, and the booking needs the board's approval.${r.fee > 0 ? ` Fee ${fmt(r.fee)}.` : ''}${r.deposit > 0 ? ` Deposit ${fmt(r.deposit)}.` : ''}`,
      assignedRole: 'Secretary',
      dueDate: r.date,
      source: 'runbook',
      sourceId: bookingSourceId(r.id),
      customSteps: bookingSteps(r),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncBookingCase(created);
  }
  return out;
}
