/**
 * A Tasker job's lifecycle inside an action, and everything it touches.
 *
 *   book         the board asks a Tasker (over the per-job limit only after a board vote on the action)
 *   accepted     a work order is opened on the action and approved; the owner hears it is scheduled
 *   on the way → checked in → (scope request) → done
 *   confirm      the final bill is entered as the work order's invoice and paid;
 *                the checklist item ticks, so the step can complete
 *   rate         the Tasker shows first next time if the board rated them well
 *
 * Off the happy path: no reply (choose again), the Tasker cancels (rebook on
 * the same work order), the board cancels, a problem with the work (payment
 * held; free return visit, or cancel), and a licensed trade found on site.
 *
 * Every step writes one line to the action's decision trail. `applyUpdate` is
 * what TaskRabbit's webhooks will call once the partner API is live; until
 * then the panel's demo controls call it.
 */
import { useTaskerStore, nowStamp, type TaskerJob } from '@/store/useTaskerStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase } from '@/types/issues';
import { DEFAULT_TASKER_LIMIT, MIN_BILLED_HOURS, TIME_SLOTS, estimateFor, taskerById, type TaskCategoryId, type TaskerUpdate, type TimeSlotId } from './taskRabbit';

/** Repairs and maintenance: where Tasker work is charged. */
export const TASKER_ACCOUNT = '5010';

/** The building's per-job limit (Funds › Settings › Billing rules, or Change on the Tasker panel). */
export const taskerLimit = () => useFinancialStore.getState().taskerLimit ?? DEFAULT_TASKER_LIMIT;
export const ownerVoteLimit = () => useBuildingStore.getState().bylawsConfig.boardSpendingLimit;

/** The board approved spending on this action: its recorded vote has more approvals than denials. */
export function boardApproved(c: CaseTrackerCase | undefined): boolean {
  const v = c?.boardVotes;
  if (!v?.votes?.length) return false;
  const yes = v.votes.filter(x => x.vote === 'approve').length;
  const no = v.votes.filter(x => x.vote === 'deny').length;
  return yes > no;
}

export type SpendGate = { ok: true; why: string } | { ok: false; needs: 'board-vote' | 'not-tasker'; why: string };

/** Can this amount be booked on this action now? */
export function spendGate(amount: number, c: CaseTrackerCase | undefined): SpendGate {
  const limit = taskerLimit();
  if (amount > ownerVoteLimit()) return { ok: false, needs: 'not-tasker', why: `${fmt(amount)} is over the ${fmt(ownerVoteLimit())} bylaws limit. That is a vendor project, not a Tasker job.` };
  if (amount <= limit) return { ok: true, why: `${fmt(amount)} is within the ${fmt(limit)} limit for Tasker jobs. No vote needed.` };
  if (boardApproved(c)) return { ok: true, why: `Over the ${fmt(limit)} limit; the board approved it on this action.` };
  return { ok: false, needs: 'board-vote', why: `${fmt(amount)} is over the ${fmt(limit)} limit for Tasker jobs. Record the board's vote on this action first.` };
}

export const slotLabel = (slot: TimeSlotId) => TIME_SLOTS.find(s => s.id === slot)?.label ?? slot;
const when = (j: Pick<TaskerJob, 'date' | 'slot'>) => `${j.date}, ${slotLabel(j.slot)}`;

const caseOf = (id: string) => useIssuesStore.getState().cases.find(c => c.id === id);
const trail = (caseId: string, actor: string, summary: string, woId?: string | null) =>
  useIssuesStore.getState().addTrailEntry(caseId, {
    type: 'tasker_update', date: nowStamp().slice(0, 10), actor, summary,
    ...(woId ? { linkedEntityType: 'work_order', linkedEntityId: woId } : {}),
  });
const job = (id: string) => useTaskerStore.getState().jobs.find(j => j.id === id);

/** The owner's request behind the action, if there is one: they hear about the booking there. */
function tellOwner(j: TaskerJob, text: string) {
  const c = caseOf(j.caseId);
  if (!j.notifyOwner || c?.source !== 'issue' || !c.sourceId) return;
  const issues = useIssuesStore.getState();
  if (issues.issues.some(i => i.id === c.sourceId)) issues.addIssueComment(c.sourceId, 'The board', text);
}

