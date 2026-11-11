import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { Issue } from '@/types/issues';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Cell, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { requestRows, requestsSummary, type RequestRow, type CommunitySnapshot } from '../metrics';

const CATEGORIES = ['Repair', 'Noise or neighbour', 'Parking', 'Amenity', 'Document or certificate', 'Something else'];
const longDay = (iso: string) => { const d = new Date(iso.slice(0, 10) + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

/** The owner's request form: the same `addIssue` call the Community Room makes. */
function MakeRequest({ snap, onDone }: { snap: CommunitySnapshot; onDone: () => void }) {
  const addIssue = useIssuesStore(s => s.addIssue);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [scope, setScope] = useState<'unit' | 'common'>(snap.viewer.linkedUnits.length ? 'unit' : 'common');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'URGENT'>('LOW');
  const [note, setNote] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setNote('Say what is going on in a line.'); return; }
    addIssue({
      type: scope === 'common' ? 'BUILDING_PUBLIC' : 'UNIT_PRIVATE', category, priority: urgency, status: 'SUBMITTED', title: title.trim(), description: description.trim(),
      reportedBy: snap.viewer.id, reporterName: snap.viewer.name, reporterEmail: snap.viewer.email, unitNumber: snap.viewer.linkedUnits[0] ?? '', submittedDate: new Date().toISOString().slice(0, 10),
    } as Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes' | 'comms'>);
    setTitle(''); setDescription(''); setNote('Sent. You get a card on Home at each step.');
    onDone();
  };
  return (
    <Card aria-label="Make a request" className="gap-3">
      <SectionLabel>Make a request</SectionLabel>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)} className={INPUT}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Unit"><select value={scope} onChange={e => setScope(e.target.value as 'unit' | 'common')} className={INPUT}>{snap.viewer.linkedUnits[0] && <option value="unit">{snap.viewer.linkedUnits[0]} · {snap.viewer.name}</option>}<option value="common">Common area</option></select></Field>
        </div>
        <Field label="What is going on"><input aria-label="What is going on" value={title} onChange={e => setTitle(e.target.value)} placeholder="Say where it is, when it started and what you have noticed" className={INPUT} /></Field>
        <textarea aria-label="Details" value={description} onChange={e => setDescription(e.target.value)} placeholder="Details, when it started, what you tried" rows={3} className="w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="Photo"><Button type="button" size="sm" variant="ghost">+ Add a photo, up to 5</Button></Field>
          <div className="flex flex-col gap-1 text-xs font-semibold text-ux2-muted">How urgent
            <div className="flex flex-wrap gap-1.5">{([['LOW', 'Routine'], ['MEDIUM', 'This week'], ['URGENT', 'Urgent']] as const).map(([id, l]) => <label key={id} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold', urgency === id ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink')}><input type="radio" name="urgency" className="sr-only" checked={urgency === id} onChange={() => setUrgency(id)} />{l}</label>)}</div>
          </div>
        </div>
        <Why>Urgent means a safety or water problem; the board and staff are paged. Everything else is answered within 48 hours.</Why>
        <div className="flex items-center gap-3"><Button type="submit">Send request</Button>{note && <span className="text-xs text-ux2-muted">{note}</span>}</div>
      </form>
    </Card>
  );
}

function stateChip(r: RequestRow) {
  return <Chip tone={r.step === 3 ? 'sage' : r.replyOverdue ? 'red' : r.step === 2 ? 'navy' : 'amber'}>{r.step === 3 ? 'Resolved' : r.replyOverdue ? 'Reply overdue' : r.step === 2 ? 'In progress' : 'New'}</Chip>;
}

