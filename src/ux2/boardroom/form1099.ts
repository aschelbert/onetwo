/**
 * The 1099 filing runbook, wired: on January 1, one case for the year just
 * ended when any vendor was paid $600 or more (from the paid work orders),
 * due January 31. The app ticks the steps it can see: the vendor list (the
 * ledger made it) and the W-9s once every vendor on the list has one on
 * file (Building › Contracts). Nothing to file means no case.
 *
 * The database runs the same job every morning (run_form_1099, migration
 * 055); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const FORM_1099_ID = '1099';
export const FORM_1099_SIT = 'runbook-1099';
export const FORM_1099_THRESHOLD = 600;
export const form1099SourceId = (taxYear: number) => `${FORM_1099_ID}:${taxYear}`;

export const STEP = { list: 0, w9: 1, file: 2, keep: 3 } as const;

export interface Vendor1099 { vendor: string; amount: number; w9OnFile: boolean }

/** Vendors paid $600 or more in the tax year, from the paid work orders, with their W-9 status. */
export function vendors1099(taxYear: number): Vendor1099[] {
  const paid = new Map<string, number>();
  for (const w of useFinancialStore.getState().workOrders) {
    if (w.status === 'paid' && w.paidDate?.startsWith(String(taxYear)) && w.vendor) paid.set(w.vendor, (paid.get(w.vendor) ?? 0) + w.amount);
  }
  const vendors = useBuildingStore.getState().vendors;
  return Array.from(paid.entries()).filter(([, amt]) => amt >= FORM_1099_THRESHOLD)
    .map(([vendor, amount]) => ({ vendor, amount, w9OnFile: vendors.some(v => v.name === vendor && !!v.w9OnFile) }))
    .sort((a, b) => b.amount - a.amount);
}

export function form1099Steps(taxYear: number, list: Vendor1099[]): { s: string; detail?: string; ck?: string[] }[] {
  const total = list.reduce((t, v) => t + v.amount, 0);
  return [
    { s: `Confirm the vendors paid ${fmt(FORM_1099_THRESHOLD)} or more in ${taxYear}: ${list.length} vendor${list.length === 1 ? '' : 's'}, ${fmt(total)}`, detail: `From the paid work orders: ${list.map(v => `${v.vendor} ${fmt(v.amount)}`).join(' · ')}. Corporations and payments by card are exempt; strike those. This step ticks itself when the action opens.` },
    { s: 'Collect the W-9 from every vendor on the list', detail: 'Building › Contracts shows who has one on file; Mark received as they arrive. This step ticks itself when every vendor on the list has a W-9.' },
    { s: `File Form 1099-NEC with the IRS and send each vendor its copy by ${taxYear + 1}-01-31`, ck: ['Filed through the IRS IRIS portal or the accountant', 'Copy B to each vendor', 'DC copies where the vendor is in DC'] },
    { s: `Keep the filed forms and the W-9s with the ${taxYear} records`, ck: ['Filed 1099s under Building › Documents', 'W-9s in the vendor file'] },
  ];
}

export function form1099Case(cases: CaseTrackerCase[], taxYear: number): CaseTrackerCase | undefined {
  return cases.find(c => c.source === 'runbook' && c.sourceId === form1099SourceId(taxYear));
}

/** Tick the steps the app can see: the list, the W-9s. */
export function syncForm1099Case(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${FORM_1099_ID}:`)) return;
  const taxYear = Number(c.sourceId.slice(FORM_1099_ID.length + 1));
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.list].done) complete(c.id, STEP.list);
  const list = vendors1099(taxYear);
  if (!c.steps[STEP.w9].done && list.length > 0 && list.every(v => v.w9OnFile)) complete(c.id, STEP.w9);
}

export interface Form1099Run { taxYear: number; caseId: string | null; opened: boolean }

export function runForm1099(today: string = todayIso()): Form1099Run {
  const fin = useFinancialStore.getState();
  const year = Number(today.slice(0, 4));
  const taxYear = year - 1;
  const existing = form1099Case(useIssuesStore.getState().cases, taxYear);
  if (existing) { syncForm1099Case(existing); return { taxYear, caseId: existing.id, opened: false }; }
  if (fin.runbooksOff.includes(FORM_1099_ID)) return { taxYear, caseId: null, opened: false };
  // January 1 through the end of March; after that the year's filing is history, not a case to open.
  if (today > `${year}-03-31`) return { taxYear, caseId: null, opened: false };
  const list = vendors1099(taxYear);
  if (list.length === 0) return { taxYear, caseId: null, opened: false };
  const id = useIssuesStore.getState().createCase({
    catId: 'financial',
    sitId: FORM_1099_SIT,
    approach: 'pre',
    title: `1099 filing · ${taxYear}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'high',
    notes: `Opened by the 1099 filing runbook on ${today}: ${list.length} vendor${list.length === 1 ? ' was' : 's were'} paid ${fmt(FORM_1099_THRESHOLD)} or more in ${taxYear}. Form 1099-NEC goes to each vendor and the IRS by ${year}-01-31; ${list.filter(v => !v.w9OnFile).length} W-9${list.filter(v => !v.w9OnFile).length === 1 ? ' is' : 's are'} still missing.`,
    assignedRole: 'Treasurer',
    dueDate: `${year}-01-31`,
    source: 'runbook',
    sourceId: form1099SourceId(taxYear),
    customSteps: form1099Steps(taxYear, list),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncForm1099Case(created);
  return { taxYear, caseId: id, opened: true };
}
