/**
 * With the backend on, the Annual budget's steps need the board's drafts
 * loaded before a new draft may start. A board member signing in never
 * loaded them, so every step sat on "Loading next year's draft…" with
 * nothing to do. The guide now loads them itself, and offers to try again
 * when the load fails instead of waiting forever.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fetchBudgetDrafts = vi.fn();
vi.mock('@/lib/supabase', async (orig) => ({ ...(await orig<typeof import('@/lib/supabase')>()), isBackendEnabled: true, getActiveTenantId: () => 't1' }));
vi.mock('@/lib/services/budgetDrafts', () => ({ fetchBudgetDrafts: (...a: unknown[]) => fetchBudgetDrafts(...a), saveBudgetDraft: vi.fn(async () => true) }));

import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { budgetSteps } from '@/ux2/boardroom/annualBudget';
import { BudgetGuide } from '@/ux2/boardroom/budget/BudgetGuide';
import type { CaseTrackerCase } from '@/types/issues';

const FY = { start: '2027-01-01', end: '2027-12-31' };
const steps = budgetSteps(FY).map((s, i) => ({ id: `s${i}`, s: s.s, detail: s.detail, done: i === 0, doneDate: null, userNotes: '' }));
const c = { id: 'b1', catId: 'financial', sitId: 'runbook-annual-budget', title: 'Annual budget · 2027', unit: '', owner: '', approach: 'pre', status: 'open', priority: 'high', created: '2026-11-11', notes: '', steps, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [], source: 'runbook', sourceId: `annual-budget:${FY.start}` } as unknown as CaseTrackerCase;
const lines = () => render(<MemoryRouter><BudgetGuide c={c} step={steps[2]} stepIndex={2} /></MemoryRouter>);

beforeEach(() => {
  cleanup();
  fetchBudgetDrafts.mockReset();
  useBuildingStore.setState(s => ({ details: { ...(s.details ?? {}), fiscalYearEnd: '12-31' } as typeof s.details }));
  useIssuesStore.setState({ cases: [c], casesLoaded: true });
  // As a board member's sign-in left it: nothing loaded.
  useBudgetDraftStore.setState({ drafts: {}, loaded: false, failed: false });
});

describe('the budget steps with the backend on', () => {
  it('load the board\'s drafts when they were not loaded, then start the draft', async () => {
    fetchBudgetDrafts.mockResolvedValue([]);
    lines();
    await waitFor(() => expect(screen.getByRole('region', { name: /Budget step: Set every line/ })).toBeTruthy());
    expect(fetchBudgetDrafts).toHaveBeenCalledWith('t1');
    expect(useBudgetDraftStore.getState().drafts[FY.start]).toBeTruthy();
  });

  it('offer to try again when the load fails, and start no draft until it works', async () => {
    fetchBudgetDrafts.mockResolvedValue(null);
    lines();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(useBudgetDraftStore.getState().drafts[FY.start]).toBeUndefined();
    fetchBudgetDrafts.mockResolvedValue([]);
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(useBudgetDraftStore.getState().drafts[FY.start]).toBeTruthy());
  });
});
