/**
 * reconcile.ts -- Bank reconciliation logic.
 *
 * findDifferences(bankLines, ledgerEntries):
 *   Matches by amount and date within 3 days.
 *   Returns unmatched bank lines with suggested fixes,
 *   unmatched ledger entries, and manual entries missing reason.
 */

import type { GLEntry } from '@/types/financial';

export interface BankLine {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

export interface ReconcileDifference {
  bankLine?: BankLine;
  ledgerEntry?: GLEntry;
  type: 'unmatched_bank' | 'unmatched_ledger' | 'missing_reason';
  suggestedFix: string;
}

export interface ReconcileResult {
  matched: Array<{ bankLine: BankLine; ledgerEntry: GLEntry }>;
  differences: ReconcileDifference[];
  bankTotal: number;
  ledgerTotal: number;
  balanceDifference: number;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Determine if two dates are within 3 calendar days of each other.
 */
function withinThreeDays(dateA: string, dateB: string): boolean {
  const a = new Date(dateA + 'T00:00:00').getTime();
  const b = new Date(dateB + 'T00:00:00').getTime();
  return Math.abs(a - b) <= THREE_DAYS_MS;
}

/**
 * Match bank lines to ledger entries by amount and date proximity.
 * Returns unmatched items with suggested fixes.
 */
export function findDifferences(
  bankLines: BankLine[],
  ledgerEntries: GLEntry[],
): ReconcileResult {
  const matched: ReconcileResult['matched'] = [];
  const differences: ReconcileDifference[] = [];

  // Track which entries have been matched
  const matchedBankIds = new Set<string>();
  const matchedLedgerIds = new Set<string>();

  // Try to match each bank line to a ledger entry
  for (const bl of bankLines) {
    let bestMatch: GLEntry | null = null;
    let bestDateDiff = Infinity;

    for (const le of ledgerEntries) {
      if (matchedLedgerIds.has(le.id)) continue;

      // Amount must match exactly (pennies)
      const leAmount = Math.round(le.amount * 100);
      const blAmount = Math.round(bl.amount * 100);
      if (leAmount !== blAmount) continue;

      // Date must be within 3 days
      if (!withinThreeDays(bl.date, le.date)) continue;

      const dateDiff = Math.abs(
        new Date(bl.date + 'T00:00:00').getTime() - new Date(le.date + 'T00:00:00').getTime(),
      );
      if (dateDiff < bestDateDiff) {
        bestDateDiff = dateDiff;
        bestMatch = le;
      }
    }

    if (bestMatch) {
      matched.push({ bankLine: bl, ledgerEntry: bestMatch });
      matchedBankIds.add(bl.id);
      matchedLedgerIds.add(bestMatch.id);
    }
  }

  // Unmatched bank lines
  for (const bl of bankLines) {
    if (matchedBankIds.has(bl.id)) continue;
    differences.push({
      bankLine: bl,
      type: 'unmatched_bank',
      suggestedFix: bl.type === 'credit'
        ? `Record a payment or deposit for ${bl.description} ($${bl.amount.toFixed(2)})`
        : `Record an expense for ${bl.description} ($${bl.amount.toFixed(2)})`,
    });
  }

  // Unmatched ledger entries
  for (const le of ledgerEntries) {
    if (matchedLedgerIds.has(le.id)) continue;
    differences.push({
      ledgerEntry: le,
      type: 'unmatched_ledger',
      suggestedFix: `Verify "${le.memo}" ($${le.amount.toFixed(2)}) appears on bank statement, or void if duplicate.`,
    });
  }

  // Manual entries missing reason
  for (const le of ledgerEntries) {
    if (le.source === 'manual' && !le.reason) {
      // Only add if not already in differences as unmatched
      const alreadyAdded = differences.some(d => d.ledgerEntry?.id === le.id);
      if (!alreadyAdded) {
        differences.push({
          ledgerEntry: le,
          type: 'missing_reason',
          suggestedFix: `Add a reason for manual entry "${le.memo}" ($${le.amount.toFixed(2)}).`,
        });
      }
    }
  }

  // Compute totals
  const bankTotal = bankLines.reduce(
    (s, bl) => s + (bl.type === 'credit' ? bl.amount : -bl.amount),
    0,
  );
  const ledgerTotal = ledgerEntries.reduce((s, le) => s + le.amount, 0);

  return {
    matched,
    differences,
    bankTotal,
    ledgerTotal,
    balanceDifference: Math.round((bankTotal - ledgerTotal) * 100) / 100,
  };
}
