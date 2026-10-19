/**
 * Step adapters — convert runbook items, CATS cases, and setup sub-tasks
 * into the unified Step shape.
 */

import type { Step } from '@/types/steps';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { Situation } from '@/store/useIssuesStore';
import type { BuildingMember, BoardRoleKey } from '@/types/auth';
import type { StepConfig, CompletionContext } from '@/features/setup/setup-steps';

// ── Runbook Item → Step ───────────────────────────────────────────────────

/**
 * Convert a single runbook ComplianceItem into a Step.
 *
 * @param item       The compliance/runbook item
 * @param completion Whether this item is completed
 * @param season     Optional season context for the milestone container id
 */
export function fromRunbookItem(
  item: ComplianceItem,
  completion: boolean,
  season?: { milestoneId: string },
): Step {
  const containerId = season?.milestoneId ?? item.id;

  return {
    id: `milestone:${containerId}:0`,
    containerType: 'milestone',
    containerId,
    index: 0,
    total: 1,
    title: item.task,
    detail: item.tip || undefined,
    ownerRole: item.primaryRole,
    ownerName: undefined,
    dueDate: isFixedDate(item.due) ? item.due : null,
    dueRule: isFixedDate(item.due) ? undefined : item.due,
    legalRef: item.legalRef || undefined,
    actionType: 'runbook_outcome',
    proofRequired: false,
    status: completion ? 'done' : 'open',
    drawer: {
      id: 'runbook',
      params: { itemId: item.id },
    },
  };
}

// ── Case → Step[] ─────────────────────────────────────────────────────────

/**
 * Convert a CATS case (with its template situation) into an array of Steps,
 * one per CaseStep.
 *
 * @param caseData     The CaseTrackerCase
 * @param situation    The CATS situation template (for legal refs etc.)
 * @param members      Board members for owner name resolution
 */
export function fromCase(
  caseData: CaseTrackerCase,
  situation: Situation | undefined,
  members: BuildingMember[],
): Step[] {
  const steps = caseData.steps;
  if (!steps || steps.length === 0) return [];

  const assignedMember = members.find(
    m => m.id === caseData.assignedTo || m.name === caseData.assignedTo,
  );

  return steps.map((st, i) => {
    const ownerRole: BoardRoleKey | undefined =
      (caseData.assignedRole as BoardRoleKey | undefined) ?? assignedMember?.roleKey;

    return {
      id: `case:${caseData.id}:${i}`,
      containerType: 'case' as const,
      containerId: caseData.id,
      index: i,
      total: steps.length,
      title: st.s,
      detail: st.detail ?? st.desc ?? undefined,
      ownerRole,
      ownerName: assignedMember?.name ?? caseData.assignedTo,
      dueDate: caseData.dueDate ?? null,
      dueRule: st.t ?? undefined,
      legalRef: st.d ?? undefined,
      actionType: 'case_step' as const,
      proofRequired: hasProofRequirement(st),
      status: stepStatus(st),
      completedBy: st.done ? (assignedMember?.name ?? 'Board') : undefined,
      completedAt: st.doneDate ?? undefined,
      drawer: {
        id: 'case_step',
        params: { caseId: caseData.id, stepIndex: String(i) },
      },
    };
  });
}

// ── Setup Sub-task → Step ─────────────────────────────────────────────────

/**
 * Convert setup step configs into Steps.
 *
 * @param stepConfig  The setup StepConfig (group of sub-tasks)
 * @param ctx         CompletionContext for checking done status
 */
export function fromSetupStep(
  stepConfig: StepConfig,
  ctx: CompletionContext,
): Step[] {
  const subTasks = stepConfig.subTasks;
  return subTasks.map((sub, i) => ({
    id: `setup:${stepConfig.stepNumber}:${i}`,
    containerType: 'setup' as const,
    containerId: String(stepConfig.stepNumber),
    index: i,
    total: subTasks.length,
    title: sub.label,
    detail: stepConfig.description,
    ownerRole: 'president' as BoardRoleKey,
    ownerName: undefined,
    dueDate: null,
    dueRule: undefined,
    legalRef: undefined,
    actionType: 'setup_task' as const,
    proofRequired: false,
    status: sub.checkComplete(ctx) ? 'done' : 'open',
    drawer: {
      id: 'setup',
      params: {
        stepNumber: String(stepConfig.stepNumber),
        subTaskId: sub.id,
        ...(sub.navigateTo ? { navigateTo: sub.navigateTo } : {}),
      },
    },
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isFixedDate(due: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

function hasProofRequirement(st: CaseStep): boolean {
  if (st.checks && st.checks.length > 0) return true;
  if (st.requiresBids) return true;
  if (st.requiresConflictCheck) return true;
  if (st.isSpendingDecision) return true;
  return false;
}

function stepStatus(st: CaseStep): Step['status'] {
  if (st.done) return 'done';
  return 'open';
}
