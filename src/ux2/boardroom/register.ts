/**
 * The register runbooks, wired: a violation, an architectural request or a
 * resale certificate request entered under Board Room › Register gets one
 * action, with its steps, and the app ticks each step it can see from the
 * entry's own fields (the notice date, the hearing, the decision, the
 * delivery). When the matter ends, its action closes with the reason.
 *
 * They run in the app only, like the amenity bookings and the vendor bids:
 * there is no database twin, so an action opens when a board member or the
 * manager next opens the app. A lien has no action of its own; it belongs to
 * the unit's collections action, and the register watches for the release.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useRegisterStore } from '@/store/useRegisterStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import {
  RESALE_DAYS, architecturalStanding, cureBy, decisionDue, plusDays, resaleDue, resaleStanding, violationStanding,
  type ArchitecturalRequest, type RegisterEntry, type ResaleRequest, type Violation,
} from '@/lib/register';
import { resalePacket } from '../me/metrics';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const VIOLATION_ID = 'covenant-violation';
export const RESALE_ID = 'resale-certificate';
/** Architectural review is a wizard situation, not one of the catalogue runbooks; its runbook id is the situation's. */
export const ARCHITECTURAL_ID = 'sit-architectural-review';

export const VIOLATION_SIT = `runbook-${VIOLATION_ID}`;
export const RESALE_SIT = `runbook-${RESALE_ID}`;
export const ARCHITECTURAL_SIT = 'architectural-review';

const RUNBOOK_OF: Record<string, string> = { violation: VIOLATION_ID, resale: RESALE_ID, architectural: ARCHITECTURAL_ID };
export const registerSourceId = (e: Pick<RegisterEntry, 'kind' | 'id'>) => `${RUNBOOK_OF[e.kind]}:${e.id}`;
export const registerCase = (cases: CaseTrackerCase[], e: Pick<RegisterEntry, 'kind' | 'id'>) => cases.find(c => c.source === 'runbook' && c.sourceId === registerSourceId(e));

type Steps = { s: string; detail?: string; ck?: string[] }[];

export const V_STEP = { log: 0, notice: 1, reinspect: 2, hearingNotice: 3, hearing: 4, fine: 5 } as const;
export function violationSteps(v: Violation): Steps {
  const days = v.data.cureDays;
  return [
    { s: `Log the violation: ${v.title}`, detail: 'The rule, what was seen, when and by whom, under Board Room › Register. Done as this action opens.' },
    { s: `Send Unit ${v.unit} the notice of violation, with ${days} days to put it right`, detail: 'Board Room › Outbox has the notice template. This step ticks itself when the notice date is entered on the register.', ck: ['Cites the rule by its number in the documents', 'Says what has to be done and by what date', 'Says the owner may ask to be heard before any fine'] },
    { s: 'Re-inspect on the cure date', detail: 'Mark it cured on the register, or set a hearing. This step ticks itself on either.' },
    { s: 'Give the owner written notice of the hearing', detail: 'This step ticks itself when the hearing date is on the register.', ck: ['Date, time and place', 'The rule and the facts the board will consider', 'Sent the way the documents require, with proof kept'] },
    { s: 'Hold the hearing and record what the board decided', detail: 'This step ticks itself when the outcome is entered on the register.', ck: ['The owner was given the chance to speak', 'The decision and the vote are in the minutes', 'The same rule was applied as for every other owner'] },
    { s: 'Charge the fine to the unit, if the board imposed one', detail: 'Register › Charge the fine posts it to the unit\'s account. This step ticks itself when the fine is charged, or when the board upheld the violation with no fine.' },
  ];
}

