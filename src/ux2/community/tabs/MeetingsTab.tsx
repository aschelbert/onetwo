/**
 * Community › Meetings. Two levels: the list of every meeting (with the next
 * one up top), and one meeting's own page for its notice, agenda, attendance
 * and minutes. `?meeting=<id>` opens a meeting; every deep link into a
 * meeting (Home, Obligations, the Outbox, Votes) lands on its page.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { meetingRows, meetingsSummary, type MeetingRow, type CommunitySnapshot } from '../metrics';
import { MEETING_BG, ON_DARK_PRIMARY, Rsvp, stateLabel, typeLabel } from '../meetingUi';
import { itemsOf } from '../meetingRecord';
import MeetingPage from './MeetingPage';

type Filter = 'all' | 'upcoming' | 'past' | 'board' | 'owner';

function ScheduleForm({ onClose, onScheduled }: { onClose: () => void; onScheduled: (title: string, date: string) => void }) {
  const add = useMeetingsStore(s => s.addMeeting);
  const [title, setTitle] = useState('Board meeting');
  const [type, setType] = useState('BOARD');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [location, setLocation] = useState('Community room');
  const [link, setLink] = useState('');
  return (
    <form aria-label="Schedule a meeting" onSubmit={e => { e.preventDefault(); if (!date) return; add({ title, type, status: 'SCHEDULED', date, time, location, virtualLink: link, agenda: [], notes: '' }); onScheduled(title, date); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Schedule a meeting · then open it to build the agenda and send the notice</div>
      <Field label="Title" className="min-w-[200px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>
      <Field label="Type" className="w-[150px]"><select value={type} onChange={e => setType(e.target.value)} className={INPUT}><option value="BOARD">Board</option><option value="ANNUAL">Annual</option><option value="SPECIAL">Special</option><option value="QUARTERLY">Quarterly</option></select></Field>
      <Field label="Date" className="w-[160px]"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
      <Field label="Time" className="w-[120px]"><input type="time" value={time} onChange={e => setTime(e.target.value)} className={INPUT} /></Field>
      <Field label="Room" className="w-[180px]"><input value={location} onChange={e => setLocation(e.target.value)} className={INPUT} /></Field>
      <Field label="Remote link" className="min-w-[200px] flex-1"><input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!date}>Schedule</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/** What a meeting still needs, in a word, for the list's last column. */
function nextStep(r: MeetingRow, isBoard: boolean): { label: string; tone: 'red' | 'amber' | 'sage' | 'ghost' | 'plum' } {
  const m = r.meeting;
  if (r.state === 'cancelled') return { label: 'Cancelled', tone: 'ghost' };
  if (m.startedAt && !m.endedAt) return { label: 'In session', tone: 'red' };
  if (r.state === 'upcoming') {
    if (!isBoard) {
      if (!r.noticeSent) return { label: 'Details with the notice', tone: 'ghost' };
      const open = itemsOf(m).some(i => i.vote?.who === 'owners' && i.vote.status === 'open');
      return open ? { label: 'Your vote is open', tone: 'plum' } : { label: r.mine ? 'You are going' : 'RSVP open', tone: 'ghost' };
    }
    if (r.datePassed) return { label: 'Start or close it', tone: 'amber' };
    if (!r.agendaCount) return { label: 'Build the agenda', tone: 'amber' };
    if (!r.noticeSent) return { label: r.noticeOverdue ? 'Notice overdue' : 'Send the notice', tone: r.noticeOverdue ? 'red' : 'amber' };
    return { label: 'Ballots coming in', tone: 'plum' };
  }
  if (m.session?.sealedAt) return { label: 'In the archive', tone: 'sage' };
  if (r.minutes === 'approved') return isBoard && m.endedAt && !m.session?.summary ? { label: 'Send the summary', tone: 'amber' } : { label: 'Minutes posted', tone: 'sage' };
  if (!isBoard) return m.session?.summary ? { label: 'Summary posted', tone: 'sage' } : { label: 'Minutes to come', tone: 'ghost' };
  return r.minutes === 'draft' ? { label: 'Approve the minutes', tone: 'amber' } : { label: 'Draft the minutes', tone: 'amber' };
}

