import type { CaseTrackerCase } from '@/types/issues';
import MonthCloseTools from './MonthCloseTools';
import { InsuranceTools, WriteOffTool } from './MoneyTools';
import BudgetTools from './BudgetTools';
import YearEndTools from './YearEndTools';

/** Which long-standing runbook an action belongs to, and the key after it ('month-close:2026-10' gives ['month-close', '2026-10']). */
export function toolsFor(c: Pick<CaseTrackerCase, 'source' | 'sourceId'> | undefined): { runbook: string; parts: string[] } | null {
  if (c?.source !== 'runbook' || !c.sourceId) return null;
  const [runbook, ...parts] = c.sourceId.split(':');
  return ['month-close', 'collections', 'insurance-renewal', 'annual-budget', 'year-end'].includes(runbook) && parts[0] ? { runbook, parts } : null;
}

/**
 * The work that belongs to a long-standing action but is not one of its
 * ticked steps: reconciling the bank accounts in a month close, asking for a
 * write-off in collections, the rebuild-cost check in an insurance renewal,
 * the objectives in the annual budget, the allowance at year end. Shown with
 * the action's own page, below its steps.
 */
export default function CaseTools({ c }: { c: CaseTrackerCase }) {
  const t = toolsFor(c);
  if (!t) return null;
  const [a] = t.parts;
  if (t.runbook === 'month-close') return <MonthCloseTools period={a} />;
  if (t.runbook === 'collections') return <WriteOffTool unitNum={a} caseId={c.id} sourceId={c.sourceId!} />;
  if (t.runbook === 'insurance-renewal') return <InsuranceTools policyId={a} sourceId={c.sourceId!} />;
  if (t.runbook === 'annual-budget') return <BudgetTools year={a} />;
  if (t.runbook === 'year-end') return <YearEndTools fyEnd={a} />;
  return null;
}