export const R_STEP = { log: 0, statement: 1, packet: 2, fee: 3, deliver: 4 } as const;
export function resaleSteps(r: ResaleRequest): Steps {
  return [
    { s: `Log the request for Unit ${r.unit} and start the ${RESALE_DAYS}-day clock`, detail: `Requested ${r.openedOn}, due ${resaleDue(r)} (DC Code § 42-1904.11). Done as this action opens.` },
    { s: 'Prepare the statement of account for the unit', detail: 'Register › Prepare statement takes the unit\'s balance, monthly assessment and any special assessments from Funds as of that day. This step ticks itself then.' },
    { s: 'Assemble the packet: declaration, bylaws, rules, budget, reserves', detail: 'Judged from Records › Documents. This step ticks itself when each of them is on file.', ck: ['Insurance summary included', 'Any pending suits or judgments disclosed', 'Any known violations on the unit disclosed'] },
    { s: 'Charge the certificate fee, or record that there is none', detail: 'A reasonable fee may be charged. This step ticks itself when the fee is charged to the unit or waived on the register.' },
    { s: `Deliver the certificate by ${resaleDue(r)}`, detail: 'This step ticks itself when the delivery date is entered on the register.' },
  ];
}

export const A_STEP = { log: 0, complete: 1, review: 2, decide: 3, inspect: 4 } as const;
export function architecturalSteps(a: ArchitecturalRequest): Steps {
  return [
    { s: `Log the application: ${a.title}`, detail: 'Under Board Room › Register. Done as this action opens.' },
    { s: 'Confirm the application is complete', ck: ['Plans or drawings', 'Contractor named, with licence and certificate of insurance', 'Any city permit the work needs is identified'] },
    { s: 'Review it against the declaration, bylaws and rules', ck: ['Does not touch common elements or structure without approval', 'Consistent with what other owners were allowed', 'Any conditions written down'] },
    { s: `Decide in writing by ${decisionDue(a)}`, detail: 'This step ticks itself when the decision is entered on the register. Some documents treat silence past the deadline as approval, so the date matters.' },
    { s: 'Inspect the finished work against what was approved', detail: 'This step ticks itself when the inspection date is entered on the register.' },
  ];
}

const tick = (c: CaseTrackerCase, idx: number, when: boolean) => { if (when && c.steps && c.steps[idx] && !c.steps[idx].done) useIssuesStore.getState().completeStep(c.id, idx); };
const close = (c: CaseTrackerCase, reason: string, notes: string) => { if (c.status !== 'closed') useIssuesStore.getState().closeCaseWithReason(c.id, reason, notes); };

/** Tick what the register shows on one action, and close it when the matter has ended. */
export function syncRegisterCase(c: CaseTrackerCase, today: string = todayIso()): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId) return;
  const [runbook, id] = [c.sourceId.slice(0, c.sourceId.lastIndexOf(':')), c.sourceId.slice(c.sourceId.lastIndexOf(':') + 1)];
  const e = useRegisterStore.getState().entries.find(x => x.id === id);
  if (!e || RUNBOOK_OF[e.kind] !== runbook) return;
  if (e.kind === 'violation') {
    const v = e as Violation; const d = v.data;
    tick(c, V_STEP.log, true);
    tick(c, V_STEP.notice, !!d.noticeSentOn);
    tick(c, V_STEP.reinspect, !!d.curedOn || !!d.hearingOn);
    tick(c, V_STEP.hearingNotice, !!d.hearingOn);
    tick(c, V_STEP.hearing, !!d.hearingOutcome);
    tick(c, V_STEP.fine, d.hearingOutcome === 'upheld' && (!!d.fineInvoiceId || !(d.fineAmount > 0)));
    const st = violationStanding(v, today);
    if (!st.open) close(c, st.stage === 'cured' ? 'Cured' : st.stage === 'dismissed' ? 'Dismissed at the hearing' : st.stage === 'fined' ? 'Upheld and fined' : st.stage === 'warned' ? 'Upheld without a fine' : 'Closed on the register', st.label);
  } else if (e.kind === 'resale') {
    const r = e as ResaleRequest; const d = r.data;
    tick(c, R_STEP.log, true);
    tick(c, R_STEP.statement, !!d.statement);
    const packet = resalePacket(useBuildingStore.getState().legalDocuments);
    tick(c, R_STEP.packet, packet.ready === packet.total);
    tick(c, R_STEP.fee, !!d.feeInvoiceId || d.feeWaived);
    tick(c, R_STEP.deliver, !!d.deliveredOn);
    const st = resaleStanding(r, today);
    if (!st.open) close(c, st.stage === 'delivered' ? 'Certificate delivered' : 'Request cancelled', st.label);
  } else if (e.kind === 'architectural') {
    const a = e as ArchitecturalRequest; const d = a.data;
    tick(c, A_STEP.log, true);
    tick(c, A_STEP.decide, !!d.decision);
    tick(c, A_STEP.inspect, !!d.inspectedOn);
    const st = architecturalStanding(a, today);
    if (!st.open) close(c, st.stage === 'denied' ? 'Denied' : st.stage === 'complete' ? 'Approved and inspected' : 'Closed on the register', st.label);
  }
}