export default function MeetingsTab({ snap, meetingId, onOpen }: { snap: CommunitySnapshot; meetingId: string | null; onOpen: (id: string | null) => void }) {
  const navigate = useNavigate();
  const rows = meetingRows(snap);
  const sum = meetingsSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const board = useBuildingStore(s => s.board);
  const [filter, setFilter] = useState<Filter>('all');
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<{ title: string; date: string } | null>(null);
  const boardCount = board.length || new Set(snap.meetings.flatMap(m => m.attendees.board)).size;
  const list = useMemo(() => {
    const all = [...sum.upcoming, ...sum.past, ...rows.filter(r => r.state === 'cancelled')];
    return all.filter(r => filter === 'all' ? true : filter === 'upcoming' ? r.state === 'upcoming' : filter === 'past' ? r.state === 'past' : filter === 'board' ? /board/i.test(r.meeting.type) : !/board/i.test(r.meeting.type));
  }, [rows, sum.upcoming, sum.past, filter]);

  if (meetingId) {
    const row = rows.find(r => r.meeting.id === meetingId);
    if (row) return <MeetingPage key={row.meeting.id} row={row} snap={snap} onBack={() => onOpen(null)} />;
    return (
      <div className="flex flex-col gap-4">
        <div><button type="button" onClick={() => onOpen(null)} className="text-sm font-semibold text-ux2-teal hover:underline">← All meetings</button></div>
        <Inner className="text-sm text-ux2-muted">That meeting isn't here any more. It may have been removed, or it's still saving; open it again from the list.</Inner>
      </div>
    );
  }

  const next = sum.upcoming.find(r => !r.datePassed) ?? sum.next;
  const justScheduled = scheduled && rows.find(r => r.meeting.title === scheduled.title && r.meeting.date === scheduled.date);
  const waiting = isBoard ? [...new Map([...sum.noticesOverdue, ...sum.upcoming.filter(r => r.datePassed), ...sum.minutesToApprove, ...sum.minutesMissing].map(r => [r.meeting.id, r])).values()] : [];

  return (
    <div className="flex flex-col gap-4">
      {isBoard && <HeaderActions><Button onClick={() => setScheduling(v => !v)}>Schedule a meeting</Button></HeaderActions>}
      {scheduling && <ScheduleForm onClose={() => setScheduling(false)} onScheduled={(title, date) => setScheduled({ title, date })} />}
      {justScheduled && <div role="status" className="flex flex-wrap items-center gap-2 text-[13px] text-ux2-ink">Scheduled {justScheduled.meeting.title} for {dayLabel(justScheduled.meeting.date)}.<Button size="sm" variant="ghost" onClick={() => onOpen(justScheduled.meeting.id)}>Open it to build the agenda</Button></div>}

      {next ? (
        <Card tone="navy" aria-label="Next meeting" style={{ backgroundImage: MEETING_BG }} className="border-transparent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><SectionLabel className="!text-white/[0.72]">Next meeting · {stateLabel(next)}</SectionLabel>{isBoard && <Chip tone={next.noticeSent ? 'sage' : next.noticeOverdue ? 'red' : 'amber'}>{next.noticeSent ? 'Notice sent' : next.noticeOverdue ? `Notice overdue · due ${dayLabel(next.noticeDue)}` : `Notice due ${dayLabel(next.noticeDue)}`}</Chip>}</div>
              <div className="font-display text-2xl font-semibold text-white">{next.meeting.title} · {dayLabel(next.meeting.date)}{next.meeting.time ? `, ${next.meeting.time}` : ''}</div>
              <div className="text-sm text-white/[0.78]">{!isBoard && !next.noticeSent ? `The agenda, documents and your ballot come with the notice, by ${dayLabel(next.noticeDue)}` : `${next.meeting.location || 'Room to set'}${next.meeting.virtualLink ? ' and remote' : ''} · ${next.agendaCount} agenda item${next.agendaCount === 1 ? '' : 's'} · ${next.rsvpUnits} of ${snap.units.length} units coming`}</div>
            </div>
            <div className="flex gap-1.5">
              {!isBoard && <Rsvp row={next} snap={snap} onDark />}
              <Button size="sm" className={ON_DARK_PRIMARY} onClick={() => onOpen(next.meeting.id)}>{isBoard ? 'Manage this meeting' : 'Open'}</Button>
            </div>
          </div>
        </Card>
      ) : <Inner className="text-sm text-ux2-muted">No meeting is scheduled.{isBoard ? ' Schedule one above.' : ''}</Inner>}

      {waiting.length > 0 && (
        <Card tone="outline" aria-label="Waiting on the board" className="gap-2">
          <SectionLabel>Waiting on the board · {waiting.length}</SectionLabel>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {waiting.slice(0, 4).map(r => {
              const s = nextStep(r, true);
              return (
                <button key={r.meeting.id} type="button" onClick={() => onOpen(r.meeting.id)} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
                  <Cell title={`${r.meeting.title} · ${dayLabel(r.meeting.date)}`} note={typeLabel(r.meeting.type)} />
                  <Chip tone={s.tone === 'ghost' ? 'amber' : s.tone}>{s.label}</Chip>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Meeting filters" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All meetings' }, { id: 'upcoming', label: `Upcoming · ${sum.upcoming.length}` }, { id: 'past', label: `Past · ${sum.past.length}` }, { id: 'board', label: 'Board meetings' }, { id: 'owner', label: 'Owner meetings' }]} />
        <span className="text-xs text-ux2-muted"><button type="button" onClick={() => navigate('/home?view=calendar')} className="font-semibold text-ux2-teal hover:underline">Open the calendar</button> · Minutes archive is in <button type="button" onClick={() => navigate('/building?tab=documents')} className="font-semibold text-ux2-teal hover:underline">Building › Documents</button></span>
      </div>

      <Card aria-label="All meetings" className="gap-2.5">
        <SectionLabel>Every meeting</SectionLabel>
        {list.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing here.</Inner> : (
          <Table minWidth={820}>
            <thead><tr><Th>Meeting</Th><Th>When and where</Th><Th>Agenda</Th><Th>Attendance</Th><Th>Next step</Th><Th className="text-right"><span className="sr-only">Open</span></Th></tr></thead>
            <tbody>
              {list.map(r => {
                const s = nextStep(r, isBoard);
                return (
                  <tr key={r.meeting.id} data-meeting={r.meeting.id} onClick={() => onOpen(r.meeting.id)} className="cursor-pointer hover:bg-ux2-surface">
                    <Td><Cell title={<button type="button" onClick={e => { e.stopPropagation(); onOpen(r.meeting.id); }} className="text-left font-semibold text-ux2-ink hover:underline">{r.meeting.title}</button>} note={`${typeLabel(r.meeting.type)} · ${stateLabel(r).toLowerCase()}`} /></Td>
                    <Td><Cell title={<span className="font-normal">{dayLabel(r.meeting.date)}{r.meeting.time ? `, ${r.meeting.time}` : ''}</span>} note={`${r.meeting.location || 'Room to set'}${r.meeting.virtualLink ? ' and remote' : ''}`} /></Td>
                    <Td className="text-ux2-muted">{!isBoard && !r.noticeSent && r.state === 'upcoming' ? 'With the notice' : r.agendaCount ? `${r.agendaCount} item${r.agendaCount === 1 ? '' : 's'}` : 'Not started'}</Td>
                    <Td className="text-ux2-muted">{r.state === 'upcoming' ? `${r.rsvpUnits} of ${snap.units.length} units coming` : `${r.rsvpBoard} of ${boardCount} board · ${r.rsvpUnits} units`}</Td>
                    <Td><Chip tone={s.tone}>{s.label}</Chip></Td>
                    <Td className="text-right"><span aria-hidden className="text-ux2-muted">›</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Why>Open a meeting to manage it: its notice, agenda, who's coming and its minutes are all on its page.</Why>
      </Card>
    </div>
  );
}
