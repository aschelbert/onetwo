import type { CaseTrackerCase } from '@/types/issues';

interface BudgetTrackerProps {
  c: CaseTrackerCase;
}

/**
 * Budget tracker placeholder for the left sidebar.
 * Returns null when case has no budgetBaseline — the layout slot
 * exists for future budget workflow enrichment.
 */
export function BudgetTracker({ c }: BudgetTrackerProps) {
  if (!c.budgetBaseline) return null;
  return null;
}
