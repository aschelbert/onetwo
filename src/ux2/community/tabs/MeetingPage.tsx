/**
 * One meeting, in four steps: 1 the agenda with its votes and reports, 2 the
 * notice and ballots, 3 the meeting itself (minutes, votes and attendance in
 * one view, which becomes the record), 4 the summary to owners. The board
 * moves between the steps; owners see their own view of the same meeting.
 */
import { useState } from 'react';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { Button, Chip, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { CommunitySnapshot, MeetingRow } from '../metrics';
import { STEP_LABEL, stepOf, type MeetingStep } from '../meetingRecord';
import { MEETING_BG, ON_DARK_GHOST, stateLabel, typeLabel } from '../meetingUi';
import { useMeeting } from '../meeting/useMeeting';
import StepAgenda from '../meeting/StepAgenda';
import StepNotice from '../meeting/StepNotice';
import StepRun from '../meeting/StepRun';
import StepSummary, { downloadRecord } from '../meeting/StepSummary';
import OwnerMeeting from '../meeting/OwnerMeeting';

function DetailsForm({ row, onClose }: { row: MeetingRow; onClose: () => void }) {
  const update = useMeetingsStore(s => s.updateMeeting);
  const m = row.meeting;
  const [f, setF] = useState({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));
  const moved = f.date !== m.date || f.time !== m.time || f.location !== m.location;
  return (
    <form aria-label="Edit the meeting details" onSubmit={e => { e.preventDefault(); if (!f.title.trim() || !f.date) return; update(m.id, { ...f, title: f.title.trim(), status: moved && m.status === 'SCHEDULED' && row.noticeSent ? 'RESCHEDULED' : m.status }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Title" className="min-w-[200px] flex-1"><input value={f.title} onChange={set('title')} className={INPUT} /></Field>
      <Field label="Type" className="w-[150px]"><select value={f.type} onChange={set('type')} className={INPUT}><option value="BOARD">Board</option><option value="ANNUAL">Annual</option><option value="SPECIAL">Special</option><option value="QUARTERLY">Quarterly</option></select></Field>
      <Field label="Date" className="w-[160px]"><input type="date" value={f.date} onChange={set('date')} className={INPUT} /></Field>
      <Field label="Time" className="w-[120px]"><input type="time" value={f.time} onChange={set('time')} className={INPUT} /></Field>
      <Field label="Room" className="w-[180px]"><input value={f.location} onChange={set('location')} className={INPUT} /></Field>
      <Field label="Remote link" className="min-w-[200px] flex-1"><input value={f.virtualLink} onChange={set('virtualLink')} placeholder="https://" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!f.title.trim() || !f.date}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
      {moved && row.noticeSent && <p className="m-0 w-full text-xs text-ux2-muted">The notice already went out. Moving the date, time or room means sending it again from this page.</p>}
    </form>
  );
}

export default function MeetingPage({ row, snap, onBack }: { row: MeetingRow; snap: CommunitySnapshot; onBack: () => void }) {
  const ctx = useMeeting(row, snap);
  const { m, isBoard } = ctx;
  const atStep = stepOf(m);
  const [step, setStep] = useState<MeetingStep>(atStep);
  const [editingDetails, setEditingDetails] = useState(false);
  const back = <div><button type="button" onClick={onBack} className="text-sm font-semibold text-ux2-teal hover:underline">← All meetings</button></div>;

  if (!isBoard) return <div className="flex flex-col gap-4" data-meeting-page={m.id}>{back}<OwnerMeeting ctx={ctx} /></div>;

  const live = !!m.startedAt && !m.endedAt;
  return (
    <div className="flex flex-col gap-4" data-meeting-page={m.id}>
      {back}
      <section aria-label="Meeting" style={{ backgroundImage: MEETING_BG }} className="flex flex-col gap-3 rounded-[22px] px-[22px] py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {live ? <Chip tone="red">● In session{m.startedAt ? ` since ${new Date(m.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</Chip> : <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white/[0.72]">{typeLabel(m.type)} · {stateLabel(row)}</span>}
              {!m.noticeSentAt && !row.noticeSent && row.state === 'upcoming' && <Chip tone={row.noticeOverdue ? 'red' : 'amber'}>{row.noticeOverdue ? `Notice overdue · due ${dayLabel(row.noticeDue)}` : `Notice due ${dayLabel(row.noticeDue)}`}</Chip>}
              {live && <Chip tone={ctx.present.length >= ctx.quorum ? 'sage' : 'amber'}>{ctx.present.length >= ctx.quorum ? 'Quorum met' : 'No quorum yet'} · {ctx.present.length} of {ctx.units.length} units</Chip>}
            </div>
            <h2 className="m-0 font-display text-2xl font-semibold text-white">{m.title} · {dayLabel(m.date)}{m.time ? `, ${m.time}` : ''}</h2>
            <div className="text-sm text-white/[0.78]">{m.location || 'Room to set'}{m.virtualLink ? ' and remote' : ''} · {ctx.items.length} item{ctx.items.length === 1 ? '' : 's'} · {ctx.items.filter(i => i.vote).length} vote{ctx.items.filter(i => i.vote).length === 1 ? '' : 's'}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!editingDetails && !m.endedAt && <Button size="sm" variant="ghost" className={ON_DARK_GHOST} onClick={() => setEditingDetails(true)}>Edit details</Button>}
            {m.endedAt && <Button size="sm" variant="ghost" className={ON_DARK_GHOST} onClick={() => downloadRecord(ctx)}>Download the record</Button>}
          </div>
        </div>
        <ol aria-label="Meeting steps" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {([1, 2, 3, 4] as MeetingStep[]).map(n => (
            <li key={n}><button type="button" aria-current={step === n ? 'step' : undefined} onClick={() => setStep(n)} className={`min-h-[32px] rounded-full px-3 text-xs font-semibold ${step === n ? 'bg-ux2-cyan text-ux2-navy' : n < atStep ? 'bg-white/[0.14] text-white' : 'border border-white/30 text-white/[0.8]'}`}>{n} · {STEP_LABEL[n]}{n < atStep ? ' ✓' : ''}</button></li>
          ))}
        </ol>
      </section>
      {editingDetails && <DetailsForm row={row} onClose={() => setEditingDetails(false)} />}
      {step === 1 && <StepAgenda ctx={ctx} onNext={() => setStep(2)} />}
      {step === 2 && <StepNotice ctx={ctx} onNext={() => setStep(3)} />}
      {step === 3 && <StepRun ctx={ctx} />}
      {step === 4 && <StepSummary ctx={ctx} />}
    </div>
  );
}
