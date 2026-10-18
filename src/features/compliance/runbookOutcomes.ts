/**
 * runbookOutcomes.ts — Pure logic for determining what answers to show
 * in the RunbookDrawer for a given ComplianceItem.
 *
 * No side effects. No imports from stores or services.
 */

import type { ComplianceItem } from '@/lib/complianceRefresh';

export interface Outcome {
  id: string;
  label: string;
  detail: string;
  kind:
    | 'done_with_upload'
    | 'done_later_proof'
    | 'send_letter'
    | 'open_case'
    | 'schedule_meeting'
    | 'mark_filed'
    | 'not_applicable'
    | 'done_plain';
  requiresUpload?: boolean;
  requiresReason?: boolean;
  letterTemplateHint?: string;
}

export interface OutcomeContext {
  hasTemplateFor: (hint: string) => boolean;
  isFiling: boolean;
}

// Item IDs that represent vendor-related items
const VENDOR_ITEM_IDS = new Set(['i5', 'm4']);

function isInsuranceOrVendorItem(item: ComplianceItem): boolean {
  return (
    item.id.startsWith('i') ||
    VENDOR_ITEM_IDS.has(item.id) ||
    item.task.toLowerCase().includes('insurance') ||
    item.task.toLowerCase().includes('vendor')
  );
}

function getLetterHint(item: ComplianceItem): string {
  if (item.task.toLowerCase().includes('insurance') || item.id.startsWith('i')) {
    return 'insurance_broker';
  }
  if (item.task.toLowerCase().includes('vendor') || item.id === 'm4') {
    return 'vendor_request';
  }
  return 'general_request';
}

export function outcomesFor(item: ComplianceItem, ctx: OutcomeContext): Outcome[] {
  const outcomes: Outcome[] = [];
  const action = item.satisfyingAction;

  switch (action) {
    case 'document':
      outcomes.push({
        id: 'upload',
        label: 'Done -- I have the document',
        detail: 'Upload or attach the document as proof.',
        kind: 'done_with_upload',
        requiresUpload: true,
      });
      outcomes.push({
        id: 'later_proof',
        label: 'Done -- I will attach proof later',
        detail: 'Marks complete now. A reminder task is created for 7 days.',
        kind: 'done_later_proof',
      });
      break;

    case 'meeting':
      outcomes.push({
        id: 'schedule',
        label: 'Schedule the meeting',
        detail: 'Opens the meeting scheduler with pre-filled details.',
        kind: 'schedule_meeting',
      });
      outcomes.push({
        id: 'already_held',
        label: 'Already held',
        detail: 'The meeting has already taken place.',
        kind: 'done_plain',
      });
      break;

    case 'filing':
      outcomes.push({
        id: 'filed',
        label: 'Mark as filed',
        detail: 'Record the filing date and confirmation number.',
        kind: 'mark_filed',
      });
      {
        const hint = getLetterHint(item);
        if (ctx.hasTemplateFor(hint)) {
          outcomes.push({
            id: 'send_letter',
            label: 'Send a letter',
            detail: 'Use a template to send a letter related to this filing.',
            kind: 'send_letter',
            letterTemplateHint: hint,
          });
        }
      }
      break;

    case 'case':
      outcomes.push({
        id: 'open_case',
        label: 'Open a case',
        detail: 'Create a case to track resolution. Item stays open until the case resolves.',
        kind: 'open_case',
      });
      outcomes.push({
        id: 'already_done',
        label: 'Already completed',
        detail: 'This has been handled outside the system.',
        kind: 'done_plain',
      });
      break;

    case 'review':
    default:
      outcomes.push({
        id: 'upload',
        label: 'Done -- I have documentation',
        detail: 'Upload or attach documentation as proof.',
        kind: 'done_with_upload',
        requiresUpload: true,
      });
      outcomes.push({
        id: 'reviewed',
        label: 'Reviewed and complete',
        detail: 'Mark as completed after review.',
        kind: 'done_plain',
      });
      break;
  }

  // Insurance and vendor items additionally get "send_letter" if template exists
  if (isInsuranceOrVendorItem(item) && action !== 'filing') {
    const hint = getLetterHint(item);
    if (ctx.hasTemplateFor(hint)) {
      const label = item.task.toLowerCase().includes('vendor')
        ? 'Ask the vendor'
        : 'Ask the broker';
      outcomes.push({
        id: 'ask_letter',
        label,
        detail: 'Send a templated letter requesting the needed documentation.',
        kind: 'send_letter',
        letterTemplateHint: hint,
      });
    }
  }

  // Always add not_applicable
  outcomes.push({
    id: 'not_applicable',
    label: 'Does not apply',
    detail: 'This requirement is not applicable to our association.',
    kind: 'not_applicable',
    requiresReason: true,
  });

  // Always add "Something else" last
  outcomes.push({
    id: 'something_else',
    label: 'Something else',
    detail: 'Provide a free-text reason.',
    kind: 'done_plain',
    requiresReason: true,
  });

  return outcomes;
}
