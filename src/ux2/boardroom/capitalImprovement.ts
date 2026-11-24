/**
 * The capital improvement runbook, wired: a project started under Building ›
 * Projects gets one action, with the ten steps of a capital job, and each step
 * ticks itself from the project's own record as the work is entered on the
 * action's page. Closing the project out closes the action.
 *
 * It runs in the app only (no database twin), like the register's runbooks:
 * the action opens as the project is started.
 *
 * Two things happen here rather than on the screen, because they touch other
 * records: awarding the contract raises the work order the bill will be paid
 * on, and closing out resets the reserve component and the asset.
 */
import { useAuthStore } from '@/store/useAuthStore';
import { changeComponent } from './reserves';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { STEP_ORDER, STEP_TITLE, awardedBid, projectCost, projectSteps, type CapitalProject } from '@/lib/capitalProject';
import { CAPITAL_HOW as HOW } from './capitalPlan';
import { fundOf } from '@/lib/ledger';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const CAPITAL_ID = 'capital-improvement';
export const CAPITAL_SIT = `runbook-${CAPITAL_ID}`;
export const capitalSourceId = (projectId: string) => `${CAPITAL_ID}:${projectId}`;
export const projectCase = (cases: CaseTrackerCase[], projectId: string) => cases.find(c => c.source === 'runbook' && c.sourceId === capitalSourceId(projectId));
/** The project an action belongs to, when it is a capital improvement's. */
export const projectIdOf = (c: Pick<CaseTrackerCase, 'source' | 'sourceId'> | undefined) => (c?.source === 'runbook' && c.sourceId?.startsWith(`${CAPITAL_ID}:`) ? c.sourceId.slice(CAPITAL_ID.length + 1) : null);

/** The bylaws' spending limit, which sets how many bids a job needs. */
export const spendingLimit = () => useBuildingStore.getState().bylawsConfig?.boardSpendingLimit || 5000;

export function capitalSteps(): { s: string; detail?: string }[] {
  return STEP_ORDER.map(k => ({ s: STEP_TITLE[k], detail: `${HOW[k]}.` }));
}

/** The expense account a project's bill is booked to: the one tied to its reserve component, else any reserve expense account, else repairs. */
function accountFor(p: CapitalProject): string {
  const chart = useFinancialStore.getState().chartOfAccounts.filter(a => a.type === 'expense' && a.sub !== 'header');
  return (p.reserveItemId && chart.find(a => a.reserveItem === p.reserveItemId)?.num)
    || chart.find(a => fundOf(a) === 'reserve')?.num
    || chart.find(a => /maint|repair/i.test(a.name))?.num
    || chart[0]?.num || '5010';
}

/** Award the contract: record the bid and the date, and raise the approved work order its bill will be paid on. */
export function awardContract(projectId: string, bidId: string, reason: string, signedOn: string): void {
  const store = useCapitalProjectsStore.getState();
  const p = store.projects.find(x => x.id === projectId);
  const bid = p?.bids.find(b => b.id === bidId);
  if (!p || !bid) return;
  let workOrderId = p.workOrderId;
  if (!workOrderId) {
    const fin = useFinancialStore.getState();
    const linked = projectCase(useIssuesStore.getState().cases, projectId);
    fin.createWorkOrder({ title: p.title, vendor: bid.vendor, amount: bid.amount, acctNum: accountFor(p), caseId: linked?.id });
    workOrderId = useFinancialStore.getState().workOrders.slice(-1)[0]?.id ?? '';
    // The board's award is the approval; the bill still waits on the work being signed off.
    if (workOrderId) useFinancialStore.getState().approveWorkOrder(workOrderId);
  }
  store.patch(projectId, { awardedBidId: bidId, awardReason: reason.trim(), contractSignedOn: signedOn, workOrderId });
}

/** Sign off the finished work on the project and on its work order, so the bill can be approved for payment. */
export function signOffWork(projectId: string, by: string, on: string): void {
  const store = useCapitalProjectsStore.getState();
  const p = store.projects.find(x => x.id === projectId);
  if (!p) return;
  if (p.workOrderId) useFinancialStore.getState().signOffWorkOrder(p.workOrderId, by, '', on);
  store.patch(projectId, { signedOffOn: on, signedOffBy: by });
}

