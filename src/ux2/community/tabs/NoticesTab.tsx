import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore, type Announcement } from '@/store/useComplianceStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, KV, RowMenu, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { emailAnnouncement } from '../notify';
import { noticesSummary, type CommunitySnapshot } from '../metrics';

const CATEGORIES: { id: Announcement['category']; label: string; tone: 'ghost' | 'amber' | 'teal' | 'red' | 'plum' | 'navy' }[] = [
  { id: 'general', label: 'Notice', tone: 'ghost' },
  { id: 'maintenance', label: 'Building', tone: 'amber' },
  { id: 'financial', label: 'Financial', tone: 'teal' },
  { id: 'safety', label: 'Alert', tone: 'red' },
  { id: 'rules', label: 'Rules', tone: 'plum' },
  { id: 'meeting', label: 'Meeting', tone: 'navy' },
];
const cat = (c: string) => CATEGORIES.find(x => x.id === c) ?? { id: c, label: c, tone: 'ghost' as const };
const longDay = (iso: string) => { const d = new Date(iso.slice(0, 10) + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

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
    } else setNote('Posted.');
    setTitle(''); setBody(''); setPinned(false);
    onDone();
  };

  return (
    <form onSubmit={submit} aria-label="New notice" className="flex flex-col gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="text-sm font-semibold text-ux2-ink">New notice · each post adds a Home card; an Alert emails at once</div>
      <input aria-label="Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className={INPUT} />
      <textarea aria-label="Text" value={body} onChange={e => setBody(e.target.value)} placeholder="What the building needs to know" rows={4} className="w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-end gap-3 text-sm text-ux2-ink">
        <Field label="Category" className="w-[160px]"><select value={category} onChange={e => setCategory(e.target.value as Announcement['category'])} className={INPUT}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <label className="flex items-center gap-2 pb-2.5"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin it</label>
        <label className="flex items-center gap-2 pb-2.5"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email every active member</label>
      </div>
      <div className="flex items-center gap-3"><Button type="submit" size="sm" disabled={busy}>{busy ? 'Posting…' : 'Post'}</Button><Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>{note && <span className="text-xs text-ux2-muted">{note}</span>}</div>
    </form>
  );
}

