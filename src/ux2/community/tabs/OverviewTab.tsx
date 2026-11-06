import { useMemo, useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents, ownerEvents } from '../../score/events';
import { average, bandFor, computeScorecard } from '../../score/stewardship';
import { firstName, leaderboardVisible, meetingRows, meetingsSummary, noticesSummary, requestRows, requestsSummary, voteRows, votesSummary, type CommunitySnapshot, type LeaderRow } from '../metrics';
import type { CommunityTab } from '../CommunityModule';

const CATEGORY_LABEL: Record<string, string> = { general: 'Notice', maintenance: 'Maintenance', financial: 'Financial', safety: 'Alert', rules: 'Rules', meeting: 'Meeting' };

export default function OverviewTab({ snap, onGo }: { snap: CommunitySnapshot; onGo: (tab: CommunityTab, extra?: Record<string, string | null>) => void }) {
  const notices = noticesSummary(snap);
  const meetings = meetingsSummary(meetingRows(snap));
  const votes = votesSummary(voteRows(snap));
  const requests = requestsSummary(requestRows(snap));
  const board = useBuildingStore(s => s.board);
  const store = useStoreSnapshot(snap.today);
  const [showAll, setShowAll] = useState(false);

  const scores = useMemo(() => {
    const boardScores = board.map(b => computeScorecard(boardEvents(store, { name: b.name, officerTitle: b.role })).total);
    const rows: LeaderRow[] = snap.units.map(u => {
      const member = board.find(b => b.name === u.owner);
      const score = member ? computeScorecard(boardEvents(store, { name: u.owner, officerTitle: member.role })).total : computeScorecard(ownerEvents(store, { name: u.owner, units: [u.number] })).total;
      const you = snap.viewer.linkedUnits.includes(u.number) || u.owner === snap.viewer.name;
      return { unit: u.number, name: you ? 'You' : firstName(u.owner), role: member?.role, score, band: bandFor(score), you };
    }).sort((a, b) => b.score - a.score);
    const owners = average(rows.map(r => r.score));
    const boardAvg = average(boardScores);
    const building = rows.length || boardScores.length ? average([...rows.map(r => r.score), ...boardScores]) : 0;
    return { rows, owners, boardAvg, building };
  }, [snap.units, snap.viewer, board, store]);

  const visible = leaderboardVisible(scores.rows, snap.viewer.isBoard);
  const belowHidden = scores.rows.length - visible.length;
  const toGo = Math.max(0, 90 - scores.building);
  const lift: { title: string; detail: string; dim: string; tab: CommunityTab; extra?: Record<string, string> }[] = [];
  for (const v of votes.open.slice(0, 1)) lift.push({ title: `Vote on ${v.election.title}`, detail: `${v.eligibleUnits - v.votedUnits} units still to vote${v.closes ? ` · closes ${dayLabel(v.closes)}` : ''}`, dim: '+Impact', tab: 'votes', extra: { vote: v.election.id } });
  if (meetings.next) lift.push({ title: `RSVP for ${dayLabel(meetings.next.meeting.date)}`, detail: `${meetings.next.rsvpUnits} units so far · quorum matters for owner votes`, dim: '+Reach', tab: 'meetings', extra: { meeting: meetings.next.meeting.id } });
  if (requests.buildingOpen.length) lift.push({ title: 'Answer or upvote an open request', detail: `${requests.buildingOpen.length} building-wide request${requests.buildingOpen.length === 1 ? '' : 's'} open`, dim: '+Reach', tab: 'requests' });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-label="Recent notices">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent notices</SectionLabel>
            <button type="button" onClick={() => onGo('notices')} className="text-xs font-semibold text-ux2-teal hover:underline">All ›</button>
          </div>
          {notices.all.length === 0 ? <p className="text-sm text-ux2-muted">Nothing posted yet.</p> : (
            <ul className="m-0 list-none divide-y divide-ux2-line p-0">
              {notices.all.slice(0, 5).map(a => (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <span className="w-14 shrink-0 text-xs font-semibold text-ux2-muted">{dayLabel(a.postedDate.slice(0, 10))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ux2-ink">{a.title}</span>
                    <span className="block truncate text-xs text-ux2-muted">{a.postedBy}{a.pinned ? ' · pinned' : ''}</span>
                  </span>
                  <Chip tone={a.category === 'safety' ? 'red' : a.pinned ? 'cyan' : 'ghost'}>{CATEGORY_LABEL[a.category] ?? a.category}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card tone="teal" aria-label="Building stewardship">
          <SectionLabel className="text-white/[0.66]">Building stewardship</SectionLabel>
          <div className="text-[40px] font-semibold leading-none tracking-[-0.04em]">{scores.building}<small className="ml-1.5 text-sm font-medium text-white/[0.66]">· {bandFor(scores.building)}</small></div>
          <ul className="m-0 list-none p-0 text-sm text-white/[0.9]">
            <li className="flex justify-between py-0.5"><span>Board, {board.length} member{board.length === 1 ? '' : 's'}</span><b className="font-semibold text-white">{scores.boardAvg}</b></li>
            <li className="flex justify-between py-0.5"><span>Unit owners, {snap.units.length}</span><b className="font-semibold text-white">{scores.owners}</b></li>
          </ul>
          <p className="text-xs text-white/[0.66]">{toGo > 0 ? `Excellent at 90 · ${toGo} point${toGo === 1 ? '' : 's'} to go` : 'Excellent · keep it there'} · each number is the average stewardship score of that group over the last twelve months.</p>
        </Card>
      </div>

      {lift.length > 0 && (
        <Card aria-label="Lift it this month">
          <SectionLabel>Lift it this month</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {lift.map(l => (
              <li key={l.title} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold text-ux2-ink">{l.title}</div><div className="text-xs text-ux2-muted">{l.detail}</div></div>
                <div className="flex items-center gap-2"><Chip tone="teal">{l.dim}</Chip><Button size="sm" onClick={() => onGo(l.tab, l.extra)}>Open</Button></div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="Unit owner leaderboard">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Unit owner leaderboard · this year</SectionLabel>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setShowAll(false)} className="rounded-full"><Chip tone={!showAll ? 'navy' : 'ghost'}>Top 10</Chip></button>
            <button type="button" onClick={() => setShowAll(true)} className="rounded-full"><Chip tone={showAll ? 'navy' : 'ghost'}>All {visible.length}</Chip></button>
          </div>
        </div>
        <p className="text-xs text-ux2-muted">Every owner in the building, board members included. First names and units only; the score is each owner's own stewardship: paying on time, voting, answering and showing up.</p>
        {visible.length === 0 ? <p className="text-sm text-ux2-muted">No units yet.</p> : (
          <ol className="m-0 list-none p-0">
            {(showAll ? visible : visible.slice(0, 10)).map((r, i) => (
              <li key={r.unit} data-leader={r.unit} className={`flex items-center gap-3 border-b border-ux2-line py-2 last:border-b-0 ${r.you ? 'rounded-lg bg-ux2-cyan/40 px-2' : ''}`}>
                <span className="w-6 text-right text-sm font-semibold text-ux2-dim">{i + 1}</span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ux2-navy text-[11px] font-bold text-white">{r.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ux2-ink"><b className="font-semibold">{r.name}</b> · {r.unit}{r.role ? ` · ${r.role}` : ''}</span>
                <Chip tone={r.score >= 90 ? 'teal' : r.score >= 80 ? 'sage' : r.score >= 70 ? 'amber' : 'red'}>{r.band} · {r.score}</Chip>
              </li>
            ))}
          </ol>
        )}
        <Inner className="text-xs text-ux2-muted">Owners average {scores.owners} · the board averages {scores.boardAvg}{belowHidden > 0 ? ` · ${belowHidden} owner${belowHidden === 1 ? '' : 's'} below 70 see their own place, no one else does` : ''}.</Inner>
      </Card>
    </div>
  );
}
