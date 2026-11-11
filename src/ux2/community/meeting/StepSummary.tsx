/**
 * Step 4: the summary to owners, written from the record and sent by app,
 * email and mail. Once it's out and the minutes are approved, the record is
 * sealed into Building › Archive.
 */
import { useMemo, useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { channelReach, composeMinutes, decidedText, recordText, type Channel } from '../meetingRecord';
import { channelLine, sendSummary } from '../meetingSend';
import type { MeetingCtx } from './useMeeting';

export function downloadRecord(ctx: MeetingCtx) {
  const text = recordText({ building: ctx.building, meeting: ctx.m, items: ctx.items, attendance: ctx.present, unitCount: ctx.units.length, boardPresent: ctx.m.attendees.board, includeUnits: ctx.isBoard });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `${ctx.m.title.replace(/[^\w]+/g, '-')}-${ctx.m.date}-record.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function StepSummary({ ctx }: { ctx: MeetingCtx }) {
  const { m, items, units, snap } = ctx;
  const reach = useMemo(() => channelReach(units), [units]);
  const mailConnected = useMailStore(s => s.mailingSettings.mailConnected);
  const sent = m.session?.summary;
  const [decided, setDecided] = useState(decidedText(items, ctx.present.length, units.length));
  const [next, setNext] = useState('');
  const [withMinutes, setWithMinutes] = useState(!!m.minutesApprovedAt);
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ app: true, email: true, mail: reach.mail > 0 && mailConnected });
  const [sending, setSending] = useState(false);
  const title = `What the ${m.title} decided`;
  const body = [decided, next ? `What happens next:\n${next}` : '', withMinutes && m.minutesApprovedAt ? `The approved minutes:\n\n${composeMinutes(items, `${m.title} · ${m.date}`)}` : ''].filter(Boolean).join('\n\n');

  if (!m.endedAt && ctx.row.state !== 'past') return <Card aria-label="Summary to owners" className="gap-2"><SectionLabel>Summary to owners</SectionLabel><Why>The summary is written from the record once the meeting is adjourned.</Why></Card>;

  const send = async () => {
    setSending(true);
    const report = await sendSummary({ meeting: m, channels, units, mailUnits: reach.mailUnits, by: snap.viewer.name, today: snap.today, title, body });
    const at = new Date().toISOString();
    ctx.updateSession({ summary: { at, by: snap.viewer.name, channels: report, decided, next }, ...(m.minutesApprovedAt ? { sealedAt: at } : {}) });
    setSending(false);
  };

  if (sent) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card aria-label="Summary sent" className="gap-2">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Summary to owners</SectionLabel><Chip tone="sage">Sent {dayLabel(sent.at.slice(0, 10))}</Chip></div>
          <Inner className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{sent.decided}{sent.next ? `\n\nWhat happens next:\n${sent.next}` : ''}</Inner>
          <Inner className="text-sm"><Cell title="Delivery" note={channelLine(sent.channels)} /></Inner>
        </Card>
        <Card aria-label="The record" className="gap-2">
          <div className="flex items-center justify-between gap-2"><SectionLabel>The record</SectionLabel><Chip tone={m.session?.sealedAt ? 'sage' : 'amber'}>{m.session?.sealedAt ? `Sealed ${dayLabel(m.session.sealedAt.slice(0, 10))}` : 'Seals when the minutes are approved'}</Chip></div>
          <Inner className="text-sm text-ux2-ink">Minutes by item, every vote's result, attendance by unit, the notice and this summary as sent, and the packet as presented.</Inner>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => downloadRecord(ctx)}>Download the record</Button>
          <Why>A sealed record is kept in Building › Archive and doesn't change; a correction needs the board's approval and is added beside the original.</Why>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card tone="white" aria-label="Send the meeting summary" className="gap-3 border-ux2-navy">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel className="!text-ux2-navy">Send the meeting summary</SectionLabel><Chip tone="ghost">Written from the record · edit anything</Chip></div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ux2-ink">What was decided<textarea rows={4} value={decided} onChange={e => setDecided(e.target.value)} className="rounded-[14px] border border-ux2-line-strong px-3 py-2.5 text-sm font-normal leading-[1.55]" /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ux2-ink">What happens next<textarea rows={3} value={next} onChange={e => setNext(e.target.value)} placeholder="New dues start January 1. The new board meets January 14." className="rounded-[14px] border border-ux2-line-strong px-3 py-2.5 text-sm font-normal leading-[1.55]" /></label>
        <label className="flex items-center gap-2 text-sm text-ux2-ink"><input type="checkbox" checked={withMinutes} disabled={!m.minutesApprovedAt} onChange={e => setWithMinutes(e.target.checked)} /> Include the approved minutes{m.minutesApprovedAt ? '' : ' (once the board approves them)'}</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([['app', 'App', `${reach.app} units · a notice`], ['email', 'Email', `${reach.email} units`], ['mail', 'Mail', `${reach.mail} unit${reach.mail === 1 ? '' : 's'}`]] as [Channel, string, string][]).map(([k, label, note]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-[14px] border bg-white px-3 py-2.5 ${channels[k] ? 'border-ux2-navy' : 'border-ux2-line'}`}><input type="checkbox" checked={channels[k]} disabled={k === 'mail' && reach.mail === 0} onChange={e => setChannels(c => ({ ...c, [k]: e.target.checked }))} className="mt-1" /><span><span className="block font-semibold text-ux2-ink">{label}</span><span className="block text-[13px] text-ux2-muted">{note}</span></span></label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ux2-line pt-3">
          <span className="text-[13px] text-ux2-muted">{m.minutesApprovedAt ? 'The minutes are approved; sending seals the record into Building › Archive.' : 'The minutes aren’t approved yet: the summary can go now, and the record seals when they are.'}</span>
          <Button disabled={sending || !decided.trim() || !Object.values(channels).some(Boolean)} onClick={() => { void send(); }}>{sending ? 'Sending…' : `Send to ${units.length} units`}</Button>
        </div>
      </Card>
      <Card aria-label="Preview" className="gap-2">
        <SectionLabel>Preview</SectionLabel>
        <Inner className="flex flex-col gap-2 text-sm leading-[1.55]"><div className="font-semibold text-ux2-ink">{title}</div><div className="whitespace-pre-wrap text-ux2-ink">{body}</div></Inner>
      </Card>
    </div>
  );
}
