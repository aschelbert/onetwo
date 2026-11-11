import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useRunbookStore } from '@/ux2/runbook/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useIssuesStore } from '@/store/useIssuesStore';

vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', features: {} }),
}));

import HomePage, { unitBalanceState } from '@/ux2/home/HomePage';
import CaseDock from '@/ux2/shell/CaseDock';
import { dockFor, caseIdFromLocation, casePath, spotFromSearch, useCaseDockStore } from '@/ux2/shell/caseDock';
import { useLocation } from 'react-router-dom';

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

  it('renders the board Home: tiles, the feed, the stewardship card, building news and the pulse', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), /);
    expect(screen.getByText('Reserves funded')).toBeTruthy();
    expect(screen.getByText('Collected')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Up next' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Waiting on others' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Upcoming' })).toBeTruthy();
    expect(document.querySelector('[data-widget="stewardship-radar"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Stewardship by dimension"]')).toBeNull();
    expect(document.querySelector('[aria-label="Building news"]')).toBeTruthy();
    // The unit balance sits between the stewardship card and Building news, and goes to My Unit to pay.
    const widgets = [...document.querySelectorAll('[data-widget="stewardship-radar"], [aria-label="Unit balance"], [aria-label="Building news"]')];
    expect(widgets.map(el => el.getAttribute('data-widget') ?? el.getAttribute('aria-label'))).toEqual(['stewardship-radar', 'Unit balance', 'Building news']);
    expect(document.querySelector('[aria-label="Unit balance"] button')).toBeTruthy();
    expect(document.querySelector('[data-widget="calendar"]')).toBeNull();
  });

  it('the stewardship card flips through the five dimensions', () => {
    renderHome();
    expect(document.querySelector('[data-widget="stewardship-radar"] svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(document.querySelector('[data-dimension="Timeliness"]')).toBeTruthy();
    expect(document.querySelector('[data-widget="stewardship-radar"] svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Compliance' }));
    expect(document.querySelector('[data-dimension="Compliance"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(document.querySelector('[data-widget="stewardship-radar"] svg')).toBeTruthy();
  });

  it('Feed | Calendar flips the feed for the merged calendar, kept in the URL', () => {
    renderHome('/home?view=calendar');
    expect(document.querySelector('[data-widget="calendar"]')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull();
    expect(document.querySelectorAll('[data-widget="calendar"] [data-month]').length).toBe(6);
    expect(document.querySelector('[data-widget="calendar"] [data-month] [data-day]')).toBeTruthy();
    expect(screen.getByText('Nothing scheduled today')).toBeTruthy();
    expect(screen.queryByText('Reserves funded')).toBeNull();
    expect(document.querySelector('[data-widget="stewardship-radar"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Later months' }));
    const views = screen.getByRole('navigation', { name: 'Home views' });
    fireEvent.click(within(views).getByRole('button', { name: /^Feed/ }));
    expect(screen.getByRole('region', { name: 'Up next' })).toBeTruthy();
    expect(document.querySelector('[data-widget="calendar"]')).toBeNull();
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

  it('renders the owner Home with the unit balance, building news and no board tiles', () => {
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(document.querySelector('[aria-label="Unit balance"]')).toBeTruthy();
      expect(document.querySelector('[aria-label="Building news"]')).toBeTruthy();
      expect(screen.queryByText('Reserves funded')).toBeNull();
      expect(screen.queryByRole('region', { name: 'Waiting on others' })).toBeNull();
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });
});

describe('Case dock', () => {
  beforeEach(() => useCaseDockStore.getState().reset());

  it('picks the most recent open case with a step left, hides on that case, and skips dismissed ones', () => {
    const cases = useIssuesStore.getState().cases.filter(c => c.status !== 'closed' && c.steps?.some(s => !s.done));
    expect(cases.length).toBeGreaterThan(1);
    const [a, b] = cases;
    const d = dockFor(useIssuesStore.getState().cases, [a.id, b.id], [], null)!;
    expect(d.active.c.id).toBe(a.id);
    expect(d.active.step.done).toBe(false);
    expect(d.others.map(o => o.c.id)).toEqual([b.id]);
    expect(dockFor(useIssuesStore.getState().cases, [a.id, b.id], [], a.id)).toBeNull();
    expect(dockFor(useIssuesStore.getState().cases, [a.id, b.id], [a.id], null)!.active.c.id).toBe(b.id);
    expect(caseIdFromLocation('/boardroom', '?view=case:c3')).toBe('c3');
    expect(caseIdFromLocation('/funds', '?view=case:c3')).toBeNull();
  });

  it('follows you off the case: shows the step, ticks a check on the case, goes back, and dismisses', () => {
    const issues = useIssuesStore.getState();
    const c = issues.cases.find(x => x.status !== 'closed' && x.steps?.some(s => !s.done && (s.checks?.length ?? 0) > 0))
      ?? issues.cases.find(x => x.status !== 'closed' && x.steps?.some(s => !s.done))!;
    useCaseDockStore.getState().touch(c.id);
    const { unmount } = render(<MemoryRouter initialEntries={[`/boardroom?view=case:${c.id}`]}><CaseDock /></MemoryRouter>);
    expect(document.querySelector('[data-widget="case-dock"]')).toBeNull();
    unmount();

    render(
      <MemoryRouter initialEntries={['/funds']}>
        <Routes>
          <Route path="/funds" element={<CaseDock />} />
          <Route path="/issues" element={<div data-testid="case-page">case</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const dock = document.querySelector('[data-widget="case-dock"]') as HTMLElement;
    expect(dock).toBeTruthy();
    expect(within(dock).getByText(new RegExp(`${c.id} · `))).toBeTruthy();
    fireEvent.click(within(dock).getByRole('button', { name: 'Expand the action dock' }));
    const stepIdx = c.steps!.findIndex(s => !s.done);
    const step = c.steps![stepIdx];
    if (step.checks?.length) {
      const first = step.checks[0];
      fireEvent.click(within(dock).getByRole('checkbox', { name: first.label }));
      const after = useIssuesStore.getState().cases.find(x => x.id === c.id)!.steps![stepIdx].checks!.find(k => k.id === first.id)!;
      expect(after.checked).toBe(!first.checked);
      useIssuesStore.getState().toggleCheck(c.id, stepIdx, first.id);
    } else {
      expect(within(dock).getByRole('button', { name: 'Mark step done' })).toBeTruthy();
    }
    fireEvent.click(within(dock).getByRole('button', { name: 'Dismiss the action dock' }));
    expect(document.querySelector('[data-widget="case-dock"]')).toBeNull();
    expect(useCaseDockStore.getState().dismissed).toContain(c.id);
  });

  it('Back to the step returns to the case', () => {
    const c = useIssuesStore.getState().cases.find(x => x.status !== 'closed' && x.steps?.some(s => !s.done))!;
    useCaseDockStore.getState().touch(c.id);
    render(
      <MemoryRouter initialEntries={['/funds']}>
        <Routes>
          <Route path="/funds" element={<CaseDock />} />
          <Route path="/issues" element={<div data-testid="case-page">case</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const dock = document.querySelector('[data-widget="case-dock"]') as HTMLElement;
    fireEvent.click(within(dock).getByRole('button', { name: 'Back to the step' }));
    expect(screen.getByTestId('case-page')).toBeTruthy();
  });

  it('Back returns to the step and checklist item you left from', () => {
    const c = useIssuesStore.getState().cases.find(x => x.status !== 'closed' && (x.steps?.filter(s => !s.done).length ?? 0) > 1 && x.steps!.some(s => !s.done && (s.checks?.length ?? 0) > 0))!;
    const later = c.steps!.reduce((last, s, i) => (!s.done && (s.checks?.length ?? 0) > 0 ? i : last), -1);
    const check = c.steps![later].checks![0].id;
    const dockStore = useCaseDockStore.getState();
    dockStore.touch(c.id);
    dockStore.remember(c.id, { step: later, approach: null });
    useCaseDockStore.getState().rememberCheck(c.id, check);

    // The dock shows the step you were on, not the first step left.
    expect(dockFor(useIssuesStore.getState().cases, [c.id], [], null, useCaseDockStore.getState().spots)!.active.stepIdx).toBe(later);

    function CasePage() { const { search } = useLocation(); return <div data-testid="case-page">{search}</div>; }
    render(
      <MemoryRouter initialEntries={['/funds']}>
        <Routes>
          <Route path="/funds" element={<CaseDock />} />
          <Route path="/issues" element={<CasePage />} />
        </Routes>
      </MemoryRouter>,
    );
    const dock = document.querySelector('[data-widget="case-dock"]') as HTMLElement;
    fireEvent.click(within(dock).getByRole('button', { name: 'Back to the step' }));
    const spot = spotFromSearch(screen.getByTestId('case-page').textContent!);
    expect(spot).toEqual({ step: later, approach: null, check });

    // Moving to another step forgets the item.
    useCaseDockStore.getState().remember(c.id, { step: 0, approach: null });
    expect(useCaseDockStore.getState().spots[c.id]).toEqual({ step: 0, approach: null });
    expect(casePath('c1', { step: 2, approach: 1, check: 'k 1' })).toBe('/issues?view=case:c1&step=3&approach=2&check=k%201');
    expect(spotFromSearch('?view=case:c1')).toBeNull();
  });
});

describe('Unit balance state', () => {
  const units = [{ number: '301', monthlyFee: 450, payments: [{ date: '2026-10-15', amount: 450 }] }];
  const inv = (dueDate: string, amount = 450, paidAmount: number | null = null, status = 'sent') => ({ unitNumber: '301', amount, paidAmount, status, dueDate });
  it('is paid up with nothing owed, and names the next dues date from the due day', () => {
    expect(unitBalanceState(units, [], 0, '2026-11-11', 15)).toMatchObject({ state: 'paid', pastDue: 0, next: { date: '2026-11-15', amount: 450 } });
    expect(unitBalanceState(units, [], 0, '2026-11-20', 15).next.date).toBe('2026-12-15');
  });
  it('is due when everything owed is on invoices not yet past their due date', () => {
    expect(unitBalanceState(units, [inv('2026-11-15')], 450, '2026-11-11', 15)).toMatchObject({ state: 'due', pastDue: 0, next: { date: '2026-11-15', amount: 450 } });
    // A part-paid invoice counts only what is left.
    expect(unitBalanceState(units, [inv('2026-11-15', 450, 200)], 250, '2026-11-11', 15).state).toBe('due');
  });
  it('is behind when an invoice is past due, or the balance is more than the upcoming invoices explain', () => {
    expect(unitBalanceState(units, [inv('2026-10-15', 450, null, 'overdue'), inv('2026-11-15')], 900, '2026-11-11', 15)).toMatchObject({ state: 'behind', pastDue: 450 });
    expect(unitBalanceState(units, [inv('2026-11-15')], 950, '2026-11-11', 15)).toMatchObject({ state: 'behind', pastDue: 500 });
    expect(unitBalanceState(units, [], 120, '2026-11-11', 15)).toMatchObject({ state: 'behind', pastDue: 120 });
  });
});

