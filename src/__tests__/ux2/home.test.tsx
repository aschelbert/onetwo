import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useRunbookStore } from '@/ux2/runbook/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useIssuesStore } from '@/store/useIssuesStore';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {} }),
}));

import HomePage from '@/ux2/home/HomePage';
import ReturnToCaseBar from '@/ux2/shell/ReturnToCaseBar';

function renderHome(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Home', () => {
  beforeEach(() => {
    localStorage.clear();
    useRunbookStore.setState({ cards: {} });
  });

  it('renders the board Home with the feed, stewardship radar, tiles and calendar', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), /);
    expect(screen.getByRole('region', { name: 'Up next' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Waiting on others' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Upcoming' })).toBeTruthy();
    expect(document.querySelector('[data-widget="stewardship-radar"]')).toBeTruthy();
    expect(screen.getByText('Reserves funded')).toBeTruthy();
    expect(screen.getByText('Collected')).toBeTruthy();
    expect(document.querySelectorAll('[aria-label="Calendar"] [data-month]')).toHaveLength(4);
  });

  it('a card action deep links into the production page', () => {
    renderHome();
    const upNext = screen.getByRole('region', { name: 'Up next' });
    const buttons = within(upNext).getAllByRole('button').filter(b => !b.getAttribute('aria-label')?.startsWith('Hide') && !/Show/.test(b.textContent || ''));
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId('elsewhere')).toBeTruthy();
  });

  it('hiding a card takes it off Home and remembers it for this person', () => {
    renderHome();
    const upNext = screen.getByRole('region', { name: 'Up next' });
    const first = upNext.querySelector('[data-card]') as HTMLElement;
    const id = first.getAttribute('data-card')!;
    fireEvent.click(within(first).getByRole('button', { name: /^Hide / }));
    expect(screen.getByRole('region', { name: 'Up next' }).querySelector(`[data-card="${id}"]`)).toBeNull();
    const userId = useAuthStore.getState().currentUser.id;
    expect(useRunbookStore.getState().hiddenFor(userId, '2099-01-01').has(id)).toBe(true);
  });

  it('a snooze ends on its date', () => {
    const s = useRunbookStore.getState();
    s.snooze('u1', 'filing:f1', '2026-11-10');
    expect(s.hiddenFor('u1', '2026-11-09').has('filing:f1')).toBe(true);
    expect(s.hiddenFor('u1', '2026-11-10').has('filing:f1')).toBe(false);
    s.restore('u1', 'filing:f1');
    expect(s.hiddenFor('u1', '2026-11-09').size).toBe(0);
  });

  it('renders the owner Home with a balance tile and no board tiles', () => {
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.getByText('Balance')).toBeTruthy();
      expect(screen.queryByText('Reserves funded')).toBeNull();
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });
});

describe('ReturnToCaseBar', () => {
  it('shows when a case context exists and we are off the case page', () => {
    const store = useIssuesStore.getState();
    const first = store.cases[0];
    const base = { caseId: first.id, caseTitle: first.title, stepTitle: 'Demand letter', stepIdx: 2, returnPath: '/funds', progress: { done: 2, total: 5 } };
    store.setActiveCaseContext({ ...base, minimized: false });
    const { unmount } = render(<MemoryRouter initialEntries={['/issues?view=case:x']}><ReturnToCaseBar /></MemoryRouter>);
    expect(document.querySelector('[data-widget="return-to-case"]')).toBeNull();
    unmount();

    render(
      <MemoryRouter initialEntries={['/funds']}>
        <Routes>
          <Route path="/funds" element={<ReturnToCaseBar />} />
          <Route path="/issues" element={<div data-testid="case-page">case</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Step 3 of 5: Demand letter/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the step' }));
    expect(screen.getByTestId('case-page')).toBeTruthy();
    store.clearActiveCaseContext();
  });
});
