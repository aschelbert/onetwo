import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore, type Announcement } from '@/store/useComplianceStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { emailAnnouncement } from '../notify';
import { noticesSummary, type CommunitySnapshot } from '../metrics';

const CATEGORIES: { id: Announcement['category']; label: string }[] = [
  { id: 'general', label: 'Notice' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'financial', label: 'Financial' },
  { id: 'safety', label: 'Alert' },
  { id: 'rules', label: 'Rules' },
  { id: 'meeting', label: 'Meeting' },
];
const label = (c: string) => CATEGORIES.find(x => x.id === c)?.label ?? c;

/** The board's New notice form: same store action and email function as the Board Room. */
function NewNotice({ onDone }: { onDone: () => void }) {
  const addAnnouncement = useComplianceStore(s => s.addAnnouncement);
  const currentUser = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const buildingMembers = useAuthStore(s => s.buildingMembers);
  const board = useBuildingStore(s => s.board);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Announcement['category']>('general');
  const [pinned, setPinned] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setNote('A title and the text are needed.'); return; }
    const postedBy = board.find(b => b.name === currentUser.name)?.role || currentRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    addAnnouncement({ title: title.trim(), body: body.trim(), category, postedBy, postedDate: new Date().toISOString().slice(0, 10), pinned });
    if (sendEmail) {
      setBusy(true);
      const recipients = buildingMembers.filter(m => m.email && m.status === 'active').map(m => ({ email: m.email, name: m.name }));
      const r = await emailAnnouncement({ title: title.trim(), body: body.trim(), category, postedBy, recipients });
      setBusy(false);
      setNote(r.sent > 0 ? `Posted and emailed to ${r.sent} recipient${r.sent === 1 ? '' : 's'}.` : `Posted. ${r.note ?? ''}`);
    } else {
      setNote('Posted.');
    }
    setTitle(''); setBody(''); setPinned(false);
    onDone();
  };

  return (
    <Card aria-label="New notice">
      <SectionLabel>New notice</SectionLabel>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input aria-label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="h-10 rounded-lg border border-ux2-line px-3 text-sm" />
        <textarea aria-label="Text" value={body} onChange={e => setBody(e.target.value)} placeholder="What the building needs to know" rows={4} className="rounded-lg border border-ux2-line px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-3 text-sm text-ux2-ink">
          <label className="flex items-center gap-2">Category
            <select value={category} onChange={e => setCategory(e.target.value as Announcement['category'])} className="h-9 rounded-lg border border-ux2-line bg-white px-2 text-sm">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin it</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email every active member</label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post'}</Button>
          {note && <span className="text-xs text-ux2-muted">{note}</span>}
        </div>
      </form>
      <Inner className="text-xs text-ux2-muted">Board members post. Each post adds a Home card for owners; an Alert emails at once. Pinned posts show first to everyone.</Inner>
    </Card>
  );
}

export default function NoticesTab({ snap }: { snap: CommunitySnapshot }) {
  const notices = noticesSummary(snap);
  const togglePin = useComplianceStore(s => s.togglePinAnnouncement);
  const remove = useComplianceStore(s => s.deleteAnnouncement);
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const isBoard = snap.viewer.isBoard;
  const list = notices.all.filter(a => filter === 'all' || a.category === filter);

  return (
    <div className="flex flex-col gap-5">
      {notices.alerts.length > 0 ? (
        <Card tone="red" aria-label="Alerts">
          <SectionLabel className="text-white/[0.75]">Active alerts</SectionLabel>
          <ul className="m-0 list-none p-0">
            {notices.alerts.map(a => <li key={a.id} className="py-1 text-[15px] font-semibold">{a.title}<span className="text-sm font-normal text-white/[0.8]"> · {dayLabel(a.postedDate.slice(0, 10))} · {a.postedBy}</span></li>)}
          </ul>
        </Card>
      ) : (
        <Inner className="text-xs text-ux2-muted">No active alerts. Urgent notices from the board (water or power off, fire alarm test, elevator out of service) show here and at the top of Home for seven days.</Inner>
      )}

      {isBoard && (composing ? <NewNotice onDone={() => setComposing(false)} /> : <Button className="self-start" onClick={() => setComposing(true)}>New notice</Button>)}

      {notices.pinned.length > 0 && (
        <Card tone="cyan" aria-label="Pinned">
          <SectionLabel className="text-ux2-navy/[0.65]">Pinned · shown first to everyone</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-navy/10 p-0">
            {notices.pinned.map(a => (
              <li key={a.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{a.title}</div><div className="text-xs opacity-75">{label(a.category)} · pinned by {a.postedBy} · {dayLabel(a.postedDate.slice(0, 10))}</div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Close' : 'Open'}</Button>
                  {isBoard && <Button size="sm" variant="ghost" onClick={() => togglePin(a.id)}>Unpin</Button>}
                </div>
                {open === a.id && <p className="basis-full whitespace-pre-wrap text-sm">{a.body}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="All notices">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>All notices · {notices.total}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFilter('all')} className="rounded-full"><Chip tone={filter === 'all' ? 'navy' : 'ghost'}>All</Chip></button>
            {Object.entries(notices.byCategory).map(([c, n]) => (
              <button key={c} type="button" onClick={() => setFilter(c)} className="rounded-full"><Chip tone={filter === c ? 'navy' : 'ghost'}>{label(c)} · {n}</Chip></button>
            ))}
          </div>
        </div>
        {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing here.</p> : (
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {list.map(a => (
              <li key={a.id} data-notice={a.id} className="py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={a.category === 'safety' ? 'red' : 'ghost'}>{label(a.category)}</Chip>
                      {a.pinned && <Chip tone="cyan">Pinned</Chip>}
                      <span className="text-[15px] font-semibold text-ux2-ink">{a.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-ux2-muted">Posted {dayLabel(a.postedDate.slice(0, 10))} · {a.postedBy}</div>
                    {open === a.id && <p className="mt-2 whitespace-pre-wrap text-sm text-ux2-ink">{a.body}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Close' : 'Open'}</Button>
                    {isBoard && <Button size="sm" variant="ghost" onClick={() => togglePin(a.id)}>{a.pinned ? 'Unpin' : 'Pin'}</Button>}
                    {isBoard && <Button size="sm" variant="danger" onClick={() => { if (window.confirm('Delete this notice?')) remove(a.id); }}>Delete</Button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">Who can post: board members. Audience: every active member of the building. Delivery: each post adds a Home card, and the board can email it when posting. Comments and read counts are on the roadmap.</Inner>
      </Card>
    </div>
  );
}
