/**
 * Milestone Cases — maps milestone IDs to CATS situation IDs.
 *
 * When a milestone's season is active and no case exists with
 * `linkedMilestoneId === milestoneId`, the milestone's progress
 * reads from the linked case's steps.  `createCaseForMilestone`
 * in useIssuesStore creates the case and stamps the link.
 */

export interface MilestoneCaseMapping {
  milestoneId: string;
  /** CATS category id (e.g. 'financial') */
  catId: string;
  /** CATS situation id (e.g. 'annual-budgeting') */
  situationId: string;
  /** Default approach for the auto-created case */
  approach: 'pre' | 'self' | 'legal';
  /** Title template for the auto-created case */
  titleTemplate: string;
}

/**
 * Static map: milestone id -> CATS situation.
 *
 * Only milestones that have a direct CATS multi-step equivalent appear here.
 * When the season activates, the engine spawns the case and removes the
 * duplicate runbook items from the queue.
 */
export const MILESTONE_CASES: MilestoneCaseMapping[] = [
  {
    milestoneId: 'budget-preparation',
    catId: 'financial',
    situationId: 'annual-budgeting',
    approach: 'pre',
    titleTemplate: 'Annual Budget {year}',
  },
  {
    milestoneId: 'annual-meeting-prep',
    catId: 'governance',
    situationId: 'annual-meeting-preparation',
    approach: 'pre',
    titleTemplate: 'Annual Meeting {year}',
  },
  {
    milestoneId: 'maint-insurance-renewals',
    catId: 'financial',
    situationId: 'insurance-renewals',
    approach: 'pre',
    titleTemplate: 'Insurance Renewals {year}',
  },
];

/**
 * Lookup: milestone id -> mapping. Returns undefined if no mapping exists.
 */
export function getMilestoneCaseMapping(milestoneId: string): MilestoneCaseMapping | undefined {
  return MILESTONE_CASES.find(m => m.milestoneId === milestoneId);
}

/**
 * All milestone IDs that have a CATS case equivalent.
 */
export function milestoneCaseIds(): string[] {
  return MILESTONE_CASES.map(m => m.milestoneId);
}
