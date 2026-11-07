/**
 * User Management, to the Me-Users board: three tiles (People with access,
 * Invites, Roles), the Members table with role pills and a row menu, the
 * Invite card (one person or bulk), the Audit log and the Permissions
 * matrix. Demo tenants read and write the auth store; live tenants read
 * `tenant_users` and `invitations` and send invites through the
 * `send-invite` edge function, the same paths the production page used.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { getInitials } from '@/lib/formatters';
import type { Role } from '@/types/auth';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, KV, PillTabs, RowMenu, SearchInput, SectionLabel, Table, Td, Th, Tile, TileRow, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { MeSnapshot } from '../metrics';

type Access = 'owner' | 'resident' | 'board' | 'admin' | 'counsel' | 'accountant' | 'staff' | 'manager';

interface Person { id: string; name: string; email: string; unit: string; boardTitle: string | null; role: Role; access: Access; status: string; lastActive: string | null; you: boolean }
interface Invite { id: string; email: string; unit: string; role: Role; sent: string; expires: string; code: string }

const ACCESS_LABEL: Record<Access, string> = { owner: 'Owner', resident: 'Resident', board: 'Board', admin: 'Admin', counsel: 'Counsel · read-only', accountant: 'Accountant · read-only', staff: 'Staff', manager: 'Manager' };
const ROLE_OPTIONS: { id: string; label: string; role: Role }[] = [
  { id: 'resident', label: 'Owner', role: 'RESIDENT' },
  { id: 'resident-r', label: 'Resident', role: 'RESIDENT' },
  { id: 'board_member', label: 'Board member', role: 'BOARD_MEMBER' },
  { id: 'admin', label: 'Admin', role: 'BOARD_MEMBER' },
  { id: 'staff', label: 'Staff', role: 'STAFF' },
  { id: 'property_manager', label: 'Property manager', role: 'PROPERTY_MANAGER' },
];
const toRole = (r: string): Role => (r.toUpperCase() as Role);
const accessFor = (role: Role, boardTitle: string | null, you: boolean): Access =>
  role === 'BOARD_MEMBER' ? (you || /treasurer|president/i.test(boardTitle ?? '') ? 'admin' : 'board')
    : role === 'STAFF' ? 'staff' : role === 'PROPERTY_MANAGER' || role === 'PM_COMPANY' ? 'manager' : 'owner';
const ACCESS_TONE: Record<Access, 'navy' | 'teal' | 'ghost' | 'cyan' | 'amber'> = { admin: 'navy', board: 'teal', owner: 'ghost', resident: 'ghost', counsel: 'cyan', accountant: 'cyan', staff: 'amber', manager: 'amber' };

const PERMS: { module: string; cells: string[] }[] = [
  { module: 'Home', cells: ['Full', 'Full', 'Full', 'Full', 'Read', 'Read'] },
  { module: 'Board Room', cells: ['None', 'None', 'Full', 'Full', 'Read', 'None'] },
  { module: 'Funds', cells: ['Read', 'None', 'Full', 'Full', 'Read', 'Read'] },
  { module: 'Building', cells: ['Read', 'Read', 'Full', 'Full', 'Read', 'Read'] },
  { module: 'Community', cells: ['Full', 'Full', 'Full', 'Full', 'Read', 'None'] },
  { module: 'Me', cells: ['Full', 'Full', 'Full', 'Full', 'Full', 'Full'] },
];
const PERM_COLS = ['Owner', 'Resident', 'Board', 'Admin', 'Counsel', 'Accountant'];

interface AuditRow { when: string; what: string; detail: string }

/** Members and invites from the store (demo) or Supabase (live), with the writes each side supports. */
function usePeople(viewerName: string, viewerEmail: string) {
  const tenant = useTenantContext();
  const store = useAuthStore();
  const live = !tenant.isDemo && isBackendEnabled && !!supabase;
  const [rows, setRows] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(live);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!live || !supabase) return;
    setLoading(true);
    const { data: tu } = await supabase.from('tenant_users').select('id, user_id, role, unit, board_title, status, created_at, name, email').eq('tenant_id', tenant.id);
    const { data: inv } = await supabase.from('invitations').select('*').eq('tenant_id', tenant.id).eq('status', 'pending').order('created_at', { ascending: false });
    setRows((tu ?? []).map(u => {
      const role = toRole(u.role);
      const you = u.email === viewerEmail;
      return { id: u.id, name: u.name || u.email || 'Member', email: u.email ?? '', unit: u.unit ?? '', boardTitle: u.board_title, role, access: accessFor(role, u.board_title, you), status: u.status, lastActive: null, you };
    }));
    setInvites((inv ?? []).map(i => ({ id: i.id, email: i.email, unit: i.unit ?? '', role: toRole(i.role), sent: i.created_at.slice(0, 10), expires: i.expires_at.slice(0, 10), code: i.code })));
    setLoading(false);
  }, [live, tenant.id, viewerEmail]);

  useEffect(() => { void load(); }, [load]);

  const people: Person[] = live ? rows : store.buildingMembers.filter(m => m.role !== 'PLATFORM_ADMIN').map(m => {
    const you = m.name === viewerName;
    return { id: m.id, name: m.name, email: m.email, unit: m.unit, boardTitle: m.boardTitle, role: m.role, access: accessFor(m.role, m.boardTitle, you), status: m.status, lastActive: m.joined, you };
  });
  const pending: Invite[] = live ? invites : store.buildingInvites.filter(i => i.status === 'pending').map(i => ({ id: i.id, email: i.email, unit: i.unit, role: i.role, sent: i.sentDate, expires: addDays(i.sentDate, 14), code: i.code }));

  const call = async (body: Record<string, unknown>) => {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ ...body, senderName: viewerName }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const invite = async (list: { email: string; role: string; unit: string }[], noteText?: string) => {
    setNote(null);
    if (!live) { list.forEach(i => store.inviteMember(i.email, toRole(i.role === 'admin' ? 'board_member' : i.role), i.unit || undefined)); setNote(`${list.length === 1 ? 'Invitation' : `${list.length} invitations`} created with a one-time code.`); return; }
    try {
      const data = list.length === 1
        ? await call({ email: list[0].email, role: list[0].role, unit: list[0].unit || null, note: noteText || undefined })
        : await call({ invitees: list });
      const first = data?.invitations?.[0];
      setNote(list.length === 1 ? (first?.sent ? `Invitation sent to ${list[0].email}.` : `Invitation created${first?.code ? ` (code ${first.code})` : ''}; email delivery pending.`) : `${data?.sent ?? 0} of ${data?.total ?? list.length} invitations sent.`);
      await load();
    } catch (e: any) { setNote(e.message || 'The invitation did not go out.'); }
  };
  const revoke = async (inv: Invite) => {
    if (!live) { store.revokeInvite(inv.id); return; }
    await supabase!.from('invitations').update({ status: 'revoked' }).eq('id', inv.id);
    await load();
  };
  const resend = async (inv: Invite) => {
    if (!live) { setNote('Resend sends the same code again; in the demo the code is shown below.'); return; }
    try { await call({ email: inv.email, role: inv.role.toLowerCase(), unit: inv.unit || null, resendCode: inv.code }); setNote(`Invitation resent to ${inv.email}.`); } catch (e: any) { setNote(e.message || 'Resend failed.'); }
  };
  const changeRole = async (p: Person, role: Role) => {
    if (!live) { store.updateMemberRole(p.id, role); return; }
    const { error } = await supabase!.from('tenant_users').update({ role: role.toLowerCase() }).eq('id', p.id);
    setNote(error ? `Role not changed: ${error.message}` : `${p.name} is now ${ACCESS_LABEL[accessFor(role, p.boardTitle, p.you)]}.`);
    await load();
  };
  const remove = async (p: Person) => {
    if (!live) { store.removeMember(p.id); return; }
    const { error } = await supabase!.from('tenant_users').update({ status: 'inactive' }).eq('id', p.id);
    setNote(error ? `Not removed: ${error.message}` : `${p.name} can no longer sign in. Their unit, ledger and votes stay.`);
    await load();
  };

  return { live, loading, people, pending, note, setNote, invite, revoke, resend, changeRole, remove };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function Avatar({ name }: { name: string }) {
  return <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ux2-navy text-[11px] font-bold text-white">{getInitials(name)}</span>;
}

