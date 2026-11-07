import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, KV, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useRunbookSwitches } from '../../boardroom/store';
import { contractRows, contractsSummary, type ContractRow, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

const STATE_TONE: Record<ContractRow['state'], 'red' | 'amber' | 'sage' | 'ghost'> = { lapsed: 'red', ending: 'amber', active: 'sage', none: 'ghost', inactive: 'ghost' };
function stateLabel(r: ContractRow): string {
  if (r.state === 'lapsed') return 'Sign renewal';
  if (r.state === 'ending') return `Renew by ${r.ends ? dayLabel(r.ends) : ''}`;
  if (r.state === 'inactive') return 'Inactive';
  return 'Active';
}

function VendorForm({ onClose }: { onClose: () => void }) {
  const add = useBuildingStore(s => s.addVendor);
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  return (
    <form aria-label="Add a vendor" onSubmit={e => { e.preventDefault(); if (!name) return; add({ name, service, contact, phone, email, contract: '', status: 'active' }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Vendor" className="min-w-[180px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Spark Electric" className={INPUT} /></Field>
      <Field label="What they do" className="w-[180px]"><input value={service} onChange={e => setService(e.target.value)} placeholder="electrician" className={INPUT} /></Field>
      <Field label="Contact" className="w-[150px]"><input value={contact} onChange={e => setContact(e.target.value)} className={INPUT} /></Field>
      <Field label="Phone" className="w-[140px]"><input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} /></Field>
      <Field label="Email" className="w-[200px]"><input value={email} onChange={e => setEmail(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name}>Add vendor</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/** Sign a renewal (lapsed or ending): a new end date and amount on the vendor's contract, or a first contract. */
function RenewForm({ r, onClose }: { r: ContractRow; onClose: () => void }) {
  const update = useVendorTrackerStore(s => s.updateContract);
  const add = useVendorTrackerStore(s => s.addContract);
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const [title, setTitle] = useState(r.contract?.title ?? `${r.service} contract`);
  const [amount, setAmount] = useState(String(r.contract?.amount ?? ''));
  const [ends, setEnds] = useState(nextYear);
  return (
    <form aria-label={`Renew ${r.vendor}`} onSubmit={e => { e.preventDefault(); if (r.contract) update(r.contract.id, { title, amount: Number(amount) || 0, endDate: ends, status: 'active', startDate: today }); else add({ vendorId: r.vendorId, vendorName: r.vendor, title, startDate: today, endDate: ends, amount: Number(amount) || 0, status: 'active', autoRenew: false, attachments: [], notes: '' }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">{r.contract ? 'Countersign the renewal' : 'Add a contract'} · {r.vendor}</div>
      <Field label="Contract" className="min-w-[200px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>
      <Field label="Amount a year" className="w-[140px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
      <Field label="Ends" className="w-[160px]"><input type="date" value={ends} onChange={e => setEnds(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">{r.contract ? 'Countersign' : 'Save'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

export default function ContractsTab({ snap, isBoard }: { snap: BuildingSnapshot; isBoard: boolean; onGo: (tab: BuildingTab, section?: string) => void }) {
  const navigate = useNavigate();
  const rows = useMemo(() => contractRows(snap), [snap]);
  const sum = contractsSummary(rows);
  const bidsOn = useRunbookSwitches(s => s.isOn('vendor-bids'));
  const setOn = useRunbookSwitches(s => s.setOn);
  const updateVendor = useBuildingStore(s => s.updateVendor);
  const [adding, setAdding] = useState(false);
  const [renewing, setRenewing] = useState<string | null>(null);
  const needs = [...sum.lapsed, ...sum.ending].slice(0, 2);
  const certs = rows.filter(r => r.state !== 'inactive');
  const signed = certs.filter(r => !!r.contract && r.state !== 'lapsed').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="m-0 text-xl font-medium text-ux2-ink">Contracts</h2><p className="m-0 text-sm text-ux2-muted">Every vendor the building pays, the contract behind each, when it ends, and the bids that replace it.</p></div>
        {isBoard && <div className="flex gap-2"><Button variant="ghost" onClick={() => navigate('/boardroom?view=new&cat=maintenance&sit=vendor-management')}>Request bids</Button><Button onClick={() => setAdding(v => !v)}>Add a vendor</Button></div>}
      </div>
      {adding && <VendorForm onClose={() => setAdding(false)} />}

      {needs.length > 0 && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">{sum.lapsed.length} lapsed · {sum.ending.length} ending in 90 days</span></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {needs.map(r => (
              <button key={r.vendorId} type="button" onClick={() => r.state === 'lapsed' ? setRenewing(renewing === r.vendorId ? null : r.vendorId) : bidsOn ? setRenewing(r.vendorId) : setOn('vendor-bids', true)} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{r.contract?.title ?? r.service} {r.state === 'lapsed' ? 'lapsed' : 'ends'} {r.ends ? dayLabel(r.ends) : ''}</span><span className="block text-xs text-ux2-muted">{r.vendor}{r.contract ? ` · ${fmt(r.contract.amount)} a year` : ''} · {r.state === 'lapsed' ? 'countersign the renewal' : bidsOn ? 'bids runbook collects 3 bids' : 'bids runbook is off, turn it on to collect 3 bids'}</span></span>
                <Chip tone={r.state === 'lapsed' ? 'red' : 'ghost'}>{r.state === 'lapsed' ? 'Countersign' : bidsOn ? 'Renew' : 'Turn on bids'}</Chip>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card aria-label="Vendors and contracts" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Vendors and contracts</SectionLabel>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ux2-muted">
            <span>Bids</span>
            <button type="button" role="switch" aria-checked={bidsOn} aria-label={`Vendor bids ${bidsOn ? 'on' : 'off'}`} onClick={() => setOn('vendor-bids', !bidsOn)} className="rounded-full"><Chip tone={bidsOn ? 'navy' : 'ghost'}>{bidsOn ? 'On' : 'Off · manual'}</Chip></button>
            <span>· vendor-bids runbook collects 3 bids when a job is over the limit</span>
            {isBoard && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Add vendor</Button>}
          </div>
        </div>
        {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">No vendors yet.</Inner> : (
          <Table minWidth={860}>
            <thead><tr><Th>Vendor</Th><Th>What they do</Th><Th>Contract</Th><Th>Ends</Th><Th num>Paid this year</Th><Th>1099</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.vendorId}>
                  <tr data-vendor={r.vendorId} className={r.state === 'inactive' ? 'opacity-60' : ''}>
                    <Td><Cell title={r.vendor} note={r.service.toLowerCase()} /></Td>
                    <Td>{r.contract?.title ?? r.service}</Td>
                    <Td>{r.contract ? `${/annual|year/i.test(r.contract.title) ? 'Annual' : 'Contract'} · ${fmt(r.contract.amount)}${r.contract.autoRenew ? ' · auto-renews' : ''}` : 'Per job'}</Td>
                    <Td className={`whitespace-nowrap ${r.state === 'lapsed' ? 'font-semibold text-ux2-red-ink' : ''}`}>{r.ends ? `${dayLabel(r.ends)}${r.state === 'lapsed' ? ' · lapsed' : ''}` : '—'}</Td>
                    <Td num className="font-semibold">{fmt(r.paidThisYear)}</Td>
                    <Td>{r.needs1099 ? <span>Yes{!r.w9OnFile && <span className="text-xs text-ux2-red-ink"> · W-9 missing</span>}</span> : <Chip tone="ghost">Under $600</Chip>}</Td>
                    <Td>
                      {isBoard && (r.state === 'lapsed' || r.state === 'ending' || r.state === 'none')
                        ? <button type="button" onClick={() => setRenewing(renewing === r.vendorId ? null : r.vendorId)} className="rounded-full"><Chip tone={STATE_TONE[r.state]}>{r.state === 'none' ? 'Add contract' : stateLabel(r)}</Chip></button>
                        : <Chip tone={STATE_TONE[r.state]}>{r.state === 'none' ? 'Per job' : stateLabel(r)}</Chip>}
                    </Td>
                  </tr>
                  {renewing === r.vendorId && <tr><td colSpan={7} className="px-3 py-2"><RenewForm r={r} onClose={() => setRenewing(null)} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        <Why>{sum.vendors} vendor{sum.vendors === 1 ? '' : 's'}. {sum.needs1099.length} {sum.needs1099.length === 1 ? 'is' : 'are'} over $600 this year, so their 1099s go out Jan 31 from Funds. Bills, work orders and payments stay in <button type="button" onClick={() => navigate('/funds?tab=expenses')} className="font-semibold text-ux2-teal hover:underline">Funds › Expenses</button>; this list is who they are and what they signed.</Why>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card aria-label="Bids" className="gap-2.5">
          <SectionLabel>Bids</SectionLabel>
          <p className="m-0 text-sm text-ux2-muted">The vendor-bids runbook collects three bids, compares them against the current contract and the budget line, and puts the choice to the board as a vote. {bidsOn ? 'It is on for this building.' : 'It is off for this building; everything else in Contracts runs on its own.'}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setOn('vendor-bids', !bidsOn)} className="rounded-full"><Chip tone="ghost">Vendor bids · {bidsOn ? 'On' : 'Off · manual'}</Chip></button>
            <button type="button" onClick={() => navigate('/funds?tab=expenses')} className="rounded-full"><Chip tone="ghost">Bills by vendor · Funds › Expenses</Chip></button>
          </div>
        </Card>
        <Card aria-label="Paperwork on file" className="gap-2.5">
          <SectionLabel>Paperwork on file</SectionLabel>
          <Inner className="py-1">
            <KV label="W-9s">{sum.needs1099.length - sum.missingW9.length} of {sum.needs1099.length} <span className="text-xs font-normal text-ux2-muted">{sum.missingW9.length ? `· ${sum.missingW9.map(r => r.vendor).join(', ')} missing · needed for the 1099 by Jan 31` : '· every vendor over $600'}</span>{isBoard && sum.missingW9[0] && <button type="button" onClick={() => updateVendor(sum.missingW9[0].vendorId, { w9OnFile: true })} className="ml-2 text-xs font-semibold text-ux2-teal hover:underline">Mark received</button>}</KV>
            <KV label="Certificates of insurance">{certs.filter(r => !!r.contract).length} of {certs.length} <span className="text-xs font-normal text-ux2-muted">· asked for with each contract</span></KV>
            <KV label="Signed contracts">{signed} of {certs.length} <span className="text-xs font-normal text-ux2-muted">{sum.lapsed.length ? `· ${sum.lapsed.map(r => (r.contract?.title ?? r.service).toLowerCase()).join(', ')} unsigned` : ''}</span></KV>
          </Inner>
          <Why>Each gap is an obligation on Building › Obligations and a Home card for the Treasurer until the file lands in Documents.</Why>
        </Card>
      </div>
    </div>
  );
}
