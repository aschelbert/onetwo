/**
 * Community › Votes for the board: the record of every vote, grouped by the
 * meeting it was taken at. Votes between meetings (written consent and mailed
 * ballots) follow below it.
 */
import { useNavigate } from 'react-router-dom';
import { Card, Chip, Inner, SectionLabel, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { CommunitySnapshot } from '../metrics';
import { THRESHOLD_LABEL, itemsOf, resultLine } from '../meetingRecord';
import { useMeetingRecordStore } from '@/store/useMeetingRecordStore';

export default function VotesRecord({ snap }: { snap: CommunitySnapshot }) {
  const navigate = useNavigate();
  const counts = useMeetingRecordStore(s => s.counts);
  const ballots = useMeetingRecordStore(s => s.ballots);
  const groups = snap.meetings
    .map(m => ({
      m,
      votes: [
        ...itemsOf(m).filter(i => i.vote).map((i, n) => ({ id: i.id, title: i.vote!.question || i.title, who: i.vote!.who, note: `${i.vote!.who === 'owners' ? THRESHOLD_LABEL[i.vote!.threshold] : 'Board roll call'}`, status: i.vote!.status, result: i.vote!.result ? resultLine(i.vote!) : '', passed: i.vote!.result?.passed, n, itemId: i.id })),
        ...m.votes.map(v => ({ id: v.id, title: v.motion, who: v.type === 'board' ? 'board' as const : 'owners' as const, note: 'Recorded in the minutes', status: 'closed' as const, result: `${v.status === 'passed' ? 'Passed' : 'Failed'}: ${v.tally.approve} for, ${v.tally.deny} against`, passed: v.status === 'passed', n: 0, itemId: '' })),
      ],
    }))
    .filter(g => g.votes.length)
    .sort((a, b) => b.m.date.localeCompare(a.m.date));
  const openCount = groups.reduce((t, g) => t + g.votes.filter(v => v.status === 'open').length, 0);
  return (
    <Card aria-label="Votes by meeting" className="gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Every vote, by meeting{openCount ? ` · ${openCount} open` : ''}</SectionLabel><span className="text-xs text-ux2-muted">Add a vote on the meeting's agenda</span></div>
      {groups.length === 0 && <Why>No votes on any meeting yet. A vote is added to an agenda item in step 1 of a meeting.</Why>}
      {groups.map(({ m, votes }) => (
        <Inner key={m.id} className="flex flex-col gap-1 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <span className="flex items-center gap-2"><span className="font-semibold text-ux2-ink">{m.title} · {dayLabel(m.date)}</span><Chip tone={m.endedAt || m.status === 'COMPLETED' ? (m.session?.sealedAt ? 'sage' : 'ghost') : 'amber'}>{m.session?.sealedAt ? 'Sealed' : m.endedAt || m.status === 'COMPLETED' ? 'Held' : m.startedAt ? 'In session' : 'Upcoming'}</Chip></span>
            <button type="button" onClick={() => navigate(`/community?tab=meetings&meeting=${encodeURIComponent(m.id)}`)} className="text-[13px] font-semibold text-ux2-teal hover:underline">Open the meeting</button>
          </div>
          {votes.map(v => {
            const turnout = v.who === 'owners' && v.status === 'open' ? (ballots.filter(b => b.meetingId === m.id && b.itemId === v.itemId).length || counts[m.id]?.[v.itemId] || 0) : null;
            return (
              <div key={v.id} className="grid grid-cols-1 items-center gap-2 border-t border-ux2-line/60 py-2 sm:grid-cols-[minmax(0,2.2fr)_auto_minmax(0,1.4fr)_auto]">
                <div className="min-w-0"><div className="text-sm font-semibold text-ux2-ink">{v.title}</div><div className="text-xs text-ux2-muted">{v.note}</div></div>
                <Chip tone={v.who === 'owners' ? 'plum' : 'teal'}>{v.who === 'owners' ? 'Owners' : 'Board'}</Chip>
                <span className="text-[13px] text-ux2-muted">{v.result || (turnout != null ? `${turnout} of ${snap.units.length} units so far` : v.status === 'draft' ? 'Opens with the notice' : 'At the meeting')}</span>
                <Chip tone={v.status === 'closed' ? (v.passed ? 'sage' : 'red') : v.status === 'open' ? 'plum' : 'ghost'}>{v.status === 'closed' ? (v.passed ? 'Passed' : 'Failed') : v.status === 'open' ? 'Open' : 'Ready'}</Chip>
              </div>
            );
          })}
        </Inner>
      ))}
      <Why>Every vote belongs to a meeting, so its notice, quorum and minutes are never missing. Owners vote on the meeting itself and see results in their Notices.</Why>
    </Card>
  );
}
