/**
 * The association's register: the matters that used to exist only as
 * guidance in a case, kept as records with their own dates.
 *
 *  - violation      a rule broken: notice, cure date, hearing, fine
 *  - architectural  an owner's request to alter a unit or the exterior
 *  - resale         a resale certificate requested for a unit, with its clock
 *  - lien           a lien for unpaid assessments: recorded, released
 *
 * Each entry is plain data; the functions here say where one stands today.
 * The Board Room runbooks open an action for an entry and tick its steps
 * from these same fields (src/ux2/boardroom/register.ts).
 */
export type RegisterKind = 'violation' | 'architectural' | 'resale' | 'lien';

export interface ViolationData {
  /** The rule or provision, as the documents number it. */
  rule: string;
  description: string;
  observedBy: string;
  /** Days the owner is given to put it right. */
  cureDays: number;
  noticeSentOn: string;
  curedOn: string;
  hearingOn: string;
  hearingOutcome: '' | 'upheld' | 'dismissed';
  hearingNotes: string;
  fineAmount: number;
  fineInvoiceId: string;
}

export interface ArchitecturalData {
  description: string;
  contractor: string;
  /** Days the documents give the board to decide. */
  reviewDays: number;
  decision: '' | 'approved' | 'approved_with_conditions' | 'denied';
  conditions: string;
  decidedOn: string;
  /** The finished work was looked at and matches what was approved. */
  inspectedOn: string;
}

export interface ResaleData {
  requestedBy: string;
  requesterEmail: string;
  /** What the unit owed and paid monthly when the certificate was prepared. */
  statement: { preparedOn: string; balance: number; monthlyFee: number; specialAssessments: number } | null;
  feeAmount: number;
  feeInvoiceId: string;
  /** True when the board decided not to charge for it. */
  feeWaived: boolean;
  deliveredOn: string;
  deliveredTo: string;
}

export interface LienData {
  amount: number;
  /** When the owner was told the lien would be recorded. */
  noticeSentOn: string;
  recordedOn: string;
  /** The recorder's instrument or document number. */
  instrument: string;
  attorney: string;
  releasedOn: string;
  releaseInstrument: string;
}

export interface RegisterEntry<K extends RegisterKind = RegisterKind> {
  id: string;
  kind: K;
  unit: string;
  /** Who it concerns, as known when it was opened. */
  owner: string;
  title: string;
  openedOn: string;
  closedOn: string;
  data: K extends 'violation' ? ViolationData : K extends 'architectural' ? ArchitecturalData : K extends 'resale' ? ResaleData : K extends 'lien' ? LienData : never;
  notes: string;
}

export type Violation = RegisterEntry<'violation'>;
export type ArchitecturalRequest = RegisterEntry<'architectural'>;
export type ResaleRequest = RegisterEntry<'resale'>;
export type Lien = RegisterEntry<'lien'>;

/** DC Code § 42-1904.11: the association provides the certificate within 10 days of the request. */
export const RESALE_DAYS = 10;
export const DEFAULT_CURE_DAYS = 30;
export const DEFAULT_REVIEW_DAYS = 30;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const plusDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysTo = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

export const blankViolation = (): ViolationData => ({ rule: '', description: '', observedBy: '', cureDays: DEFAULT_CURE_DAYS, noticeSentOn: '', curedOn: '', hearingOn: '', hearingOutcome: '', hearingNotes: '', fineAmount: 0, fineInvoiceId: '' });
export const blankArchitectural = (): ArchitecturalData => ({ description: '', contractor: '', reviewDays: DEFAULT_REVIEW_DAYS, decision: '', conditions: '', decidedOn: '', inspectedOn: '' });
export const blankResale = (): ResaleData => ({ requestedBy: '', requesterEmail: '', statement: null, feeAmount: 0, feeInvoiceId: '', feeWaived: false, deliveredOn: '', deliveredTo: '' });
export const blankLien = (): LienData => ({ amount: 0, noticeSentOn: '', recordedOn: '', instrument: '', attorney: '', releasedOn: '', releaseInstrument: '' });

export type Tone = 'red' | 'amber' | 'sage' | 'navy' | 'ghost' | 'plum';

export interface Standing {
  /** A short stage name, stable enough to test against. */
  stage: string;
  label: string;
  tone: Tone;
  /** What someone has to do next; '' when nothing. */
  next: string;
  /** The date the next thing is due, when there is one. */
  due?: string;
  overdue: boolean;
  open: boolean;
}

const standing = (stage: string, label: string, tone: Tone, next: string, today: string, due?: string, open = true): Standing =>
  ({ stage, label, tone, next, due, overdue: open && !!due && ISO.test(due) && daysTo(today, due) < 0, open });

/** The day the cure period ends: counted from the notice, since that is when the owner was told. */
export const cureBy = (v: Violation) => (ISO.test(v.data.noticeSentOn) ? plusDays(v.data.noticeSentOn, v.data.cureDays || DEFAULT_CURE_DAYS) : '');

