/**
 * The vendor onboarding runbook, wired: the first time money moves to a
 * vendor (a work order approved, invoiced or paid) who is not on Building
 * › Contracts, or is there without a W-9, one case opens: the record, the
 * W-9, the certificate of insurance and licenses, the contract on file.
 * The app ticks the record, the W-9 and the contract as they land. One
 * case per vendor, by name.
 *
 * The database opens the same case every morning (run_vendor_onboarding,
 * migration 062); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const VENDOR_ONBOARDING_ID = 'vendor-onboarding';
export const VENDOR_ONBOARDING_SIT = 'runbook-vendor-onboarding';
export const vendorKey = (name: string) => name.trim().toLowerCase();
export const onboardingSourceId = (name: string) => `${VENDOR_ONBOARDING_ID}:${vendorKey(name)}`;

export const STEP = { record: 0, w9: 1, insurance: 2, contract: 3 } as const;

export const onboardingCase = (cases: CaseTrackerCase[], name: string) => cases.find(c => c.source === 'runbook' && c.sourceId === onboardingSourceId(name));

const vendorRecord = (name: string) => useBuildingStore.getState().vendors.find(v => vendorKey(v.name) === vendorKey(name));
const vendorContract = (name: string) => { const v = vendorRecord(name); return useVendorTrackerStore.getState().contracts.find(c => (v && c.vendorId === v.id) || vendorKey(c.vendorName) === vendorKey(name)); };

/** Vendors money has moved to (a work order past draft) who still need onboarding: no record, or a record without a W-9. */
export function vendorsToOnboard(): { name: string; paid: number; hasRecord: boolean }[] {
  const seen = new Map<string, { name: string; paid: number }>();
  for (const w of useFinancialStore.getState().workOrders) {
    if (w.status === 'draft' || !w.vendor?.trim()) continue;
    const k = vendorKey(w.vendor);
    const cur = seen.get(k) ?? { name: w.vendor.trim(), paid: 0 };
    cur.paid += w.amount;
    seen.set(k, cur);
  }
  return Array.from(seen.values()).map(v => ({ ...v, hasRecord: !!vendorRecord(v.name) })).filter(v => !v.hasRecord || !vendorRecord(v.name)!.w9OnFile);
}

export function onboardingSteps(name: string): { s: string; detail?: string; ck?: string[] }[] {
  return [
    { s: `Add ${name} to Building › Contracts: service, contact, terms`, detail: 'This step ticks itself when the vendor has a record there.' },
    { s: `Collect ${name}'s W-9`, detail: 'Needed for the 1099 by January 31 once payments reach $600. Mark received on Building › Contracts; this step ticks itself then.' },
    { s: 'Certificate of insurance naming the association, and licenses checked', ck: ['General liability, the association as additional insured', 'Workers compensation if they have employees', 'Business and trade licenses current'] },
    { s: `Put ${name}'s contract on file under Building › Contracts, with its end date`, detail: 'The contract renewals then track it. This step ticks itself when a contract for the vendor is on file.' },
  ];
}

/** Tick what Building › Contracts shows. */
export function syncOnboardingCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${VENDOR_ONBOARDING_ID}:`)) return;
  const name = c.owner || c.sourceId.slice(VENDOR_ONBOARDING_ID.length + 1);
  const complete = useIssuesStore.getState().completeStep;
  const rec = vendorRecord(name);
  if (!c.steps[STEP.record].done && rec) complete(c.id, STEP.record);
  if (!c.steps[STEP.w9].done && rec?.w9OnFile) complete(c.id, STEP.w9);
  if (!c.steps[STEP.contract].done && vendorContract(name)) complete(c.id, STEP.contract);
}

export interface OnboardingRun { opened: string[] }

export function runVendorOnboarding(today: string = todayIso()): OnboardingRun {
  const fin = useFinancialStore.getState();
  const out: OnboardingRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${VENDOR_ONBOARDING_ID}:`)) syncOnboardingCase(c);
  if (fin.runbooksOff.includes(VENDOR_ONBOARDING_ID)) return out;
  const managed = !!useBuildingStore.getState().management.company;
  for (const v of vendorsToOnboard()) {
    if (onboardingCase(useIssuesStore.getState().cases, v.name)) continue;
    const id = useIssuesStore.getState().createCase({
      catId: 'admin',
      sitId: VENDOR_ONBOARDING_SIT,
      approach: 'pre',
      title: `Vendor onboarding · ${v.name}`,
      unit: '',
      owner: v.name,
      priority: 'medium',
      notes: `Opened by the Vendor onboarding runbook on ${today}: ${v.name} is on work orders for ${fmt(v.paid)} and ${v.hasRecord ? 'has no W-9 on file' : 'is not on Building › Contracts yet'}. Record, W-9, insurance and licenses, contract.`,
      assignedRole: managed ? 'Property Manager' : 'Treasurer',
      source: 'runbook',
      sourceId: onboardingSourceId(v.name),
      customSteps: onboardingSteps(v.name),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncOnboardingCase(created);
  }
  return out;
}