export interface RegisterRun { opened: string[] }

/** Open an action for every open register entry that has none, then tick every register action. */
export function runRegister(today: string = todayIso()): RegisterRun {
  const off = useFinancialStore.getState().runbooksOff;
  const out: RegisterRun = { opened: [] };
  for (const e of useRegisterStore.getState().entries) {
    if (e.kind === 'lien' || off.includes(RUNBOOK_OF[e.kind])) continue;
    if (registerCase(useIssuesStore.getState().cases, e)) continue;
    const base = { approach: 'pre' as const, unit: e.unit, owner: e.owner, source: 'runbook', sourceId: registerSourceId(e) };
    let id: string | undefined;
    if (e.kind === 'violation') {
      const v = e as Violation;
      if (!violationStanding(v, today).open) continue;
      id = useIssuesStore.getState().createCase({ ...base, catId: 'enforcement', sitId: VIOLATION_SIT, title: `Violation · Unit ${v.unit} · ${v.title}`, priority: 'medium', assignedRole: 'Vice President', dueDate: cureBy(v) || plusDays(v.openedOn, 7),
        notes: `Opened by the Covenant violation runbook on ${today}: ${v.data.rule ? `${v.data.rule}. ` : ''}${v.data.description}${v.data.observedBy ? ` Seen by ${v.data.observedBy} on ${v.openedOn}.` : ''} The owner gets ${v.data.cureDays} days from the notice to put it right, and may ask to be heard before any fine.`, customSteps: violationSteps(v) });
    } else if (e.kind === 'resale') {
      const r = e as ResaleRequest;
      if (!resaleStanding(r, today).open) continue;
      id = useIssuesStore.getState().createCase({ ...base, catId: 'admin', sitId: RESALE_SIT, title: `Resale certificate · Unit ${r.unit}`, priority: 'high', assignedRole: 'Secretary', dueDate: resaleDue(r),
        notes: `Opened by the Resale certificate runbook on ${today}: ${r.data.requestedBy || 'the owner'} asked for a resale certificate for Unit ${r.unit} on ${r.openedOn}. It is due ${resaleDue(r)}, ${RESALE_DAYS} days after the request (DC Code § 42-1904.11).`, customSteps: resaleSteps(r) });
    } else {
      const a = e as ArchitecturalRequest;
      if (!architecturalStanding(a, today).open) continue;
      id = useIssuesStore.getState().createCase({ ...base, catId: 'enforcement', sitId: ARCHITECTURAL_SIT, title: `Architectural request · Unit ${a.unit} · ${a.title}`, priority: 'medium', assignedRole: 'President', dueDate: decisionDue(a),
        notes: `Opened from the register on ${today}: ${a.data.description}${a.data.contractor ? ` Contractor: ${a.data.contractor}.` : ''} The board decides by ${decisionDue(a)}, ${a.data.reviewDays} days after the application.`, customSteps: architecturalSteps(a) });
    }
    if (id) out.opened.push(id);
  }
  for (const c of useIssuesStore.getState().cases) {
    if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId && Object.values(RUNBOOK_OF).some(r => c.sourceId!.startsWith(`${r}:`))) syncRegisterCase(c, today);
  }
  return out;
}
