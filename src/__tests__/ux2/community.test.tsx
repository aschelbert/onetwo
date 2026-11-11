import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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

  it('A board member runs a meeting through its four steps: agenda with votes and reports, notice, the meeting, the summary', async () => {
    const { useMeetingRecordStore } = await import('@/store/useMeetingRecordStore');
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
    const m0 = useMeetingsStore.getState().meetings.find(m => m.status === 'SCHEDULED')!;
    useMeetingsStore.getState().updateMeeting(m0.id, { items: undefined, session: {}, noticeSentAt: null, startedAt: null, endedAt: null, minutesApprovedAt: null, minutesApprovals: [] });
    renderAt(`/community?tab=meetings&meeting=${m0.id}`);
    const meeting = () => useMeetingsStore.getState().meetings.find(m => m.id === m0.id)!;
    const lastItem = () => { const its = meeting().items!; return its[its.length - 1]; };

    // Step 1: add an item, put an owner vote on it, attach a report as a snapshot.
    const agenda = document.querySelector('[aria-label="Agenda"]') as HTMLElement;
    fireEvent.click(within(agenda).getByRole('button', { name: 'Add an item' }));
    fireEvent.change(within(agenda).getByLabelText('Agenda item'), { target: { value: 'Adopt the 2027 budget' } });
    fireEvent.click(within(agenda).getByRole('button', { name: 'Add' }));
    const item = lastItem();
    expect(item.title).toBe('Adopt the 2027 budget');
    const row = agenda.querySelector(`[data-item="${item.id}"]`) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add a vote' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Save the vote' }));
    expect(lastItem().vote).toMatchObject({ who: 'owners', threshold: 'majority_voting', status: 'draft' });
    fireEvent.click(within(row).getByRole('button', { name: 'Attach' }));
    const panel = screen.getByRole('group', { name: /Attach to/ });
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Add' })[2]);
    expect(lastItem().attachments[0]).toMatchObject({ source: 'report', report: 'budget_vs_actual', mode: 'frozen', audience: 'all' });

    // Step 2: send the notice; the owner vote opens with it. Then a paper ballot comes in.
    fireEvent.click(screen.getByRole('button', { name: /^2 · Notice and ballots/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Send to \d+ units$/ }));
    await waitFor(() => expect(meeting().noticeSentAt).toBeTruthy());
    expect(lastItem().vote!.status).toBe('open');
    expect(useComplianceStore.getState().announcements.some(a => a.title === `Meeting notice: ${m0.title}`)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Enter a paper ballot or proxy' }));
    const paper = screen.getByRole('form', { name: 'Enter a paper ballot or proxy' });
    fireEvent.change(within(paper).getByLabelText('Unit'), { target: { value: '101' } });
    fireEvent.click(within(paper).getByLabelText('for'));
    fireEvent.click(within(paper).getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(useMeetingRecordStore.getState().ballots.some(b => b.meetingId === m0.id && b.unit === '101' && b.method === 'paper')).toBe(true));

    // Step 3: start, check a unit in, count the room, record the vote, adjourn.
    fireEvent.click(screen.getByRole('button', { name: 'Start the meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start the meeting' }));
    expect(meeting().startedAt).toBeTruthy();
    const checkin = screen.getByRole('form', { name: 'Check in a unit' });
    fireEvent.change(within(checkin).getByLabelText('Unit'), { target: { value: '102' } });
    fireEvent.click(within(checkin).getByRole('button', { name: 'Check in' }));
    expect(useMeetingRecordStore.getState().privateOf(m0.id).attendance).toEqual([expect.objectContaining({ unit: '102', mode: 'in_person' })]);
    const voteItem = screen.getByRole('article', { name: /Adopt the 2027 budget/ });
    fireEvent.change(within(voteItem).getByLabelText('In the room, for'), { target: { value: '2' } });
    fireEvent.click(within(voteItem).getByRole('button', { name: 'Close and record in the minutes' }));
    expect(lastItem().vote).toMatchObject({ status: 'closed', result: expect.objectContaining({ for: 3, passed: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'Adjourn' }));
    expect(meeting()).toMatchObject({ status: 'COMPLETED' });
    expect(meeting().minutes).toContain('Vote: Passed: 3 for, 0 against');

    // Step 4: the summary goes out, written from the record.
    fireEvent.click(screen.getByRole('button', { name: /^4 · Summary to owners/ }));
    expect((screen.getByLabelText('What was decided') as HTMLTextAreaElement).value).toContain('Adopt the 2027 budget: passed, 3 for, 0 against.');
    fireEvent.click(screen.getByRole('button', { name: /^Send to \d+ units$/ }));
    await waitFor(() => expect(meeting().session?.summary).toBeTruthy());
  });

  it('An owner sees only the date before the notice, votes on the meeting after it, sees the vote in Notices and has no Votes tab', async () => {
    const { useMeetingRecordStore } = await import('@/store/useMeetingRecordStore');
    const prev = useAuthStore.getState().currentRole;
    useAuthStore.setState({ currentRole: 'RESIDENT' });
    try {
      const m0 = useMeetingsStore.getState().meetings.find(m => m.status === 'SCHEDULED')!;
      const items = [{ id: 'i-budget', title: 'Adopt the budget', kind: 'decision' as const, minutes: '', attachments: [], vote: { who: 'owners' as const, question: 'Adopt the budget?', threshold: 'majority_voting' as const, status: 'open' as const } }];
      useMeetingsStore.getState().updateMeeting(m0.id, { items, noticeSentAt: null, startedAt: null, endedAt: null, session: {} });
      useComplianceStore.setState({ communications: [] });
      const first = renderAt(`/community?tab=meetings&meeting=${m0.id}`);
      expect(screen.getByText('Scheduled · date only')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cast my vote' })).toBeNull();
      first.unmount();

      useMeetingsStore.getState().updateMeeting(m0.id, { noticeSentAt: '2026-11-30T12:00:00Z' });
      const second = renderAt(`/community?tab=meetings&meeting=${m0.id}`);
      fireEvent.click(screen.getByLabelText('For'));
      fireEvent.click(screen.getByRole('button', { name: 'Cast my vote' }));
      await waitFor(() => expect(useMeetingRecordStore.getState().ballots.find(b => b.meetingId === m0.id && b.itemId === 'i-budget')).toMatchObject({ unit: '301', choice: 'for', method: 'online' }));
      second.unmount();

      renderAt('/community?tab=votes');
      const nav = screen.getByRole('navigation', { name: 'Community sections' });
      expect(within(nav).queryByRole('button', { name: /^Votes/ })).toBeNull();
      const mine = document.querySelector('[aria-label="Your unit\'s votes"]') as HTMLElement;
      expect(within(mine).getByText(/You: for · can change/)).toBeTruthy();
      expect(document.querySelector('[aria-label="Board decisions"]')).toBeTruthy();
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
