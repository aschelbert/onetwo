import { describe, it, expect } from 'vitest';
import { outcomesFor, type Outcome } from '@/features/compliance/runbookOutcomes';
import type { ComplianceItem } from '@/lib/complianceRefresh';

function makeItem(overrides: Partial<ComplianceItem> = {}): ComplianceItem {
  return {
    id: 'test1',
    task: 'Test task',
    role: 'President',
    freq: 'Annual',
    due: '2026-06-30',
    critical: false,
    tip: 'Test tip',
    legalRef: 'Test Ref',
    whyItMatters: 'Important',
    consequence: 'Bad things',
    howTo: ['Step 1', 'Step 2'],
    fiduciaryDuty: 'care',
    scope: 'governance',
    ...overrides,
  };
}

const noTemplates = { hasTemplateFor: () => false, isFiling: false };
const allTemplates = { hasTemplateFor: () => true, isFiling: false };

function kinds(outcomes: Outcome[]): string[] {
  return outcomes.map((o) => o.kind);
}

describe('outcomesFor', () => {
  it('returns done_with_upload and done_later_proof for document action', () => {
    const item = makeItem({ satisfyingAction: 'document' });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('done_with_upload');
    expect(k).toContain('done_later_proof');
  });

  it('returns schedule_meeting and done_plain for meeting action', () => {
    const item = makeItem({ satisfyingAction: 'meeting' });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('schedule_meeting');
    expect(k).toContain('done_plain');
  });

  it('returns mark_filed for filing action', () => {
    const item = makeItem({ satisfyingAction: 'filing' });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('mark_filed');
  });

  it('returns send_letter for filing action when template exists', () => {
    const item = makeItem({ satisfyingAction: 'filing' });
    const result = outcomesFor(item, allTemplates);
    const k = kinds(result);
    expect(k).toContain('send_letter');
  });

  it('returns open_case and done_plain for case action', () => {
    const item = makeItem({ satisfyingAction: 'case' });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('open_case');
    expect(k).toContain('done_plain');
  });

  it('returns done_with_upload and done_plain for review action', () => {
    const item = makeItem({ satisfyingAction: 'review' });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('done_with_upload');
    expect(k).toContain('done_plain');
  });

  it('returns done_with_upload and done_plain for undefined action', () => {
    const item = makeItem({ satisfyingAction: undefined });
    const result = outcomesFor(item, noTemplates);
    const k = kinds(result);
    expect(k).toContain('done_with_upload');
    expect(k).toContain('done_plain');
  });

  it('always includes not_applicable', () => {
    const actions: Array<ComplianceItem['satisfyingAction']> = [
      'document',
      'meeting',
      'filing',
      'case',
      'review',
      undefined,
    ];
    for (const action of actions) {
      const item = makeItem({ satisfyingAction: action });
      const result = outcomesFor(item, noTemplates);
      expect(kinds(result)).toContain('not_applicable');
    }
  });

  it('always includes "Something else" as the last outcome', () => {
    const actions: Array<ComplianceItem['satisfyingAction']> = [
      'document',
      'meeting',
      'filing',
      'case',
      'review',
      undefined,
    ];
    for (const action of actions) {
      const item = makeItem({ satisfyingAction: action });
      const result = outcomesFor(item, noTemplates);
      const last = result[result.length - 1];
      expect(last.label).toBe('Something else');
      expect(last.kind).toBe('done_plain');
      expect(last.requiresReason).toBe(true);
    }
  });

  it('insurance items get send_letter when template exists', () => {
    const item = makeItem({
      id: 'i1',
      task: 'D&O insurance current',
      satisfyingAction: undefined,
    });
    const result = outcomesFor(item, allTemplates);
    const letterOutcomes = result.filter((o) => o.kind === 'send_letter');
    expect(letterOutcomes.length).toBeGreaterThanOrEqual(1);
    expect(letterOutcomes.some((o) => o.label === 'Ask the broker')).toBe(true);
  });

  it('vendor items get send_letter when template exists', () => {
    const item = makeItem({
      id: 'm4',
      task: 'Vendor contracts and licenses verified',
      satisfyingAction: undefined,
    });
    const result = outcomesFor(item, allTemplates);
    const letterOutcomes = result.filter((o) => o.kind === 'send_letter');
    expect(letterOutcomes.length).toBeGreaterThanOrEqual(1);
    expect(letterOutcomes.some((o) => o.label === 'Ask the vendor')).toBe(true);
  });

  it('insurance items do NOT get send_letter when no template matches', () => {
    const item = makeItem({
      id: 'i1',
      task: 'D&O insurance current',
      satisfyingAction: undefined,
    });
    const result = outcomesFor(item, noTemplates);
    const letterOutcomes = result.filter((o) => o.kind === 'send_letter');
    expect(letterOutcomes.length).toBe(0);
  });

  it('not_applicable requires a reason', () => {
    const item = makeItem({ satisfyingAction: 'document' });
    const result = outcomesFor(item, noTemplates);
    const na = result.find((o) => o.kind === 'not_applicable');
    expect(na).toBeDefined();
    expect(na!.requiresReason).toBe(true);
  });

  it('done_with_upload requires upload', () => {
    const item = makeItem({ satisfyingAction: 'document' });
    const result = outcomesFor(item, noTemplates);
    const upload = result.find((o) => o.kind === 'done_with_upload');
    expect(upload).toBeDefined();
    expect(upload!.requiresUpload).toBe(true);
  });
});
