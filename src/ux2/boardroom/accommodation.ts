/**
 * Accommodation requests, wired. A request a resident makes in the app is
 * their own record (kind 'accommodation-ask', carrying their unit so they can
 * read it); the board works it in a private record of kind 'accommodation',
 * which carries no unit and a title with no name in it. As the board's record
 * moves, the resident's is told where it stands, and the decision only once
 * they have been told it.
 */
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { ASK_KIND, DEFAULT_TARGET_DAYS, askView, dueFor, type AccommodationAsk, type AccommodationData, type RequestKind } from '@/lib/actions/accommodation';
import { todayIso } from '../runbook/adapters';
import { SYNC, TRIGGERS, startAction } from './recordActions';

export const ACCOMMODATION_SETTINGS = 'accommodation-settings';
export interface AccommodationSettings { targetDays: number; managerSees: boolean }
export const settingsFrom = (data: unknown): AccommodationSettings => ({ targetDays: DEFAULT_TARGET_DAYS, managerSees: false, ...((data as Partial<AccommodationSettings>) ?? {}) });
export const accommodationSettings = (): AccommodationSettings => settingsFrom(useActionRecordsStore.getState().doc(ACCOMMODATION_SETTINGS)?.data);
export const saveAccommodationSettings = (changes: Partial<AccommodationSettings>, today: string = todayIso()) =>
  useActionRecordsStore.getState().setDoc(ACCOMMODATION_SETTINGS, 'Accommodation requests: who sees them', { ...accommodationSettings(), ...changes } as unknown as Record<string, unknown>, today);

/** Whether the person signed in may see these requests: board members always, the manager only if the board said so. Owners never. */
export function mayHandle(role: string | undefined, s: AccommodationSettings = accommodationSettings()): boolean {
  if (role === 'BOARD_MEMBER' || role === 'PLATFORM_ADMIN') return true;
  return role === 'PROPERTY_MANAGER' && s.managerSees;
}

const all = () => useActionRecordsStore.getState().records;
/** A title that says nothing about who asked or for what: "Request 3 of 2026". */
export function neutralTitle(today: string): string {
  const year = today.slice(0, 4);
  return `Request ${all().filter(r => r.kind === 'accommodation' && r.openedOn.startsWith(year)).length + 1} of ${year}`;
}

/** Start the board's record for a request, however it arrived. The unit goes in the data, never on the record. */
export function startAccommodation(d: Partial<AccommodationData>, today: string = todayIso()) {
  const receivedOn = d.receivedOn || today;
  return startAction('accommodation', neutralTitle(today), { ...d, receivedOn }, { dueOn: dueFor(receivedOn, accommodationSettings().targetDays) }, today);
}

/** A resident makes a request in the app: their own record, which the board's trigger picks up. */
export function askForAccommodation(a: { what: string; kind: RequestKind; unit: string; onBehalfOf: string }, today: string = todayIso()): string {
  const me = useAuthStore.getState().currentUser;
  const data: AccommodationAsk = { what: a.what.trim(), kind: a.kind, by: me.name, byUser: me.id, onBehalfOf: a.onBehalfOf.trim(), askedOn: today, stage: 'received', decision: '', decidedOn: '', conditions: '', recordId: '' };
  return useActionRecordsStore.getState().add({ kind: ASK_KIND, title: 'Your request', unit: a.unit, openedOn: today, dueOn: '', closedOn: '', data: data as unknown as Record<string, unknown> });
}

/** The requests the people in these units made in the app, newest first. */
export const asksFor = (units: string[]) => all().filter(r => r.kind === ASK_KIND && units.includes(r.unit)).sort((a, b) => b.openedOn.localeCompare(a.openedOn));

// A request made in the app gets the board's private record, once, when someone who may handle it is signed in.
TRIGGERS.push((today: string) => {
  if (useFinancialStore.getState().runbooksOff.includes('accommodation-request')) return;
  if (!mayHandle(useAuthStore.getState().currentUser?.role)) return;
  for (const ask of all().filter(r => r.kind === ASK_KIND)) {
    const a = ask.data as unknown as AccommodationAsk;
    if (a.recordId || all().some(r => r.kind === 'accommodation' && (r.data as unknown as AccommodationData).askId === ask.id)) continue;
    const { recordId } = startAccommodation({ what: a.what, kind: a.kind, unit: ask.unit, requester: a.onBehalfOf || a.by, onBehalfBy: a.onBehalfOf ? a.by : '', how: 'app', receivedOn: a.askedOn, askId: ask.id }, today);
    if (recordId) useActionRecordsStore.getState().patchData(ask.id, { recordId });
  }
});

// The resident's record follows the board's: the stage as it moves, the decision once they have been told. The action closes when the change is in place.
SYNC.accommodation = (r, today) => {
  const d = r.data as unknown as AccommodationData;
  const store = useActionRecordsStore.getState();
  if (d.askId) {
    const ask = store.records.find(x => x.id === d.askId);
    const now = ask?.data as unknown as AccommodationAsk | undefined;
    const next = askView(d);
    if (ask && now && (now.stage !== next.stage || now.decision !== next.decision || now.decidedOn !== next.decidedOn || now.conditions !== next.conditions)) store.patchData(ask.id, next as unknown as Record<string, unknown>);
    if (ask && !ask.closedOn && (next.stage === 'in-place' || (next.stage === 'decided' && d.decision === 'deny'))) store.patch(ask.id, { closedOn: today });
  }
  const finished = !!d.toldOn && (d.decision === 'deny' || !!d.inPlaceOn);
  if (finished && !r.closedOn) store.patch(r.id, { closedOn: today });
};
