import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSettingsPage from '@/features/account/AccountSettingsPage';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import StewardshipCard from '../../home/StewardshipCard';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents, stewardshipFor } from '../../score/events';
import { bandFor, computeScorecard } from '../../score/stewardship';
import { dimensionLines, lowestDimension, recentReceipts, type MeSnapshot } from '../metrics';

const HOW: Record<string, string> = {
  Timeliness: 'Dues paid by the due date and requests answered by their date. Full credit on time, half a week late, a quarter a month late.',
  Compliance: 'Filings and dated obligations met on time; invoices and assessments paid by their date.',
  Oversight: 'Cases closed and none past their target; for board members, the board checklist.',
  Reach: 'Showing up: meetings attended, in person, remote or by proxy.',
  Impact: 'Ballots cast and board decisions voted on, of the ones you could.',
};

export default function AccountTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const store = useStoreSnapshot(snap.today);
  const board = useBuildingStore(s => s.board);
  const view = useMemo(() => stewardshipFor(store), [store]);
  const lines = dimensionLines(view.you, view.building.dims);
  const recent = recentReceipts(view.events, snap.today, 3);
  const lowest = lowestDimension(view.you);
  const leaderboard = useMemo(() => snap.viewer.isBoard
    ? board.map(b => ({ name: b.name, role: b.role, score: computeScorecard(boardEvents(store, { name: b.name, officerTitle: b.role })).total, you: b.name === snap.viewer.name })).sort((a, b) => b.score - a.score)
    : [], [board, store, snap.viewer]);
  const rank = leaderboard.findIndex(l => l.you) + 1;
  const ahead = rank > 1 ? leaderboard[rank - 2] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StewardshipCard you={view.you} events={view.events} buildingDims={view.building.dims} buildingTotal={view.building.total} group={view.group} subject={`${bandFor(view.you.total)} · ${snap.viewer.officerTitle ?? (snap.viewer.isBoard ? 'board member' : 'owner')} · this year`} />
        <Card aria-label="This month">
          <SectionLabel>Last scored events · each with a receipt</SectionLabel>
          {recent.length === 0 ? <p className="text-sm text-ux2-muted">Nothing scored yet.</p> : (
            <ul className="m-0 list-none divide-y divide-ux2-line p-0">
              {recent.map(e => (
                <li key={e.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ux2-ink">{e.label}</div>
                    <div className="text-xs text-ux2-muted">{dayLabel(e.date)} · {e.reason ?? ''}</div>
                  </div>
                  <Chip tone={e.earned >= e.available ? 'teal' : e.earned > 0 ? 'amber' : 'red'}>{e.dimension} {e.earned > 0 ? `+${e.points}` : '0'}</Chip>
                </li>
              ))}
            </ul>
          )}
          <Inner className="text-xs text-ux2-muted">Timeliness and Compliance weigh 35 points each, Oversight, Reach and Impact 10 each. Scored on the last twelve months; {view.events.length} events behind this score.</Inner>
        </Card>
        {snap.viewer.isBoard ? (
          <Card tone="red" aria-label="On the board">
            <SectionLabel className="text-white/[0.75]">On the board</SectionLabel>
            <div className="text-2xl font-semibold">{snap.viewer.officerTitle ?? 'Board member'}</div>
            <ul className="m-0 list-none p-0 text-sm text-white/[0.9]">
              {rank > 0 && <li className="flex justify-between py-0.5"><span>On the leaderboard</span><b className="font-semibold text-white">{rank} of {leaderboard.length}</b></li>}
              {ahead && <li className="flex justify-between py-0.5"><span>Ahead of you</span><b className="font-semibold text-white">{ahead.name.split(' ')[0]} · {ahead.score}</b></li>}
              <li className="flex justify-between py-0.5"><span>Board mean · building avg</span><b className="font-semibold text-white">{view.building.total}</b></li>
            </ul>
            <button type="button" onClick={() => navigate('/community')} className="self-start text-xs font-semibold text-white underline-offset-2 hover:underline">Full leaderboard · Community › Overview</button>
          </Card>
        ) : (
          <Card tone="teal" aria-label="Your place">
            <SectionLabel className="text-white/[0.66]">Among the owners</SectionLabel>
            <div className="text-2xl font-semibold">{view.you.total} · {bandFor(view.you.total)}</div>
            <p className="text-sm text-white/[0.85]">Owners average {view.building.total}. Lift {lowest} first: {HOW[lowest]}</p>
            <button type="button" onClick={() => navigate('/community')} className="self-start text-xs font-semibold text-white underline-offset-2 hover:underline">The leaderboard · Community › Overview</button>
          </Card>
        )}
      </div>

      <Card tone="cyan" aria-label="By dimension">
        <SectionLabel className="text-ux2-navy/[0.65]">By dimension · how the score works</SectionLabel>
        <ul className="m-0 list-none divide-y divide-ux2-navy/10 p-0">
          {lines.map(l => (
            <li key={l.dimension} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{l.dimension}</div><div className="text-xs opacity-75">{HOW[l.dimension]} · {l.earned} of {l.available} credit{l.available === 1 ? '' : 's'} · {l.points} of {l.weight} points</div></div>
              <div className="flex items-center gap-3 text-sm"><span className="opacity-70">avg {l.buildingPct ?? '—'}</span><b className="w-8 text-right text-lg font-semibold">{l.pct}</b></div>
            </li>
          ))}
        </ul>
      </Card>

      {snap.viewer.isBoard && leaderboard.length > 0 && (
        <Card tone="teal" aria-label="Board leaderboard">
          <SectionLabel className="text-white/[0.66]">Board leaderboard · composite · band</SectionLabel>
          <ol className="m-0 list-none p-0">
            {leaderboard.map((l, i) => (
              <li key={l.name} className={`flex items-center gap-3 border-b border-white/15 py-2 last:border-b-0 ${l.you ? 'rounded-lg bg-white/10 px-2' : ''}`}>
                <span className="w-5 text-right text-sm font-semibold text-white/60">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm"><b className="font-semibold">{l.you ? 'You' : l.name.split(' ')[0]}</b> · {l.role}</span>
                <Chip tone={l.score >= 90 ? 'cyan' : l.score >= 80 ? 'sage' : l.score >= 70 ? 'amber' : 'red'}>{bandFor(l.score)} · {l.score}</Chip>
              </li>
            ))}
          </ol>
          <p className="text-xs text-white/[0.7]">Only board members see this list.</p>
        </Card>
      )}

      <Card aria-label="Profile and preferences">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Profile, linked units, notifications and security</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => navigate('/my-unit')}>My Unit</Button>
        </div>
        <div className="ux2-legacy"><AccountSettingsPage embedded /></div>
      </Card>
    </div>
  );
}