export default function UsersTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const tenant = useTenantContext();
  const units = useFinancialStore(s => s.units);
  const { live, loading, people, pending, note, setNote, invite, revoke, resend, changeRole, remove } = usePeople(snap.viewer.name, snap.viewer.email);
  const [filter, setFilter] = useState<'all' | 'board' | 'owners' | 'staff'>('all');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<'one' | 'bulk'>('one');
  const [email, setEmail] = useState('');
  const [unit, setUnit] = useState('');
  const [roleId, setRoleId] = useState('resident');
  const [memo, setMemo] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkRole, setBulkRole] = useState('resident');
  const [changing, setChanging] = useState<Person | null>(null);

  const active = people.filter(p => p.status === 'active');
  const owners = active.filter(p => p.role === 'RESIDENT').length;
  const board = active.filter(p => p.role === 'BOARD_MEMBER').length;
  const staff = active.filter(p => p.role === 'STAFF' || p.role === 'PROPERTY_MANAGER' || p.role === 'PM_COMPANY').length;
  const hasManager = active.some(p => p.role === 'PROPERTY_MANAGER' || p.role === 'PM_COMPANY');

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return active
      .filter(p => filter === 'all' || (filter === 'board' && p.role === 'BOARD_MEMBER') || (filter === 'owners' && p.role === 'RESIDENT') || (filter === 'staff' && (p.role === 'STAFF' || p.role === 'PROPERTY_MANAGER' || p.role === 'PM_COMPANY')))
      .filter(p => !ql || `${p.name} ${p.email} ${p.unit} ${p.boardTitle ?? ''}`.toLowerCase().includes(ql))
      .sort((a, b) => Number(b.you) - Number(a.you) || (a.role === 'BOARD_MEMBER' ? 0 : 1) - (b.role === 'BOARD_MEMBER' ? 0 : 1) || a.name.localeCompare(b.name));
  }, [active, filter, q]);
  const visible = showAll ? shown : shown.slice(0, 8);

  const audit: AuditRow[] = useMemo(() => {
    const rows: AuditRow[] = pending.map(i => ({ when: i.sent, what: 'Invite sent', detail: `${i.unit ? `Unit ${i.unit}` : i.email} · ${ACCESS_LABEL[accessFor(i.role, null, false)]} · by ${snap.viewer.name}` }));
    people.filter(p => p.lastActive).forEach(p => rows.push({ when: p.lastActive!, what: p.role === 'BOARD_MEMBER' ? 'Role changed' : 'Joined', detail: `${p.name} · ${p.role === 'BOARD_MEMBER' ? `${p.boardTitle ?? 'Board member'} added` : ACCESS_LABEL[p.access]}` }));
    return rows.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 5);
  }, [pending, people, snap.viewer.name]);

  const vacant = units.filter(u => !active.some(p => p.unit === u.number)).map(u => u.number);
  const submitOne = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setNote('Enter an email address.'); return; }
    const opt = ROLE_OPTIONS.find(r => r.id === roleId)!;
    void invite([{ email: email.trim(), role: opt.role.toLowerCase(), unit: unit }], memo);
    setEmail(''); setUnit(''); setMemo('');
  };
  const submitBulk = (e: React.FormEvent) => {
    e.preventDefault();
    const opt = ROLE_OPTIONS.find(r => r.id === bulkRole)!;
    const list = bulk.split('\n').map(l => l.split(',').map(s => s.trim())).filter(p => p[0]?.includes('@')).map(p => ({ email: p[0], role: opt.role.toLowerCase(), unit: p[1] ?? '' }));
    if (!list.length) { setNote('One line per person: email, unit.'); return; }
    void invite(list);
    setBulk('');
  };

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="grey" label="People with access" meta={<span className="text-xs text-ux2-muted">{tenant.name}</span>} value={loading ? '…' : active.length} unit="can sign in" className="min-h-[200px]"
          sub={<span className="block"><span className="grid grid-cols-3 gap-2 py-1">{[['Owners', owners], ['Board', board], ['Staff and counsel', staff]].map(([k, v]) => <span key={k} className="block"><span className="block text-[11px] uppercase tracking-wide text-ux2-dim">{k}</span><span className="block text-lg font-semibold text-ux2-ink">{v}</span></span>)}</span>{hasManager ? 'A manager seat is on.' : 'Self-managed, no manager seat.'} Board members hold an owner seat too; the count is seats, not people.</span>}
          action={<><span>Building directory · owners, residents, contacts</span><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory')}>Open</Button></>} />
        <Tile tone={pending.length ? 'navy' : 'grey'} label="Invites" meta={<span className={`text-xs ${pending.length ? 'text-white/70' : 'text-ux2-muted'}`}>{pending.length} pending</span>} value={pending.length} unit="pending" className="min-h-[200px]"
          sub={pending[0] ? (
            <span className="block">
              <span className="block text-[15px] font-semibold">{pending[0].unit ? `Unit ${pending[0].unit} · ` : ''}{pending[0].email}</span>
              <span className="block">{ACCESS_LABEL[accessFor(pending[0].role, null, false)]} · sent {dayLabel(pending[0].sent)} · expires {dayLabel(pending[0].expires)}</span>
              <span className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => void resend(pending[0])}>Resend</Button><Button size="sm" variant="ghost" onClick={() => void revoke(pending[0])}>Revoke</Button></span>
              <span className="mt-2 block text-xs opacity-80">Invites carry a one-time code and expire after 14 days. They go from noreply@getonetwo.com with reply-to set to you.</span>
            </span>
          ) : 'Nothing out. Invites carry a one-time code and expire after 14 days.'}
          action={<><span>Invite someone · one at a time or in bulk</span><Button size="sm" variant="ghost" onClick={() => document.getElementById('invite-card')?.scrollIntoView({ behavior: 'smooth' })}>Below ›</Button></>} />
        <Tile tone="teal" label="Roles" value={6} unit="roles" className="min-h-[200px]"
          sub={<span className="block"><span className="mb-2 flex flex-wrap gap-1.5">{['Owner', 'Resident', 'Board member', 'Admin', 'Counsel · read-only', 'Accountant · read-only'].map(r => <Chip key={r} tone="white">{r}</Chip>)}</span>{[['Owner, Resident', 'their unit and the community'], ['Board member', 'everything, writes'], ['Admin', 'board plus people and roles'], ['Counsel, Accountant', 'read what they need']].map(([k, v]) => <KV key={k} dark label={k}>{v}</KV>)}</span>}
          action={<><span>Permissions matrix · module by role</span><Button size="sm" variant="ghost" onClick={() => document.getElementById('permissions-card')?.scrollIntoView({ behavior: 'smooth' })}>View</Button></>} />
      </TileRow>

      {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}

      <Card aria-label="Members">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Members · {active.length} with access · as of today, {dayLabel(snap.today)}</SectionLabel>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <PillTabs size="filter" surface="white" aria-label="Member filters" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All', badge: active.length }, { id: 'board', label: 'Board', badge: board }, { id: 'owners', label: 'Owners', badge: owners }, { id: 'staff', label: 'Staff and counsel', badge: staff }]} />
            <SearchInput value={q} onChange={setQ} placeholder="Search members" label="Search members" />
          </div>
        </div>
        <Table minWidth={760}>
            <thead><tr><Th>Name</Th><Th>Unit or role</Th><Th>Access</Th><Th>Last active</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id} data-member={p.id}>
                  <Td><div className="flex items-center gap-2"><Avatar name={p.name} /><Cell title={<>{p.name}{p.you && <span className="ml-1 text-xs font-normal text-ux2-muted">· you</span>}</>} note={p.email} /></div></Td>
                  <Td>{[p.boardTitle, p.unit ? `Unit ${p.unit}` : null].filter(Boolean).join(' · ') || ACCESS_LABEL[p.access]}</Td>
                  <Td><Chip tone={ACCESS_TONE[p.access]}>{ACCESS_LABEL[p.access]}</Chip></Td>
                  <Td>{p.you ? 'Now' : p.lastActive ? dayLabel(p.lastActive) : '—'}</Td>
                  <Td>{p.status === 'active' ? 'Active' : p.status}</Td>
                  <Td num>{!p.you && <RowMenu label={`Actions for ${p.name}`} items={[{ label: 'Change role', onSelect: () => setChanging(p) }, { label: 'Reset password', onSelect: () => setNote(`${p.name} resets their password from the sign-in page; the link goes to ${p.email}.`) }, { label: 'Resend welcome', onSelect: () => setNote(live ? 'The welcome packet re-sends on their next sign-in.' : `Welcome re-sent to ${p.email}.`) }, { label: 'Remove', danger: true, onSelect: () => { if (window.confirm(`Remove ${p.name}? Their unit, ledger and votes stay; only the sign-in goes.`)) void remove(p); } }]} />}</Td>
                </tr>
              ))}
              {visible.length === 0 && <tr><Td colSpan={6}><span className="text-ux2-muted">{loading ? 'Loading members…' : 'No one matches.'}</span></Td></tr>}
            </tbody>
          </Table>
        {changing && (
          <Inner aria-label="Change role" className="flex flex-wrap items-end gap-2">
            <Field label={`New role for ${changing.name}`} className="min-w-[220px]">
              <select defaultValue={ROLE_OPTIONS.find(r => r.role === changing.role)?.id ?? 'resident'} id="change-role" className={INPUT}>{ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
            </Field>
            <Button size="sm" onClick={() => { const id = (document.getElementById('change-role') as HTMLSelectElement).value; void changeRole(changing, ROLE_OPTIONS.find(r => r.id === id)!.role); setChanging(null); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setChanging(null)}>Cancel</Button>
          </Inner>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Why>The row menu offers Change role, Reset password, Resend welcome, and Remove. Removing someone keeps their unit, ledger and votes; only the sign-in goes.</Why>
          {shown.length > 8 && <Button size="sm" variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show ${shown.length - 8} more`}</Button>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card id="invite-card" aria-label="Invite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Invite</SectionLabel>
            <PillTabs size="filter" surface="white" aria-label="Invite mode" value={mode} onChange={setMode} tabs={[{ id: 'one', label: 'One person' }, { id: 'bulk', label: 'Bulk' }]} />
          </div>
          {mode === 'one' ? (
            <form onSubmit={submitOne} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email"><input type="email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} placeholder="name@example.com" /></Field>
                <Field label="Unit">
                  <select aria-label="Unit" value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}>
                    <option value="">No unit · staff or counsel</option>
                    {units.map(u => <option key={u.number} value={u.number}>{u.number}{vacant.includes(u.number) ? ' · vacant' : ''}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Role">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Role">
                  {ROLE_OPTIONS.map(r => <button key={r.id} type="button" role="radio" aria-checked={roleId === r.id} onClick={() => setRoleId(r.id)} className={`h-9 rounded-full border px-3.5 text-xs font-semibold ${roleId === r.id ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>{r.label}</button>)}
                </div>
              </Field>
              <Field label="Note in the email · optional"><input aria-label="Note in the email" value={memo} onChange={e => setMemo(e.target.value)} className={INPUT} /></Field>
              <div><Button type="submit">Send invitation</Button></div>
            </form>
          ) : (
            <form onSubmit={submitBulk} className="flex flex-col gap-3">
              <Field label="One line per person: email, unit"><textarea aria-label="People to invite" value={bulk} onChange={e => setBulk(e.target.value)} rows={5} className="w-full rounded-2xl border border-ux2-line-strong bg-white px-3.5 py-2.5 text-sm text-ux2-ink" placeholder={'m.chen@example.com, 1A\nj.rivera@example.com, 2C'} /></Field>
              <Field label="Role for all"><select aria-label="Role for all" value={bulkRole} onChange={e => setBulkRole(e.target.value)} className={INPUT}>{ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
              <div><Button type="submit">Send invitations</Button></div>
            </form>
          )}
          <Why>Bulk takes one line per person: email, unit. Same role for all. The email goes from <b>noreply@getonetwo.com</b> with reply-to <b>{snap.viewer.email}</b>. The link is a one-time code, good for 14 days. Owners with a unit get the welcome packet on first sign-in.</Why>
          {pending.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Still out · {pending.length}</SectionLabel>
              {pending.map(i => <Inner key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><Cell title={i.email} note={`${i.unit ? `Unit ${i.unit} · ` : ''}${ACCESS_LABEL[accessFor(i.role, null, false)]} · sent ${dayLabel(i.sent)} · expires ${dayLabel(i.expires)}${!live ? ` · code ${i.code}` : ''}`} /><span className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => void resend(i)}>Resend</Button><Button size="sm" variant="ghost" onClick={() => void revoke(i)}>Revoke</Button></span></Inner>)}
            </div>
          )}
        </Card>

        <Card aria-label="Audit log">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Audit log · last {audit.length}</SectionLabel><span className="text-xs text-ux2-muted">Everything since the building joined</span></div>
          <div className="flex flex-col gap-2">
            {audit.map((r, i) => <Inner key={i} className="flex items-start justify-between gap-3"><Cell title={r.what} note={r.detail} /><span className="shrink-0 text-xs text-ux2-muted">{dayLabel(r.when)}</span></Inner>)}
            {audit.length === 0 && <Inner className="text-sm text-ux2-muted">Nothing yet. The first invite or role change lands here.</Inner>}
          </div>
          <Why>Every change to a person, role or sign-in is logged with who did it. The log is read-only and counsel can see it.</Why>
        </Card>
      </div>

      <Card id="permissions-card" aria-label="Permissions">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Permissions · what each role can do in each module</SectionLabel>
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setNote('Per-module actions are set in the Admin Console; the matrix here mirrors them.')}>Edit a role</Button><Button size="sm" variant="ghost" onClick={() => setNote('Roles are on the defaults.')}>Reset to defaults</Button></div>
        </div>
        <Table minWidth={720}>
            <thead><tr><Th>Module</Th>{PERM_COLS.map(c => <Th key={c}>{c}</Th>)}</tr></thead>
            <tbody>
              {PERMS.map(r => (
                <tr key={r.module}>
                  <Td><span className="font-semibold">{r.module}</span></Td>
                  {r.cells.map((c, i) => <Td key={i}><Chip tone={c === 'Full' ? 'navy' : c === 'Read' ? 'cyan' : 'ghost'}>{c}</Chip></Td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        <Why>Full means view, add, edit and approve inside that module; Read means view only; owners read only their own unit in Funds. Board and Admin are the production board-member role; Admin adds this page.</Why>
      </Card>
    </div>
  );
}
