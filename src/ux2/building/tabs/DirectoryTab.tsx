import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BuildingPage from '@/features/building/BuildingPage';
import TheUnitsTab from '@/features/building/tabs/TheUnitsTab';
import { useBuildingStore } from '@/store/useBuildingStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel } from '../../components';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents } from '../../score/events';
import { bandFor, computeScorecard } from '../../score/stewardship';
import type { BuildingSnapshot } from '../metrics';

type Section = 'units' | 'people';
const SECTIONS: Section[] = ['units', 'people'];

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

function People({ snap, isBoard }: { snap: BuildingSnapshot; isBoard: boolean }) {
  const navigate = useNavigate();
  const management = useBuildingStore(s => s.management);
  const counsel = useBuildingStore(s => s.legalCounsel);
  const staff = usePayrollStore(s => s.staff);
  const invites = useAuthStore(s => s.buildingInvites);
  const me = useAuthStore(s => s.currentUser);
  const store = useStoreSnapshot(snap.today);
  const scores = useMemo(() => new Map(snap.board.map(b => [b.id, computeScorecard(boardEvents(store, { name: b.name, officerTitle: b.role })).total])), [snap.board, store]);
  const pending = invites.filter(i => i.status === 'pending');
  return (
    <div className="flex flex-col gap-5">
      {pending.length > 0 && isBoard && (
        <Card aria-label="Invites">
          <SectionLabel>Invites · {pending.length} pending</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {pending.map(i => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ux2-ink">{i.email}{i.unit ? ` · Unit ${i.unit}` : ''} · {i.role.replace('_', ' ').toLowerCase()}</span>
                <Button size="sm" variant="ghost" onClick={() => navigate('/admin/users')}>Manage</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card aria-label="Board">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Board · {snap.board.length}</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=votes')}>Elections in Community</Button>
        </div>
        {snap.board.length === 0 ? <p className="text-sm text-ux2-muted">No board members yet. Add them below.</p> : (
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {snap.board.map(b => {
              const sc = scores.get(b.id) ?? 0;
              return (
                <li key={b.id} className="flex items-center gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{initials(b.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ux2-ink">{b.name} · {b.role}{b.name === me.name ? <Chip tone="cyan" className="ml-2">You</Chip> : null}</span>
                    <span className="block truncate text-xs text-ux2-muted">{b.email}{b.term ? ` · term ${b.term}` : ''}</span>
                  </span>
                  <Chip tone={sc >= 80 ? 'teal' : sc >= 70 ? 'amber' : 'ghost'} title="Stewardship, the member's own score from Home">{sc} · {bandFor(sc)}</Chip>
                </li>
              );
            })}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">Stewardship is the board member's own score from Home. Roles set who gets which Home cards and which obligations are theirs.</Inner>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card aria-label="Management and counsel">
          <SectionLabel>Management and counsel</SectionLabel>
          <Inner>
            <div className="text-sm font-semibold text-ux2-ink">{management.company || 'Self-managed · no property manager'}</div>
            {management.company && <div className="text-xs text-ux2-muted">{management.contact}{management.title ? ` · ${management.title}` : ''} · {management.phone} · {management.hours}</div>}
          </Inner>
          {counsel.map(c => (
            <Inner key={c.id}>
              <div className="text-sm font-semibold text-ux2-ink">{c.firm} · counsel</div>
              <div className="text-xs text-ux2-muted">{c.attorney}{c.specialty ? ` · ${c.specialty}` : ''} · {c.phone}</div>
            </Inner>
          ))}
          {counsel.length === 0 && <p className="text-xs text-ux2-muted">No legal counsel on file.</p>}
        </Card>
        <Card aria-label="Staff and emergency">
          <SectionLabel>Staff and who to call</SectionLabel>
          {staff.length === 0 ? <p className="text-xs text-ux2-muted">No staff on payroll.</p> : staff.map(s => (
            <Inner key={s.id}><div className="text-sm font-semibold text-ux2-ink">{s.name} · {s.role}</div><div className="text-xs text-ux2-muted">{s.type} · {s.email}</div></Inner>
          ))}
          <Inner className="border-ux2-red-tint bg-ux2-red-tint">
            <div className="text-sm font-semibold text-ux2-red-ink">Emergency</div>
            <div className="text-xs text-ux2-ink">{management.emergency ? `${management.company || 'Management'} · ${management.emergency}${management.afterHours ? ` · ${management.afterHours}` : ''}` : 'Call 911 for danger to life; the board president for the building'}</div>
          </Inner>
          {isBoard && <Button size="sm" variant="ghost" className="self-start" onClick={() => navigate('/funds?tab=expenses')}>Payroll · Funds › Expenses</Button>}
        </Card>
      </div>
      {isBoard && (
        <Card aria-label="Edit people">
          <SectionLabel>Edit the board, management and counsel</SectionLabel>
          <div className="ux2-legacy"><BuildingPage embedded tab="contacts" /></div>
        </Card>
      )}
    </div>
  );
}

export default function DirectoryTab({ snap, section, onSection, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; isBoard: boolean }) {
  const units = useFinancialStore(s => s.units);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'units';
  const tabs = [
    { id: 'units' as Section, label: 'Units & owners', badge: units.length || undefined },
    { id: 'people' as Section, label: 'Board, management & staff', badge: snap.board.length || undefined },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PillTabs size="filter" aria-label="Directory sections" value={current} onChange={onSection} tabs={tabs} />
      {current === 'units' && (
        <Card aria-label="Units and owners">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Units and owners · {units.length}</SectionLabel>
            <span className="text-xs text-ux2-muted">Balances and payments live on Funds › Income</span>
          </div>
          <div className="ux2-legacy"><TheUnitsTab variant="building" /></div>
        </Card>
      )}
      {current === 'people' && <People snap={snap} isBoard={isBoard} />}
    </div>
  );
}
