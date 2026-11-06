import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { Issue } from '@/types/issues';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { requestRows, requestsSummary, type RequestRow, type CommunitySnapshot } from '../metrics';

const CATEGORIES = ['Repair', 'Noise or neighbour', 'Parking', 'Amenity', 'Document or certificate', 'Something else'];

/** The owner's request form: the same `addIssue` call the Community Room makes. */
function MakeRequest({ snap, onDone }: { snap: CommunitySnapshot; onDone: () => void }) {
  const addIssue = useIssuesStore(s => s.addIssue);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [scope, setScope] = useState<'unit' | 'common'>(snap.viewer.linkedUnits.length ? 'unit' : 'common');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'URGENT'>('MEDIUM');
  const [note, setNote] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setNote('Say what is going on in a line.'); return; }
    addIssue({
      type: scope === 'common' ? 'BUILDING_PUBLIC' : 'UNIT_PRIVATE',
      category,
      priority: urgency,
      status: 'SUBMITTED',
      title: title.trim(),
      description: description.trim(),
      reportedBy: snap.viewer.id,
      reporterName: snap.viewer.name,
      reporterEmail: snap.viewer.email,
      unitNumber: snap.viewer.linkedUnits[0] ?? '',
      submittedDate: new Date().toISOString().slice(0, 10),
    } as Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes' | 'comms'>);
    setTitle(''); setDescription(''); setNote('Sent. You get a card on Home at each step.');
    onDone();
  };
  return (
    <Card aria-label="Make a request">
      <SectionLabel>Make a request</SectionLabel>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => <button key={c} type="button" onClick={() => setCategory(c)} className="rounded-full"><Chip tone={category === c ? 'navy' : 'ghost'}>{c}</Chip></button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {snap.viewer.linkedUnits.length > 0 && <button type="button" onClick={() => setScope('unit')} className="rounded-full"><Chip tone={scope === 'unit' ? 'navy' : 'ghost'}>Unit {snap.viewer.linkedUnits[0]} · private</Chip></button>}
          <button type="button" onClick={() => setScope('common')} className="rounded-full"><Chip tone={scope === 'common' ? 'navy' : 'ghost'}>Common area · visible to everyone</Chip></button>
        </div>
        <input aria-label="What is going on" value={title} onChange={e => setTitle(e.target.value)} placeholder="What is going on" className="h-10 rounded-lg border border-ux2-line px-3 text-sm" />
        <textarea aria-label="Details" value={description} onChange={e => setDescription(e.target.value)} placeholder="Details, when it started, what you tried" rows={3} className="rounded-lg border border-ux2-line px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-ux2-muted">
          How urgent
          {([['LOW', 'Routine'], ['MEDIUM', 'This week'], ['URGENT', 'Urgent']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => setUrgency(id)} className="rounded-full"><Chip tone={urgency === id ? (id === 'URGENT' ? 'red' : 'navy') : 'ghost'}>{l}</Chip></button>)}
        </div>
        <div className="flex items-center gap-3"><Button type="submit">Send request</Button>{note && <span className="text-xs text-ux2-muted">{note}</span>}</div>
      </form>
      <Inner className="text-xs text-ux2-muted">Urgent means a safety or water problem. The board must reply within 14 days either way; bigger jobs become a case you can follow.</Inner>
    </Card>
  );
}

function RequestItem({ r, snap, highlight }: { r: RequestRow; snap: CommunitySnapshot; highlight: boolean }) {
  const upvote = useIssuesStore(s => s.upvoteIssue);
  const [open, setOpen] = useState(highlight);
  const i = r.issue;
  return (
    <li data-request={i.id} className={`py-3 ${highlight ? 'rounded-lg bg-ux2-cyan/30 px-2' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ux2-ink">{i.title}{r.mine ? <span className="text-xs font-normal text-ux2-muted"> · yours</span> : i.unitNumber ? <span className="text-xs font-normal text-ux2-muted"> · Unit {i.unitNumber}</span> : null}</div>
          <div className="text-xs text-ux2-muted">{i.category} · sent {dayLabel(i.submittedDate.slice(0, 10))} · step {r.step} of 3 · {r.stepLabel}{r.step < 3 ? ` · board reply due ${dayLabel(r.replyDue)}` : ''}</div>
          {open && (
            <div className="mt-2 flex flex-col gap-2 text-sm text-ux2-ink">
              {i.description && <p className="whitespace-pre-wrap">{i.description}</p>}
              {i.comments.length > 0 && (
                <ul className="m-0 list-none p-0">
                  {i.comments.map(c => <li key={c.id} className="border-l-2 border-ux2-line py-1 pl-3"><span className="text-xs text-ux2-muted">{dayLabel(c.date.slice(0, 10))} · {c.author}</span><div>{c.text}</div></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone={r.step === 3 ? 'sage' : r.replyOverdue ? 'red' : r.step === 2 ? 'navy' : 'amber'}>{r.step === 3 ? 'Resolved' : r.replyOverdue ? 'Reply overdue' : r.step === 2 ? 'In progress' : 'New'}</Chip>
          {r.public && !r.mine && r.step < 3 && <Button size="sm" variant="ghost" onClick={() => upvote(i.id, snap.viewer.id, snap.viewer.name, snap.viewer.linkedUnits[0] ?? '')}>{r.upvoted ? '✓ ' : ''}Upvote · {r.upvotes}</Button>}
          <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Open'}</Button>
        </div>
      </div>
    </li>
  );
}

export default function RequestsTab({ snap, highlightId }: { snap: CommunitySnapshot; highlightId: string | null }) {
  const navigate = useNavigate();
  const rows = requestRows(snap);
  const sum = requestsSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const [composing, setComposing] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => setComposing(c => !c)}>{composing ? 'Close the form' : 'Make a request'}</Button>
        {isBoard && <Button variant="ghost" onClick={() => navigate('/issues?caseTab=issues')}>Board replies, the 14-day clock and convert to case · Board Room › Inbox</Button>}
      </div>
      {composing && <MakeRequest snap={snap} onDone={() => setComposing(false)} />}

      <Card aria-label="Your requests">
        <SectionLabel>Your requests · {sum.mineOpen.length} open</SectionLabel>
        {sum.mine.length === 0 ? <p className="text-sm text-ux2-muted">Nothing yet. Make a request above.</p> : (
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {sum.mine.map(r => <RequestItem key={r.issue.id} r={r} snap={snap} highlight={r.issue.id === highlightId} />)}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">1 Received within 48 hours · 2 Assigned to a board member, staff or a vendor with a date · 3 Resolved, you confirm. You get a card at each step on Home and an email when the board replies.</Inner>
      </Card>

      <Card aria-label="Building-wide requests">
        <SectionLabel>Building-wide requests · {sum.buildingOpen.length} open · {sum.resolvedThisYear.filter(r => r.public).length} resolved</SectionLabel>
        {sum.building.filter(r => !r.mine).length === 0 ? <p className="text-sm text-ux2-muted">No open requests about common areas.</p> : (
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {sum.building.filter(r => !r.mine).slice(0, 20).map(r => <RequestItem key={r.issue.id} r={r} snap={snap} highlight={r.issue.id === highlightId} />)}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">Requests about common areas or that need a neighbour show to the whole building; an upvote tells the board more people care.</Inner>
      </Card>
    </div>
  );
}
