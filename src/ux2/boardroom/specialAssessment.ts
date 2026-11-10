/**
 * The special assessment runbook, wired: when the board approves a
 * spending request funded by a special assessment, one case opens to
 * levy it: each unit's share, the resolution, the owner vote where the
 * bylaws want one, the notice, the invoices, the collection. The app
 * ticks the shares at once, the notice once one goes out, the levy once
 * every unit has its invoice, and the collection once they are all paid.
 * One case per approved request; a special assessment case the board
 * opened by hand counts instead.
 *
 * The database runs the same job every morning (run_special_assessment,
 * migration 058); the step texts here and there must stay the same.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useSpendingStore, type SpendingApproval } from '@/store/useSpendingStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { todayIso } from '../runbook/adapters';

export const SPECIAL_ASSESSMENT_ID = 'special-assessment';
export const SPECIAL_ASSESSMENT_SIT = 'runbook-special-assessment';
export const assessmentSourceId = (approvalId: string) => `${SPECIAL_ASSESSMENT_ID}:${approvalId}`;
/** Owners hear of a special assessment at least this many days before it is due. */
export const ASSESSMENT_NOTICE_DAYS = 30;

export const STEP = { shares: 0, resolution: 1, vote: 2, notice: 3, levy: 4, collect: 5 } as const;

export const assessmentApproved = (a: SpendingApproval) => a.status === 'approved' && a.fundingSource === 'special_assessment';

/** The runbook's case for this request, or a special assessment case the board already has open. */
export function assessmentCase(cases: CaseTrackerCase[], approvalId: string): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && c.sourceId === assessmentSourceId(approvalId)) || (c.status !== 'closed' && c.sitId === 'special-assessments' && c.source !== 'runbook'));
}

export function assessmentSteps(a: SpendingApproval, unitCount: number): { s: string; detail?: string; ck?: string[] }[] {
  const per = unitCount > 0 ? Math.round(a.amount / unitCount) : 0;
  return [
    { s: `Compute each unit's share of ${fmt(a.amount)} by percentage interest`, detail: `${unitCount} unit${unitCount === 1 ? '' : 's'}, about ${fmt(per)} each at equal shares; the Declaration's percentage interests set the real split (Funds › Income › Units has each unit's). This step ticks itself: the figures are in the ledger.` },
    { s: 'Board resolution: adopt the assessment, the due date, the payment plan', ck: ['Resolution in the minutes with the amount, the purpose and the due date', 'Installments or a hardship option offered on the same terms to every owner'] },
    { s: 'Owner vote, if the bylaws require one at this amount', ck: ['Bylaws and DC Code § 42-1903.08 checked for the threshold', 'Meeting notice with the proposal, the per-unit amounts and a proxy form'] },
    { s: `Notice to every owner at least ${ASSESSMENT_NOTICE_DAYS} days before the due date`, detail: 'Post it as a financial notice under Community and mail it where the bylaws require. This step ticks itself when a notice about the assessment goes out after this case opened.' },
    { s: 'Levy it: a special assessment invoice on every unit', detail: 'Funds › Income › Units › Charge, type Special assessment, one per unit at its share, into the reserve fund. This step ticks itself when every unit has one.' },
    { s: 'Collect it and keep the money in its fund', detail: 'Payments apply through the unit ledgers; Collections runs on any unit 30 days late. This step ticks itself when every invoice is paid.' },
  ];
}

const noticeAfter = (c: CaseTrackerCase) => {
  const since = c.created.slice(0, 10);
  const comp = useComplianceStore.getState();
  return comp.announcements.some(x => /assessment/i.test(x.title) && x.postedDate.slice(0, 10) >= since)
    || comp.communications.some(x => /assessment/i.test(x.subject) && x.status === 'sent' && x.date.slice(0, 10) >= since);
};

/** Tick what the ledger and the notices show. */
export function syncAssessmentCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${SPECIAL_ASSESSMENT_ID}:`)) return;
  const fin = useFinancialStore.getState();
  const complete = useIssuesStore.getState().completeStep;
  if (!c.steps[STEP.shares].done) complete(c.id, STEP.shares);
  if (!c.steps[STEP.notice].done && noticeAfter(c)) complete(c.id, STEP.notice);
  const since = c.created.slice(0, 10);
  const levied = fin.unitInvoices.filter(i => i.type === 'special_assessment' && i.status !== 'void' && i.createdDate.slice(0, 10) >= since);
  const units = fin.units.filter(u => u.monthlyFee > 0 || u.votingPct > 0);
  const every = units.length > 0 && units.every(u => levied.some(i => i.unitNumber === u.number));
  if (!c.steps[STEP.levy].done && every) complete(c.id, STEP.levy);
  if (!c.steps[STEP.collect].done && every && levied.every(i => i.status === 'paid')) complete(c.id, STEP.collect);
}

export interface AssessmentRun { opened: string[] }

export function runSpecialAssessments(today: string = todayIso()): AssessmentRun {
  const fin = useFinancialStore.getState();
  const out: AssessmentRun = { opened: [] };
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${SPECIAL_ASSESSMENT_ID}:`)) syncAssessmentCase(c);
  if (fin.runbooksOff.includes(SPECIAL_ASSESSMENT_ID)) return out;
  for (const a of useSpendingStore.getState().approvals) {
    if (!assessmentApproved(a)) continue;
    if (assessmentCase(useIssuesStore.getState().cases, a.id)) continue;
    const unitCount = fin.units.length;
    const id = useIssuesStore.getState().createCase({
      catId: 'financial',
      sitId: SPECIAL_ASSESSMENT_SIT,
      approach: 'pre',
      title: `Special assessment · ${a.title} · ${fmt(a.amount)}`,
      unit: '',
      owner: a.requestedBy || '',
      priority: 'high',
      notes: `Opened by the Special assessment runbook on ${today}: the board approved ${fmt(a.amount)} for ${a.title}${a.decidedAt ? ` on ${a.decidedAt.slice(0, 10)}` : ''}, funded by a special assessment across ${unitCount} unit${unitCount === 1 ? '' : 's'}. Shares by percentage interest, a resolution, the owner vote where the bylaws want one, ${ASSESSMENT_NOTICE_DAYS} days' notice, then the invoices.`,
      assignedRole: 'Treasurer',
      source: 'runbook',
      sourceId: assessmentSourceId(a.id),
      customSteps: assessmentSteps(a, unitCount),
    });
    out.opened.push(id);
    const created = useIssuesStore.getState().cases.find(c => c.id === id);
    if (created) syncAssessmentCase(created);
  }
  return out;
}