export interface BookInput {
  caseId: string; stepIdx: number; checkId: string;
  category: TaskCategoryId; title: string; details: string;
  date: string; slot: TimeSlotId; access: string;
  taskerId: string; estimateHours: number; notifyOwner: boolean; bookedBy: string;
}

/**
 * Change the per-job limit. Refused over the bylaws spending limit (that is owner-vote territory) or below $0.
 * Changed from an action, the change goes on that action's decision trail too.
 */
export function changeTaskerLimit(amount: number, by: string, caseId?: string): boolean {
  const before = taskerLimit();
  if (!useFinancialStore.getState().setTaskerLimit(amount)) return false;
  const after = taskerLimit();
  if (caseId && after !== before) trail(caseId, by, `Changed the limit for Tasker jobs without a board vote from ${fmt(before)} to ${fmt(after)}.`);
  return true;
}

/** Ask a Tasker. Refuses (returns null) when the amount is not allowed yet. */
export function book(input: BookInput): TaskerJob | null {
  const t = taskerById(input.taskerId);
  if (!t) return null;
  const estimate = estimateFor(t.rate, input.estimateHours);
  if (!spendGate(estimate, caseOf(input.caseId)).ok) return null;
  const j: TaskerJob = {
    ...input, id: `TJ-${Date.now().toString(36).toUpperCase()}`,
    taskerName: t.name, rate: t.rate, estimate, parts: 0, status: 'requested', woId: null,
    createdAt: nowStamp(), events: [{ at: nowStamp(), who: input.bookedBy, text: `Asked ${t.name} through TaskRabbit` }],
  };
  useTaskerStore.getState().addJob(j);
  trail(j.caseId, input.bookedBy, `Asked ${t.name} through TaskRabbit for ${when(j)}: ${j.title}, est. ${fmt(estimate)} (${input.estimateHours} hr at ${fmt(t.rate)}/hr).`);
  return j;
}

/** Ask another Tasker for the same job (no reply, or they cancelled). The work order, if any, moves with it. */
export function rebook(jobId: string, taskerId: string, by: string, patch: Partial<Pick<TaskerJob, 'date' | 'slot'>> = {}): void {
  const j = job(jobId); const t = taskerById(taskerId);
  if (!j || !t) return;
  const estimate = estimateFor(t.rate, j.estimateHours);
  useTaskerStore.getState().updateJob(j.id, { ...patch, taskerId: t.id, taskerName: t.name, rate: t.rate, estimate, status: 'requested', eta: undefined, scope: undefined }, { who: by, text: `Asked ${t.name} instead` });
  if (j.woId) useFinancialStore.getState().updateWorkOrder(j.woId, { vendor: `TaskRabbit · ${t.name}`, amount: estimate + j.parts });
  trail(j.caseId, by, `Asked ${t.name} instead of ${j.taskerName}, est. ${fmt(estimate)}.`, j.woId);
}

