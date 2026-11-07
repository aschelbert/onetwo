import { useMemo, useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents, ownerEvents } from '../../score/events';
import { average, bandFor, computeScorecard, DIMENSIONS, WEIGHTS, type Scorecard, type ScoreEvent } from '../../score/stewardship';
import StewardshipCard from '../../home/StewardshipCard';
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
    const named: { name: string; e: ScoreEvent }[] = [];
    const boardCards = board.map(b => { const events = boardEvents(store, { name: b.name, officerTitle: b.role }); for (const e of events) named.push({ name: b.name, e }); return { card: computeScorecard(events), events }; });
    const boardScores = boardCards.map(c => c.card.total);
    const allEvents: ScoreEvent[] = boardCards.flatMap(c => c.events);
    const cards: Scorecard[] = boardCards.map(c => c.card);
    const rows: LeaderRow[] = snap.units.map(u => {
      const member = board.find(b => b.name === u.owner);
      const events = member ? boardEvents(store, { name: u.owner, officerTitle: member.role }) : ownerEvents(store, { name: u.owner, units: [u.number] });
      const card = computeScorecard(events);
      if (!member) { cards.push(card); allEvents.push(...events); for (const e of events) named.push({ name: u.owner, e }); }
      const you = snap.viewer.linkedUnits.includes(u.number) || u.owner === snap.viewer.name;
      return { unit: u.number, name: you ? 'You' : firstName(u.owner), role: member?.role, score: card.total, band: bandFor(card.total), you };
    }).sort((a, b) => b.score - a.score);
    const owners = average(rows.map(r => r.score));
    const boardAvg = average(boardScores);
    const building = rows.length || boardScores.length ? average([...rows.map(r => r.score), ...boardScores]) : 0;
    // The building as one scorecard: each dimension the average of everyone's, so the same card can show it.
    const dims = DIMENSIONS.map((_, i) => average(cards.map(c => c.dimensions[i]?.pct ?? 0)));
    const boardDims = DIMENSIONS.map((_, i) => average(boardCards.map(c => c.card.dimensions[i]?.pct ?? 0)));
    const buildingCard: Scorecard = { total: building, band: bandFor(building), dimensions: DIMENSIONS.map((dimension, i) => ({ dimension, weight: WEIGHTS[dimension], earned: dims[i] / 100, available: 1, points: Math.round((dims[i] / 100) * WEIGHTS[dimension] * 10) / 10, pct: dims[i] })) };
    return { rows, owners, boardAvg, building, buildingCard, boardDims, allEvents, named };
  }, [snap.units, snap.viewer, board, store]);

  const visible = leaderboardVisible(scores.rows, snap.viewer.isBoard);
  const month = snap.today.slice(0, 7);
  const movers = useMemo(() => [...scores.named]
    .filter(({ e }) => e.earned > 0 && (e.date.startsWith(month) || e.date >= `${snap.today.slice(0, 4)}-${String(Math.max(1, Number(snap.today.slice(5, 7)) - 1)).padStart(2, '0')}`))
    .sort((a, b) => b.e.date.localeCompare(a.e.date))
    .slice(0, 4), [scores.named, month, snap.today]);
  const belowHidden = scores.rows.length - visible.length;
  const toGo = Math.max(0, 90 - scores.building);
  const lift: { title: string; detail: string; dim: string; tab: CommunityTab; extra?: Record<string, string> }[] = [];
  for (const v of votes.open.slice(0, 1)) lift.push({ title: `Vote on ${v.election.title}`, detail: `${v.eligibleUnits - v.votedUnits} units still to vote${v.closes ? ` · closes ${dayLabel(v.closes)}` : ''}`, dim: '+Impact', tab: 'votes', extra: { vote: v.election.id } });
  if (meetings.next) lift.push({ title: `RSVP for ${dayLabel(meetings.next.meeting.date)}`, detail: `${meetings.next.rsvpUnits} units so far · quorum matters for owner votes`, dim: '+Reach', tab: 'meetings', extra: { meeting: meetings.next.meeting.id } });
  if (requests.buildingOpen.length) lift.push({ title: 'Answer or upvote an open request', detail: `${requests.buildingOpen.length} building-wide request${requests.buildingOpen.length === 1 ? '' : 's'} open`, dim: '+Reach', tab: 'requests' });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card tone="cyan" className="lg:col-span-2" aria-label="Recent notices">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-lg font-medium text-ux2-navy">Recent notices</h2>
            <button type="button" onClick={() => onGo('notices')} className="rounded-full"><Chip tone="white" className="!bg-white !text-ux2-navy">All ›</Chip></button>
          </div>
          {notices.all.length === 0 ? <p className="text-sm text-ux2-navy/[0.7]">Nothing posted yet.</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {notices.all.slice(0, 5).map(a => (
                <li key={a.id} className="flex items-start gap-3 rounded-[14px] bg-white px-3.5 py-2.5">
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
        <StewardshipCard
          label="Building stewardship"
          you={scores.buildingCard}
          events={scores.allEvents}
          buildingDims={scores.boardDims}
          buildingTotal={scores.boardAvg}
          compareLabel="Board avg"
          group="building"
          subject={`${bandFor(scores.building)} · the board (${board.length}) at ${scores.boardAvg}, owners (${snap.units.length}) at ${scores.owners} · ${toGo > 0 ? `${toGo} to Excellent` : 'Excellent'}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {lift.length > 0 && (
        <Card tone="navy" aria-label="Lift it this month">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-medium text-white">Lift it this month</h2>
            <Chip tone="cyan">{toGo > 0 ? `Excellent at 90 · ${toGo} point${toGo === 1 ? '' : 's'} to go` : 'Excellent · keep it there'}</Chip>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lift.map(l => (
              <li key={l.title} className="flex flex-col gap-2 rounded-[14px] bg-white/[0.08] px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold text-white">{l.title}</div><div className="text-xs text-white/[0.66]">{l.detail}</div></div>
                <div className="flex items-center gap-2"><Chip tone={l.dim === '+Impact' ? 'plum' : l.dim === '+Reach' ? 'amber' : 'teal'}>{l.dim}</Chip><button type="button" onClick={() => onGo(l.tab, l.extra)} className="inline-flex h-9 items-center rounded-full border border-white/40 px-3.5 text-xs font-semibold text-white hover:bg-white/10">Open</button></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
        <Card tone="navy" aria-label="Who moved it this month">
          <h2 className="m-0 text-lg font-medium text-white">Who moved it this month</h2>
          {movers.length === 0 ? <p className="m-0 text-sm text-white/[0.7]">Nothing scored yet this month.</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {movers.map(({ name, e }) => (
                <li key={`${name}:${e.id}`} className="flex items-center gap-3 rounded-[14px] bg-white/[0.08] px-3.5 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.12] text-[11px] font-bold text-white">{name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-sm text-white"><b className="font-semibold">{name === snap.viewer.name ? 'You' : firstName(name)}</b> {e.label.charAt(0).toLowerCase() + e.label.slice(1)} <span className="text-white/[0.6]">· {dayLabel(e.date)}</span></span>
                  <Chip tone="cyan">+{e.dimension}</Chip>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-xs text-white/[0.66]">Owners see first names and units only; here and on the leaderboard below.</p>
        </Card>
      </div>

      <Card tone="navy" aria-label="Unit owner leaderboard">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-medium text-white">Unit owner leaderboard · this year</h2>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setShowAll(false)} className="rounded-full"><Chip tone={!showAll ? 'cyan' : 'ghost'} className={!showAll ? '' : '!border-white/30 !bg-transparent !text-white'}>Top 10</Chip></button>
            <button type="button" onClick={() => setShowAll(true)} className="rounded-full"><Chip tone={showAll ? 'cyan' : 'ghost'} className={showAll ? '' : '!border-white/30 !bg-transparent !text-white'}>All {visible.length}</Chip></button>
          </div>
        </div>
        <p className="text-xs text-white/[0.66]">Every owner in the building, board members included. First names and units only; the score is each owner's own stewardship: paying on time, voting, answering and showing up.</p>
        {visible.length === 0 ? <p className="text-sm text-white/[0.7]">No units yet.</p> : (
          <ol className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 md:grid-cols-2">
            {(showAll ? visible : visible.slice(0, 10)).map((r, i) => (
              <li key={r.unit} data-leader={r.unit} className={`flex items-center gap-3 rounded-[14px] px-3 py-2 ${r.you ? 'bg-ux2-cyan/[0.18] ring-1 ring-ux2-cyan' : 'bg-white/[0.08]'}`}>
                <span className="w-6 text-right text-sm font-semibold text-white/[0.5]">{i + 1}</span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.12] text-[11px] font-bold text-white">{r.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white"><b className="font-semibold">{r.name}</b> · {r.unit}{r.role ? ` · ${r.role}` : ''}</span>
                <Chip tone={r.score >= 90 ? 'teal' : r.score >= 80 ? 'sage' : r.score >= 70 ? 'amber' : 'red'}>{r.band} · {r.score}</Chip>
              </li>
            ))}
          </ol>
        )}
        <Inner className="border-white/15 bg-white/[0.08] text-xs text-white/[0.75]">Owners average {scores.owners} · the board averages {scores.boardAvg}{belowHidden > 0 ? ` · ${belowHidden} owner${belowHidden === 1 ? '' : 's'} below 70 see their own place, no one else does` : ''}.</Inner>
      </Card>
    </div>
  );
}