export function violationStanding(v: Violation, today: string): Standing {
  const d = v.data;
  if (d.curedOn) return standing('cured', `Cured ${d.curedOn}`, 'sage', '', today, undefined, false);
  if (d.hearingOutcome === 'dismissed') return standing('dismissed', 'Dismissed at the hearing', 'ghost', '', today, undefined, false);
  if (d.hearingOutcome === 'upheld') {
    if (d.fineAmount > 0 && !d.fineInvoiceId) return standing('fine-due', 'Upheld · fine to charge', 'amber', `Charge the $${d.fineAmount.toLocaleString()} fine to the unit`, today);
    return standing(d.fineAmount > 0 ? 'fined' : 'warned', d.fineAmount > 0 ? `Fined $${d.fineAmount.toLocaleString()}` : 'Upheld · no fine', 'plum', '', today, undefined, false);
  }
  if (v.closedOn) return standing('closed', `Closed ${v.closedOn}`, 'ghost', '', today, undefined, false);
  if (!d.noticeSentOn) return standing('logged', 'Notice not sent', 'amber', 'Send the notice of violation', today, plusDays(v.openedOn, 7));
  if (d.hearingOn) {
    return daysTo(today, d.hearingOn) < 0
      ? standing('hearing-held', 'Hearing date passed', 'red', 'Record what the hearing decided', today, d.hearingOn)
      : standing('hearing-set', `Hearing ${d.hearingOn}`, 'navy', 'Hold the hearing', today, d.hearingOn);
  }
  const by = cureBy(v);
  return daysTo(today, by) < 0
    ? standing('uncured', 'Cure date passed', 'red', 'Re-inspect: mark it cured, or set a hearing', today, by)
    : standing('noticed', `Cure by ${by}`, 'navy', 'Re-inspect on the cure date', today, by);
}

export const decisionDue = (a: ArchitecturalRequest) => plusDays(a.openedOn, a.data.reviewDays || DEFAULT_REVIEW_DAYS);

export function architecturalStanding(a: ArchitecturalRequest, today: string): Standing {
  const d = a.data;
  if (d.decision === 'denied') return standing('denied', `Denied ${d.decidedOn}`, 'ghost', '', today, undefined, false);
  if (d.decision) {
    if (d.inspectedOn) return standing('complete', `Approved · work inspected ${d.inspectedOn}`, 'sage', '', today, undefined, false);
    if (a.closedOn) return standing('closed', `Closed ${a.closedOn}`, 'ghost', '', today, undefined, false);
    return standing('approved', d.decision === 'approved_with_conditions' ? 'Approved with conditions' : 'Approved', 'sage', 'Inspect the finished work against what was approved', today);
  }
  if (a.closedOn) return standing('withdrawn', `Withdrawn ${a.closedOn}`, 'ghost', '', today, undefined, false);
  const due = decisionDue(a);
  return standing('review', `Decide by ${due}`, daysTo(today, due) < 0 ? 'red' : daysTo(today, due) <= 7 ? 'amber' : 'navy', 'Decide in writing', today, due);
}

export const resaleDue = (r: ResaleRequest) => plusDays(r.openedOn, RESALE_DAYS);

export function resaleStanding(r: ResaleRequest, today: string): Standing {
  const d = r.data;
  if (d.deliveredOn) {
    const late = daysTo(resaleDue(r), d.deliveredOn) > 0;
    return standing('delivered', `Delivered ${d.deliveredOn}${late ? ' · late' : ''}`, late ? 'amber' : 'sage', '', today, undefined, false);
  }
  if (r.closedOn) return standing('cancelled', `Cancelled ${r.closedOn}`, 'ghost', '', today, undefined, false);
  const due = resaleDue(r);
  const left = daysTo(today, due);
  const next = !d.statement ? 'Prepare the statement of account' : 'Deliver the certificate';
  return standing(d.statement ? 'ready' : 'requested', left < 0 ? `Overdue · was due ${due}` : `Due ${due} · ${left} day${left === 1 ? '' : 's'} left`, left < 0 ? 'red' : left <= 3 ? 'amber' : 'navy', next, today, due);
}

/** `balance` is what the unit owes today; a recorded lien on a unit that owes nothing has to be released. */
export function lienStanding(l: Lien, today: string, balance: number): Standing {
  const d = l.data;
  if (d.releasedOn) return standing('released', `Released ${d.releasedOn}`, 'sage', '', today, undefined, false);
  if (!d.recordedOn) {
    if (balance <= 0.005) return standing('moot', 'Paid before recording', 'sage', 'Withdraw the referral', today);
    return standing('referred', d.noticeSentOn ? 'Referred · owner notified' : 'Referred for a lien', 'amber', d.noticeSentOn ? 'Record the lien and enter its instrument number' : 'Send the owner notice of the lien', today);
  }
  if (balance <= 0.005) return standing('release-due', 'Paid · release owed', 'red', 'Record the release of lien', today, today);
  return standing('recorded', `Recorded ${d.recordedOn}`, 'plum', '', today);
}

export function standingOf(e: RegisterEntry, today: string, balanceOf: (unit: string) => number = () => 0): Standing {
  switch (e.kind) {
    case 'violation': return violationStanding(e as Violation, today);
    case 'architectural': return architecturalStanding(e as ArchitecturalRequest, today);
    case 'resale': return resaleStanding(e as ResaleRequest, today);
    default: return lienStanding(e as Lien, today, balanceOf(e.unit));
  }
}

/** Earlier violations of the same rule by the same unit: what makes this one a repeat. */
export function priorViolations(v: Violation, all: RegisterEntry[]): Violation[] {
  const rule = v.data.rule.trim().toLowerCase();
  return all.filter((e): e is Violation => e.kind === 'violation' && e.id !== v.id && e.unit === v.unit && e.openedOn <= v.openedOn && (!rule || (e as Violation).data.rule.trim().toLowerCase() === rule));
}
