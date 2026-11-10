/**
 * The collections runbook, wired: a unit 30 days past due on dues or a
 * special assessment gets one case, with the collection steps, and the app
 * ticks the steps it can see: the late fee charged, the balance cleared.
 * One open case per unit at a time: a case the board opened by hand for
 * the unit counts, so the runbook never doubles it. A new episode after
 * the case closes gets a new case, keyed by the oldest unpaid invoice.
 *
 * The database runs the same job every morning (run_collections, migration
 * 052); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { addDays } from '@/lib/billingCycle';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import type { Unit, UnitInvoice } from '@/types/financial';
import { daysBetween } from '../runbook/model';
import { todayIso } from '../runbook/adapters';

export const COLLECTIONS_ID = 'collections';
/** Days past an invoice's due date before the runbook starts. */
export const COLLECTIONS_DAYS = 30;
export const collectionsSourceId = (unit: string, invoiceId: string) => `${COLLECTIONS_ID}:${unit}:${invoiceId}`;
export const COLLECTIONS_SIT = 'runbook-collections';

export const STEP = { fee: 0, notice: 1, demand: 2, plan: 3, outcome: 4 } as const;

const unpaid = (i: UnitInvoice) => i.amount - (i.paidAmount ?? 0);
/** Dues and assessments still owed; fees ride along and never start a case on their own. */
export const owedInvoice = (i: UnitInvoice) => (i.type === 'monthly' || i.type === 'special_assessment') && (i.status === 'sent' || i.status === 'overdue') && unpaid(i) > 0.005;

/** The unit's oldest unpaid dues or assessment invoice that is 30 days past due, if any. */
export function overdueInvoice(unit: string, invoices: UnitInvoice[], today: string): UnitInvoice | undefined {
  return invoices
    .filter(i => i.unitNumber === unit && owedInvoice(i) && daysBetween(i.dueDate, today) >= COLLECTIONS_DAYS)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}

/** An open case already working this unit's balance: the runbook's own, or one the board opened on the delinquent-accounts situation. */
export function openCollectionsCase(cases: CaseTrackerCase[], unit: string): CaseTrackerCase | undefined {
  return cases.find(c => c.status !== 'closed' && c.unit === unit && ((c.source === 'runbook' && !!c.sourceId?.startsWith(`${COLLECTIONS_ID}:${unit}:`)) || c.sitId === 'delinquent-accounts'));
}

export function collectionsSteps(unit: string, owed: number, oldestDue: string): { s: string; detail?: string; ck?: string[] }[] {
  return [
    { s: `Charge the late fee on Unit ${unit}'s overdue dues`, detail: 'Billing charges it after the grace period when the late fee is on (Funds › Settings › Billing rules); otherwise charge it from the unit ledger. This step ticks itself once the fee invoice exists.' },
    { s: `Send Unit ${unit} the second notice by certified mail, with the statement of account`, ck: ['Statement of account attached: dues, late fee, interest if the bylaws allow', 'Cites the bylaw provision for the late fee', 'Sent by USPS certified mail with return receipt, receipt kept in the owner file'] },
    { s: `Send the formal demand letter by ${addDays(oldestDue, 60)}: total due, lien rights under DC Code § 42-1903.13(a), 30-day cure period`, ck: ['Itemizes the total due', 'States the statutory lien and its super-lien priority', 'Gives the 30-day cure period and offers a payment plan'] },
    { s: 'Offer a written payment plan', ck: ['Keeps the owner current on new dues while paying down the arrears', 'Same terms the board offers every owner', 'Signed copy in the owner file'] },
    { s: `Record the outcome for Unit ${unit}: paid in full, on a plan, or referred for a lien`, detail: `${fmt(owed)} was owed when this opened. This step ticks itself when the unit has nothing past due.` },
  ];
}

/** Tick the steps the app can see: the late fee charged, the balance cleared. */
export function syncCollectionsCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || !c.sourceId || c.source !== 'runbook') return;
  const [, unit, invoiceId] = c.sourceId.split(':');
  if (!unit || !invoiceId) return;
  const fin = useFinancialStore.getState();
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.fee].done && fin.unitInvoices.some(i => i.type === 'fee' && i.status !== 'void' && i.forInvoiceId === invoiceId)) complete(c.id, STEP.fee);
  const u = fin.units.find(x => x.number === unit);
  const clear = !!u && u.balance <= 0.005 && !fin.unitInvoices.some(i => i.unitNumber === unit && owedInvoice(i));
  if (!c.steps[STEP.outcome].done && clear) complete(c.id, STEP.outcome);
}

export interface CollectionsRun { opened: string[]; synced: number }

/** Open a case for every unit newly 30 days past due, then tick what the app can see on every open collections case. */
export function runCollections(today: string = todayIso()): CollectionsRun {
  const fin = useFinancialStore.getState();
  const issues = useIssuesStore.getState();
  const out: CollectionsRun = { opened: [], synced: 0 };
  if (!fin.runbooksOff.includes(COLLECTIONS_ID)) {
    for (const u of fin.units as Unit[]) {
      if (openCollectionsCase(issues.cases, u.number)) continue;
      const inv = overdueInvoice(u.number, fin.unitInvoices, today);
      if (!inv) continue;
      const owed = fin.unitInvoices.filter(i => i.unitNumber === u.number && owedInvoice(i)).reduce((t, i) => t + unpaid(i), 0);
      const days = daysBetween(inv.dueDate, today);
      const id = useIssuesStore.getState().createCase({
        catId: 'financial',
        sitId: COLLECTIONS_SIT,
        approach: 'pre',
        title: `Collections · Unit ${u.number} · ${fmt(owed)} past due`,
        unit: u.number,
        owner: u.owner,
        priority: days >= 90 ? 'high' : 'medium',
        notes: `Opened by the Collections runbook on ${today}: ${inv.description} was due ${inv.dueDate}, ${days} days ago, and ${fmt(owed)} is owed in all. The demand letter is due ${addDays(inv.dueDate, 60)}; a lien may follow 30 days after it. Payment plans are offered on the same terms to every owner.`,
        assignedRole: 'Treasurer',
        dueDate: addDays(inv.dueDate, 60),
        source: 'runbook',
        sourceId: collectionsSourceId(u.number, inv.id),
        customSteps: collectionsSteps(u.number, owed, inv.dueDate),
      });
      out.opened.push(id);
    }
  }
  for (const c of useIssuesStore.getState().cases) {
    if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${COLLECTIONS_ID}:`)) { syncCollectionsCase(c); out.synced++; }
  }
  return out;
}
