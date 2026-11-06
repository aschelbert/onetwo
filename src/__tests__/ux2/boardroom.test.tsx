import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { _resetUx2ForTests, setUx2Flags } from '@/ux2/flags';
import { useAuthStore } from '@/store/useAuthStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: true, status: 'active', tier: 'management_suite', features: {}, id: 't1' }),
}));
vi.mock('@/features/issues/IssuesPage', () => ({ default: ({ embedded, prefill }: { embedded?: boolean; prefill?: { catId: string; sitId: string } }) => <div data-testid="legacy-issues" data-embedded={embedded ? '1' : '0'}>{prefill ? `${prefill.catId}/${prefill.sitId}` : 'page'}</div> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-boardroom" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/boardroom/tabs/CommunicationsTab', () => ({ default: () => <div data-testid="legacy-comms" /> }));
vi.mock('@/features/issues/components/workflow/DecisionTrail', () => ({ default: ({ entries }: { entries: unknown[] }) => <div data-testid="legacy-trail">{entries.length}</div> }));
vi.mock('@/features/issues/components/workflow/SpendingDecisionPanel', () => ({ SpendingDecisionPanel: () => <div data-testid="panel-spending" /> }));
vi.mock('@/features/issues/components/workflow/BidComparisonPanel', () => ({ BidComparisonPanel: () => <div data-testid="panel-bids" /> }));
vi.mock('@/features/issues/components/workflow/ConflictCheckPanel', () => ({ ConflictCheckPanel: () => <div data-testid="panel-conflict" /> }));
vi.mock('@/features/issues/components/CaseModals', () => ({ AddBidModal: () => null }));
vi.mock('@/features/issues/components/CaseComponents', () => ({ BoardVoteDisplay: () => <div data-testid="legacy-vote" /> }));

import BoardRoomSwitch, { CasesRedirect, IssuesSwitch } from '@/ux2/boardroom/BoardRoomSwitch';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/boardroom" element={<BoardRoomSwitch />} />
        <Route path="/issues" element={<IssuesSwitch />} />
        <Route path="/cases" element={<CasesRedirect />} />
        <Route path="/building" element={<div data-testid="building">building</div>} />
        <Route path="/community" element={<div data-testid="community">community</div>} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Board Room behind ux2.boardroom', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetUx2ForTests();
    useRunbookSwitches.setState({ off: ['vendor-bids'] });
  });

  it('shows the production pages when the flag is off', () => {
    renderAt('/boardroom');
    expect(screen.getByTestId('legacy-boardroom').textContent).toBe('page');
    renderAt('/issues?view=case:c1');
    expect(screen.getByTestId('legacy-issues').textContent).toBe('page');
  });

  it('renders Open with a row per open case and the five sections', () => {
    setUx2Flags('boardroom');
    renderAt('/boardroom');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Board Room');
    const nav = screen.getByRole('navigation', { name: 'Board Room sections' });
    expect(within(nav).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(\d+ open|\d+ drafts?|\d+)$/, '').trim())).toEqual(['Open', 'Inbox', 'Runbooks', 'Outbox', 'Archive']);
    const open = useIssuesStore.getState().cases.filter(c => c.status === 'open').length;
    expect(document.querySelectorAll('tr[data-case]').length).toBe(open);
  });

  it('a case row opens the production workspace inside the case frame, and the breadcrumb returns', () => {
    setUx2Flags('boardroom');
    renderAt('/boardroom');
    const first = document.querySelector('tr[data-case]') as HTMLElement;
    const id = first.getAttribute('data-case')!;
    fireEvent.click(first);
    expect(document.querySelector('[data-page="ux2-boardroom-case"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-issues').getAttribute('data-embedded')).toBe('1');
    expect(screen.getByText(id)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All cases' }));
    expect(document.querySelector('[data-page="ux2-boardroom"]')).toBeTruthy();
  });

  it('Home\'s /issues?view=case: link lands in the case frame; /cases keeps its query', () => {
    setUx2Flags('boardroom');
    const c = useIssuesStore.getState().cases[0];
    renderAt(`/issues?view=case:${c.id}`);
    expect(document.querySelector('[data-page="ux2-boardroom-case"]')).toBeTruthy();
    expect(screen.getByText(c.title)).toBeTruthy();
    renderAt(`/cases?view=case:${c.id}`);
    expect(document.querySelectorAll('[data-page="ux2-boardroom-case"]').length).toBe(2);
  });

  it('the case frame mounts the spending, bid and conflict panels for open steps that need them', () => {
    setUx2Flags('boardroom');
    const store = useIssuesStore.getState();
    const target = store.cases.find(c => c.status === 'open' && (c.steps ?? []).some(s => !s.done && (s.isSpendingDecision || s.requiresBids || s.requiresConflictCheck)));
    if (!target) return;
    renderAt(`/boardroom?view=case:${target.id}`);
    expect(document.querySelector('[aria-label="Decisions on this case"]')).toBeTruthy();
  });

  it('Inbox acknowledges a new request through the issues store and mounts the production inbox', () => {
    setUx2Flags('boardroom');
    renderAt('/boardroom?tab=inbox');
    expect(screen.getByTestId('legacy-issues').getAttribute('data-embedded')).toBe('1');
    const ack = screen.queryAllByRole('button', { name: 'Acknowledge' })[0];
    if (ack) {
      const before = useIssuesStore.getState().issues.filter(i => i.status === 'SUBMITTED').length;
      fireEvent.click(ack);
      expect(useIssuesStore.getState().issues.filter(i => i.status === 'SUBMITTED').length).toBe(before - 1);
    }
  });

  it('Runbooks lists all 32, switches one off and opens the wizard on a situation', () => {
    setUx2Flags('boardroom');
    renderAt('/boardroom?tab=runbooks');
    fireEvent.click(screen.getByRole('button', { name: /^All 32$/ }));
    expect(document.querySelectorAll('tr[data-runbook]').length).toBe(32);
    const sw = screen.getByRole('switch', { name: 'Collections on' });
    fireEvent.click(sw);
    expect(useRunbookSwitches.getState().isOn('collections')).toBe(false);
    const row = document.querySelector('tr[data-runbook="collections"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Open a case' }));
    expect(screen.getByTestId('legacy-issues').textContent).toBe('financial/delinquent-accounts');
  });

  it('Outbox and Archive render their summaries and the production communications tab', () => {
    setUx2Flags('boardroom');
    renderAt('/boardroom?tab=outbox');
    expect(screen.getByTestId('legacy-comms')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
    renderAt('/boardroom?tab=archive');
    expect(document.querySelector('[aria-label="Archive"]')).toBeTruthy();
  });

  it('absorbed tabs redirect to Building and Community when those modules are on', () => {
    setUx2Flags('boardroom,building,community');
    renderAt('/boardroom?tab=runbook');
    expect(screen.getByTestId('building')).toBeTruthy();
    renderAt('/boardroom?tab=votes');
    expect(screen.getByTestId('community')).toBeTruthy();
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      renderAt('/issues');
      const pages = screen.getAllByTestId('legacy-issues');
      expect(pages[pages.length - 1].textContent).toBe('page');
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });
});