function MyRequest({ r, snap, highlight }: { r: RequestRow; snap: CommunitySnapshot; highlight: boolean }) {
  const addComment = useIssuesStore(s => s.addIssueComment);
  const [commenting, setCommenting] = useState(highlight);
  const [text, setText] = useState('');
  const i = r.issue;
  const ack = i.comments[0]?.date?.slice(0, 10);
  const steps = [
    ['1 Received', `${dayLabel(i.submittedDate.slice(0, 10))}${ack ? ` · acknowledged ${dayLabel(ack)}` : ''}`],
    ['2 Assigned', r.step >= 2 ? (i.comments[i.comments.length - 1]?.text.slice(0, 60) || 'A board member has it') : 'To a board member, staff or a vendor, with a date'],
    ['3 Resolved', r.step === 3 ? 'Done' : 'You confirm it is fixed'],
  ];
  return (
    <Card tone={r.step < 3 ? 'outline' : 'surface'} aria-label={`Request ${i.id}`} data-request={i.id} className="gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="flex flex-wrap items-center gap-2"><SectionLabel>Your request</SectionLabel>{stateChip(r)}</div><div className="text-xl font-semibold text-ux2-ink">{i.title}</div><div className="text-xs text-ux2-muted">{i.id} · {i.category} · sent {longDay(i.submittedDate)}{ack ? ` · acknowledged ${longDay(ack)} by ${i.comments[0].author}` : ''}</div></div>
        <div className="flex gap-1.5"><Button size="sm" variant="ghost">Add a photo</Button><Button size="sm" variant="ghost" onClick={() => setCommenting(v => !v)}>Add a comment</Button></div>
      </div>
      <Inner className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm"><b className="font-semibold text-ux2-ink">Step {r.step} of 3 · {r.stepLabel}</b><span className="text-xs text-ux2-muted">{r.step < 3 ? `Board reply due ${longDay(r.replyDue)}` : 'Closed'}</span></div>
        <div className="flex gap-1">{[1, 2, 3].map(n => <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= r.step ? 'bg-ux2-navy' : 'bg-ux2-line')} />)}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{steps.map(([t, d]) => <div key={t}><div className="text-xs font-semibold text-ux2-ink">{t}</div><div className="text-xs text-ux2-muted">{d}</div></div>)}</div>
      </Inner>
      {(i.comments.length > 0 || i.description) && (
        <Inner className="flex flex-col gap-1.5 text-sm">
          {[...i.comments].reverse().map(c => <div key={c.id} className="flex gap-3"><span className="w-12 shrink-0 text-xs text-ux2-muted">{dayLabel(c.date.slice(0, 10))}</span><span><b className="font-semibold text-ux2-ink">{c.author === snap.viewer.name ? 'You' : c.author}</b> <span className="text-ux2-ink">· {c.text}</span></span></div>)}
          {i.description && <div className="flex gap-3"><span className="w-12 shrink-0 text-xs text-ux2-muted">{dayLabel(i.submittedDate.slice(0, 10))}</span><span><b className="font-semibold text-ux2-ink">You</b> <span className="text-ux2-ink">· {i.description}</span></span></div>}
        </Inner>
      )}
      {commenting && <form onSubmit={e => { e.preventDefault(); if (!text.trim()) return; addComment(i.id, snap.viewer.name, text.trim()); setText(''); setCommenting(false); }} className="flex gap-2"><input aria-label="Comment" value={text} onChange={e => setText(e.target.value)} placeholder="Add to the thread" className={INPUT} /><Button type="submit" size="sm">Send</Button></form>}
      <Why>You get a card on Home at each step and an email when the board replies. If nothing happens by {longDay(r.replyDue)} the request is flagged to the whole board.</Why>
    </Card>
  );
}