/**
 * Close the project out: the reserve component it replaced starts again (new
 * cost, full life, nothing set aside), the asset is marked new with its
 * warranty, and the project is closed.
 */
export function closeOut(projectId: string, on: string, newLifeYears: number, warrantyUntil: string): void {
  const store = useCapitalProjectsStore.getState();
  const p = store.projects.find(x => x.id === projectId);
  if (!p || p.closedOn) return;
  const cost = projectCost(p);
  const life = Math.max(1, Math.round(newLifeYears) || 1);
  const vendor = awardedBid(p)?.vendor ?? '';
  const fin = useFinancialStore.getState();
  if (p.reserveItemId && fin.reserveItems.some(r => r.id === p.reserveItemId)) {
    // Through the reserves' own door, so the replacement is dated, has its reason, and opens a funding review.
    changeComponent({ kind: 'replace', id: p.reserveItemId, on, cost, life }, `Capital project closed: ${p.title}`, useAuthStore.getState().currentUser.name || 'The board', on);
  }
  const b = useBuildingStore.getState();
  if (p.assetId && b.assets.some(a => a.id === p.assetId)) {
    b.updateAsset(p.assetId, { installedDate: on, condition: 'Excellent', usefulLifeYears: life, remainingLifeYears: life, replacementCostToday: cost, originalCost: cost });
    if (warrantyUntil) b.addWarranty(p.assetId, { description: `${p.title} · installation`, type: 'Installation', vendorId: '', vendorName: vendor, expires: warrantyUntil, documentRef: '' });
  }
  store.patch(projectId, { closedOn: on, newLifeYears: life, warrantyUntil });
}

/** Tick what the project's record shows on its action, pick up a paid bill, and close the action at close-out. */
export function syncCapitalCase(c: CaseTrackerCase, today: string = todayIso()): void {
  const id = projectIdOf(c);
  if (!id || c.status === 'closed' || !c.steps) return;
  let p = useCapitalProjectsStore.getState().projects.find(x => x.id === id);
  if (!p) return;
  // The bill is paid in Funds; the project learns of it here.
  if (p.workOrderId && !p.paidOn) {
    const wo = useFinancialStore.getState().workOrders.find(w => w.id === p!.workOrderId);
    if (wo?.status === 'paid') {
      useCapitalProjectsStore.getState().patch(id, { paidOn: wo.paidDate || today });
      p = useCapitalProjectsStore.getState().projects.find(x => x.id === id)!;
    }
  }
  const steps = projectSteps(p, spendingLimit());
  const complete = useIssuesStore.getState().completeStep;
  steps.forEach((s, i) => { if (s.done && c.steps![i] && !c.steps![i].done) complete(c.id, i); });
  if (p.closedOn) useIssuesStore.getState().closeCaseWithReason(c.id, 'Project closed out', `${p.title} closed out ${p.closedOn}.`);
}

export interface CapitalRun { opened: string[] }

/** Open an action for every open project that has none, then tick every capital improvement action. */
export function runCapitalImprovement(today: string = todayIso()): CapitalRun {
  const out: CapitalRun = { opened: [] };
  if (!useFinancialStore.getState().runbooksOff.includes(CAPITAL_ID)) {
    for (const p of useCapitalProjectsStore.getState().projects) {
      if (p.closedOn || projectCase(useIssuesStore.getState().cases, p.id)) continue;
      const id = useIssuesStore.getState().createCase({
        catId: 'strategic', sitId: CAPITAL_SIT, approach: 'pre',
        title: `Capital improvement · ${p.title}`, unit: '', owner: '', priority: 'medium', assignedRole: 'President',
        notes: `Opened by the Capital improvement runbook on ${today}: ${p.need}`,
        source: 'runbook', sourceId: capitalSourceId(p.id), customSteps: capitalSteps(),
      });
      out.opened.push(id);
    }
  }
  for (const c of useIssuesStore.getState().cases) if (projectIdOf(c) && c.status !== 'closed') syncCapitalCase(c, today);
  return out;
}
