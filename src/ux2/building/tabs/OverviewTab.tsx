import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import BuildingPage from '@/features/building/BuildingPage';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, SectionLabel, TileSwitcher, type TileSection } from '../../components';
import { dayLabel } from '../../home/calendar';
import { daysBetween } from '../../runbook/model';
import { ISO_DATE } from '../../runbook/adapters';
import { buildingScore, contractRows, contractsSummary, documentsSummary, insuranceStatus, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

type Section = 'details' | 'insurance' | 'assets';
const SECTIONS: Section[] = ['details', 'insurance', 'assets'];

export interface NeedsYouItem {
  id: string;
  title: string;
  detail: string;
  tone: 'red' | 'amber' | 'ghost';
  action: { label: string; tab: BuildingTab; section?: string };
}

/** What needs someone on the building this week; each is also a Home card. */
export function needsYou(snap: BuildingSnapshot): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const p of insuranceStatus(snap)) {
    if (p.state === 'current') continue;
    out.push({ id: `ins:${p.id}`, title: p.state === 'lapsed' ? `${p.type} insurance has lapsed` : `Renew ${p.type} insurance before ${dayLabel(p.expires)}`, detail: `${p.carrier}${p.state === 'lapsed' ? ` · lapsed ${Math.abs(p.daysLeft)} days ago` : ` · ${p.daysLeft} days`}${p.hasCertificate ? '' : ' · no certificate on file'}`, tone: p.state === 'lapsed' ? 'red' : 'amber', action: { label: 'Open insurance', tab: 'overview', section: 'insurance' } });
  }
  const con = contractsSummary(contractRows(snap));
  for (const r of con.lapsed) out.push({ id: `con:${r.vendorId}`, title: `${r.contract?.title ?? r.service} contract lapsed ${r.ends ? dayLabel(r.ends) : ''}`, detail: `${r.vendor} · sign the renewal or close it out`, tone: 'red', action: { label: 'Contracts', tab: 'contracts' } });
  for (const r of con.ending) out.push({ id: `con:${r.vendorId}`, title: `${r.contract?.title ?? r.service} contract ends ${r.ends ? dayLabel(r.ends) : ''}`, detail: `${r.vendor} · ${r.daysLeft} days · collect bids or renew`, tone: 'amber', action: { label: 'Contracts', tab: 'contracts' } });
  const docs = documentsSummary(snap);
  for (const d of docs.reviewDue) out.push({ id: `doc:${d.id}`, title: `${d.name} is due for review`, detail: 'Marked review-due in Documents', tone: 'amber', action: { label: 'Documents', tab: 'documents', section: 'governing' } });
  return out;
}

