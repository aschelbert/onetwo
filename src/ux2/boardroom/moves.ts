/**
 * The move in or out runbook, wired: a move on the calendar (Funds › Units
 * › Moves) gets its case as soon as it is scheduled, with the move playbook
 * (the case wizard's own situation: elevator, deposit, insurance, access,
 * inspection, record). The move record carries each of those as a field,
 * so the app ticks every step as the manager fills the record in. One case
 * per move; the move keeps the case's id so each shows the other.
 *
 * The database opens the same case every morning (run_move, migration
 * 056); the app fills in the playbook and ticks it when it loads the case.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import type { CaseTrackerCase } from '@/types/issues';
import type { MoveEvent } from '@/types/financial';
import { addDays } from '@/lib/billingCycle';
import { ISO_DATE, todayIso } from '../runbook/adapters';

export const MOVE_ID = 'move';
export const MOVE_SIT = 'scheduled-move';
/** A move older than this has nothing left to run. */
export const MOVE_LOOKBACK_DAYS = 30;
export const moveSourceId = (eventId: string) => `${MOVE_ID}:${eventId}`;

export const moveCase = (cases: CaseTrackerCase[], eventId: string) => cases.find(c => c.source === 'runbook' && c.sourceId === moveSourceId(eventId));
export const moveDue = (e: MoveEvent, today: string) => ISO_DATE.test(e.scheduledDate) && e.scheduledDate >= addDays(today, -MOVE_LOOKBACK_DAYS);

const tick = (c: CaseTrackerCase, re: RegExp) => { const i = (c.steps ?? []).findIndex(s => re.test(s.s)); if (i >= 0 && !c.steps![i].done) useIssuesStore.getState().completeStep(c.id, i); };

/** Tick every step the move record answers. */
export function syncMoveCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${MOVE_ID}:`)) return;
  const e = useFinancialStore.getState().moveEvents.find(x => x.id === c.sourceId!.slice(MOVE_ID.length + 1));
  if (!e) return;
  if (e.elevatorSlot || e.timeWindow) tick(c, /^schedule elevator reservation/i);
  if (e.depositStatus !== 'pending' || !(e.depositAmount > 0)) tick(c, /^collect move deposit/i);
  if (e.insuranceConfirmed) tick(c, /^confirm mover insurance/i);
  if (e.accessStatus !== 'pending') tick(c, /^issue or revoke building access/i);
  if (e.inspectionStatus === 'passed' || e.inspectionStatus === 'failed') tick(c, /^complete pre\/post-move inspection/i);
  if (e.depositStatus === 'refunded' || e.depositStatus === 'forfeited' || (!(e.depositAmount > 0) && (e.inspectionStatus === 'passed' || e.inspectionStatus === 'failed'))) tick(c, /^record move event/i);
}

export interface MoveRun { opened: string[] }

export function runMoves(today: string = todayIso()): MoveRun {
  const fin = useFinancialStore.getState();
  const out: MoveRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${MOVE_ID}:`)) syncMoveCase(c);
  if (fin.runbooksOff.includes(MOVE_ID)) return out;
  const managed = !!useBuildingStore.getState().management.company;
  for (const e of fin.moveEvents) {
    if (!moveDue(e, today)) continue;
    if (moveCase(useIssuesStore.getState().cases, e.id)) continue;
    const kind = e.moveType === 'in' ? 'Move in' : 'Move out';
    const id = useIssuesStore.getState().createCase({
      catId: 'admin',
      sitId: MOVE_SIT,
      approach: 'pre',
      title: `${kind} · Unit ${e.unitNumber} · ${e.scheduledDate}`,
      unit: e.unitNumber,
      owner: e.residentName || '',
      priority: 'medium',
      notes: `Opened by the Move in or out runbook on ${today}: ${e.residentName ? `${e.residentName} moves ${e.moveType}` : `a move ${e.moveType}`} for Unit ${e.unitNumber} on ${e.scheduledDate}${e.timeWindow ? `, ${e.timeWindow}` : ''}${e.moverName ? `, with ${e.moverName}` : ''}.${e.depositAmount > 0 ? ` Deposit ${e.depositAmount}.` : ''} The move record under Funds › Units carries the elevator slot, deposit, insurance, access and inspection; each step here ticks as it is filled in.${e.notes ? `\n\n${e.notes}` : ''}`,
      assignedRole: managed ? 'Property Manager' : 'Vice President',
      dueDate: e.scheduledDate,
      source: 'runbook',
      sourceId: moveSourceId(e.id),
    });
    out.opened.push(id);
    // The move shows its case, and the case its move.
    useFinancialStore.setState(s => ({ moveEvents: s.moveEvents.map(x => x.id === e.id ? { ...x, caseId: id } : x) }));
    if (fin.tenantId) void fin.updateMoveEvent(e.id, { caseId: id });
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncMoveCase(created);
  }
  return out;
}
