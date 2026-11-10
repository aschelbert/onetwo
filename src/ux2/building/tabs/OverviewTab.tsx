import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore, type BuildingAsset, type InsurancePolicy } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMailStore } from '@/store/useMailStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, KV, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { daysBetween } from '../../runbook/model';
import { ISO_DATE } from '../../runbook/adapters';
import { contractRows, contractsSummary, documentsSummary, insuranceStatus, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

export interface NeedsYouItem {
  id: string;
  title: string;
  detail: string;
  tone: 'red' | 'amber' | 'ghost';
  chip: string;
  action: { label: string; tab: BuildingTab; section?: string };
}

/** What needs someone on the building this week; each is also a Home card. */
export function needsYou(snap: BuildingSnapshot): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const p of insuranceStatus(snap)) {
    if (p.state === 'current') continue;
    out.push({ id: `ins:${p.id}`, title: p.state === 'lapsed' ? `${p.type} insurance has lapsed` : `Renew ${p.type} insurance before ${dayLabel(p.expires)}`, detail: `${p.carrier}${p.state === 'lapsed' ? ` · lapsed ${Math.abs(p.daysLeft)} days ago` : ` · insurance renewal runbook`}${p.hasCertificate ? '' : ' · no certificate on file'}`, tone: p.state === 'lapsed' ? 'red' : 'amber', chip: p.state === 'lapsed' ? `Lapsed ${dayLabel(p.expires)}` : `${p.daysLeft} days`, action: { label: 'Open insurance', tab: 'overview', section: 'insurance' } });
  }
  const con = contractsSummary(contractRows(snap));
  for (const r of con.lapsed) out.push({ id: `con:${r.vendorId}`, title: `Countersign the ${(r.contract?.title ?? r.service).toLowerCase()}`, detail: `${r.vendor} · lapsed ${r.ends ? dayLabel(r.ends) : ''} · sign the renewal or close it out`, tone: 'red', chip: `Overdue ${r.ends ? dayLabel(r.ends) : ''}`, action: { label: 'Contracts', tab: 'contracts' } });
  for (const r of con.ending) out.push({ id: `con:${r.vendorId}`, title: `${r.contract?.title ?? r.service} ends ${r.ends ? dayLabel(r.ends) : ''}`, detail: `${r.vendor} · collect bids or renew`, tone: 'amber', chip: `${r.daysLeft} days`, action: { label: 'Contracts', tab: 'contracts' } });
  const docs = documentsSummary(snap);
  for (const d of docs.reviewDue) out.push({ id: `doc:${d.id}`, title: `${d.name} is due for review`, detail: 'Its obligation stays open until the reviewed version is on file', tone: 'amber', chip: 'Review due', action: { label: 'Documents', tab: 'documents' } });
  return out;
}