export default function OverviewTab({ snap, section, onSection, onGo, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: BuildingTab, section?: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  const score = buildingScore(snap);
  const ins = insuranceStatus(snap);
  const docs = documentsSummary(snap);
  const assets = useBuildingStore(s => s.assets);
  const schedules = useBuildingStore(s => s.maintenanceSchedules);
  const needs = useMemo(() => needsYou(snap), [snap]);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'details';

  const visits = useMemo(() => schedules
    .filter(m => ISO_DATE.test(m.nextDue) && m.status !== 'completed')
    .map(m => ({ ...m, days: daysBetween(snap.today, m.nextDue) }))
    .filter(m => m.days >= -30 && m.days <= 120)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 6), [schedules, snap.today]);

  const worst = ins[0];
  const insTone = !worst ? 'grey' : worst.state === 'lapsed' ? 'red' : worst.state === 'expiring' ? 'navy' : 'teal';

  const sections: TileSection<Section>[] = [
    {
      id: 'details',
      tile: {
        tone: 'grey',
        label: 'Details',
        value: snap.details.totalUnits || '—',
        unit: 'units',
        sub: `${snap.address.street}, ${snap.address.city} · built ${snap.details.yearBuilt || '—'} · ${snap.details.floors || '—'} floors · ${snap.details.entityType === 'incorporated' ? 'incorporated' : 'unincorporated'}`,
        children: <div className="text-xs text-ux2-muted">{snap.managementCompany ? `Managed by ${snap.managementCompany}` : 'Self-managed · no property manager'} · counsel {snap.counselCount ? 'retained' : 'none'} · governance {score.governance}</div>,
      },
      detail: <div className="ux2-legacy"><BuildingPage embedded tab="details" /></div>,
    },
    {
      id: 'insurance',
      tile: {
        tone: insTone,
        label: 'Insurance',
        meta: worst ? (worst.state === 'current' ? 'All current' : worst.state === 'lapsed' ? 'Lapsed' : `Expires ${dayLabel(worst.expires)}`) : 'None on file',
        value: ins.length,
        unit: `polic${ins.length === 1 ? 'y' : 'ies'}`,
        sub: worst ? `${worst.type} · ${worst.carrier} · ${worst.state === 'lapsed' ? `lapsed ${Math.abs(worst.daysLeft)} days ago` : `${worst.daysLeft} days left`} · ${docs.certificates} certificate${docs.certificates === 1 ? '' : 's'} on file` : 'Add the D&O and property policies',
        children: ins.length > 1 ? (
          <ul className="m-0 list-none p-0 text-xs">
            {ins.slice(0, 3).map(p => <li key={p.id} className="flex justify-between py-0.5"><span>{p.type}</span><b className="font-semibold">{dayLabel(p.expires)}</b></li>)}
          </ul>
        ) : undefined,
      },
      detail: <div className="ux2-legacy"><BuildingPage embedded tab="insurance" /></div>,
    },
    {
      id: 'assets',
      tile: {
        tone: 'grey',
        label: 'Assets and maintenance',
        value: assets.length,
        unit: `asset${assets.length === 1 ? '' : 's'}`,
        sub: `${schedules.filter(m => m.status === 'overdue').length} overdue · ${schedules.filter(m => m.status === 'due-soon').length} due soon · ${schedules.length} schedules`,
        children: visits[0] ? <div className="text-xs text-ux2-muted">Next: {visits[0].task} · {dayLabel(visits[0].nextDue)}{visits[0].vendor ? ` · ${visits[0].vendor}` : ''}</div> : undefined,
      },
      detail: <div className="ux2-legacy"><BuildingPage embedded tab="assets" /></div>,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you">
          <div className="flex items-center justify-between">
            <SectionLabel>Needs you</SectionLabel>
            <span className="text-xs text-ux2-dim">Each is also a Home card</span>
          </div>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {needs.slice(0, 6).map(n => (
              <li key={n.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ux2-ink">{n.title}</div>
                  <div className="text-xs text-ux2-muted">{n.detail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={n.tone}>{n.tone === 'red' ? 'Overdue' : 'Due soon'}</Chip>
                  <Button size="sm" onClick={() => onGo(n.action.tab, n.action.section)}>{n.action.label}</Button>
                </div>
              </li>
            ))}
          </ul>
          {needs.length > 6 && <div className="text-xs text-ux2-dim">{needs.length - 6} more on Insurance, Contracts and Documents</div>}
        </Card>
      )}

      <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its detail below. The other two stay one tap away. The board edits; every owner can read." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card aria-label="Next vendor visits">
          <SectionLabel>Next vendor visits</SectionLabel>
          {visits.length === 0 ? <p className="text-sm text-ux2-muted">Nothing scheduled in the next four months.</p> : (
            <ul className="m-0 list-none divide-y divide-ux2-line p-0">
              {visits.map(v => (
                <li key={v.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className={`w-14 shrink-0 font-semibold ${v.days < 0 ? 'text-ux2-red-ink' : 'text-ux2-ink'}`}>{dayLabel(v.nextDue)}</span>
                  <span className="min-w-0 flex-1"><span className="text-ux2-ink">{v.task}</span><span className="text-ux2-muted">{v.vendor ? ` · ${v.vendor}` : ''}{v.estimatedCost ? ` · ${v.estimatedCost}` : ''}</span></span>
                  <Chip tone={v.status === 'overdue' ? 'red' : v.status === 'due-soon' ? 'amber' : 'ghost'}>{v.status === 'overdue' ? 'Overdue' : v.status === 'due-soon' ? 'Due soon' : 'On schedule'}</Chip>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => onSection('assets')} className="self-start text-xs font-semibold text-ux2-teal hover:underline">Maintenance calendar</button>
        </Card>
        <Card aria-label="Mailing and contact">
          <SectionLabel>Mailing address and contact</SectionLabel>
          <Inner>
            <div className="text-sm font-semibold text-ux2-ink">{snap.name}</div>
            <div className="text-sm text-ux2-muted">{snap.address.street}, {snap.address.city}, {snap.address.state} {snap.address.zip}</div>
          </Inner>
          <p className="text-xs text-ux2-muted">Notices go out by email; certified mail and the card on file for mailing live under Funds › gear › Mailing card.</p>
          {isBoard && <Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=settings&section=mailing')}>Mailing card</Button>}
        </Card>
      </div>
    </div>
  );
}
