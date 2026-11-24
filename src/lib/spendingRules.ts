/**
 * How many board approvals a spending request needs before it counts as approved.
 *
 *  - over the bylaws' spending limit: a majority of the board
 *  - under the limit but over its budget line: two (a second signature)
 *  - under the limit and inside its line: one
 *
 * A board of one can only ever give one approval.
 */
export function approvalsNeeded(request: { amount: number; threshold: number }, boardSize: number, overBudgetLine: boolean): number {
  const seats = Math.max(1, Math.floor(boardSize) || 1);
  if (request.amount > request.threshold) return Math.min(seats, Math.max(2, Math.floor(seats / 2) + 1));
  if (overBudgetLine) return Math.min(seats, 2);
  return 1;
}

/** Where a request stands once the votes cast so far are counted against what it needs. */
export function decisionFrom(votes: { vote: 'approve' | 'deny' }[], needed: number): 'approved' | 'denied' | 'pending' {
  const approves = votes.filter(v => v.vote === 'approve').length;
  const denies = votes.filter(v => v.vote === 'deny').length;
  if (approves >= needed) return 'approved';
  if (denies >= needed) return 'denied';
  return 'pending';
}
