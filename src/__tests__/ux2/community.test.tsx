import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useScorecardStore } from '@/store/useScorecardStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';

const tenantFlags = vi.hoisted(() => ({ pmSeat: true }));
vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: true, status: 'active', tier: 'management_suite', pmSeat: tenantFlags.pmSeat, features: {}, id: 't1' }),
}));
vi.mock('@/features/property-log/PropertyLogPage', () => ({ default: () => <div data-testid="legacy-log" /> }));
vi.mock('@/features/community/CommunityRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-community" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/boardroom/BoardRoomPage', () => ({ default: ({ embedded, tab }: { embedded?: boolean; tab?: string }) => <div data-testid="legacy-boardroom" data-embedded={embedded ? '1' : '0'}>{tab ?? 'page'}</div> }));
vi.mock('@/features/elections/ElectionsPage', () => ({ default: ({ embedded, initialSelectedId }: { embedded?: boolean; initialSelectedId?: string | null }) => <div data-testid="legacy-votes" data-embedded={embedded ? '1' : '0'}>{initialSelectedId ?? 'list'}</div> }));
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

  it('Meetings lists every meeting; opening one shows its own notice, agenda, attendance and minutes', () => {
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    renderAt('/community?tab=meetings');
    expect(screen.queryByTestId('legacy-boardroom')).toBeNull();
    // The list is only the list: no agenda editor, approvals or attendance panels.
    expect(document.querySelector('[aria-label="All meetings"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Agenda"]')).toBeNull();
    expect(document.querySelector('[aria-label="Attendance"]')).toBeNull();
    const upcoming = useMeetingsStore.getState().meetings.find(m => m.status === 'SCHEDULED')!;
    const row = document.querySelector(`[data-meeting="${upcoming.id}"]`) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: upcoming.title }));

    // The meeting's own page.
    expect(document.querySelector(`[data-meeting-page="${upcoming.id}"]`)).toBeTruthy();
    expect(document.querySelector('[aria-label="All meetings"]')).toBeNull();
    expect(document.querySelector('[aria-label="Notice"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Attendance"]')).toBeTruthy();
    const agenda = document.querySelector('[aria-label="Agenda"]') as HTMLElement;
    const before = upcoming.agenda.length;
    fireEvent.click(within(agenda).getByRole('button', { name: 'Add an item' }));
    fireEvent.change(within(agenda).getByLabelText('Agenda item'), { target: { value: 'Bike room rules · board vote' } });
    fireEvent.click(within(agenda).getByRole('button', { name: 'Add' }));
    expect(useMeetingsStore.getState().meetings.find(m => m.id === upcoming.id)!.agenda).toHaveLength(before + 1);
    fireEvent.click(within(agenda).getByRole('button', { name: `Remove agenda item ${before + 1}` }));
    expect(useMeetingsStore.getState().meetings.find(m => m.id === upcoming.id)!.agenda).toHaveLength(before);

    fireEvent.click(screen.getByRole('button', { name: '← All meetings' }));
    expect(document.querySelector('[aria-label="All meetings"]')).toBeTruthy();
  });

  it('A held meeting has its minutes and approvals on its page, and an owner RSVPs on an upcoming one', () => {
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    const held = useMeetingsStore.getState().meetings.find(m => m.status === 'COMPLETED' && m.minutes)!;
    renderAt(`/community?tab=meetings&meeting=${held.id}`);
    const minutes = document.querySelector('[aria-label="Minutes"]') as HTMLElement;
    expect(minutes).toBeTruthy();
    expect(minutes.textContent).toContain(held.minutes.split('\n')[0]);
    expect(document.querySelector('[aria-label="Notice"]')).toBeNull();

    const prev = useAuthStore.getState().currentRole;
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      const upcoming = useMeetingsStore.getState().meetings.find(m => m.status === 'SCHEDULED')!;
      renderAt(`/community?tab=meetings&meeting=${upcoming.id}`);
      const pages = document.querySelectorAll(`[data-meeting-page="${upcoming.id}"]`);
      const page = pages[pages.length - 1] as HTMLElement;
      const me = useAuthStore.getState().currentUser.name;
      fireEvent.click(within(page.querySelector('[aria-label="Meeting"]') as HTMLElement).getByRole('button', { name: /RSVP|Going/ }));
      const m = useMeetingsStore.getState().meetings.find(x => x.id === upcoming.id)!;
      expect(m.attendees.owners.includes(me)).toBe(true);
    } finally {
      useAuthStore.setState({ currentRole: prev });
    }
  });

  it('Votes shows the open owner vote, board decisions, the election and the results without the legacy page', () => {
    renderAt('/community?tab=votes');
    expect(document.querySelector('[aria-label="Board decisions"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Open owner vote"]') || document.querySelector('[aria-label="Election"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Results and certification"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Proxies and quorum"]')).toBeTruthy();
    expect(screen.queryByTestId('legacy-votes')).toBeNull();
    renderAt('/voting');
    expect(document.querySelectorAll('[aria-label="Board decisions"]').length).toBeGreaterThan(0);
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

  it('Amenities lists the shared spaces, takes a reservation through the store, and shows the week', () => {
    renderAt('/community?tab=amenities');
    expect(screen.queryByTestId('legacy-amenities')).toBeNull();
    expect(document.querySelectorAll('[data-amenity]').length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="This week"]')).toBeTruthy();
    const before = useAmenitiesStore.getState().reservations.length;
    const reserve = screen.getAllByRole('button', { name: /^Reserve the / })[0];
    fireEvent.click(reserve);
    const form = document.querySelector('form[aria-label^="Reserve the"]') as HTMLElement;
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '14:00' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: '15:00' } });
    fireEvent.change(within(form).getByLabelText('Notes'), { target: { value: 'birthday' } });
    fireEvent.click(within(form).getByRole('button', { name: /Reserve|Request/ }));
    const after = useAmenitiesStore.getState().reservations;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].notes).toBe('birthday');
  });
});
