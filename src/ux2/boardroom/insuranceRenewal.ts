/**
 * The insurance renewal runbook, wired: a policy inside 60 days of its
 * expiry (or past it) gets one case, with the renewal steps, and the app
 * ticks the steps it can see: the policy on file with a later expiry, the
 * new certificate uploaded. One case per policy per expiry, so a renewed
 * policy starts a fresh case for its next expiry and nothing else.
 *
 * The database runs the same job every morning (run_insurance_renewal,
 * migration 052); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore, type InsurancePolicy } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { ISO_DATE, todayIso } from '../runbook/adapters';

export const INSURANCE_RENEWAL_ID = 'insurance-renewal';
/** Days before a policy expires that the runbook starts. */
export const INSURANCE_LEAD_DAYS = 60;
export const insuranceSourceId = (policyId: string, expires: string) => `${INSURANCE_RENEWAL_ID}:${policyId}:${expires}`;
export const INSURANCE_RENEWAL_SIT = 'runbook-insurance-renewal';

export const STEP = { quote: 0, compare: 1, approve: 2, bind: 3, file: 4 } as const;

/** A policy whose expiry is inside the lead time, or already past. */
export const renewalDue = (p: InsurancePolicy, today: string) => ISO_DATE.test(p.expires) && p.expires <= addDays(today, INSURANCE_LEAD_DAYS);

export function insuranceCase(cases: CaseTrackerCase[], policyId: string, expires: string): CaseTrackerCase | undefined {
  return cases.find(c => c.source === 'runbook' && c.sourceId === insuranceSourceId(policyId, expires));
}

export function insuranceSteps(p: Pick<InsurancePolicy, 'type' | 'carrier' | 'expires'>): { s: string; detail?: string; ck?: string[] }[] {
  const carrier = p.carrier ? ` from ${p.carrier}` : '';
  return [
    { s: `Ask for the ${p.type} renewal quote${carrier}`, ck: ['Current declarations page and loss runs sent to the broker', 'Coverage limits checked against the bylaws and any lender requirements'] },
    { s: 'Get at least two competing quotes', ck: ['Same limits and deductibles on every quote', 'Quotes kept with the case'] },
    { s: 'Board approves the premium', ck: ['Vote recorded in the minutes or on this case', 'Budget line checked; a spending request if it is over'] },
    { s: `Bind the policy and record it on file: carrier, coverage, premium, new expiry (was ${p.expires})`, detail: 'Building › Overview › Insurance holds the policy list. This step ticks itself when the policy on file carries a later expiry.' },
    { s: 'Upload the new certificate of insurance to the policy', detail: 'Owners and lenders ask for it; it lives on the policy under Building › Overview › Insurance. This step ticks itself when a certificate uploaded after this case opened is on the policy.' },
  ];
}

/** Tick the steps the app can see: the expiry moved on, the certificate uploaded. */
export function syncInsuranceCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || !c.sourceId || c.source !== 'runbook') return;
  const [, policyId, oldExpiry] = c.sourceId.split(':');
  const p = useBuildingStore.getState().insurance.find(x => x.id === policyId);
  if (!p || !oldExpiry) return;
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.bind].done && ISO_DATE.test(p.expires) && p.expires > oldExpiry) complete(c.id, STEP.bind);
  if (!c.steps[STEP.file].done && p.attachments.some(a => (a.uploadedAt || '').slice(0, 10) >= c.created.slice(0, 10)) && p.expires > oldExpiry) complete(c.id, STEP.file);
}

export interface InsuranceRun { opened: string[]; synced: number }

/** Open a case for every policy newly inside its lead time, then tick what the app can see on every open renewal case. */
export function runInsuranceRenewal(today: string = todayIso()): InsuranceRun {
  const fin = useFinancialStore.getState();
  const policies = useBuildingStore.getState().insurance;
  const out: InsuranceRun = { opened: [], synced: 0 };
  if (!fin.runbooksOff.includes(INSURANCE_RENEWAL_ID)) {
    for (const p of policies) {
      if (!renewalDue(p, today)) continue;
      if (insuranceCase(useIssuesStore.getState().cases, p.id, p.expires)) continue;
      const lapsed = p.expires < today;
      const id = useIssuesStore.getState().createCase({
        catId: 'legal',
        sitId: INSURANCE_RENEWAL_SIT,
        approach: 'pre',
        title: `Insurance renewal · ${p.type} · ${lapsed ? 'lapsed' : 'expires'} ${p.expires}`,
        unit: '',
        owner: 'President',
        priority: lapsed ? 'urgent' : 'high',
        notes: `Opened by the Insurance renewal runbook on ${today}: the ${p.type} policy${p.carrier ? ` with ${p.carrier}` : ''}${p.policyNum ? ` (${p.policyNum})` : ''} ${lapsed ? 'lapsed on' : 'expires'} ${p.expires}${p.coverage ? `, coverage ${p.coverage}` : ''}${p.premium ? `, premium ${p.premium}` : ''}. The bylaws and DC Code § 42-1903.10 require the association to keep it in force without a gap.`,
        assignedRole: 'President',
        dueDate: p.expires,
        source: 'runbook',
        sourceId: insuranceSourceId(p.id, p.expires),
        customSteps: insuranceSteps(p),
      });
      out.opened.push(id);
    }
  }
  for (const c of useIssuesStore.getState().cases) {
    if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${INSURANCE_RENEWAL_ID}:`)) { syncInsuranceCase(c); out.synced++; }
  }
  return out;
}
