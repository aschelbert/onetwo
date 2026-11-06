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
import { useAmenitiesStore } from '@/store/useAmenitiesStore';
import { Chip, PillTabs } from '../components';
import { dayLabel } from '../home/calendar';
import { useCommunitySnapshot } from './useCommunitySnapshot';
import { meetingRows, meetingsSummary, noticesSummary, requestRows, requestsSummary, voteRows, votesSummary } from './metrics';
import OverviewTab from './tabs/OverviewTab';
import NoticesTab from './tabs/NoticesTab';
import MeetingsTab from './tabs/MeetingsTab';
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
  const tab = resolveCommunityTab(params.get('tab'));
  const tenant = useTenantContext();
  const isManagementSuite = tenant.tier === 'management_suite' || tenant.isDemo;
  const pmSeat = tenant.pmSeat;
  const snap = useCommunitySnapshot();
  const isBoard = snap.viewer.isBoard;

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

  const subtitle = {
    overview: 'Where the building acts together: how we are doing as a building, and the latest notices, meetings, votes and requests.',
    log: 'The property log. Anyone can log what they see around the building; the board and the manager follow up.',
    scorecard: 'How the property manager is doing, quarter by quarter, as the board rates them in five categories.',
    notices: 'The bulletin board. What the building needs to know, who posted it, and the alerts channel for anything urgent.',
    meetings: 'Scheduling, notices, agendas, attendance, minutes and their approval, in one place for the board and the owners.',
    votes: 'Open votes for owners and the board, ballots, proxies, quorum, results and certification.',
    requests: 'Ask the board for something, follow where it is, and see what neighbours have asked for.',
    amenities: 'Reserve the shared spaces, follow your reservations, and the rules the board set.',
  }[tab];

  const tabs = [
    { id: 'overview' as CommunityTab, label: 'Overview' },
    { id: 'notices' as CommunityTab, label: 'Notices', badge: notices.pinned.length ? `${notices.pinned.length} pinned` : undefined, badgeTone: 'cyan' as const },
    { id: 'meetings' as CommunityTab, label: 'Meetings', badge: meetings.next ? dayLabel(meetings.next.meeting.date) : undefined, badgeTone: meetings.noticesOverdue.length ? 'red' as const : 'ghost' as const },
    { id: 'votes' as CommunityTab, label: 'Votes', badge: votes.open.length ? `${votes.open.length} open` : undefined, badgeTone: 'plum' as const },
    { id: 'requests' as CommunityTab, label: 'Requests', badge: (isBoard ? requests.open.length : requests.mineOpen.length) || undefined, badgeTone: requests.overdue.length && isBoard ? 'red' as const : 'ghost' as const },
    { id: 'log' as CommunityTab, label: 'Property log' },
    ...(isManagementSuite ? [{ id: 'amenities' as CommunityTab, label: 'Amenities', badge: isBoard && pendingApprovals ? `${pendingApprovals} to approve` : myReservations || undefined, badgeTone: 'amber' as const }] : []),
    ...(pmSeat ? [{ id: 'scorecard' as CommunityTab, label: 'PM scorecard' }] : []),
  ];

  return (
    <div data-page="ux2-community" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">Community</h1>
            <p className="max-w-[760px] text-sm text-ux2-muted">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {notices.alerts.length > 0 && (
              <button type="button" onClick={() => go('notices')} className="rounded-full"><Chip tone="red">{notices.alerts.length} alert{notices.alerts.length === 1 ? '' : 's'}</Chip></button>
            )}
            {meetings.next && <Chip tone="ghost">Next meeting {dayLabel(meetings.next.meeting.date)}</Chip>}
          </div>
        </div>
        <PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Community sections" />
      </header>

      {tab === 'overview' && <OverviewTab snap={snap} onGo={go} />}
      {tab === 'notices' && <NoticesTab snap={snap} />}
      {tab === 'meetings' && <MeetingsTab snap={snap} highlightId={params.get('meeting')} />}
      {tab === 'votes' && <VotesTab snap={snap} selectedId={params.get('vote')} onSelect={id => go('votes', { vote: id })} />}
      {tab === 'requests' && <RequestsTab snap={snap} highlightId={params.get('request')} />}
      {tab === 'log' && <LogTab isBoard={isBoard} />}
      {tab === 'amenities' && isManagementSuite && <AmenitiesSection snap={snap} />}
      {tab === 'scorecard' && pmSeat && <ScorecardTab isBoard={isBoard} today={snap.today} />}
    </div>
  );
}