/** What TaskRabbit reports. Live, a webhook calls this. */
export function applyUpdate(jobId: string, u: TaskerUpdate): void {
  const j = job(jobId);
  if (!j) return;
  const store = useTaskerStore.getState();
  const fin = useFinancialStore.getState();
  const who = 'TaskRabbit';
  switch (u.kind) {
    case 'accepted': {
      if (j.status !== 'requested') return;
      let woId = j.woId;
      if (!woId) {
        fin.createWorkOrder({ title: j.title, vendor: `TaskRabbit · ${j.taskerName}`, amount: j.estimate, acctNum: TASKER_ACCOUNT, caseId: j.caseId });
        const made = useFinancialStore.getState().workOrders;
        woId = made[made.length - 1]?.id ?? null;
        if (woId) useIssuesStore.getState().linkWO(j.caseId, woId);
      }
      if (woId) useFinancialStore.getState().approveWorkOrder(woId);
      store.updateJob(j.id, { status: 'scheduled', woId }, { who, text: `${j.taskerName} accepted. Access details sent.` });
      trail(j.caseId, who, `${j.taskerName} accepted ${when(j)}. Access details released. Work order ${woId ?? ''} approved for ${fmt(j.estimate + j.parts)}.`, woId);
      tellOwner(j, `A Tasker is booked to take care of this on ${when(j)}.`);
      return;
    }
    case 'no-reply':
      if (j.status !== 'requested') return;
      store.updateJob(j.id, { status: 'no-reply' }, { who, text: `${j.taskerName} did not accept in time` });
      trail(j.caseId, who, `${j.taskerName} did not accept in time. Nothing was shared with them.`);
      return;
    case 'on-the-way':
      if (j.status !== 'scheduled') return;
      store.updateJob(j.id, { status: 'on-the-way', eta: u.eta }, { who, text: `On the way, arriving ${u.eta}` });
      trail(j.caseId, who, `${j.taskerName} is on the way, arriving ${u.eta}.`);
      return;
    case 'checked-in':
      if (j.status !== 'on-the-way' && j.status !== 'scheduled') return;
      store.updateJob(j.id, { status: 'working' }, { who, text: 'Checked in. Work started.' });
      trail(j.caseId, who, `${j.taskerName} checked in and started.`);
      return;
    case 'scope-request':
      if (j.status !== 'working') return;
      store.updateJob(j.id, { status: 'scope-request', scope: { extraHours: u.extraHours, parts: u.parts, note: u.note } }, { who, text: `Asked for ${u.extraHours} more hr${u.parts ? ` and ${fmt(u.parts)} in parts` : ''}` });
      trail(j.caseId, who, `${j.taskerName} asked for ${u.extraHours} more hr${u.parts ? ` and ${fmt(u.parts)} in parts` : ''}: "${u.note}"`);
      return;
    case 'done': {
      if (j.status !== 'working') return;
      const billedHours = j.returnVisit ? 0 : Math.max(MIN_BILLED_HOURS, Math.ceil(u.hoursWorked * 4) / 4);
      const amount = j.returnVisit ? (j.final?.amount ?? 0) : Math.round(billedHours * j.rate) + j.parts;
      store.updateJob(j.id, { status: 'done', final: { hoursWorked: u.hoursWorked, billedHours: j.returnVisit ? (j.final?.billedHours ?? 0) : billedHours, amount, note: u.note, photos: u.photos } }, { who, text: `Marked done: ${u.photos} photos` });
      trail(j.caseId, who, `${j.taskerName} marked it done${j.returnVisit ? ' (return visit, no charge)' : `: ${billedHours} hr billed, ${fmt(amount)}`}. "${u.note}"`);
      return;
    }
    case 'tasker-cancelled':
      if (!['requested', 'scheduled', 'on-the-way'].includes(j.status)) return;
      store.updateJob(j.id, { status: 'tasker-cancelled', eta: undefined }, { who, text: `${j.taskerName} cancelled: ${u.reason}` });
      trail(j.caseId, who, `${j.taskerName} cancelled: ${u.reason}`, j.woId);
      return;
  }
}

/** The board answers a request for more time or parts. Over the limit, it needs the board's vote first. */
export function answerScope(jobId: string, approve: boolean, by: string): SpendGate | null {
  const j = job(jobId);
  if (!j?.scope || j.status !== 'scope-request') return null;
  if (!approve) {
    useTaskerStore.getState().updateJob(j.id, { status: 'working', scope: undefined }, { who: by, text: 'Declined the extra time' });
    trail(j.caseId, by, `Declined ${j.taskerName}'s request for more time.`);
    return null;
  }
  const estimateHours = j.estimateHours + j.scope.extraHours;
  const estimate = estimateFor(j.rate, estimateHours);
  const parts = j.parts + j.scope.parts;
  const gate = spendGate(estimate + parts, caseOf(j.caseId));
  if (!gate.ok) return gate;
  useTaskerStore.getState().updateJob(j.id, { status: 'working', scope: undefined, estimateHours, estimate, parts }, { who: by, text: `Approved: now est. ${fmt(estimate + parts)}` });
  if (j.woId) useFinancialStore.getState().updateWorkOrder(j.woId, { amount: estimate + parts });
  trail(j.caseId, by, `Approved more time${parts > j.parts ? ' and parts' : ''}. Estimate now ${fmt(estimate + parts)}.`, j.woId);
  return gate;
}

