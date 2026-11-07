/**
 * Amenities, to the Community board: one pill group (All amenities, My
 * reservations, Calendar, Notifications, Approvals), an amenity card per
 * shared space with its rules as chips and a Reserve form in place, the
 * board's Approvals card, and the This week strip. Everything reads and
 * writes the amenities store the production tab used.
 */
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAmenitiesStore, type AmenityConfig, type Reservation } from '@/store/useAmenitiesStore';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, PillTabs, SectionLabel, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { CommunitySnapshot } from '../metrics';

type View = 'all' | 'mine' | 'calendar' | 'notifications' | 'approvals';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const hhmm = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''}${ap}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00`); const dow = (d.getDay() + 6) % 7; return addDays(iso, -dow); };
const ago = (iso: string, today: string) => { const h = Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(iso).getTime()) / 3600000)); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

function ruleChips(c: AmenityConfig) {
  const chips: { label: string; tone: 'ghost' | 'sage' | 'amber' | 'navy' | 'cyan' }[] = [];
  if (c.reservable) chips.push({ label: 'Reservable', tone: 'navy' });
  if (c.reservable) chips.push({ label: c.reservationFee ? `$${c.reservationFee} per reservation` : 'No fee', tone: 'ghost' });
  if (c.reservable && c.depositAmount) chips.push({ label: `$${c.depositAmount} deposit`, tone: 'ghost' });
  if (c.reservable && c.requiresApproval) chips.push({ label: 'Board approval', tone: 'amber' });
  if (c.notificationEnabled) chips.push({ label: 'Notifications on', tone: 'cyan' });
  return chips;
}

function ReserveForm({ c, snap, date, onDone }: { c: AmenityConfig; snap: CommunitySnapshot; date?: string; onDone: () => void }) {
  const add = useAmenitiesStore(s => s.addReservation);
  const [d, setD] = useState(date ?? addDays(snap.today, 1));
  const [start, setStart] = useState(c.operatingHours?.open ?? '14:00');
  const [end, setEnd] = useState('16:00');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form aria-label={`Reserve the ${c.name}`} onSubmit={e => { e.preventDefault(); const r = add({ amenityId: c.id, amenityName: c.name, date: d, startTime: start, endTime: end, reservedBy: snap.viewer.id, reservedByName: snap.viewer.name, reservedByUnit: snap.viewer.linkedUnits[0] ?? '', notes }); if ('error' in r) setErr(r.error); else onDone(); }} className="flex flex-col gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Date"><input type="date" aria-label="Date" value={d} onChange={e => setD(e.target.value)} className={INPUT} /></Field>
        <Field label="From"><input type="time" aria-label="From" value={start} onChange={e => setStart(e.target.value)} className={INPUT} /></Field>
        <Field label="To"><input type="time" aria-label="To" value={end} onChange={e => setEnd(e.target.value)} className={INPUT} /></Field>
      </div>
      <Field label="What for · optional"><input aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="birthday, 15 guests" className={INPUT} /></Field>
      {err && <Why className="text-ux2-red-ink">{err}</Why>}
      <div className="flex gap-2"><Button type="submit" size="sm">{c.requiresApproval ? 'Request' : 'Reserve'}</Button><Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
      <Why>{c.reservationFee ? `$${c.reservationFee} fee` : 'No fee'}{c.depositAmount ? ` · $${c.depositAmount} deposit, returned after` : ''}{c.requiresApproval ? ' · the board approves within a day' : ' · confirmed at once'}. {c.usageRules}</Why>
    </form>
  );
}

function SettingsForm({ c, onDone }: { c: AmenityConfig; onDone: () => void }) {
  const update = useAmenitiesStore(s => s.updateConfig);
  const [f, setF] = useState({ reservable: c.reservable, requiresApproval: c.requiresApproval, notificationEnabled: c.notificationEnabled, reservationFee: c.reservationFee, depositAmount: c.depositAmount, maxDurationMinutes: c.maxDurationMinutes, capacity: c.capacity });
  return (
    <form aria-label={`Settings for ${c.name}`} onSubmit={e => { e.preventDefault(); update(c.id, f); onDone(); }} className="flex flex-col gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="flex flex-wrap gap-1.5">
        {([['reservable', 'Reservable'], ['requiresApproval', 'Board approval'], ['notificationEnabled', 'Notifications']] as const).map(([k, label]) => <button key={k} type="button" role="switch" aria-checked={f[k]} aria-label={label} onClick={() => setF(v => ({ ...v, [k]: !v[k] }))} className={`h-9 rounded-full border px-3.5 text-xs font-semibold ${f[k] ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink'}`}>{label}{f[k] ? ' · on' : ' · off'}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Fee $"><input type="number" aria-label="Fee" min={0} value={f.reservationFee} onChange={e => setF(v => ({ ...v, reservationFee: Number(e.target.value) }))} className={INPUT} /></Field>
        <Field label="Deposit $"><input type="number" aria-label="Deposit" min={0} value={f.depositAmount} onChange={e => setF(v => ({ ...v, depositAmount: Number(e.target.value) }))} className={INPUT} /></Field>
        <Field label="Max hours"><input type="number" aria-label="Max hours" min={0} value={f.maxDurationMinutes / 60} onChange={e => setF(v => ({ ...v, maxDurationMinutes: Number(e.target.value) * 60 }))} className={INPUT} /></Field>
        <Field label="Capacity"><input type="number" aria-label="Capacity" min={0} value={f.capacity} onChange={e => setF(v => ({ ...v, capacity: Number(e.target.value) }))} className={INPUT} /></Field>
      </div>
      <div className="flex gap-2"><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function AmenityCard({ c, snap, reservations, isBoard, openDate }: { c: AmenityConfig; snap: CommunitySnapshot; reservations: Reservation[]; isBoard: boolean; openDate?: string }) {
  const [mode, setMode] = useState<'none' | 'reserve' | 'settings'>(openDate ? 'reserve' : 'none');
  const next = reservations.filter(r => r.amenityId === c.id && r.date >= snap.today && (r.status === 'active' || r.status === 'pending_approval')).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];
  const hours = c.operatingHours ? `${hhmm(c.operatingHours.open)} to ${hhmm(c.operatingHours.close)}` : '24 hours';
  const line = c.reservable ? `${c.capacity ? `Up to ${c.capacity} people · ` : ''}${hours}${c.maxDurationMinutes ? ` · ${c.maxDurationMinutes / 60} hours max` : ''}` : `${hours} · no booking needed`;
  return (
    <Card aria-label={c.name} data-amenity={c.id} className="gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div><div className="text-[17px] font-semibold text-ux2-ink">{c.name}</div><div className="text-xs text-ux2-muted">{line}</div></div>
        {isBoard && <button type="button" className="text-xs font-semibold text-ux2-ink underline" onClick={() => setMode(m => (m === 'settings' ? 'none' : 'settings'))}>Settings</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">{ruleChips(c).map(ch => <Chip key={ch.label} tone={ch.tone}>{ch.label}</Chip>)}</div>
      <Inner className="text-xs text-ux2-muted">{next ? `Next: ${next.amenityName === c.name ? '' : ''}${dayLabel(next.date)}, ${hhmm(next.startTime)} to ${hhmm(next.endTime)} · ${next.reservedByUnit ? `Unit ${next.reservedByUnit}` : next.reservedByName}${next.status === 'pending_approval' ? ' · pending' : ''} · otherwise open` : c.reservable ? `Free from ${dayLabel(addDays(snap.today, 1))} · nothing booked` : c.description}</Inner>
      {mode === 'reserve' && <ReserveForm c={c} snap={snap} date={openDate} onDone={() => setMode('none')} />}
      {mode === 'settings' && <SettingsForm c={c} onDone={() => setMode('none')} />}
      {mode === 'none' && (c.reservable ? <div><Button size="sm" onClick={() => setMode('reserve')}>Reserve the {c.name.toLowerCase()}</Button></div> : <Chip tone="ghost">Standard · nothing to book</Chip>)}
    </Card>
  );
}

export default function AmenitiesSection({ snap }: { snap: CommunitySnapshot }) {
  const configs = useAmenitiesStore(s => s.configs);
  const reservations = useAmenitiesStore(s => s.reservations);
  const notifications = useAmenitiesStore(s => s.notifications);
  const cancel = useAmenitiesStore(s => s.cancelReservation);
  const approve = useAmenitiesStore(s => s.approveReservation);
  const deny = useAmenitiesStore(s => s.denyReservation);
  const send = useAmenitiesStore(s => s.sendNotification);
  const markRead = useAmenitiesStore(s => s.markNotificationRead);
  const role = useAuthStore(s => s.currentRole);
  const isBoard = snap.viewer.isBoard;
  const [view, setView] = useState<View>('all');
  const [denying, setDenying] = useState<{ id: string; reason: string } | null>(null);
  const [slot, setSlot] = useState<{ amenityId: string; date: string } | null>(null);
  const [notif, setNotif] = useState({ amenityId: configs[0]?.id ?? '', message: '' });

  const pending = reservations.filter(r => r.status === 'pending_approval').sort((a, b) => a.date.localeCompare(b.date));
  const mine = reservations.filter(r => r.reservedBy === snap.viewer.id && (r.status === 'active' || r.status === 'pending_approval')).sort((a, b) => a.date.localeCompare(b.date));
  const unread = notifications.filter(n => !n.readBy.includes(snap.viewer.id)).length;
  const reservable = configs.filter(c => c.reservable);
  const monday = mondayOf(snap.today);
  const week = useMemo(() => DAYS.map((d, i) => { const date = addDays(monday, i); return { d, date, items: reservations.filter(r => r.date === date && (r.status === 'active' || r.status === 'pending_approval')) }; }), [monday, reservations]);

  const tabs = [
    { id: 'all' as View, label: 'All amenities' },
    { id: 'mine' as View, label: 'My reservations', badge: mine.length || undefined },
    { id: 'calendar' as View, label: 'Calendar' },
    { id: 'notifications' as View, label: 'Notifications', badge: unread || undefined },
    ...(isBoard ? [{ id: 'approvals' as View, label: 'Approvals', badge: pending.length || undefined, badgeTone: 'red' as const }] : []),
  ];

  const WeekStrip = (
    <Card aria-label="This week" className="gap-2">
      <SectionLabel>This week · {reservable.map(c => c.name.toLowerCase()).join(' and ') || 'shared spaces'}</SectionLabel>
      <div className="grid grid-cols-7 gap-1.5">
        {week.map(col => (
          <div key={col.date} className="flex min-h-[96px] flex-col gap-1 rounded-[12px] bg-white p-1.5">
            <span className={`text-[11px] font-semibold ${col.date === snap.today ? 'text-ux2-navy' : 'text-ux2-muted'}`}>{col.d}</span>
            {col.items.map(r => <button key={r.id} type="button" title={`${r.amenityName} · ${r.reservedByName}${r.notes ? ` · ${r.notes}` : ''}`} onClick={() => window.alert(`${r.amenityName} · ${dayLabel(r.date)} ${hhmm(r.startTime)} to ${hhmm(r.endTime)}\n${r.reservedByName}${r.reservedByUnit ? ` · Unit ${r.reservedByUnit}` : ''}${r.notes ? `\n${r.notes}` : ''}`)} className={`rounded-md px-1.5 py-1 text-left text-[10px] leading-tight ${r.status === 'pending_approval' ? 'bg-ux2-amber-tint text-ux2-amber' : 'bg-ux2-sage-tint text-ux2-sage'}`}><span className="block font-semibold">{r.amenityName.split(' ')[0]}{r.reservedByUnit ? ` · ${r.reservedByUnit}` : ''}</span>{hhmm(r.startTime)} to {hhmm(r.endTime)}{r.status === 'pending_approval' ? ' · pending' : ''}</button>)}
            {reservable[0] && col.date >= snap.today && <button type="button" aria-label={`Reserve ${col.d}`} onClick={() => { setSlot({ amenityId: reservable[0].id, date: col.date }); setView('all'); }} className="mt-auto rounded-md border border-dashed border-ux2-line-strong py-1 text-[10px] text-ux2-dim hover:border-ux2-navy hover:text-ux2-navy">+</button>}
          </div>
        ))}
      </div>
      <Why>Tap an empty slot to reserve, a block to see details. Green is confirmed, amber is pending.</Why>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillTabs size="filter" aria-label="Amenity views" value={view} onChange={setView} tabs={tabs} />
      </div>

      {view === 'all' && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {configs.map(c => <AmenityCard key={`${c.id}-${slot?.amenityId === c.id ? slot.date : ''}`} c={c} snap={snap} reservations={reservations} isBoard={isBoard} openDate={slot?.amenityId === c.id ? slot.date : undefined} />)}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {isBoard && (
              <Card aria-label="Approvals" className="gap-2">
                <SectionLabel>Approvals · board and manager</SectionLabel>
                {pending.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing waiting. Requests that need the board land here and as Home cards.</Inner>}
                {pending.map(r => (
                  <Inner key={r.id} data-reservation={r.id} className="flex flex-col gap-2">
                    <Cell title={<>{r.amenityName} <span className="font-normal text-ux2-muted">· {dayLabel(r.date)}, {hhmm(r.startTime)} to {hhmm(r.endTime)} · Unit {r.reservedByUnit || '—'}{r.notes ? ` · ${r.notes}` : ''}</span></>} note={`${r.fee ? `$${r.fee} fee` : 'No fee'}${r.deposit ? ` · $${r.deposit} deposit` : ''} · requested ${ago(r.createdAt, snap.today)}${r.recurringGroupId ? ' · recurring' : ''}`} />
                    {denying?.id === r.id ? (
                      <form onSubmit={e => { e.preventDefault(); if (!denying.reason.trim()) return; deny(r.id, snap.viewer.id, snap.viewer.name, denying.reason.trim()); setDenying(null); }} className="flex flex-wrap items-end gap-2">
                        <Field label="Reason" className="min-w-[220px] flex-1"><input aria-label="Reason" value={denying.reason} onChange={e => setDenying({ id: r.id, reason: e.target.value })} className={INPUT} /></Field>
                        <Button type="submit" size="sm" variant="danger">Deny</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDenying(null)}>Back</Button>
                      </form>
                    ) : (
                      <div className="flex gap-2"><Button size="sm" onClick={() => approve(r.id, snap.viewer.id, snap.viewer.name)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => setDenying({ id: r.id, reason: '' })}>Deny</Button></div>
                    )}
                  </Inner>
                ))}
                <Why>These also arrive as Home cards for the board. Deny asks for a reason, as today.</Why>
              </Card>
            )}
            {WeekStrip}
          </div>
        </>
      )}

      {view === 'mine' && (
        <Card aria-label="My reservations" className="gap-2">
          <SectionLabel>My reservations · {mine.length}</SectionLabel>
          {mine.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing booked. Reserve from All amenities or tap a day in the calendar.</Inner>}
          {mine.map(r => <Inner key={r.id} data-reservation={r.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`${r.amenityName} · ${dayLabel(r.date)}`} note={`${hhmm(r.startTime)} to ${hhmm(r.endTime)}${r.notes ? ` · ${r.notes}` : ''}${r.fee ? ` · $${r.fee} fee` : ''}`} /><span className="flex items-center gap-2"><Chip tone={r.status === 'pending_approval' ? 'amber' : 'sage'}>{r.status === 'pending_approval' ? 'Pending' : 'Confirmed'}</Chip><Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Cancel</Button></span></Inner>)}
          <Why>A cancelled reservation frees the slot at once; deposits come back within a week.</Why>
        </Card>
      )}

      {view === 'calendar' && WeekStrip}

      {view === 'notifications' && (
        <Card aria-label="Notifications" className="gap-2">
          <SectionLabel>Notifications · {notifications.length}</SectionLabel>
          {isBoard && (
            <form aria-label="Send a notification" onSubmit={e => { e.preventDefault(); const c = configs.find(x => x.id === notif.amenityId); if (!c || !notif.message.trim()) return; send({ amenityId: c.id, amenityName: c.name, message: notif.message.trim(), sentBy: snap.viewer.id, sentByName: snap.viewer.name, sentByRole: role, sentAt: new Date().toISOString(), recipients: 'all' }); setNotif(n => ({ ...n, message: '' })); }} className="flex flex-wrap items-end gap-2 rounded-[14px] bg-white px-3.5 py-3">
              <Field label="Amenity" className="w-[200px]"><select aria-label="Amenity" value={notif.amenityId} onChange={e => setNotif(n => ({ ...n, amenityId: e.target.value }))} className={INPUT}>{configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Message" className="min-w-[240px] flex-1"><input aria-label="Message" value={notif.message} onChange={e => setNotif(n => ({ ...n, message: e.target.value }))} placeholder="Treadmill service Fri, 9 to 11am" className={INPUT} /></Field>
              <Button type="submit" size="sm">Send</Button>
            </form>
          )}
          {notifications.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing sent yet. Service windows and closures go out from here.</Inner>}
          {[...notifications].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map(n => <Inner key={n.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`${n.amenityName} · ${n.message}`} note={`${n.sentByName} · ${dayLabel(n.sentAt.slice(0, 10))}`} />{!n.readBy.includes(snap.viewer.id) ? <Button size="sm" variant="ghost" onClick={() => markRead(n.id, snap.viewer.id)}>Mark read</Button> : <Chip tone="ghost">Read</Chip>}</Inner>)}
        </Card>
      )}

      {view === 'approvals' && isBoard && (
        <Card aria-label="Approvals" className="gap-2">
          <SectionLabel>Approvals · {pending.length}</SectionLabel>
          {pending.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing waiting.</Inner>}
          {pending.map(r => <Inner key={r.id} data-reservation={r.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`${r.amenityName} · ${dayLabel(r.date)}, ${hhmm(r.startTime)} to ${hhmm(r.endTime)}`} note={`Unit ${r.reservedByUnit || '—'} · ${r.reservedByName}${r.notes ? ` · ${r.notes}` : ''}`} /><span className="flex gap-2"><Button size="sm" onClick={() => approve(r.id, snap.viewer.id, snap.viewer.name)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => { setDenying({ id: r.id, reason: '' }); setView('all'); }}>Deny</Button></span></Inner>)}
        </Card>
      )}
    </div>
  );
}