const money = (s: string) => Number((s || '').replace(/[^0-9.]/g, '')) || 0;
const fyLabel = (mmdd: string) => { const [m, d] = (mmdd || '12-31').split('-').map(Number); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`; };

function DetailsForm({ snap, onClose }: { snap: BuildingSnapshot; onClose: () => void }) {
  const updateAddress = useBuildingStore(s => s.updateAddress);
  const updateDetails = useBuildingStore(s => s.updateDetails);
  const [street, setStreet] = useState(snap.address.street);
  const [city, setCity] = useState(snap.address.city);
  const [state, setState] = useState(snap.address.state);
  const [zip, setZip] = useState(snap.address.zip);
  const [units, setUnits] = useState(String(snap.details.totalUnits || ''));
  const [built, setBuilt] = useState(snap.details.yearBuilt);
  const [floors, setFloors] = useState(String(snap.details.floors || ''));
  const [fy, setFy] = useState(snap.details.fiscalYearEnd || '12-31');
  const [meetEvery, setMeetEvery] = useState(String(useBuildingStore.getState().details.boardMeetingEveryDays || 61));
  const [entity, setEntity] = useState<'incorporated' | 'unincorporated'>(snap.details.entityType as 'incorporated' | 'unincorporated');
  return (
    <form aria-label="Edit details" onSubmit={e => { e.preventDefault(); updateAddress({ street, city, state, zip }); updateDetails({ totalUnits: Number(units) || 0, yearBuilt: built, floors: Number(floors) || 0, fiscalYearEnd: fy, entityType: entity, boardMeetingEveryDays: Math.min(366, Math.max(7, Number(meetEvery) || 61)) }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Street" className="min-w-[220px] flex-1"><input value={street} onChange={e => setStreet(e.target.value)} className={INPUT} /></Field>
      <Field label="City" className="w-[150px]"><input value={city} onChange={e => setCity(e.target.value)} className={INPUT} /></Field>
      <Field label="State" className="w-[80px]"><input value={state} onChange={e => setState(e.target.value)} className={INPUT} /></Field>
      <Field label="ZIP" className="w-[100px]"><input value={zip} onChange={e => setZip(e.target.value)} className={INPUT} /></Field>
      <Field label="Units" className="w-[90px]"><input inputMode="numeric" value={units} onChange={e => setUnits(e.target.value)} className={INPUT} /></Field>
      <Field label="Built" className="w-[90px]"><input value={built} onChange={e => setBuilt(e.target.value)} className={INPUT} /></Field>
      <Field label="Floors" className="w-[90px]"><input inputMode="numeric" value={floors} onChange={e => setFloors(e.target.value)} className={INPUT} /></Field>
      <Field label="FY ends (MM-DD)" className="w-[130px]"><input value={fy} onChange={e => setFy(e.target.value)} className={INPUT} /></Field>
      <Field label="Board meets every (days)" className="w-[170px]"><input inputMode="numeric" value={meetEvery} onChange={e => setMeetEvery(e.target.value)} className={INPUT} /></Field>
      <Field label="Entity" className="w-[170px]"><select value={entity} onChange={e => setEntity(e.target.value as 'incorporated' | 'unincorporated')} className={INPUT}><option value="incorporated">Incorporated</option><option value="unincorporated">Unincorporated</option></select></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function PolicyForm({ onClose }: { onClose: () => void }) {
  const add = useBuildingStore(s => s.addInsurance);
  const [type, setType] = useState('');
  const [carrier, setCarrier] = useState('');
  const [coverage, setCoverage] = useState('');
  const [premium, setPremium] = useState('');
  const [expires, setExpires] = useState('');
  return (
    <form aria-label="Add a policy" onSubmit={e => { e.preventDefault(); if (!type) return; add({ type, carrier, coverage, premium, expires, policyNum: '' }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Policy" className="min-w-[180px] flex-1"><input value={type} onChange={e => setType(e.target.value)} placeholder="D&O" className={INPUT} /></Field>
      <Field label="Carrier" className="w-[160px]"><input value={carrier} onChange={e => setCarrier(e.target.value)} className={INPUT} /></Field>
      <Field label="Limit" className="w-[120px]"><input value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="$2,000,000" className={INPUT} /></Field>
      <Field label="Premium" className="w-[120px]"><input value={premium} onChange={e => setPremium(e.target.value)} placeholder="$3,200/yr" className={INPUT} /></Field>
      <Field label="Expires" className="w-[150px]"><input type="date" value={expires} onChange={e => setExpires(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!type}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function AssetForm({ onClose }: { onClose: () => void }) {
  const add = useBuildingStore(s => s.addAsset);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<BuildingAsset['category']>('Mechanical');
  const [condition, setCondition] = useState<BuildingAsset['condition']>('Good');
  const [installed, setInstalled] = useState('');
  const [life, setLife] = useState('');
  const [cost, setCost] = useState('');
  return (
    <form aria-label="Add asset" onSubmit={e => { e.preventDefault(); if (!name) return; const years = Number(life) || 20; const age = installed ? Math.max(0, new Date().getFullYear() - Number(installed.slice(0, 4))) : 0; add({ name, category, location: '', condition, installedDate: installed, originalCost: Number(cost) || 0, usefulLifeYears: years, remainingLifeYears: Math.max(0, years - age), replacementCostToday: Number(cost) || 0, inflationRate: 3, criticality: 'Medium', annualMaintenanceCost: 0, annualOperatingCost: 0, parentAssetId: null, reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [], vendorIds: [], insurancePolicyIds: [], amenityConfigId: '', glAccountNum: '', budgetCategoryId: '', spendingApprovalIds: [], conditionHistory: [], warranties: [], notes: '', insuredValue: Number(cost) || 0 }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Asset" className="min-w-[180px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Boiler" className={INPUT} /></Field>
      <Field label="Category" className="w-[150px]"><select value={category} onChange={e => setCategory(e.target.value as BuildingAsset['category'])} className={INPUT}>{['Mechanical', 'Amenity', 'Safety', 'Technology', 'Common Area', 'Landscaping'].map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Condition" className="w-[130px]"><select value={condition} onChange={e => setCondition(e.target.value as BuildingAsset['condition'])} className={INPUT}>{['Excellent', 'Good', 'Fair', 'Poor', 'Critical'].map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Installed" className="w-[150px]"><input type="date" value={installed} onChange={e => setInstalled(e.target.value)} className={INPUT} /></Field>
      <Field label="Useful life (years)" className="w-[130px]"><input inputMode="numeric" value={life} onChange={e => setLife(e.target.value)} className={INPUT} /></Field>
      <Field label="Replacement cost" className="w-[140px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

const CONDITION_TONE: Record<string, 'sage' | 'amber' | 'red' | 'ghost'> = { Excellent: 'sage', Good: 'sage', Fair: 'amber', Poor: 'red', Critical: 'red' };

export default function OverviewTab({ snap, section, onGo, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: BuildingTab, section?: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  const ins = insuranceStatus(snap);
  const docs = documentsSummary(snap);
  const assets = useBuildingStore(s => s.assets);
  const schedules = useBuildingStore(s => s.maintenanceSchedules);
  const management = useBuildingStore(s => s.management);
  const counsel = useBuildingStore(s => s.legalCounsel);
  const boardMeetingEveryDays = useBuildingStore(s => s.details.boardMeetingEveryDays || 61);
  const reserveItems = useFinancialStore(s => s.reserveItems);
  const units = useFinancialStore(s => s.units);
  const mailing = useMailStore(s => s.mailingSettings);
  const cases = useIssuesStore(s => s.cases);
  const needs = useMemo(() => needsYou(snap), [snap]);
  const [editing, setEditing] = useState<boolean>(false);
  const [addingPolicy, setAddingPolicy] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const year = Number(snap.today.slice(0, 4));

  const visits = useMemo(() => schedules
    .filter(m => ISO_DATE.test(m.nextDue) && m.status !== 'completed')
    .map(m => ({ ...m, days: daysBetween(snap.today, m.nextDue) }))
    .filter(m => m.days >= -30 && m.days <= 120)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 4), [schedules, snap.today]);

  const worst = ins[0];
  const premium = snap.insurance.reduce((t, p) => t + money(p.premium), 0);
  const carriers = Array.from(new Set(snap.insurance.map(p => p.carrier).filter(Boolean)));
  const renewalCase = cases.find(c => c.status !== 'closed' && /insur/i.test(`${c.sitId} ${c.title}`));
  const withEmail = units.filter(u => u.email).length;
  const limits = (p?: InsurancePolicy) => (p ? `${p.type.replace(/\s*\(.*\)/, '')} ${p.coverage}` : '');

  const assetRows = assets.map(a => {
    const sched = schedules.filter(s => a.maintenanceScheduleIds.includes(s.id) && s.status !== 'completed').sort((x, y) => x.nextDue.localeCompare(y.nextDue))[0];
    const reserve = reserveItems.find(r => r.id === a.reserveItemId);
    const replaceYear = reserve ? year + Math.max(0, Math.round(reserve.yearsRemaining)) : a.remainingLifeYears ? year + a.remainingLifeYears : undefined;
    const vendor = sched?.vendor || '';
    return { a, sched, replaceYear, cost: reserve?.estimatedCost ?? a.replacementCostToday, vendor };
  });

  return (
    <div className="flex flex-col gap-5">
      {isBoard && <HeaderActions><Button variant="ghost" onClick={() => setEditing(v => !v)}>Edit details</Button><Button onClick={() => setAddingAsset(v => !v)}>Add asset</Button></HeaderActions>}
      {editing && <DetailsForm snap={snap} onClose={() => setEditing(false)} />}
      {addingAsset && <AssetForm onClose={() => setAddingAsset(false)} />}

      {needs.length > 0 && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">{needs.length === 1 ? 'Also a Home card for the Treasurer' : 'Each is also a Home card for the Treasurer'}</span></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {needs.slice(0, 4).map(n => (
              <button key={n.id} type="button" onClick={() => onGo(n.action.tab, n.action.section)} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{n.title}</span><span className="block text-xs text-ux2-muted">{n.detail}</span></span>
                <Chip tone={n.tone}>{n.chip}</Chip>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card aria-label="Details" className="gap-2.5">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Details</SectionLabel>{isBoard && <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-ux2-teal hover:underline">Edit</button>}</div>
          <Inner className="py-1">
            <KV label="Address">{snap.address.street}, {snap.address.city}, {snap.address.state} {snap.address.zip}</KV>
            <KV label="Units">{snap.details.totalUnits || '—'}{snap.details.floors ? ` · ${snap.details.floors} floors` : ''}</KV>
            <KV label="Built">{snap.details.yearBuilt || '—'}</KV>
            <KV label="Management">{management.company || 'Self-managed'} <Chip tone="ghost" className="ml-1.5">{management.company ? management.contact || 'Manager' : 'No manager'}</Chip></KV>
            <KV label="Fiscal year ends">{fyLabel(snap.details.fiscalYearEnd)}</KV>
            <KV label="Board meets">every {boardMeetingEveryDays} days <span className="text-xs font-normal text-ux2-muted">per the bylaws · the Board meeting cycle runbook follows it</span></KV>
            <KV label="Legal entity">{snap.name} <span className="text-xs font-normal text-ux2-muted">{snap.details.entityType === 'incorporated' ? `${snap.address.state || 'DC'} nonprofit` : 'unincorporated association'}</span></KV>
            <KV label="Registered agent">{counsel[0] ? <>{counsel[0].firm} <span className="text-xs font-normal text-ux2-muted">counsel</span></> : <span className="text-ux2-muted">None on file</span>}</KV>
          </Inner>
          <Why>Legal entity and agent feed the filing runbooks and the 1099s, so nobody types them twice. <span className="text-ux2-dim">DC Code § 29-1101 et seq.</span></Why>
        </Card>

        <Card aria-label="Insurance" className="gap-2.5">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Insurance</SectionLabel>{worst ? <Chip tone={worst.state === 'lapsed' ? 'red' : worst.state === 'expiring' ? 'amber' : 'sage'}>{worst.state === 'lapsed' ? `Lapsed ${dayLabel(worst.expires)}` : worst.state === 'expiring' ? `Expires ${dayLabel(worst.expires)}` : 'All current'}</Chip> : <Chip tone="ghost">None on file</Chip>}</div>
          <Inner className="py-1">
            <KV label="Policies">{snap.insurance.length ? `${snap.insurance.map(p => p.type.replace(/\s*\(.*\)/, '')).slice(0, 3).join(' + ')}${snap.insurance.length > 3 ? ` + ${snap.insurance.length - 3} more` : ''} · ${carriers.length === 1 ? 'one carrier' : `${carriers.length} carriers`}` : '—'}</KV>
            <KV label="Carrier">{carriers.slice(0, 2).join(', ') || '—'}</KV>
            <KV label="Limits">{snap.insurance.slice(0, 2).map(p => limits(p)).join(' · ') || '—'}</KV>
            <KV label="Premium">{premium ? `${fmt(premium)} / year` : '—'}</KV>
            <KV label="Certificates">{docs.certificates} on file <span className="text-xs font-normal text-ux2-muted">· in Documents</span></KV>
            {worst && <KV label="Next expiry">{worst.type.replace(/\s*\(.*\)/, '')} · {dayLabel(worst.expires)}</KV>}
          </Inner>
          {worst && worst.state !== 'current' ? (
            <button type="button" onClick={() => renewalCase ? navigate(`/issues?view=case:${renewalCase.id}`) : navigate('/boardroom?view=new&cat=legal&sit=insurance-claims')} className="flex items-center justify-between gap-3 rounded-[14px] bg-ux2-navy px-3.5 py-3 text-left text-white">
              <span className="min-w-0 text-sm"><b className="font-semibold">Renewal runbook{renewalCase?.steps ? ` · step ${Math.max(1, renewalCase.steps.findIndex(s => !s.done) + 1)} of ${renewalCase.steps.length}` : ''}</b><span className="block text-xs text-white/[0.7]">{renewalCase ? `${renewalCase.id} · ${renewalCase.title}` : `${worst.type} ${worst.state === 'lapsed' ? 'lapsed' : 'expires'} ${dayLabel(worst.expires)} · start the renewal and compare quotes`} <span className="text-white/[0.5]">DC Code § 42-1903.10</span></span></span>
              <Chip tone="white" className="!bg-white !text-ux2-navy">Open</Chip>
            </button>
          ) : isBoard ? <Button size="sm" variant="ghost" className="self-start" onClick={() => setAddingPolicy(v => !v)}>Add a policy</Button> : null}
          {addingPolicy && <PolicyForm onClose={() => setAddingPolicy(false)} />}
        </Card>
      </div>

      <Card aria-label="Assets and maintenance" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Assets and maintenance</SectionLabel><span className="text-xs text-ux2-muted">Replacement years come from the reserve study · <button type="button" onClick={() => navigate('/funds?tab=planning&section=reserves')} className="font-semibold text-ux2-teal hover:underline">Reserve plan</button></span></div>
        {assetRows.length === 0 ? <Inner className="text-sm text-ux2-muted">No assets yet. Add the roof, boiler and elevator so their replacement years and vendors sit here.</Inner> : (
          <Table minWidth={800}>
            <thead><tr><Th>Asset</Th><Th>Condition</Th><Th>Replace</Th><Th>Vendor</Th><Th>Next</Th><Th>Status</Th></tr></thead>
            <tbody>
              {assetRows.map(({ a, sched, replaceYear, cost, vendor }) => (
                <tr key={a.id}>
                  <Td><Cell title={a.name} note={`${a.category.toLowerCase()}${a.location ? ` · ${a.location}` : ''}${a.installedDate ? ` · installed ${a.installedDate.slice(0, 4)}` : ''}`} /></Td>
                  <Td>{a.condition}</Td>
                  <Td>{replaceYear ? `${replaceYear}${cost ? ` · ${fmt(cost)}` : ''}` : 'Not scheduled'}</Td>
                  <Td>{vendor || <span className="text-ux2-muted">—</span>}</Td>
                  <Td>{sched ? `${sched.task} · ${dayLabel(sched.nextDue)}` : <span className="text-ux2-muted">Nothing due</span>}</Td>
                  <Td>{sched ? <Chip tone={sched.status === 'overdue' ? 'red' : sched.status === 'due-soon' ? 'amber' : 'sage'}>{sched.status === 'overdue' ? 'Overdue' : sched.status === 'due-soon' ? 'Due soon' : 'On schedule'}</Chip> : <Chip tone={CONDITION_TONE[a.condition] ?? 'ghost'}>{a.condition === 'Fair' || a.condition === 'Poor' || a.condition === 'Critical' ? `Watch · ${a.condition.toLowerCase()}` : 'Nothing due'}</Chip>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Next vendor visits</SectionLabel><button type="button" onClick={() => navigate('/home?view=calendar')} className="text-xs font-semibold text-ux2-teal hover:underline">Open in the calendar</button></div>
        {visits.length === 0 ? <p className="m-0 text-sm text-ux2-muted">Nothing scheduled in the next four months.</p> : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {visits.slice(0, 3).map(v => (
              <Inner key={v.id} className="flex items-center justify-between gap-2">
                <Cell title={`${dayLabel(v.nextDue)} · ${v.vendor || 'Building staff'}`} note={`${v.task}${v.estimatedCost ? ` · ${v.estimatedCost}` : ''}`} />
                <Chip tone={/elevator|boiler|water|heat|fire/i.test(v.task) ? 'navy' : 'ghost'}>{/elevator|boiler|water|heat|fire/i.test(v.task) ? 'Everyone' : 'Board only'}</Chip>
              </Inner>
            ))}
          </div>
        )}
      </Card>

      <Card aria-label="Mailing address and contact" className="gap-2.5">
        <div className="flex items-center justify-between gap-2"><SectionLabel>Mailing address and contact preferences</SectionLabel>{isBoard && <button type="button" onClick={() => navigate('/funds?tab=settings&section=mailing')} className="text-xs font-semibold text-ux2-teal hover:underline">Edit</button>}</div>
        <Inner className="py-1">
          <KV label="Mail to"><span className="text-right">{mailing.senderName || snap.name}<span className="block text-xs font-normal text-ux2-muted">{mailing.senderAddress?.line1 ? `${mailing.senderAddress.line1}, ${mailing.senderAddress.city}, ${mailing.senderAddress.state} ${mailing.senderAddress.zip}` : `${snap.address.street}, ${snap.address.city}, ${snap.address.state} ${snap.address.zip}`}</span></span></KV>
          <KV label="Reply address">{management.email || snap.board[0]?.email || '—'}</KV>
          <KV label="Notices to owners">Email · {withEmail} units <span className="text-xs font-normal text-ux2-muted">· paper for {Math.max(0, units.length - withEmail)} without email</span></KV>
          <KV label="Demand letters">Certified mail + email <span className="text-xs font-normal text-ux2-muted">· DC Code § 42-1903.13</span></KV>
          <KV label="Meeting notices">10 days before <span className="text-xs font-normal text-ux2-muted">· bylaws · DC minimum 48 hours</span></KV>
          <KV label="Phone">{management.phone || snap.board[0]?.phone || '—'} <span className="text-xs font-normal text-ux2-muted">· {management.company ? 'the manager' : 'rings the President'}</span></KV>
        </Inner>
        <Why>The outbox in Board Room uses these when it sends; owners change their own preference in Me.</Why>
      </Card>
    </div>
  );
}
