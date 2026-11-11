/**
 * Building › Archive › Meeting records: every held meeting's record, sealed
 * once its minutes are approved and the summary has gone out. Each record
 * lists what it holds and downloads as one file.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useCommunitySnapshot } from '../useCommunitySnapshot';
import { meetingRows, type CommunitySnapshot, type MeetingRow } from '../metrics';
import { attendanceCounts, resultLine } from '../meetingRecord';
import { channelLine } from '../meetingSend';
import { downloadRecord } from './StepSummary';
import { useMeeting } from './useMeeting';

function RecordDetail({ row, snap }: { row: MeetingRow; snap: CommunitySnapshot }) {
  const ctx = useMeeting(row, snap);
  const navigate = useNavigate();
  const { m, items } = ctx;
  const c = attendanceCounts(ctx.present);
  const votes = items.filter(i => i.vote?.result);
  const pub = items.reduce((t, i) => t + i.attachments.length, 0);
  const sealed = m.session?.sealedAt;
  const parts: [string, string, 'Everyone' | 'Board'][] = [
    ['Minutes, by agenda item', m.minutesApprovedAt ? `${items.length} items · approved ${dayLabel(m.minutesApprovedAt.slice(0, 10))} by ${(m.minutesApprovals ?? []).map(a => a.name).join(', ')}` : m.minutes ? 'Recorded · not yet approved' : 'None recorded', 'Everyone'],
    ['Notice as sent, with proof of delivery', m.session?.notice ? `Sent ${dayLabel(m.session.notice.at.slice(0, 10))} · ${channelLine(m.session.notice.channels)}` : 'Sent before the record was kept, or not sent', 'Board'],
    ['Meeting packet, as presented', `${pub} attachment${pub === 1 ? '' : 's'} kept as they were${ctx.privateAtts.length ? ` · ${ctx.privateAtts.length} board only` : ''}`, 'Everyone'],
    ['Vote results', votes.length ? votes.map(i => `${i.title}: ${resultLine(i.vote!)}`).join(' · ') : 'No votes', 'Everyone'],
    ['Ballots and proxies', `${ctx.ballots.length} ballot${ctx.ballots.length === 1 ? '' : 's'} on file`, 'Board'],
    ['Attendance by unit', `${c.present} of ${ctx.units.length} units`, 'Board'],
    ['Summary as sent', m.session?.summary ? `${dayLabel(m.session.summary.at.slice(0, 10))} · ${channelLine(m.session.summary.channels)}` : 'Not sent', 'Everyone'],
  ];
  return (
    <section aria-label={`${m.title} record`} className="flex flex-col gap-3 rounded-[22px] border border-ux2-navy bg-white px-[22px] py-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2"><SectionLabel>Meeting record</SectionLabel><Chip tone={sealed ? 'sage' : 'amber'}>{sealed ? `Sealed ${dayLabel(sealed.slice(0, 10))}` : 'Not sealed yet'}</Chip></div>
          <h3 className="m-0 mt-1 text-xl font-semibold text-ux2-ink">{m.title} · {dayLabel(m.date)}</h3>
          <div className="text-sm text-ux2-muted">{m.startedAt ? `Held ${new Date(m.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${m.endedAt ? ` – ${new Date(m.endedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''} · ` : ''}{c.present} of {ctx.units.length} units</div>
        </div>
        <div className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => navigate(`/community?tab=meetings&meeting=${encodeURIComponent(m.id)}`)}>Open the meeting</Button><Button size="sm" onClick={() => downloadRecord(ctx)}>Download</Button></div>
      </div>
      <Inner className="flex flex-col py-1">
        {parts.map(([title, note, who]) => (
          <div key={title} className="flex items-center justify-between gap-3 border-t border-ux2-line/60 py-2.5 first:border-t-0">
            <Cell title={title} note={note} />
            <Chip tone={who === 'Board' ? 'navy' : 'teal'}>{who}</Chip>
          </div>
        ))}
      </Inner>
      <Why>A sealed record doesn't change. A correction to approved minutes is approved by the board at its next meeting and recorded in that meeting's minutes.</Why>
    </section>
  );
}

export default function MeetingRecords() {
  const snap = useCommunitySnapshot();
  const rows = useMemo(() => meetingRows(snap).filter(r => r.state === 'past' || !!r.meeting.endedAt).sort((a, b) => b.meeting.date.localeCompare(a.meeting.date)), [snap]);
  const [sel, setSel] = useState<string | null>(null);
  const row = rows.find(r => r.meeting.id === sel) ?? rows[0];
  if (!rows.length) return <Card aria-label="Meeting records" className="gap-2"><SectionLabel>Meeting records</SectionLabel><Why>No meetings held yet. A meeting's record lands here once its minutes are approved.</Why></Card>;
  const years = [...new Set(rows.map(r => r.meeting.date.slice(0, 4)))];
  return (
    <Card aria-label="Meeting records" className="gap-3">
      <SectionLabel>Meeting records · {rows.length}</SectionLabel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.8fr)]">
        <nav aria-label="Meeting records list" className="flex flex-col gap-1">
          {years.map(y => (
            <div key={y} className="flex flex-col gap-1">
              <span className="px-2 pt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">{y}</span>
              {rows.filter(r => r.meeting.date.startsWith(y)).map(r => (
                <button key={r.meeting.id} type="button" aria-current={r === row ? 'true' : undefined} onClick={() => setSel(r.meeting.id)} className={`flex flex-col rounded-[12px] px-3 py-2 text-left text-sm ${r === row ? 'bg-ux2-navy text-white' : 'text-ux2-ink hover:bg-white'}`}>
                  <span className="font-semibold">{r.meeting.title} · {dayLabel(r.meeting.date)}</span>
                  <span className={`text-xs ${r === row ? 'text-white/75' : r.meeting.session?.sealedAt ? 'text-ux2-muted' : 'text-ux2-amber'}`}>{r.meeting.session?.sealedAt ? `Sealed ${dayLabel(r.meeting.session.sealedAt.slice(0, 10))}` : r.minutes === 'approved' ? 'Minutes approved' : 'Minutes not yet approved'}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        {row && <RecordDetail key={row.meeting.id} row={row} snap={snap} />}
      </div>
    </Card>
  );
}
