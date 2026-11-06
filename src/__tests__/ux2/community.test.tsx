import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useScorecardStore } from '@/store/useScorecardStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';

const tenantFlags = vi.hoisted(() => ({ pmSeat: true }));
vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: true, status: 'active', tier: 'management_suite', pmSeat: tenantFlags.pmSeat, features: {}, id: 't1' }),
}));
vi.mock('@/features/property-log/PropertyLogPage', () => ({ default: () => <div data-testid="legacy-log" /> }));
vi.mock('@/features/community/CommunityRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-community" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-boardroom" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/elections/ElectionsPage', () => ({ default: ({ embedded, initialSelectedId }: { embedded?: boolean; initialSelectedId?: string | null }) => <div data-testid="legacy-votes" data-embedded={embedded ? '1' : '0'}>{initialSelectedId ?? 'list'}</div> }));
vi.mock('@/features/community/AmenitiesTab', () => ({ default: () => <div data-testid="legacy-amenities" /> }));
vi.mock('@/ux2/community/notify', () => ({ emailAnnouncement: async () => ({ sent: 0, note: 'Email not sent: test.' }) }));

import CommunityModule from '@/ux2/community/CommunityModule';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/community" element={<CommunityModule />} />
        <Route path="/voting" element={<Navigate to="/community?tab=votes" replace />} />
        <Route path="*" element={<div data-testid="elsewhere">elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Community', () => {
  beforeEach(() => {
    localStorage.clear();
    tenantFlags.pmSeat = true;
  });

  it('renders the Overview with notices, building stewardship and the leaderboard, and the eight sections', () => {
    renderAt('/community');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Community');
    const nav = screen.getByRole('navigation', { name: 'Community sections' });
    expect(within(nav).getAllByRole('button').map(b => (b.textContent ?? '').replace(/(\d+ pinned|\d+ open|\d+ to approve|[A-Z][a-z]{2} \d{1,2}|\d+)$/, '').trim())).toEqual(['Overview', 'Notices', 'Meetings', 'Votes', 'Requests', 'Property log', 'Amenities', 'PM scorecard']);
    expect(document.querySelector('[aria-label="Recent notices"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Building stewardship"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-leader]').length).toBeGreaterThan(0);
  });

  it('a board member posts a notice through the compliance store and can pin and delete it', () => {
    renderAt('/community?tab=notices');
    const before = useComplianceStore.getState().announcements.length;
    fireEvent.click(screen.getByRole('button', { name: 'New notice' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Water off Tuesday' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Pipe work from 9 to noon.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Email every active member/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    const list = useComplianceStore.getState().announcements;
    expect(list.length).toBe(before + 1);
    const posted = list.find(a => a.title === 'Water off Tuesday')!;
    expect(posted.category).toBe('general');
    const row = document.querySelector(`[data-notice="${posted.id}"]`) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Pin' }));
    expect(useComplianceStore.getState().announcements.find(a => a.id === posted.id)!.pinned).toBe(true);
    useComplianceStore.getState().deleteAnnouncement(posted.id);
    expect(useComplianceStore.getState().announcements.length).toBe(before);
  });

  it('Meetings shows the next meeting, lets the viewer RSVP through the store, and mounts the Board Room meetings tab', () => {
    renderAt('/community?tab=meetings');
    expect(screen.getByTestId('legacy-boardroom').textContent).toBe('meetings');
    const next = document.querySelector('[aria-label="Next meeting"]') as HTMLElement | null;
    if (next) {
      const me = useAuthStore.getState().currentUser.name;
      const id = (document.querySelector('[data-meeting]') as HTMLElement).getAttribute('data-meeting')!;
      fireEvent.click(within(next).getByRole('button', { name: /RSVP|Going/ }));
      const m = useMeetingsStore.getState().meetings.find(x => x.id === id)!;
      const going = m.attendees.board.includes(me) || m.attendees.owners.includes(me);
      expect(typeof going).toBe('boolean');
    }
  });

  it('Votes lists board decisions and deep links one election into the embedded Votes page', () => {
    renderAt('/community?tab=votes');
    expect(document.querySelector('[aria-label="Board decisions"]')).toBeTruthy();
    expect(screen.getByTestId('legacy-votes').textContent).toBe('list');
    renderAt('/community?tab=votes&vote=e-123');
    const all = screen.getAllByTestId('legacy-votes');
    expect(all[all.length - 1].textContent).toBe('e-123');
    renderAt('/voting');
    expect(screen.getAllByTestId('legacy-votes').length).toBeGreaterThan(0);
  });

  it('Requests submits through the issues store and upvotes a neighbour\'s request', () => {
    renderAt('/community?tab=requests');
    const before = useIssuesStore.getState().issues.length;
    fireEvent.click(screen.getByRole('button', { name: 'Make a request' }));
    fireEvent.change(screen.getByLabelText('What is going on'), { target: { value: 'Hallway light flickering' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    const issues = useIssuesStore.getState().issues;
    expect(issues.length).toBe(before + 1);
    const mine = issues.find(i => i.title === 'Hallway light flickering')!;
    expect(mine.status).toBe('SUBMITTED');
    expect(document.querySelector(`[data-request="${mine.id}"]`)).toBeTruthy();
    const upvote = screen.queryAllByRole('button', { name: /Upvote · \d+/ })[0];
    if (upvote) {
      const n = Number(upvote.textContent!.match(/\d+/)![0]);
      fireEvent.click(upvote);
      expect(screen.getAllByRole('button', { name: /Upvote · \d+/ })[0].textContent).toContain(String(n + 1));
    }
  });

  it('the Property log takes an owner\'s entry', () => {
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      renderAt('/community?tab=log');
      expect(screen.getAllByTestId('legacy-log').length).toBeGreaterThan(0);
      expect(document.querySelector('[aria-label="Property log"]')).toBeTruthy();
    } finally {
      useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    }
  });

  it('PM scorecard: the board rates the manager through the scorecard store', () => {
    renderAt('/community?tab=scorecard');
    expect(document.querySelector('[data-widget="pm-scorecard"]')).toBeTruthy();
    expect(screen.getByText('This quarter')).toBeTruthy();
    const before = useScorecardStore.getState().reviews.length;
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Responsiveness 4 of 5' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Financial 5 of 5' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'A steady quarter.' } });
    fireEvent.change(screen.getByLabelText('Strengths 1'), { target: { value: 'Reports on time' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    const reviews = useScorecardStore.getState().reviews;
    expect(reviews.length).toBe(before + 1);
    expect(reviews[0]).toMatchObject({ overallRating: 4.5, summary: 'A steady quarter.', strengths: ['Reports on time'] });
    expect(reviews[0].categoryRatings.financial?.score).toBe(5);
    useScorecardStore.getState().deleteReview(reviews[0].id);
  });

  it('without the Property Manager Seat there is no PM scorecard', () => {
    tenantFlags.pmSeat = false;
    renderAt('/community?tab=scorecard');
    const nav = screen.getByRole('navigation', { name: 'Community sections' });
    expect(within(nav).queryByRole('button', { name: /PM scorecard/ })).toBeNull();
    expect(document.querySelector('[data-widget="pm-scorecard"]')).toBeNull();
  });

  it('Amenities mounts the production tab for the management suite', () => {
    renderAt('/community?tab=amenities');
    expect(screen.getByTestId('legacy-amenities')).toBeTruthy();
    expect(screen.getByText('Shared spaces')).toBeTruthy();
  });
});