export default function RequestsTab({ snap, highlightId }: { snap: CommunitySnapshot; highlightId: string | null }) {
  const navigate = useNavigate();
  const upvote = useIssuesStore(s => s.upvoteIssue);
  const rows = requestRows(snap);
  const sum = requestsSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const [composing, setComposing] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState<'open' | 'resolved'>('open');
  const mineOpen = sum.mine.filter(r => r.step < 3);
  const minePast = sum.mine.filter(r => r.step === 3);
  const building = sum.building.filter(r => buildingFilter === 'open' ? r.step < 3 : r.step === 3);

  return (
    <div className="flex flex-col gap-4">
      <HeaderActions><Button onClick={() => { setComposing(true); document.getElementById('make-request')?.scrollIntoView({ behavior: 'smooth' }); }}>Make a request</Button></HeaderActions>

      <Card aria-label="Your requests" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Your requests · {mineOpen.length} open</SectionLabel>{isBoard && <button type="button" onClick={() => navigate('/boardroom?tab=inbox')} className="text-xs font-semibold text-ux2-teal hover:underline">Board replies happen in Board Room › Inbox</button>}</div>
        {mineOpen.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing open. Make a request below.</Inner> : mineOpen.map(r => <MyRequest key={r.issue.id} r={r} snap={snap} highlight={r.issue.id === highlightId} />)}
      </Card>

      <div id="make-request" className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {composing || mineOpen.length === 0 ? <MakeRequest snap={snap} onDone={() => setComposing(false)} /> : <Card aria-label="Make a request" className="justify-center"><SectionLabel>Make a request</SectionLabel><Why>Repairs, noise, parking, amenities, documents or anything else. The board must reply within 14 days.</Why><Button className="self-start" onClick={() => setComposing(true)}>Start a request</Button></Card>}
        <div className="flex flex-col gap-3">
          <Card aria-label="What happens next" className="gap-2">
            <SectionLabel>What happens next</SectionLabel>
            {[
              ['Acknowledged within 48 hours', 'A board member reads it and tells you who has it.'],
              ['Assigned', 'To a board member, staff or a vendor, with a date. Bigger jobs become an action you can follow.'],
              ['Resolved', 'You confirm it is done, or reopen it. The board must reply within 14 days either way.'],
            ].map(([t, d], i) => <Inner key={t} className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{i + 1}</span><Cell title={t} note={d} /></Inner>)}
            <Why>You get a card at each step, on Home and by email.</Why>
          </Card>
          <Card aria-label="Your past requests" className="gap-2">
            <SectionLabel>Your past requests</SectionLabel>
            {minePast.length === 0 ? <Why>Resolved requests stay here for 2 years.</Why> : minePast.slice(0, 4).map(r => <Inner key={r.issue.id} data-request={r.issue.id} className="flex items-center justify-between gap-3"><Cell title={r.issue.title} note={`${r.issue.id} · ${r.issue.category} · sent ${dayLabel(r.issue.submittedDate.slice(0, 10))}`} /><Chip tone="sage">Resolved</Chip></Inner>)}
          </Card>
        </div>
      </div>

      <Card aria-label="Building-wide requests" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Building-wide requests · visible to everyone</SectionLabel><PillTabs size="filter" surface="white" aria-label="Building requests" value={buildingFilter} onChange={setBuildingFilter} tabs={[{ id: 'open', label: `Open · ${sum.buildingOpen.length}` }, { id: 'resolved', label: `Resolved this year · ${sum.resolvedThisYear.filter(r => r.public).length}` }]} /></div>
        {building.length === 0 ? <Why>No {buildingFilter} requests about common areas.</Why> : building.slice(0, 20).map(r => (
          <Inner key={r.issue.id} data-request={r.issue.id} className="flex flex-wrap items-center justify-between gap-3">
            <Cell title={<>{r.issue.title}{r.issue.unitNumber ? <span className="font-normal text-ux2-muted"> · Unit {r.issue.unitNumber}{r.mine ? ', yours' : ''}</span> : null}</>} note={`${r.issue.category} · sent ${longDay(r.issue.submittedDate)}${r.issue.description ? ` · ${r.issue.description.slice(0, 80)}` : ''}`} />
            <span className="flex items-center gap-1.5">{stateChip(r)}{r.step < 3 && !r.mine && <Button size="sm" variant="ghost" onClick={() => upvote(r.issue.id, snap.viewer.id, snap.viewer.name, snap.viewer.linkedUnits[0] ?? '')}>{r.upvoted ? '✓ ' : ''}Upvote · {r.upvotes}</Button>}{r.mine && <Chip tone="ghost">Upvote · {r.upvotes}</Chip>}</span>
          </Inner>
        ))}
        <Why>Requests about common areas or that need a neighbour show to the whole building; an upvote tells the board more people are affected. Requests about one unit, like a resale certificate, stay private to that owner.</Why>
      </Card>
    </div>
  );
}
