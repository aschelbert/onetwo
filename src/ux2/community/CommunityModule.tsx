import { useState } from 'react';
/**
 * Community — where the building acts together (ux2.community).
 *
 *  Overview   recent notices, building stewardship, the owner leaderboard
 *  Notices    the bulletin board: alerts, pinned, every post; the board posts here
 *  Meetings   scheduling, notices, agendas, attendance, minutes and approvals
 *  Votes      open owner votes, board decisions, the election, proxies and quorum
 *  Requests   ask the board, follow yours, see the building's
 *  Log        the property log: anyone logs what they see, the team follows up
 *  Amenities  reserve, approve, rules (management suite)
 *  Scorecard  the board's quarterly review of the property manager (Property Manager Seat)
 *
 * Owners and the board see the same screen; the board also sees the manage
 * controls. The detail under each section is the production component that
 * owns the records (Board Room meetings, the Votes page, the Community Room
 * request form, the Amenities tab), mounted embedded, so meeting notices,
 * minutes approval, the election lifecycle, ballots and proxies, certification
 * and amenity rules are the code paths production runs today.
 *
 * Deep links: `/community?tab=votes&vote=<id>`, `?tab=meetings&meeting=<id>`,
 * `?tab=requests&request=<id>`. Legacy `announcements` maps to notices.
 */
import { useSearchParams } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { tierHasAmenities } from '@/lib/tiers';
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { Chip, PillTabs, ModuleHeader, STATUS_CHIP, HeaderSlotProvider } from '../components';
import { dayLabel } from '../home/calendar';
import { useCommunitySnapshot } from './useCommunitySnapshot';
import { meetingRows, meetingsSummary, noticesSummary, requestRows, requestsSummary, voteRows, votesSummary } from './metrics';
import OverviewTab from './tabs/OverviewTab';
import NoticesTab from './tabs/NoticesTab';
import MeetingsTab from './tabs/MeetingsTab';
import VotesRecord from './meeting/VotesRecord';
import VotesTab from './tabs/VotesTab';
import RequestsTab from './tabs/RequestsTab';
import AmenitiesSection from './tabs/AmenitiesSection';
import LogTab from './tabs/LogTab';
import ScorecardTab from './tabs/ScorecardTab';

export type CommunityTab = 'overview' | 'notices' | 'meetings' | 'votes' | 'requests' | 'log' | 'amenities' | 'scorecard';
const TAB_IDS: CommunityTab[] = ['overview', 'notices', 'meetings', 'votes', 'requests', 'log', 'amenities', 'scorecard'];
export const LEGACY_TABS: Record<string, CommunityTab> = { announcements: 'notices', news: 'overview', 'property-log': 'log', 'pm-scorecard': 'scorecard' };

export function resolveCommunityTab(raw: string | null): CommunityTab {
  if (!raw) return 'overview';
  if ((TAB_IDS as string[]).includes(raw)) return raw as CommunityTab;
  return LEGACY_TABS[raw] ?? 'overview';
}

