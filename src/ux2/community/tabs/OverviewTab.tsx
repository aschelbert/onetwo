import { useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Card, Chip, PillTabs } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents, ownerEvents } from '../../score/events';
import { average, bandFor, computeScorecard, DIMENSIONS, WEIGHTS, type Scorecard, type ScoreEvent } from '../../score/stewardship';
import { change, movers as findMovers, trend, type Mover, type Person, type TrendPoint, type TrendRange } from '../../score/trend';
import { ONLINE_METHODS } from '../../funds/metrics';
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
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const scores = useMemo(() => {
    const named: { name: string; e: ScoreEvent }[] = [];
    const people: Person[] = [];
    const boardCards = board.map(b => { const events = boardEvents(store, { name: b.name, officerTitle: b.role }); for (const e of events) named.push({ name: b.name, e }); people.push({ name: b.name, group: 'board', units: snap.units.filter(u => u.owner === b.name).map(u => u.number), events }); return { card: computeScorecard(events), events }; });
    const boardScores = boardCards.map(c => c.card.total);
    const allEvents: ScoreEvent[] = boardCards.flatMap(c => c.events);
    const cards: Scorecard[] = boardCards.map(c => c.card);
    const rows: LeaderRow[] = snap.units.map(u => {
      const member = board.find(b => b.name === u.owner);
      const events = member ? boardEvents(store, { name: u.owner, officerTitle: member.role }) : ownerEvents(store, { name: u.owner, units: [u.number] });
      const card = computeScorecard(events);
      if (!member) { cards.push(card); allEvents.push(...events); for (const e of events) named.push({ name: u.owner, e }); const existing = people.find(p => p.group === 'owner' && p.name === u.owner); if (existing) existing.units.push(u.number); else people.push({ name: u.owner, group: 'owner', units: [u.number], events }); }
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
    return { rows, owners, boardAvg, building, buildingCard, boardDims, allEvents, named, people };
  }, [snap.units, snap.viewer, board, store]);

  const visible = leaderboardVisible(scores.rows, snap.viewer.isBoard);
  const [range, setRange] = useState<TrendRange>('90d');
  const points = useMemo(() => trend(scores.people, snap.today, range), [scores.people, snap.today, range]);
  const moved = useMemo(() => findMovers(scores.people, snap.today, 30, 4), [scores.people, snap.today]);
  const belowHidden = scores.rows.length - visible.length;
  const toGo = Math.max(0, 90 - scores.building);
  const lift: { title: string; detail: string; dim: string; tab?: CommunityTab; extra?: Record<string, string>; path?: string }[] = [];
  for (const v of votes.open.slice(0, 1)) lift.push({ title: `Vote on ${v.election.title}`, detail: `${v.eligibleUnits - v.votedUnits} units still to vote${v.closes ? ` · closes ${dayLabel(v.closes)}` : ''}`, dim: '+Impact', tab: 'votes', extra: { vote: v.election.id } });
  if (meetings.next) lift.push({ title: `RSVP for ${dayLabel(meetings.next.meeting.date)}`, detail: `${meetings.next.rsvpUnits} units so far · quorum matters for owner votes`, dim: '+Reach', tab: 'meetings', extra: { meeting: meetings.next.meeting.id } });
  if (requests.buildingOpen.length) lift.push({ title: 'Answer or upvote an open request', detail: `${requests.buildingOpen.length} building-wide request${requests.buildingOpen.length === 1 ? '' : 's'} open`, dim: '+Reach', tab: 'requests' });

  const autopayUnits = snap.units.filter(u => u.payments.some(p => ONLINE_METHODS.includes((p.method || '').toLowerCase()))).length;
  if (snap.units.length && autopayUnits < snap.units.length) lift.push({ title: 'Turn on autopay', detail: `${autopayUnits} of ${snap.units.length} units · never a late fee`, dim: '+Timeliness', path: '/my-unit/pay' });
  const label = (m: Mover) => {
    const p = m.person;
    if (p.name === snap.viewer.name) return 'You';
    // Owners who are pulling the score down are named only to the board; the board is named to everyone.
    if (m.delta < 0 && p.group === 'owner' && !snap.viewer.isBoard) return p.units[0] ? `Unit ${p.units[0]}` : 'An owner';
    return `${firstName(p.name)}${p.group === 'owner' && p.units[0] ? ` · ${p.units[0]}` : ''}`;
  };
  const moved90 = change(points);
  const shown = showAll ? visible : visible.slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card tone="cyan" className="self-start" aria-label="Recent notices">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-medium text-ux2-navy">Recent notices</h2>
          <button type="button" onClick={() => onGo('notices')} className="rounded-full"><Chip tone="white" className="!bg-white !text-ux2-navy">All ›</Chip></button>
        </div>
        {notices.all.length === 0 ? <p className="text-sm text-ux2-navy/[0.7]">Nothing posted yet.</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {notices.all.slice(0, 5).map(a => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.72] px-3 py-2.5">
                <span className="w-12 shrink-0 text-xs font-semibold text-ux2-muted">{dayLabel(a.postedDate.slice(0, 10))}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ux2-ink">{a.title}</span>
                  <span className="block truncate text-xs text-ux2-muted">{firstName(a.postedBy)}{a.pinned ? ' · pinned' : ''}</span>
                </span>
                <Chip tone={a.category === 'safety' ? 'red' : a.pinned ? 'navy' : 'ghost'} className="shrink-0">{CATEGORY_LABEL[a.category] ?? a.category}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-col gap-5 lg:col-span-2">
        <Card tone="navy" aria-label="Building stewardship">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-medium text-white">Building stewardship · {range === '12m' ? 'last 12 months' : range === '90d' ? 'last 90 days' : 'last 30 days'}</h2>
            <PillTabs size="filter" aria-label="Stewardship range" value={range} onChange={setRange} className="!border-white/15 !bg-white/[0.08] [&_button]:!text-white [&_button[aria-current=page]]:!bg-white [&_button[aria-current=page]]:!text-ux2-navy" tabs={[{ id: '12m', label: '12 months' }, { id: '90d', label: '90 days' }, { id: '30d', label: '30 days' }]} />
          </div>
          <TrendChart points={points} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ux2-red" />Whole building · {scores.building} · {bandFor(scores.building)}</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-white" />Board, {board.length} member{board.length === 1 ? '' : 's'} · {scores.boardAvg}</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-ux2-cyan" />Unit owners, {scores.people.filter(p => p.group === 'owner').length} · {scores.owners}</span>
            <span className={`ml-auto font-semibold ${moved90 > 0 ? 'text-ux2-cyan' : moved90 < 0 ? 'text-[#F7A8B2]' : 'text-white/70'}`}>{moved90 > 0 ? `Up ${moved90}` : moved90 < 0 ? `Down ${-moved90}` : 'Flat'} over the range</span>
          </div>
          <p className="m-0 text-xs text-white/[0.66]">Each line is the average stewardship score of that group on that day, from what was scored in the year before it. This is the building over time; Home and My Account show where you stand today.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div aria-label="Lift it this month" className="flex flex-col gap-2 rounded-[18px] bg-white/[0.06] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[15px] font-semibold text-white">Lift it this month</span><Chip tone="cyan">{toGo > 0 ? `Excellent at 90 · ${toGo} point${toGo === 1 ? '' : 's'} to go` : 'Excellent · keep it there'}</Chip></div>
              {lift.length === 0 ? <p className="m-0 text-sm text-white/[0.7]">Nothing open right now that would move it.</p> : lift.map(l => (
                <button key={l.title} type="button" onClick={() => (l.path ? navigate(l.path) : l.tab && onGo(l.tab, l.extra))} className="flex items-center gap-3 rounded-[12px] bg-white/[0.08] px-3 py-2.5 text-left hover:bg-white/[0.14]">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{l.title}</span><span className="block text-xs text-white/[0.66]">{l.detail}</span></span>
                  <Chip tone={l.dim === '+Impact' ? 'plum' : l.dim === '+Reach' ? 'amber' : 'teal'} className="shrink-0">{l.dim}</Chip>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <MoverList title="Who moved it up · last 30 days" aria="Who moved it up" items={moved.up} label={label} empty="Nothing lifted it in the last 30 days." />
              <MoverList title="Who is pulling it down · last 30 days" aria="Who is pulling it down" items={moved.down} label={label} empty="Nothing pulled it down in the last 30 days." down />
              <p className="m-0 text-xs text-white/[0.66]">{snap.viewer.isBoard ? 'You see every name. Owners see first names and units, and only units for owners pulling it down.' : 'First names and units only. Owners pulling it down are shown by unit; the board sees who.'}</p>
            </div>
          </div>
        </Card>

        <Card tone="teal" aria-label="Unit owner leaderboard">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-medium text-white">Unit owner leaderboard · this year</h2>
            <PillTabs size="filter" aria-label="Leaderboard size" value={showAll ? 'all' : 'top'} onChange={v => setShowAll(v === 'all')} className="!border-white/15 !bg-white/[0.1] [&_button]:!text-white [&_button[aria-current=page]]:!bg-white [&_button[aria-current=page]]:!text-ux2-teal" tabs={[{ id: 'top', label: 'Top 10' }, { id: 'all', label: `All ${visible.length}` }]} />
          </div>
          <p className="m-0 text-xs text-white/[0.75]">Every owner in the building, board members included. First names and units only; the score is each owner's own stewardship: paying on time, voting, answering and showing up.</p>
          {visible.length === 0 ? <p className="text-sm text-white/[0.8]">No units yet.</p> : (
            <ol className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 md:grid-cols-2">
              {shown.map((r, i) => (
                <li key={r.unit} data-leader={r.unit} className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2 ${r.you ? 'bg-white/[0.16] ring-2 ring-white' : 'bg-white/[0.1]'}`}>
                  <span className="w-5 text-right text-xs font-semibold text-white/[0.6]">{i + 1}</span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ux2-navy text-[10px] font-bold text-white">{(r.you ? snap.viewer.name : r.name).split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-white"><b className="font-semibold">{r.name}</b><span className="text-white/[0.7]"> · {r.unit}{r.role ? ` · ${r.role}` : ''}</span></span>
                  <span className="shrink-0 text-xs text-white/[0.75]">{r.band}</span>
                  <span className="w-7 shrink-0 text-right text-sm font-semibold text-white">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/[0.8]">Owners average {scores.owners} · the board averages {scores.boardAvg}{belowHidden > 0 ? ` · the ${belowHidden} owner${belowHidden === 1 ? '' : 's'} below 70 see their own place, no one else does` : ''}</span>
            {!showAll && visible.length > 10 && <button type="button" onClick={() => setShowAll(true)} className="inline-flex h-9 items-center rounded-full bg-white/[0.14] px-3.5 text-xs font-semibold text-white hover:bg-white/[0.22]">Show all {visible.length} ›</button>}
          </div>
        </Card>
      </div>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Dues · 2026-10" → "dues · Oct 2026": lower-case first letter, month codes spelled out. */
function prettify(text: string): string {
  const t = text.replace(/\b(\d{4})-(\d{2})\b/g, (_, y: string, m: string) => `${MONTHS[Number(m) - 1] ?? m} ${y}`);
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function MoverList({ title, aria, items, label, empty, down }: { title: string; aria: string; items: Mover[]; label: (m: Mover) => string; empty: string; down?: boolean }) {
  return (
    <div aria-label={aria} className="flex flex-col gap-2 rounded-[18px] bg-white/[0.06] p-3.5">
      <span className="text-[15px] font-semibold text-white">{title}</span>
      {items.length === 0 ? <p className="m-0 text-sm text-white/[0.7]">{empty}</p> : items.map(m => (
        <div key={`${m.person.name}:${m.event.id}`} data-mover={down ? 'down' : 'up'} className="flex items-center gap-2.5 rounded-[12px] bg-white/[0.08] px-3 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.14] text-[10px] font-bold text-white">{label(m).startsWith('Unit ') ? label(m).slice(5, 8) : m.person.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1 text-xs text-white"><b className="font-semibold">{label(m)}</b> {prettify(m.event.label)}{m.event.reason ? ` · ${prettify(m.event.reason)}` : ''} <span className="text-white/[0.55]">· {dayLabel(m.event.date)}</span></span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${down ? 'bg-ux2-red text-white' : 'bg-ux2-cyan text-ux2-navy'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
        </div>
      ))}
    </div>
  );
}

const W = 640;
const H = 190;
const PAD = { l: 30, r: 10, t: 12, b: 22 };

/** Three lines (building, board, owners) over the range; hover shows the values for a day. */
function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.flatMap(p => [p.building, p.board, p.owners]);
  const lo = Math.max(0, Math.min(70, Math.floor((Math.min(...values) - 5) / 5) * 5));
  const hi = 100;
  const x = (i: number) => PAD.l + (points.length > 1 ? (i / (points.length - 1)) * (W - PAD.l - PAD.r) : 0);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (k: 'building' | 'board' | 'owners') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const ticks = [hi, Math.round((hi + lo) / 2 / 5) * 5, lo];
  const months: { i: number; label: string }[] = [];
  points.forEach((p, i) => { const m = p.date.slice(0, 7); if (i === 0 || m !== points[i - 1].date.slice(0, 7)) months.push({ i, label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) }); });
  const at = hover ?? points.length - 1;
  const p = points[at];
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  if (!p) return null;
  const tipX = Math.min(Math.max(x(at), PAD.l + 90), W - PAD.r - 90);
  return (
    <div className="rounded-[14px] bg-white/[0.05] px-2 py-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Stewardship trend: building ${p.building}, board ${p.board}, owners ${p.owners} on ${p.date}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.12)" /><text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.5)">{t}</text></g>)}
        {months.map(m => <text key={m.i} x={x(m.i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)">{m.label}</text>)}
        <path d={path('owners')} fill="none" stroke="#A5F3FC" strokeWidth="2" />
        <path d={path('board')} fill="none" stroke="#FFFFFF" strokeWidth="2" />
        <path d={path('building')} fill="none" stroke="#E23B4E" strokeWidth="2.5" />
        <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
        {(['building', 'board', 'owners'] as const).map(k => <circle key={k} cx={x(at)} cy={y(p[k])} r="3.5" fill={k === 'building' ? '#E23B4E' : k === 'board' ? '#FFFFFF' : '#A5F3FC'} stroke="#0D1B2E" strokeWidth="1.5" />)}
        <g transform={`translate(${tipX - 88},${PAD.t})`}>
          <rect width="176" height="30" rx="8" fill="#FFFFFF" />
          <text x="88" y="12" textAnchor="middle" fontSize="9" fill="#5F6C7B">{new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>
          <text x="88" y="24" textAnchor="middle" fontSize="10" fontWeight="600" fill="#0D1B2E">Building {p.building} · Board {p.board} · Owners {p.owners}</text>
        </g>
      </svg>
    </div>
  );
}
