/**
 * The ledger's controls: who did what on a bill, and the rules the board can
 * switch on. Pure; the store applies them.
 */
export interface BillPeople { raisedBy?: string; approvedBy?: string; paidBy?: string }

/** The rules a building has chosen. Absent means off, except the reconciliation rule, which turns itself on once the building reconciles. */
export interface ControlRules { requireReconciliation?: boolean; twoPersonBills?: boolean }

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Why this person may not pay this bill, or '' when they may. With the
 * two-person rule on, whoever raised or approved a bill cannot be the one
 * who pays it. A bill with nobody recorded against it (from before the rule)
 * is not held up.
 */
export function payBlocker(people: BillPeople | null | undefined, payer: string, rules: ControlRules): string {
  if (!rules.twoPersonBills || !payer.trim()) return '';
  if (same(people?.raisedBy, payer)) return `${payer} raised this bill, so someone else has to pay it.`;
  if (same(people?.approvedBy, payer)) return `${payer} approved this bill, so someone else has to pay it.`;
  return '';
}

/** "Raised by A · approved by B · paid by C", with only the parts on record. */
export const billTrail = (p: BillPeople | null | undefined) => [p?.raisedBy && `raised by ${p.raisedBy}`, p?.approvedBy && `approved by ${p.approvedBy}`, p?.paidBy && `paid by ${p.paidBy}`].filter(Boolean).join(' · ');