/** The board cancels before the work starts. */
export function cancel(jobId: string, by: string, reason = 'Cancelled by the board'): void {
  const j = job(jobId);
  if (!j || ['working', 'scope-request', 'done', 'paid', 'cancelled'].includes(j.status)) return;
  useTaskerStore.getState().updateJob(j.id, { status: 'cancelled', eta: undefined }, { who: by, text: reason });
  if (j.woId) useFinancialStore.getState().updateWorkOrder(j.woId, { amount: 0, title: `${j.title} (cancelled)` });
  trail(j.caseId, by, `Cancelled the booking with ${j.taskerName}.${j.woId ? ` Work order ${j.woId} set to $0.` : ''}`, j.woId);
  if (j.woId) tellOwner(j, 'The Tasker visit we scheduled is cancelled. We will update you here.');
}

/** Something is wrong with the work: hold the payment. */
export function reportProblem(jobId: string, problem: string, by: string): void {
  const j = job(jobId);
  if (!j || j.status !== 'done') return;
  useTaskerStore.getState().updateJob(j.id, { status: 'problem', problem }, { who: by, text: `Reported a problem: ${problem}` });
  trail(j.caseId, by, `Reported a problem with the work: "${problem}". Payment held.`, j.woId);
}

/** Accept the Tasker's offer to come back and fix it, at no charge. */
export function acceptReturnVisit(jobId: string, date: string, slot: TimeSlotId, by: string): void {
  const j = job(jobId);
  if (!j || j.status !== 'problem') return;
  useTaskerStore.getState().updateJob(j.id, { status: 'scheduled', returnVisit: true, date, slot, problem: undefined }, { who: by, text: `Return visit ${date}, ${slotLabel(slot)}` });
  trail(j.caseId, by, `${j.taskerName} will come back ${date}, ${slotLabel(slot)}, at no charge. Payment still held.`, j.woId);
}

/**
 * Confirm the work and pay: the final bill is entered as the work order's
 * invoice and paid (Funds posts both), and the checklist item ticks.
 */
export function confirmAndPay(jobId: string, by: string): void {
  const j = job(jobId);
  if (!j?.final || j.status !== 'done') return;
  const fin = useFinancialStore.getState();
  if (j.woId) {
    fin.receiveInvoice(j.woId, `TR-${j.id.slice(3)}`, j.final.amount);
    useFinancialStore.getState().payWorkOrder(j.woId);
  }
  useTaskerStore.getState().updateJob(j.id, { status: 'paid' }, { who: by, text: `Confirmed and paid ${fmt(j.final.amount)}` });
  trail(j.caseId, by, `Confirmed the work and paid ${j.taskerName} ${fmt(j.final.amount)}.${j.woId ? ` Work order ${j.woId} invoiced and paid.` : ''}`, j.woId);
  const ck = caseOf(j.caseId)?.steps?.[j.stepIdx]?.checks?.find(x => x.id === j.checkId);
  if (ck && !ck.checked) useIssuesStore.getState().toggleCheck(j.caseId, j.stepIdx, j.checkId);
}

export function rate(jobId: string, stars: number, by: string): void {
  const j = job(jobId);
  if (!j || j.status !== 'paid') return;
  useTaskerStore.getState().updateJob(j.id, { rating: stars }, { who: by, text: `Rated ${stars} of 5` });
  trail(j.caseId, by, `Rated ${j.taskerName} ${stars} of 5.`);
}

/** Taskers this building has rated, best rating per Tasker: they are offered first. */
export function ratingsHere(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of useTaskerStore.getState().jobs) if (j.rating) out[j.taskerId] = Math.max(out[j.taskerId] ?? 0, j.rating);
  return out;
}

/** The demo's version of "what TaskRabbit says next" on the happy path. */
export function nextDemoUpdate(j: TaskerJob): TaskerUpdate | null {
  switch (j.status) {
    case 'requested': return { kind: 'accepted' };
    case 'scheduled': return { kind: 'on-the-way', eta: 'in about 15 minutes' };
    case 'on-the-way': return { kind: 'checked-in' };
    case 'working': return { kind: 'done', hoursWorked: Math.max(0.75, j.estimateHours - 0.1), note: 'All done. Before and after photos attached.', photos: 2 };
    default: return null;
  }
}