export default function NoticesTab({ snap }: { snap: CommunitySnapshot }) {
  const notices = noticesSummary(snap);
  const togglePin = useComplianceStore(s => s.togglePinAnnouncement);
  const remove = useComplianceStore(s => s.deleteAnnouncement);
  const units = useFinancialStore(s => s.units);
  const [filter, setFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const isBoard = snap.viewer.isBoard;
  const list = notices.all.filter(a => filter === 'all' || a.category === filter).filter(a => !q || `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase()));
  const author = (a: Announcement) => a.postedBy;

  return (
    <div className="flex flex-col gap-4">
      {notices.alerts.length > 0 ? (
        <Card tone="red" aria-label="Alerts">
          <SectionLabel className="text-white/[0.75]">Active alerts</SectionLabel>
          <ul className="m-0 list-none p-0">{notices.alerts.map(a => <li key={a.id} className="py-1 text-[15px] font-semibold">{a.title}<span className="text-sm font-normal text-white/[0.8]"> · {dayLabel(a.postedDate.slice(0, 10))} · {a.postedBy}</span></li>)}</ul>
        </Card>
      ) : (
        <Inner className="flex flex-wrap items-center gap-3 text-sm text-ux2-ink"><Chip tone="sage">No active alerts</Chip><span className="text-ux2-muted">Urgent notices from the board (water or power off, fire alarm test, elevator out of service) show here and at the top of Home until they are cleared.</span></Inner>
      )}
      {isBoard && !composing && <Button className="self-end" onClick={() => setComposing(true)}>New notice</Button>}
      {composing && <NewNotice onDone={() => setComposing(false)} />}

      {notices.pinned.length > 0 && (
        <Card aria-label="Pinned" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Pinned · shown first to everyone</SectionLabel><span className="text-xs text-ux2-muted">Up to 2 pinned posts</span></div>
          {notices.pinned.slice(0, 2).map(a => (
            <Inner key={a.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5"><Chip tone={cat(a.category).tone}>{cat(a.category).label}</Chip><span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{a.title}</span><span className="block text-xs text-ux2-muted">Pinned {dayLabel(a.postedDate.slice(0, 10))} by {author(a)}</span></span></span>
              <span className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>Open</Button>{isBoard && <Button size="sm" variant="ghost" onClick={() => togglePin(a.id)}>Unpin</Button>}</span>
              {open === a.id && <p className="m-0 basis-full whitespace-pre-wrap text-sm text-ux2-ink">{a.body}</p>}
            </Inner>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Notice categories" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: `All notices · ${notices.total}` }, ...Object.entries(notices.byCategory).map(([c, n]) => ({ id: c, label: `${cat(c).label} · ${n}` })), { id: 'drafts', label: 'Drafts · 0' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search notices" label="Search notices" className="w-[240px] max-w-full" />
      </div>

      {list.length === 0 ? <Inner className="text-sm text-ux2-muted">{filter === 'drafts' ? 'No drafts. A notice goes out when it is posted.' : 'Nothing here.'}</Inner> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map(a => (
            <div key={a.id} data-notice={a.id} className="flex flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-white px-[22px] py-5">
              <div className="flex items-center justify-between gap-2"><Chip tone={cat(a.category).tone}>{cat(a.category).label}</Chip>{a.pinned ? <span className="text-xs text-ux2-muted">Pinned</span> : <span className="text-xs text-ux2-muted">Comments on</span>}</div>
              <div className="text-base font-semibold text-ux2-ink">{a.title}</div>
              <p className={cn('m-0 text-sm text-ux2-ink', open !== a.id && 'line-clamp-4')}>{a.body}</p>
              <div className="rounded-[14px] border border-ux2-line bg-ux2-surface px-3 py-1">
                <KV label="Author"><span className="text-sm">{author(a)}</span></KV>
                <KV label="Audience"><span className="text-sm">{a.category === 'meeting' || a.category === 'financial' ? 'Owners only' : 'Owners and residents'}</span></KV>
                <KV label="Read"><span className="text-sm">— of {units.length} owners</span></KV>
                <KV label="Comments"><span className="text-sm">0</span></KV>
              </div>
              <div className="text-xs text-ux2-muted">Posted {longDay(a.postedDate)}{a.category === 'maintenance' ? ' · also a building obligation in Building › Assets' : ''}</div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Close' : 'Open'}</Button>
                {isBoard && <Button size="sm" variant="ghost" onClick={() => togglePin(a.id)}>{a.pinned ? 'Unpin' : 'Pin'}</Button>}
                {isBoard && <Button size="sm" variant="ghost">Remind unread</Button>}
                {isBoard && <RowMenu label={`More for ${a.title}`} items={[{ label: 'Delete', onSelect: () => { if (window.confirm('Delete this notice?')) remove(a.id); }, danger: true }]} className="ml-auto" />}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card aria-label="How notices work" className="gap-2.5">
        <SectionLabel>How notices work</SectionLabel>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Who can post', 'Board members. Owners comment and react; the board can turn comments off per post.'],
            ['Audience', 'Owners only, owners and residents, or everyone in the building including staff.'],
            ['Read counts', 'Counted per unit when an owner opens the post. Remind unread sends one email to the units that have not.'],
            ['Delivery', 'Each post adds a Home card and goes in the 7am daily digest email. Alerts send an email at once as well.'],
          ].map(([t, d]) => <Inner key={t}><div className="text-sm font-semibold text-ux2-ink">{t}</div><Why>{d}</Why></Inner>)}
        </div>
      </Card>
    </div>
  );
}
