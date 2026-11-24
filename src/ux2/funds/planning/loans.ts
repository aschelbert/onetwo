import { useFinancialStore } from '@/store/useFinancialStore';
import { fundOf } from '@/lib/ledger';
import { LOAN_PAYMENT_SOURCE } from '@/lib/budgetYear';
import { loanStanding, paysIn, type Loan } from '@/lib/outlook';
import { todayIso } from '../../runbook/adapters';
import { planningDoc, savePlanning } from './planningDoc';

/**
 * Loans in the ledger. Borrowing puts the money in the bank and the debt
 * under what the association owes; each payment takes cash out, part of it
 * interest (an expense) and the rest principal (it brings the debt down).
 * The split comes from the loan's terms, so nobody works it out by hand.
 */
export const LOAN_PAYABLE = '2100';
export const LOAN_INTEREST = '5400';

function ensureAccounts() {
  const fin = useFinancialStore.getState();
  fin.addCoAAccount(LOAN_PAYABLE, 'Loans Payable', '2000', 'loan');
  fin.addCoAAccount(LOAN_INTEREST, 'Loan Interest', '5000', 'operating');
}

/** The bank accounts a loan can be paid into or from, the operating account first. */
export function bankAccounts() {
  return useFinancialStore.getState().chartOfAccounts.filter(a => a.sub === 'bank').sort((a, b) => Number(fundOf(a, a.num) === 'reserve') - Number(fundOf(b, b.num) === 'reserve') || a.num.localeCompare(b.num));
}

const patchLoan = (id: string, changes: Partial<Loan>, today: string) => savePlanning({ loans: planningDoc().loans.map(l => (l.id === id ? { ...l, ...changes } : l)) }, today);
const attempt = (post: () => void): string => { try { post(); return ''; } catch (e) { return e instanceof Error ? e.message : 'That could not be posted.'; } };

/** Record the money arriving: bank up, loans payable up. Returns '' or why it could not be posted. */
export function recordProceeds(loanId: string, on: string, bank: string, today: string = todayIso()): string {
  const l = planningDoc().loans.find(x => x.id === loanId);
  if (!l || l.drawnOn) return '';
  ensureAccounts();
  const err = attempt(() => useFinancialStore.getState().glPost(on, `Loan proceeds: ${l.name}${l.lender ? ` (${l.lender})` : ''}`, bank, LOAN_PAYABLE, l.principal, 'manual', `loan:${l.id}`));
  if (!err) patchLoan(l.id, { drawnOn: on }, today);
  return err;
}

/** The earliest month with a payment due that has not been posted, up to this month. */
export function nextUnposted(l: Loan, thisMonth: string): string | null {
  const posted = new Set(l.posted ?? []);
  let [y, m] = l.firstPayment.split('-').map(Number);
  for (let n = 0; n < 600; n++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month > thisMonth || !paysIn(l, month)) return null;
    if (!posted.has(month)) return month;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

/** Record one month's payment: interest to its expense account, principal against the debt, both out of the bank. */
export function recordPayment(loanId: string, month: string, on: string, bank: string, today: string = todayIso()): string {
  const l = planningDoc().loans.find(x => x.id === loanId);
  if (!l || (l.posted ?? []).includes(month)) return '';
  ensureAccounts();
  const st = loanStanding(l, month);
  const source = `${LOAN_PAYMENT_SOURCE}${l.id}:${month}`;
  const err = attempt(() => {
    const fin = useFinancialStore.getState();
    if (st.interestThis > 0) fin.glPost(on, `Loan payment ${month}: ${l.name}, interest`, LOAN_INTEREST, bank, st.interestThis, 'manual', source);
    if (st.principalThis > 0) useFinancialStore.getState().glPost(on, `Loan payment ${month}: ${l.name}, principal`, LOAN_PAYABLE, bank, st.principalThis, 'manual', source);
  });
  if (!err) patchLoan(l.id, { posted: [...(l.posted ?? []), month] }, today);
  return err;
}
