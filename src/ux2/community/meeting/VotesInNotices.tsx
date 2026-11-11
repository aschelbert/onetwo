/**
 * What Notices shows about votes, now that owners vote inside meetings:
 * the board's decisions once decided (for everyone), and the viewer's own
 * unit's votes with each result (owners only; only they and the board see
 * how a unit voted, and election ballots stay secret).
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isBackendEnabled } from '@/lib/supabase';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { useMeetingRecordStore } from '@/store/useMeetingRecordStore';
import { Card, Chip, Inner, SectionLabel, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { boardDecisions, type CommunitySnapshot } from '../metrics';
import { itemsOf, resultLine } from '../meetingRecord';

export function BoardDecisionsCard({ snap }: { snap: CommunitySnapshot }) {
  const navigate = useNavigate();
  const cases = useIssuesStore(s => s.cases);
  const approvals = useSpendingStore(s => s.approvals);
  const board = useBuildingStore(s => s.board);
  const decided = useMemo(() => boardDecisions({ cases: cases.map(c => ({ id: c.id, title: c.title, boardVotes: c.boardVotes })), meetings: snap.meetings, approvals, boardSize: board.length }).filter(d => !d.open), [cases, snap.meetings, approvals, board.length]);
  return (
    <Card aria-label="Board decisions" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Board decisions</SectionLabel><span className="text-xs text-ux2-muted">posted when decided</span></div>
      {decided.length === 0 ? <Why>No board decisions recorded yet.</Why> : (
        <Inner className="flex flex-col py-1">
          {decided.slice(0, 8).map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-t border-ux2-line/60 py-2 first:border-t-0">
              <Cell title={d.title} note={<>{d.date ? dayLabel(d.date) : ''}{d.source === 'meeting' && d.meetingId ? <> · <button type="button" onClick={() => navigate(`/community?tab=meetings&meeting=${encodeURIComponent(d.meetingId!)}`)} className="font-semibold text-ux2-teal hover:underline">the meeting</button></> : d.source === 'spending' ? ' · spending approval' : ' · on its action'} · {d.yes} for, {d.no} against{d.abstain ? `, ${d.abstain} abstaining` : ''}</>} />
              <Chip tone={d.passed ? 'sage' : 'red'}>{d.passed ? 'Passed' : 'Failed'}</Chip>
            </div>
          ))}
        </Inner>
      )}
      <Why>Older decisions are in each meeting's record in Building › Archive.</Why>
    </Card>
  );
}

export function UnitVotesCard({ snap }: { snap: CommunitySnapshot }) {
  const navigate = useNavigate();
  const ballots = useMeetingRecordStore(s => s.ballots);
  const loadBallots = useMeetingRecordStore(s => s.loadBallots);
  const units = snap.viewer.linkedUnits;
  const withVotes = useMemo(() => snap.meetings.filter(m => itemsOf(m).some(i => i.vote?.who === 'owners' && i.vote.status !== 'draft')), [snap.meetings]);
  useEffect(() => { if (isBackendEnabled) for (const m of withVotes) void loadBallots(m.id); }, [withVotes, loadBallots]);
  const rows = withVotes.flatMap(m => itemsOf(m).filter(i => i.vote?.who === 'owners' && i.vote.status !== 'draft').map(i => {
    const b = ballots.find(x => x.meetingId === m.id && x.itemId === i.id && units.includes(x.unit));
    return { m, i, b };
  })).sort((a, b) => b.m.date.localeCompare(a.m.date));
  if (!units.length) return null;
  return (
    <Card aria-label="Your unit's votes" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Your unit's votes</SectionLabel><span className="text-xs text-ux2-muted">Unit {units.join(', ')}</span></div>
      {rows.length === 0 ? <Why>No owner votes yet.</Why> : (
        <Inner className="flex flex-col py-1">
          {rows.slice(0, 10).map(({ m, i, b }) => {
            const open = i.vote!.status === 'open';
            const you = b ? (Array.isArray(b.choice) ? (i.vote!.secret ? 'You voted' : `You: ${b.choice.join(', ')}`) : `You: ${b.choice}`) : open ? 'Not voted yet' : "You didn't vote";
            return (
              <div key={`${m.id}:${i.id}`} className="flex items-center justify-between gap-3 border-t border-ux2-line/60 py-2 first:border-t-0">
                <Cell title={i.title} note={<>{m.title} · {dayLabel(m.date)} · {open ? <button type="button" onClick={() => navigate(`/community?tab=meetings&meeting=${encodeURIComponent(m.id)}`)} className="font-semibold text-ux2-teal hover:underline">open until the meeting closes it</button> : resultLine(i.vote!)}</>} />
                <span className={`shrink-0 text-[13px] font-semibold ${open ? 'text-ux2-plum' : 'text-ux2-ink'}`}>{you}{open && b ? ' · can change' : ''}</span>
              </div>
            );
          })}
        </Inner>
      )}
      <Why>Only you and the board see how your unit voted. Election ballots stay secret.</Why>
    </Card>
  );
}
