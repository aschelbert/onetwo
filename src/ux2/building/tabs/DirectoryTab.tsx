import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useTaskTrackingStore } from '@/store/useTaskTrackingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { cn, fmt } from '@/lib/formatters';
import type { Role } from '@/types/auth';
import type { Unit } from '@/types/financial';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, Table, Th, Td, Cell, KV, RowMenu, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents } from '../../score/events';
import { bandFor, computeScorecard } from '../../score/stewardship';
import { ONLINE_METHODS } from '../../funds/metrics';
import type { BuildingSnapshot } from '../metrics';

type Section = 'units' | 'board' | 'management' | 'staff' | 'emergency';
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
const monthYear = (iso?: string | null) => { if (!iso) return '—'; const d = new Date(iso.slice(0, 10) + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
const autopay = (u: Unit) => { const p = [...u.payments].sort((a, b) => b.date.localeCompare(a.date))[0]; return !!p && ONLINE_METHODS.includes((p.method || '').toLowerCase()); };
const ROLE_OPTIONS: Role[] = ['RESIDENT', 'BOARD_MEMBER', 'PROPERTY_MANAGER', 'STAFF'];

function InviteForm({ onClose }: { onClose: () => void }) {
  const invite = useAuthStore(s => s.inviteMember);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('RESIDENT');
  const [unit, setUnit] = useState('');
  return (
    <form aria-label="Invite" onSubmit={e => { e.preventDefault(); if (!email) return; invite(email, role, unit || undefined); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Email" className="min-w-[220px] flex-1"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} /></Field>
      <Field label="Role" className="w-[180px]"><select value={role} onChange={e => setRole(e.target.value as Role)} className={INPUT}>{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</option>)}</select></Field>
      <Field label="Unit" className="w-[100px]"><input value={unit} onChange={e => setUnit(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!email}>Send invite</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function BoardMemberForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const board = useBuildingStore(s => s.board);
  const add = useBuildingStore(s => s.addBoardMember);
  const update = useBuildingStore(s => s.updateBoardMember);
  const m = board.find(b => b.id === id);
  const [name, setName] = useState(m?.name ?? '');
  const [role, setRole] = useState(m?.role ?? 'Member at Large');
  const [email, setEmail] = useState(m?.email ?? '');
  const [phone, setPhone] = useState(m?.phone ?? '');
  const [term, setTerm] = useState(m?.term ?? '');
  return (
    <form aria-label={m ? `Edit ${m.name}` : 'Add a board member'} onSubmit={e => { e.preventDefault(); if (!name) return; if (m) update(m.id, { name, role, email, phone, term }); else add({ name, role, email, phone, term }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Name" className="min-w-[180px] flex-1"><input value={name} onChange={e => setName(e.target.value)} className={INPUT} /></Field>
      <Field label="Role" className="w-[170px]"><select value={role} onChange={e => setRole(e.target.value)} className={INPUT}>{['President', 'Vice President', 'Treasurer', 'Secretary', 'Member at Large'].map(r => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Email" className="w-[200px]"><input value={email} onChange={e => setEmail(e.target.value)} className={INPUT} /></Field>
      <Field label="Phone" className="w-[140px]"><input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} /></Field>
      <Field label="Term" className="w-[180px]"><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Jan 2025 – Dec 2026" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name}>{m ? 'Save' : 'Add'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

export default function DirectoryTab({ snap, section, onSection, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  const units = useFinancialStore(s => s.units);
  const management = useBuildingStore(s => s.management);
  const counsel = useBuildingStore(s => s.legalCounsel);
  const vendors = useBuildingStore(s => s.vendors);
  const removeBoardMember = useBuildingStore(s => s.removeBoardMember);
  const staff = usePayrollStore(s => s.staff);
  const invites = useAuthStore(s => s.buildingInvites);
  const members = useAuthStore(s => s.buildingMembers);
  const me = useAuthStore(s => s.currentUser);
  const issues = useIssuesStore(s => s.issues);
  const tasks = useTaskTrackingStore(s => s.tasks);
  const logs = usePropertyLogStore(s => s.logs);
  const store = useStoreSnapshot(snap.today);
  const scores = useMemo(() => new Map(snap.board.map(b => [b.id, computeScorecard(boardEvents(store, { name: b.name, officerTitle: b.role })).total])), [snap.board, store]);
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editingBoard, setEditingBoard] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const current: Section = section === 'people' ? 'board' : (['units', 'board', 'management', 'staff', 'emergency'] as string[]).includes(section ?? '') ? (section as Section) : 'units';
  const pending = invites.filter(i => i.status === 'pending');
  const noEmail = units.filter(u => !u.email);
  const month = snap.today.slice(0, 7);
  const paid = units.filter(u => u.balance <= 0 || u.payments.some(p => p.date.startsWith(month))).length;
  const fees = units.map(u => u.monthlyFee).filter(Boolean);
  const boardByEmail = new Map(snap.board.map(b => [b.email.toLowerCase(), b]));
  const boardByName = new Map(snap.board.map(b => [b.name.toLowerCase(), b]));
  const rows = units.filter(u => !q || `${u.number} ${u.owner} ${u.email} ${u.phone}`.toLowerCase().includes(q.toLowerCase()));
  const shown = showAll || q ? rows : rows.slice(0, 8);
  const goto = (s: Section) => { onSection(s); document.getElementById(`dir-${s}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const exportList = () => {
    const csv = ['Unit,Owner,Email,Phone,Monthly,Balance', ...units.map(u => [u.number, u.owner, u.email, u.phone, u.monthlyFee, u.balance].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `directory-${snap.today}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const vendorFor = (re: RegExp) => vendors.find(v => v.status === 'active' && re.test(`${v.name} ${v.service}`));
  const president = snap.board.find(b => b.role === 'President') ?? snap.board[0];
  const openTasks = tasks.filter(t => t.status !== 'done').slice(0, 2);
  const recentLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="m-0 text-xl font-medium text-ux2-ink">Directory</h2><p className="m-0 text-sm text-ux2-muted">The one directory: units and owners, the board, advisers, staff, and who to call at 2am.</p></div>
        {isBoard && <div className="flex gap-2"><Button variant="ghost" onClick={exportList}>Export list</Button><Button onClick={() => setInviting(v => !v)}>Invite</Button></div>}
      </div>
      {inviting && <InviteForm onClose={() => setInviting(false)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Directory sections" value={current} onChange={goto} tabs={[{ id: 'units', label: 'Units & owners', badge: units.length || undefined }, { id: 'board', label: 'Board', badge: snap.board.length || undefined }, { id: 'management', label: 'Management & counsel' }, { id: 'staff', label: 'Staff', badge: staff.length || undefined }, { id: 'emergency', label: 'Emergency' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search unit, name, email, phone" label="Search people" className="w-[260px] max-w-full" />
      </div>

      {(pending.length > 0 || noEmail.length > 0) && isBoard && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">Invites · {pending.length} pending</span></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {pending.slice(0, 2).map(i => (
              <button key={i.id} type="button" onClick={() => navigate('/admin/users')} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{i.unit ? `Unit ${i.unit} · ` : ''}{i.email} invited, not yet accepted</span><span className="block text-xs text-ux2-muted">Sent {dayLabel(i.sentDate.slice(0, 10))} by {i.sentBy} · {i.role.replace('_', ' ').toLowerCase()}</span></span>
                <Chip tone="amber">Resend</Chip>
              </button>
            ))}
            {noEmail.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{noEmail.length} unit{noEmail.length === 1 ? '' : 's'} still get{noEmail.length === 1 ? 's' : ''} paper notices</span><span className="block text-xs text-ux2-muted">{noEmail.slice(0, 4).map(u => u.number).join(', ')} have no email on file · ask again at the annual meeting</span></span>
                <Chip tone="ghost">Fine for now</Chip>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card id="dir-units" aria-label="Units and owners" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Units and owners · {units.length}</SectionLabel><span className="text-xs text-ux2-muted">{fees.length ? `Dues ${fmt(Math.min(...fees))} to ${fmt(Math.max(...fees))} · ` : ''}{paid} of {units.length} paid this month · {units.filter(autopay).length} on autopay · <button type="button" onClick={() => navigate('/funds?tab=income')} className="font-semibold text-ux2-teal hover:underline">Unit ledgers in Funds</button></span></div>
        {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">{units.length ? 'No unit matches.' : 'No units yet.'}</Inner> : (
          <Table minWidth={860}>
            <thead><tr><Th>Unit</Th><Th>Owner</Th><Th>Email</Th><Th>Phone</Th><Th>Roles</Th><Th>Autopay</Th><Th>Move-in</Th></tr></thead>
            <tbody>
              {shown.map(u => {
                const b = boardByEmail.get(u.email.toLowerCase()) ?? boardByName.get(u.owner.toLowerCase());
                const isMe = (!!me.email && me.email.toLowerCase() === u.email.toLowerCase()) || me.linkedUnits?.includes(u.number) || me.unitNumber === u.number;
                const inv = pending.find(i => i.unit === u.number);
                const reqs = issues.filter(i => i.unitNumber === u.number && i.status !== 'CLOSED' && i.status !== 'RESOLVED').length;
                const resident = members.find(m => m.unit === u.number && m.role === 'RESIDENT' && m.name !== u.owner);
                const behind = Math.max(0, u.balance);
                return (
                  <tr key={u.number}>
                    <Td className="font-semibold">{u.number}</Td>
                    <Td className="font-semibold">{u.owner || (inv ? 'Vacant · new owner invited' : 'Vacant')}</Td>
                    <Td className="text-ux2-muted">{u.email || (inv ? 'invite pending' : '—')}</Td>
                    <Td className="text-ux2-muted">{u.phone || '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {u.owner && <Chip tone="teal">Owner</Chip>}
                        {b && <Chip tone="navy">Board · {b.role}</Chip>}
                        {isMe && <Chip tone="cyan">You</Chip>}
                        {resident && <Chip tone="ghost">Resident</Chip>}
                        {reqs > 0 && <Chip tone="ghost">{reqs} request{reqs === 1 ? '' : 's'}</Chip>}
                        {behind > 0 && <Chip tone={behind > u.monthlyFee ? 'red' : 'amber'}>{behind > u.monthlyFee ? `Delinquent · ${fmt(behind)}` : '1 month behind'}</Chip>}
                        {u.status === 'FOR_SALE' && <Chip tone="ghost">For sale</Chip>}
                        {inv && <Chip tone="amber">Invite pending</Chip>}
                      </div>
                    </Td>
                    <Td>{u.owner ? <Chip tone={autopay(u) ? 'sage' : 'ghost'}>{autopay(u) ? 'On' : 'Off'}</Chip> : <span className="text-ux2-muted">—</span>}</Td>
                    <Td className="whitespace-nowrap text-ux2-muted">{monthYear(u.moveIn)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {rows.length > 8 && !q && <Button size="sm" variant="ghost" className="self-start" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show ${rows.length - 8} more units`}</Button>}
        <Why>A row's unit opens its ledger in Funds. Owners see their own unit only. Role chips come from the board list, Funds and Board Room; nobody sets them here.</Why>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card id="dir-board" aria-label="Board" className="gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Board · {snap.board.length}</SectionLabel><span className="text-xs text-ux2-muted">{snap.board[0]?.term ? `Terms: ${snap.board[0].term} · ` : ''}<button type="button" onClick={() => navigate('/community?tab=votes')} className="font-semibold text-ux2-teal hover:underline">Election in Community</button></span></div>
          {editingBoard === 'new' && <BoardMemberForm onClose={() => setEditingBoard(null)} />}
          <div className="flex flex-col gap-2">
            {snap.board.map(b => {
              const sc = scores.get(b.id) ?? 0;
              const isMe = b.name === me.name || (!!me.email && b.email.toLowerCase() === me.email.toLowerCase());
              const unit = units.find(u => u.email && u.email.toLowerCase() === b.email.toLowerCase())?.number;
              return (
                <Fragment key={b.id}>
                  <div className={cn('flex items-center justify-between gap-3 rounded-[14px] border bg-white px-3.5 py-3', isMe ? 'border-ux2-navy' : 'border-ux2-line')}>
                    <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ux2-navy text-[11px] font-bold text-white">{initials(b.name)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ux2-ink">{b.name} · {b.role}{isMe && <Chip tone="cyan" className="ml-1.5">You</Chip>}</span><span className="block truncate text-xs text-ux2-muted">{unit ? `Unit ${unit} · ` : ''}{b.term ? `since ${b.term.split(/[–-]/)[0].trim()} · ` : ''}{b.email}</span></span></span>
                    <span className="flex shrink-0 items-center gap-1.5"><Chip tone={sc >= 90 ? 'sage' : sc >= 80 ? 'teal' : sc >= 70 ? 'amber' : 'ghost'} title="Stewardship, the member's own score from Home">{sc} · {bandFor(sc)}</Chip>{isBoard && <RowMenu label={`More for ${b.name}`} items={[{ label: 'Edit', onSelect: () => setEditingBoard(b.id) }, { label: 'Remove from the board', onSelect: () => removeBoardMember(b.id), danger: true }]} />}</span>
                  </div>
                  {editingBoard === b.id && <BoardMemberForm id={b.id} onClose={() => setEditingBoard(null)} />}
                </Fragment>
              );
            })}
            {snap.board.length === 0 && <Inner className="text-sm text-ux2-muted">No board members yet.</Inner>}
          </div>
          {isBoard && editingBoard !== 'new' && <Button size="sm" variant="ghost" className="self-start" onClick={() => setEditingBoard('new')}>Add a board member</Button>}
          <Why>Stewardship is the board member's own score from Home. Roles set who gets which Home cards and which obligations are theirs. <button type="button" onClick={() => navigate('/building?tab=obligations&section=duties')} className="font-semibold text-ux2-teal hover:underline">Duties and roles</button></Why>
        </Card>

        <div className="flex flex-col gap-3">
          <Card id="dir-management" aria-label="Management and counsel" className="gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Management and counsel</SectionLabel><label className="flex items-center gap-1.5 text-xs text-ux2-muted"><input type="checkbox" checked={!!management.company} readOnly /> Property manager</label></div>
            <Inner className="flex items-center justify-between gap-3">
              <Cell title={management.company ? `${management.company} · property manager` : 'Self-managed · no property manager'} note={management.company ? `${management.contact}${management.title ? ` · ${management.title}` : ''} · ${management.phone} · ${management.hours}` : 'PM scorecard: n/a. Add a Property Manager Seat to add one; the scorecard (response time, bills on time, owner replies) appears in Community.'} />
              <Chip tone={management.company ? 'sage' : 'ghost'}>{management.company ? 'On' : 'Off'}</Chip>
            </Inner>
            {counsel.map(c => <Inner key={c.id} className="flex items-center justify-between gap-3"><Cell title={`${c.firm} · counsel`} note={`${c.attorney}${c.specialty ? ` · ${c.specialty}` : ''} · ${c.phone}`} /><Chip tone="ghost">Board only</Chip></Inner>)}
            {counsel.length === 0 && <Why>No legal counsel on file.</Why>}
          </Card>
          <Card id="dir-staff" aria-label="Staff" className="gap-2.5">
            <SectionLabel>Staff · {staff.length}</SectionLabel>
            {staff.length === 0 ? <Why>No staff on payroll.</Why> : staff.map(s => (
              <Inner key={s.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ux2-teal-tint text-[11px] font-bold text-ux2-teal">{initials(s.name)}</span><Cell title={`${s.name} · ${s.role}${s.type === 'contractor' ? ', contractor' : ''}`} note={`${s.phone || s.email}${s.startDate ? ` · since ${monthYear(s.startDate)}` : ''} · paid through Funds`} /></span>
                <Chip tone="ghost">Everyone</Chip>
              </Inner>
            ))}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card id="dir-emergency" aria-label="Emergency contacts" className="gap-2.5">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Emergency contacts</SectionLabel><Chip tone="ghost">Everyone</Chip></div>
          <Inner className="py-1">
            <KV label="Fire, police, medical">911</KV>
            <KV label="Elevator, trapped passenger">{vendorFor(/elevator|lift/i) ? `${vendorFor(/elevator|lift/i)!.name} · ${vendorFor(/elevator|lift/i)!.phone}` : '—'}</KV>
            <KV label="No heat or hot water">{vendorFor(/heat|boiler|hvac|plumb/i) ? `${vendorFor(/heat|boiler|hvac|plumb/i)!.name} · ${vendorFor(/heat|boiler|hvac|plumb/i)!.phone}` : '—'}</KV>
            <KV label="Electrical or fire alarm">{vendorFor(/electric|fire/i) ? `${vendorFor(/electric|fire/i)!.name} · ${vendorFor(/electric|fire/i)!.phone}` : '—'}</KV>
            <KV label="Gas smell">Leave first, then call the gas utility</KV>
            <KV label={management.company ? 'Manager after hours' : 'Board on call'}>{management.company ? `${management.emergency || management.phone}${management.afterHours ? ` · ${management.afterHours}` : ''}` : president ? `${president.name} · ${president.role} · ${president.phone}` : '—'}</KV>
          </Inner>
          <Why>Printed on the lobby card and in the welcome packet; the resident view shows this first.</Why>
        </Card>
        <Card aria-label="Tasks and property log" className="gap-2.5">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Tasks and property log</SectionLabel><button type="button" onClick={() => navigate('/boardroom?tab=tasks')} className="text-xs font-semibold text-ux2-teal hover:underline">All tasks in Board Room</button></div>
          {openTasks.length === 0 ? <Why>No open tasks.</Why> : openTasks.map(t => (
            <Inner key={t.id} className="flex items-center justify-between gap-3"><Cell title={t.title} note={`Task · ${t.assignedToName || 'unassigned'}${t.dueDate ? ` · by ${dayLabel(t.dueDate)}` : ''}`} /><Chip tone={t.status === 'blocked' ? 'amber' : 'ghost'}>{t.status === 'blocked' ? 'Waiting' : t.dueDate ? dayLabel(t.dueDate) : 'Open'}</Chip></Inner>
          ))}
          <SectionLabel>Last {Math.min(3, recentLogs.length)} log entries</SectionLabel>
          {recentLogs.length === 0 ? <Why>Nothing logged yet.</Why> : recentLogs.map(l => (
            <button key={l.id} type="button" onClick={() => navigate('/community?tab=log')} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-2.5 text-left text-[13px] hover:border-ux2-line-strong"><span className="min-w-0 truncate"><b className="font-semibold text-ux2-ink">{dayLabel(l.date)}</b> · {l.title} <span className="text-ux2-muted">· {l.conductedBy}</span></span><Chip tone={l.status === 'open' ? 'navy' : 'ghost'}>{l.status === 'open' ? 'Open' : l.status === 'monitoring' ? 'Monitoring' : 'Resolved'}</Chip></button>
          ))}
        </Card>
      </div>
    </div>
  );
}