export default function CommunityModule() {
  const [params, setParams] = useSearchParams();
  const requested = resolveCommunityTab(params.get('tab'));
  const tenant = useTenantContext();
  // Amenities come with Plus Facilities (and the legacy tiers that became it); the demo shows everything.
  const isManagementSuite = tierHasAmenities(tenant.tier) || tenant.isDemo;
  const pmSeat = tenant.pmSeat;
  const snap = useCommunitySnapshot();
  const isBoard = snap.viewer.isBoard;
  // Owners vote inside meetings; their votes and the board's decisions are in Notices.
  const tab: CommunityTab = requested === 'votes' && !isBoard ? 'notices' : requested;

  const notices = noticesSummary(snap);
  const meetings = meetingsSummary(meetingRows(snap));
  const votes = votesSummary(voteRows(snap));
  const requests = requestsSummary(requestRows(snap));
  const pendingApprovals = useAmenitiesStore(s => s.getPendingApprovals)().length;
  const myReservations = useAmenitiesStore(s => s.getReservationsForUser)(snap.viewer.id).filter(r => r.status === 'active' || r.status === 'pending_approval').length;

  const go = (next: CommunityTab, extra?: Record<string, string | null>) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab'); else p.set('tab', next);
      for (const k of ['vote', 'meeting', 'request']) p.delete(k);
      for (const [k, v] of Object.entries(extra ?? {})) { if (v) p.set(k, v); else p.delete(k); }
      return p;
    }, { replace: true });
  };

  // Opening a meeting is a step in, so it gets its own history entry: Back returns to the list.
  const openMeeting = (id: string | null) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'meetings');
      if (id) p.set('meeting', id); else p.delete('meeting');
      return p;
    });
    window.scrollTo?.({ top: 0 });
  };

  const subtitle = {
    overview: 'Where the building acts together: how we are doing as a building, and the latest notices, meetings, votes and requests.',
    log: 'The property log. Anyone can log what they see around the building; the board and the manager follow up.',
    scorecard: 'How the property manager is doing, quarter by quarter, as the board rates them in five categories.',
    notices: 'The bulletin board. What the building needs to know, who posted it, and the alerts channel for anything urgent.',
    meetings: isBoard ? 'Every meeting, start to finish: the agenda with its votes and reports, the notice and ballots by app, email and mail, the meeting itself (minutes, votes and attendance in one view) and the summary to owners. The sealed record goes to Building › Archive.' : 'Meetings with their agenda, documents and your ballot once the notice is out. Vote ahead or during the meeting; results and approved minutes follow.',
    votes: 'The record of every vote, grouped by the meeting it was taken at, with open ballots and turnout. Votes between meetings (written consent and mailed ballots) are below.',
    requests: isBoard ? 'Ask the board for something, follow where it is, and see what neighbours have asked for. This is the owner-facing side of the requests the board works in Board Room › Inbox: replies, the 14-day clock and the convert-to-action step happen there; the owner sees the status, the dates and the replies.' : 'Ask the board for something, follow where it is, and see what neighbours have asked for. The board replies within 14 days.',
    amenities: isBoard ? 'Reserve the shared spaces, follow your reservations, and the rules the board set. Approvals and Settings show for the board and manager only.' : 'Reserve the shared spaces, follow your reservations, and the rules the board set. The board approves requests within a day.',
  }[tab];

  const tabs = [
    { id: 'overview' as CommunityTab, label: 'Overview' },
    { id: 'notices' as CommunityTab, label: 'Notices', badge: notices.pinned.length || undefined, badgeTone: 'cyan' as const },
    { id: 'meetings' as CommunityTab, label: 'Meetings', badge: meetings.next ? dayLabel(meetings.next.meeting.date) : undefined, badgeTone: meetings.noticesOverdue.length ? 'red' as const : 'ghost' as const },
    ...(isBoard ? [{ id: 'votes' as CommunityTab, label: 'Votes', badge: votes.open.length || undefined, badgeTone: 'plum' as const }] : []),
    { id: 'requests' as CommunityTab, label: 'Requests', badge: (isBoard ? requests.open.length : requests.mineOpen.length) || undefined, badgeTone: requests.overdue.length && isBoard ? 'red' as const : 'ghost' as const },
    { id: 'log' as CommunityTab, label: 'Property log' },
    ...(isManagementSuite ? [{ id: 'amenities' as CommunityTab, label: 'Amenities', badge: (isBoard ? pendingApprovals : myReservations) || undefined, badgeTone: 'amber' as const }] : []),
    ...(pmSeat ? [{ id: 'scorecard' as CommunityTab, label: 'PM scorecard' }] : []),
  ];

  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-community" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title="Community"
          subtitle={subtitle}
          status={notices.alerts.length > 0 || meetings.next ? <>
            {notices.alerts.length > 0 && (
              <button type="button" onClick={() => go('notices')} className="rounded-full"><Chip tone="red" className={STATUS_CHIP}>{notices.alerts.length} alert{notices.alerts.length === 1 ? '' : 's'}</Chip></button>
            )}
            {meetings.next && <Chip tone="ghost" className={STATUS_CHIP}>Next meeting {dayLabel(meetings.next.meeting.date)}</Chip>}
          </> : undefined}
          tabs={<PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Community sections" />}
        />

        {tab === 'overview' && <OverviewTab snap={snap} onGo={go} />}
        {tab === 'notices' && <NoticesTab snap={snap} />}
        {tab === 'meetings' && <MeetingsTab snap={snap} meetingId={params.get('meeting')} onOpen={openMeeting} />}
        {tab === 'votes' && <div className="flex flex-col gap-4"><VotesRecord snap={snap} /><div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Between meetings · written consent and mailed ballots</div><VotesTab snap={snap} selectedId={params.get('vote')} onSelect={id => go('votes', { vote: id })} /></div>}
        {tab === 'requests' && <RequestsTab snap={snap} highlightId={params.get('request')} />}
        {tab === 'log' && <LogTab isBoard={isBoard} />}
        {tab === 'amenities' && isManagementSuite && <AmenitiesSection snap={snap} />}
        {tab === 'scorecard' && pmSeat && <ScorecardTab isBoard={isBoard} today={snap.today} />}
      </div>
    </HeaderSlotProvider>
  );
}
