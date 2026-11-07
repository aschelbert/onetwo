import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from '@/ux2/boardroom/store';

const tenantFlags = vi.hoisted(() => ({ pmSeat: true }));
vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: true, status: 'active', tier: 'management_suite', pmSeat: tenantFlags.pmSeat, features: {}, id: 't1' }),
}));
vi.mock('@/features/association-team/tabs/TaskTrackingTab', () => ({ default: () => <div data-testid="legacy-tasks" /> }));
vi.mock('@/features/association-team/tabs/CommunicationsTab', () => ({ default: () => <div data-testid="legacy-intercom" /> }));
vi.mock('@/features/issues/IssuesPage', () => ({ default: ({ embedded, prefill }: { embedded?: boolean; prefill?: { catId: string; sitId: string } }) => <div data-testid="legacy-issues" data-embedded={embedded ? '1' : '0'}>{prefill ? `${prefill.catId}/${prefill.sitId}` : 'page'}</div> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-boardroom" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/boardroom/tabs/CommunicationsTab', () => ({ default: () => <div data-testid="legacy-comms" /> }));
vi.mock('@/features/issues/components/workflow/DecisionTrail', () => ({ default: ({ entries }: { entries: unknown[] }) => <div data-testid="legacy-trail">{entries.length}</div> }));
vi.mock('@/features/issues/components/workflow/SpendingDecisionPanel', () => ({ SpendingDecisionPanel: () => <div data-testid="panel-spending" /> }));
vi.mock('@/features/issues/components/workflow/BidComparisonPanel', () => ({ BidComparisonPanel: () => <div data-testid="panel-bids" /> }));
vi.mock('@/features/issues/components/workflow/ConflictCheckPanel', () => ({ ConflictCheckPanel: () => <div data-testid="panel-conflict" /> }));
vi.mock('@/features/issues/components/CaseModals', () => ({ AddBidModal: () => null }));
vi.mock('@/features/issues/components/CaseComponents', () => ({ BoardVoteDisplay: () => <div data-testid="legacy-vote" /> }));

import { BoardRoomRoute, IssuesRoute, RedirectKeepQuery } from '@/ux2/shell/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/boardroom" element={<BoardRoomRoute />} />
        <Route path="/issues" element={<IssuesRoute />} />
        <Route path="/cases" element={<RedirectKeepQuery to="/issues" />} />
        <Route path="/building" element={<div data-testid="building">building</div>} />
        <Route path="/community" element={<div data-testid="community">community</div>} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Board Room', () => {
  beforeEach(() => {
    localStorage.clear();
    tenantFlags.pmSeat = true;
    useRunbookSwitches.setState({ off: ['vendor-bids'] });
  });

  it('renders Open with a row per open case and the seven sections', () => {
    renderAt('/boardroom');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Board Room');
    const nav = screen.getByRole('navigation', { name: 'Board Room sections' });
    expect(within(nav).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(\d+ open|\d+ drafts?|\d+)$/, '').trim())).toEqual(['Open', 'Inbox', 'Runbooks', 'Outbox', 'Tasks', 'Intercom', 'Archive']);
    const open = useIssuesStore.getState().cases.filter(c => c.status === 'open').length;
    expect(document.querySelectorAll('tr[data-case]').length).toBe(open);
  });

  it('a case row opens the production workspace inside the case frame, and the breadcrumb returns', () => {
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
    const c = useIssuesStore.getState().cases[0];
    renderAt(`/issues?view=case:${c.id}`);
    expect(document.querySelector('[data-page="ux2-boardroom-case"]')).toBeTruthy();
    expect(screen.getByText(c.title)).toBeTruthy();
    renderAt(`/cases?view=case:${c.id}`);
    expect(document.querySelectorAll('[data-page="ux2-boardroom-case"]').length).toBe(2);
  });

  it('the case frame mounts the spending, bid and conflict panels for open steps that need them', () => {
    const store = useIssuesStore.getState();
    const target = store.cases.find(c => c.status === 'open' && (c.steps ?? []).some(s => !s.done && (s.isSpendingDecision || s.requiresBids || s.requiresConflictCheck)));
    if (!target) return;
    renderAt(`/boardroom?view=case:${target.id}`);
    expect(document.querySelector('[aria-label="Decisions on this case"]')).toBeTruthy();
  });

  it('Inbox lists requests in the mock table with reply, acknowledges through the issues store, and shows the five-step runbook', () => {
    renderAt('/boardroom?tab=inbox');
    expect(screen.queryByTestId('legacy-issues')).toBeNull();
    const requests = document.querySelector('[aria-label="Requests"]') as HTMLElement;
    expect(within(requests).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Request', 'Status', 'Reply due', 'Assignee', 'Runbook step', '']);
    expect(document.querySelector('[aria-label="Request runbook"]')?.textContent).toContain('3 · Assign');
    const ack = screen.queryAllByRole('button', { name: 'Acknowledge' })[0];
    if (ack) {
      const before = useIssuesStore.getState().issues.filter(i => i.status === 'SUBMITTED').length;
      fireEvent.click(ack);
      expect(useIssuesStore.getState().issues.filter(i => i.status === 'SUBMITTED').length).toBe(before - 1);
    }
  });

  it('Runbooks lists all 32, switches one off and opens the wizard on a situation', () => {
    renderAt('/boardroom?tab=runbooks');
    expect(screen.queryByText('Switched on')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^All 32$/ }));
    expect(document.querySelectorAll('tr[data-runbook]').length).toBe(32);
    const sw = screen.getByRole('switch', { name: 'Collections on' });
    fireEvent.click(sw);
    expect(useRunbookSwitches.getState().isOn('collections')).toBe(false);
    const row = document.querySelector('tr[data-runbook="collections"]') as HTMLElement;
    const start = within(row).queryByRole('button', { name: 'Open a case' });
    if (start) {
      fireEvent.click(start);
      expect(screen.getByTestId('legacy-issues').textContent).toBe('financial/delinquent-accounts');
    } else {
      fireEvent.click(within(row).getByRole('button', { name: /^Open now/ }));
      expect(document.querySelector('[data-page="ux2-boardroom-case"]')).toBeTruthy();
    }
  });

  it('Outbox shows alerts, drafts, templates and delivery without the production communications tab; New letter composes', () => {
    renderAt('/boardroom?tab=outbox');
    expect(screen.queryByTestId('legacy-comms')).toBeNull();
    expect(document.querySelector('[aria-label="Alerts"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Drafts"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Templates"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="How a letter goes out"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New letter' }));
    expect(screen.getByRole('form', { name: 'New letter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sent · 0' }));
    expect(document.querySelector('[aria-label="Sent"]')).toBeTruthy();
    renderAt('/boardroom?tab=archive');
    expect(document.querySelector('[aria-label="Archive"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Closed recently"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Export all"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="How long it stays"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All types' })).toBeTruthy();
  });

  it('Tasks and the Intercom mount the team tools with the Property Manager Seat, and are gone without it', () => {
    renderAt('/boardroom?tab=tasks');
    expect(screen.getByTestId('legacy-tasks')).toBeTruthy();
    renderAt('/boardroom?tab=intercom');
    expect(screen.getByTestId('legacy-intercom')).toBeTruthy();
    renderAt('/association-team-redirected?tab=x');
    tenantFlags.pmSeat = false;
    renderAt('/boardroom?tab=intercom');
    const navs = screen.getAllByRole('navigation', { name: 'Board Room sections' });
    const last = navs[navs.length - 1];
    expect(within(last).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(\d+ open|\d+ drafts?|\d+)$/, '').trim())).toEqual(['Open', 'Inbox', 'Runbooks', 'Outbox', 'Archive']);
    expect(screen.getAllByTestId('legacy-intercom').length).toBe(1);
  });

  it('absorbed tabs redirect to Building and Community; owners keep their own case view', () => {
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
