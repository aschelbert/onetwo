import { useNavigate } from 'react-router-dom';
import UserManagementPage from '@/features/user-management/UserManagementPage';
import { useAuthStore } from '@/store/useAuthStore';
import { Button, Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { MeSnapshot } from '../metrics';

const ROLE_LABEL: Record<string, string> = { BOARD_MEMBER: 'Board member', RESIDENT: 'Owner or resident', PROPERTY_MANAGER: 'Property manager', STAFF: 'Staff', PLATFORM_ADMIN: 'Platform admin', PM_COMPANY: 'Management company' };

export default function UsersTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const members = useAuthStore(s => s.buildingMembers).filter(m => m.role !== 'PLATFORM_ADMIN');
  const invites = useAuthStore(s => s.buildingInvites);
  const active = members.filter(m => m.status === 'active');
  const owners = active.filter(m => m.role === 'RESIDENT').length;
  const board = active.filter(m => m.role === 'BOARD_MEMBER').length;
  const staff = active.filter(m => m.role === 'STAFF' || m.role === 'PROPERTY_MANAGER' || m.role === 'PM_COMPANY').length;
  const pending = invites.filter(i => i.status === 'pending');
  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="grey" label="People with access" value={active.length} unit="can sign in" sub={`Owners ${owners} · board ${board} · staff and management ${staff} · the count is seats, not people`} className="min-h-[160px]" action={<><span>Building directory</span><button type="button" onClick={() => navigate('/building?tab=directory')} className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Open</button></>} />
        <Tile tone={pending.length ? 'navy' : 'grey'} label="Invites" value={pending.length} unit="pending" sub={pending[0] ? `${pending[0].email}${pending[0].unit ? ` · Unit ${pending[0].unit}` : ''} · sent ${dayLabel(pending[0].sentDate.slice(0, 10))}` : 'Nothing out · invites carry a one-time code'} className="min-h-[160px]" />
        <Tile tone="teal" label="Roles" value={4} unit="roles" sub="Owner or resident: their unit and the community · Board member: everything, writes · Property manager and staff: operations" className="min-h-[160px]" />
      </TileRow>
      <Card aria-label="Roles">
        <SectionLabel>Who sees what</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[['Owner, resident', 'Their unit, the ledger, documents, votes and the community'], ['Board member', 'Everything, with writes; officers get their own obligations'], ['Property manager', 'Operations: cases, vendors, work orders, the inbox'], ['Staff', 'Tasks, the property log and the intercom']].map(([r, d]) => (
            <Inner key={r}><div className="text-sm font-semibold text-ux2-ink">{r}</div><div className="text-xs text-ux2-muted">{d}</div></Inner>
          ))}
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(active.reduce<Record<string, number>>((acc, m) => { acc[m.role] = (acc[m.role] ?? 0) + 1; return acc; }, {})).map(([r, n]) => <Chip key={r} tone="ghost">{ROLE_LABEL[r] ?? r} · {n}</Chip>)}
          </div>
        )}
      </Card>
      <Card aria-label="Members and invites">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Members, invites, bulk invite</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory&section=people')}>Board and roles · Building › Directory</Button>
        </div>
        <p className="text-sm text-ux2-muted">Invites go from noreply@getonetwo.com with reply-to set to {snap.viewer.email}. Removing someone keeps their unit, ledger and votes; only the sign-in goes.</p>
        <div className="ux2-legacy"><UserManagementPage embedded /></div>
      </Card>
    </div>
  );
}
