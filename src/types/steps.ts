/**
 * Step — unified shape for runbook how-to items, CATS case steps,
 * setup sub-tasks, and (later) month-close steps.
 *
 * The queue and drawers treat every Step alike regardless of origin.
 */

import type { BoardRoleKey } from '@/types/auth';

export type StepContainerType = 'milestone' | 'case' | 'setup' | 'close';

export interface Step {
  /** Composite id: `${containerType}:${containerId}:${index}` */
  id: string;
  containerType: StepContainerType;
  containerId: string;
  index: number;
  total: number;
  title: string;
  detail?: string;
  ownerRole?: BoardRoleKey;
  ownerName?: string;
  dueDate: string | null;
  dueRule?: string;
  legalRef?: string;
  actionType: 'runbook_outcome' | 'case_step' | 'setup_task' | 'close_step';
  proofRequired: boolean;
  status: 'open' | 'done' | 'skipped' | 'blocked';
  completedBy?: string;
  completedAt?: string;
  proofRef?: string;
  drawer: { id: string; params: Record<string, string> };
}
