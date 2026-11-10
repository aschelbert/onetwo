/**
 * The filings runbook, wired: a pending filing on the calendar (Building ›
 * Obligations: the biennial report, the 1120-H, the D-20, inspections...)
 * gets its case 45 days before it is due, or at once if it is already
 * late. The case is the same one the Start button on Home opens, so it
 * carries the filings playbook, the obligation card says Continue, and
 * closing it as Resolved marks the filing filed. One case per filing per
 * cycle: a case opened for this filing inside the last year counts.
 *
 * The database opens the same case every morning (run_filings, migration
 * 054); the app fills in the playbook steps when it loads the case.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore, type RegulatoryFiling } from '@/store/useComplianceStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { ISO_DATE, todayIso } from '../runbook/adapters';
import { categoryOf } from '../runbook/obligationCases';

export const FILINGS_ID = 'filings';
/** Days before a filing is due that the runbook opens its case. */
export const FILING_LEAD_DAYS = 45;
export const FILING_SIT = 'compliance-filing';

/** The case for this filing's current cycle: open, or closed inside the last year (so an unresolved close is not reopened). */
export function filingCase(cases: CaseTrackerCase[], f: Pick<RegulatoryFiling, 'id' | 'dueDate'>): CaseTrackerCase | undefined {
  return cases.find(c => c.source === 'filing' && c.sourceId === f.id && (c.status !== 'closed' || c.created >= addDays(f.dueDate, -366)));
}

export const filingDue = (f: RegulatoryFiling, today: string) => f.status === 'pending' && ISO_DATE.test(f.dueDate) && f.dueDate <= addDays(today, FILING_LEAD_DAYS);

export interface FilingsRun { opened: string[] }

export function runFilings(today: string = todayIso()): FilingsRun {
  const fin = useFinancialStore.getState();
  const out: FilingsRun = { opened: [] };
  if (fin.runbooksOff.includes(FILINGS_ID)) return out;
  const catId = categoryOf(FILING_SIT) ?? 'admin';
  for (const f of useComplianceStore.getState().filings) {
    if (!filingDue(f, today)) continue;
    if (filingCase(useIssuesStore.getState().cases, f)) continue;
    const late = f.dueDate < today;
    const id = useIssuesStore.getState().createCase({
      catId,
      sitId: FILING_SIT,
      approach: 'pre',
      title: f.name,
      unit: '',
      owner: f.responsible || 'Board',
      priority: late ? 'urgent' : 'high',
      notes: [`Opened by the Filings runbook on ${today}: ${f.name} is ${late ? 'late, it was' : ''} due ${f.dueDate}${f.legalRef ? ` (${f.legalRef})` : ''}. Closing this case as Resolved marks it filed.`, f.notes].filter(Boolean).join('\n\n'),
      assignedRole: f.responsible || undefined,
      dueDate: f.dueDate,
      source: 'filing',
      sourceId: f.id,
    });
    out.opened.push(id);
  }
  return out;
}
