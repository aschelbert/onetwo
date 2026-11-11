/**
 * On the annual meeting's budget step: whether the budget it presents has
 * been adopted, and the way to it. The budget is made in the Annual budget
 * runbook; this step brings it to the owners and ticks itself once the board
 * has adopted it.
 */
import { useNavigate } from 'react-router-dom';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { Button } from '../../components';
import { dayLabel } from '../../home/calendar';
import { casePath } from '../../shell/caseDock';
import { addDays } from '@/lib/billingCycle';
import { BUDGET_LEAD_DAYS, MEETING_BUDGET_STEP, budgetForMeeting, budgetStepIndex, startBudgetNow } from '../annualBudget';
import { ANNUAL_MEETING_SIT } from '../meetings';

export function MeetingBudgetNote({ c, step }: { c: CaseTrackerCase; step: CaseStep }) {
  const navigate = useNavigate();
  // Re-render as the budget moves.
  useIssuesStore(s => s.cases);
  useBudgetDraftStore(s => s.drafts);
  if (c.sitId !== ANNUAL_MEETING_SIT || !MEETING_BUDGET_STEP.test(step.s)) return null;
  const b = budgetForMeeting(c.dueDate ?? new Date().toISOString().slice(0, 10));
  const open = (idx?: number) => b.action && navigate(casePath(b.action.id, idx != null && idx >= 0 ? { step: idx, approach: null } : undefined));
  const next = b.action?.steps?.findIndex(s => !s.done) ?? -1;
  const tone = b.adoptedAt ? 'border-ux2-sage bg-ux2-sage-tint/50' : 'border-ux2-amber bg-ux2-amber-tint/60';
  return (
    <div data-meeting-budget className={`ux2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3 ${tone}`}>
      <div className="min-w-[220px] flex-1 text-[13px] text-ux2-ink">
        {b.adoptedAt
          ? <><b className="font-semibold">The board adopted the {b.label} budget on {dayLabel(b.adoptedAt)}.</b> Bring it to the owners: it is filed under Building › Documents › Budgets once the budget's last step is done.</>
          : b.action
            ? <><b className="font-semibold">The {b.label} budget isn't adopted yet.</b> It is on step {next + 1} of {b.action.steps?.length}{next >= 0 ? `: ${b.action.steps![next].s}` : ''}. This step ticks itself once the board adopts it.</>
            : <><b className="font-semibold">The {b.label} budget hasn't been started.</b> The Annual budget runbook starts it on {dayLabel(addDays(b.fy.start, -BUDGET_LEAD_DAYS))}; start it now to have it adopted before this meeting.</>}
      </div>
      {b.action
        ? <Button size="sm" onClick={() => open(b.adoptedAt ? budgetStepIndex(b.action!, 'adopt') : next)}>Open the budget</Button>
        : <Button size="sm" onClick={() => { const id = startBudgetNow(); navigate(casePath(id, { step: 0, approach: null })); }}>Start the budget now</Button>}
    </div>
  );
}
