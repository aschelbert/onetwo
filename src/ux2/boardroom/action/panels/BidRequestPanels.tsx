import { useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { fmt } from '@/lib/formatters';
import { generateLocalId } from '@/lib/generateId';
import { vendorInsuranceStatus } from '@/lib/vendorInsurance';
import { lowest, recommended, trueCost, type BidRequestData } from '@/lib/actions/bidRequest';
import { Button, Chip, Inner, KV, SectionLabel, Table, Th, Td, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM, money } from '../ActionShell';
import type { PanelProps } from '../RecordAction';

const SCOPE_FIELDS: [keyof BidRequestData['scope'], string, string][] = [
  ['what', 'What is wanted', 'Mowing, edging, beds, two seasonal plantings, leaf removal'],
  ['how', 'How it is to be done · special requirements', 'Electric equipment before 9 am; clippings removed'],
  ['frequency', 'How often', 'Weekly April to October, monthly otherwise'],
  ['hours', 'Acceptable work hours', 'Weekdays 8 am to 5 pm'],
  ['crew', 'Number of people', 'At least 2, same foreman each visit'],
  ['insurance', 'Insurance required', ''],
  ['warranty', 'Warranty', 'Plantings replaced for 12 months'],
  ['term', 'Term, or timetable to complete', 'January 1 to December 31'],
];

function Scope({ r, patch }: PanelProps<BidRequestData>) {
  const [scope, setScope] = useState(r.data.scope);
  const [due, setDue] = useState(r.data.bidsDueOn);
  const [budget, setBudget] = useState(r.data.budget ? String(r.data.budget) : '');
  const [min, setMin] = useState(String(r.data.minBids));
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SCOPE_FIELDS.map(([k, label, ph]) => <Field key={k} label={label} className={k === 'what' || k === 'how' ? 'md:col-span-2' : ''}>{k === 'what' ? <textarea aria-label={label} rows={3} value={scope[k]} placeholder={ph} onChange={e => setScope(s => ({ ...s, [k]: e.target.value }))} className={AREA} /> : <input value={scope[k]} placeholder={ph} onChange={e => setScope(s => ({ ...s, [k]: e.target.value }))} className={INPUT} />}</Field>)}
      </div>
      <div className={FORM}>
        <Field label="Bids due" className="w-[170px]"><input type="date" value={due} onChange={e => setDue(e.target.value)} className={INPUT} /></Field>
        <Field label="Budget line or estimate" className="w-[190px]"><input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="$" className={INPUT} /></Field>
        <Field label="Bids to collect" className="w-[140px]"><input inputMode="numeric" value={min} onChange={e => setMin(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!scope.what.trim() || !due} onClick={() => patch({ scope, bidsDueOn: due, budget: money(budget), minBids: Math.max(1, Math.round(Number(min)) || 3) })}>Save the scope</Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>
      </div>
      <Why>These are the headings a request for proposals carries, so every bidder prices the same job: what, how, how often, hours, crew, insurance, warranty and term. Bidders are asked for a price and references.</Why>
    </>
  );
}

function Invite({ r, patch }: PanelProps<BidRequestData>) {
  const vendors = useBuildingStore(s => s.vendors).filter(v => v.status === 'active');
  const [vendor, setVendor] = useState('');
  const [questions, setQuestions] = useState(r.data.questions);
  const today = todayIso();
  const add = (name: string) => { const v = name.trim(); if (v && !r.data.invited.some(i => i.vendor === v)) patch({ invited: [...r.data.invited, { vendor: v, sentOn: today }] }); setVendor(''); };
  const emails = r.data.invited.map(i => vendors.find(v => v.name === i.vendor)?.email).filter(Boolean).join(',');
  return (
    <>
      <SectionLabel>Invited · {r.data.invited.length} of {r.data.minBids} needed</SectionLabel>
      {r.data.invited.length > 0 && <Inner className="flex flex-col gap-1.5">{r.data.invited.map(i => <div key={i.vendor} className="flex items-center justify-between gap-2 text-sm text-ux2-ink"><span><b className="font-semibold">{i.vendor}</b> <span className="text-xs text-ux2-muted">· invited {i.sentOn}</span></span><span className="flex items-center gap-2">{r.data.bids.some(b => b.vendor === i.vendor) ? <Chip tone="sage">Bid in</Chip> : <Chip tone="ghost">Waiting</Chip>}<Button size="sm" variant="ghost" aria-label={`Remove ${i.vendor}`} onClick={() => patch({ invited: r.data.invited.filter(x => x.vendor !== i.vendor) })}>Remove</Button></span></div>)}</Inner>}
      <form onSubmit={e => { e.preventDefault(); add(vendor); }} className={FORM} aria-label="Invite a bidder">
        <Field label="Vendor" className="min-w-[220px] flex-1"><input list="bid-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="From Contracts, or a new name" className={INPUT} /><datalist id="bid-vendors">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!vendor.trim()}>Add to the invitation</Button>
        {emails && <a className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink" href={`mailto:?bcc=${encodeURIComponent(emails)}&subject=${encodeURIComponent(`Request for proposals: ${r.title}`)}&body=${encodeURIComponent(`${r.data.scope.what}\n\nBids are due ${r.data.bidsDueOn}.`)}`}>Email the scope to those with an address</a>}
      </form>
      <Field label="Bidders' questions, and the answer given to all of them"><textarea aria-label="Questions and answers" rows={3} value={questions} onChange={e => setQuestions(e.target.value)} className={AREA} /></Field>
      <div><Button size="sm" variant="ghost" disabled={questions === r.data.questions} onClick={() => patch({ questions })}>Save the answers</Button></div>
      <Why>An answer to one bidder goes to every bidder, so nobody prices the job on better information.</Why>
    </>
  );
}

function Compare({ r, patch }: PanelProps<BidRequestData>) {
  const vendors = useBuildingStore(s => s.vendors);
  const today = todayIso();
  const d = r.data;
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [addBack, setAddBack] = useState('');
  const [warranty, setWarranty] = useState('');
  const [reason, setReason] = useState(d.reason);
  const insured = (name: string) => { const v = vendors.find(x => x.name === name); const st = v ? vendorInsuranceStatus(v, today).state : 'missing'; return st === 'current' || st === 'expiring'; };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim() || !money(amount)) return;
    patch({ bids: [...d.bids, { id: generateLocalId('bid'), vendor: vendor.trim(), amount: money(amount), addBack: money(addBack), insuranceOk: insured(vendor.trim()), licenceOk: false, warranty: warranty.trim(), references: '' }] });
    setVendor(''); setAmount(''); setAddBack(''); setWarranty('');
  };
  const set = (id: string, c: Record<string, unknown>) => patch({ bids: d.bids.map(b => (b.id === id ? { ...b, ...c } : b)) });
  const low = lowest(d.bids);
  return (
    <>
      {d.bids.length > 0 && (
        <Table minWidth={760}>
          <thead><tr><Th>Bidder</Th><Th num>Price</Th><Th num>Left out</Th><Th num>True cost</Th><Th>Against {d.budget ? fmt(d.budget) : 'budget'}</Th><Th>Insured</Th><Th>Licensed</Th><Th aria-label="Recommend" /></tr></thead>
          <tbody>
            {d.bids.map(b => {
              const t = trueCost(b);
              return (
                <tr key={b.id} className={b.id === d.recommendedBidId ? 'bg-ux2-teal-tint' : ''}>
                  <Td className="font-semibold">{b.vendor}{b.warranty && <span className="block text-xs font-normal text-ux2-muted">warranty {b.warranty}</span>}</Td>
                  <Td num>{fmt(b.amount)}</Td><Td num>{b.addBack ? `+${fmt(b.addBack)}` : '—'}</Td>
                  <Td num className="font-semibold">{fmt(t)}{low?.id === b.id && d.bids.length > 1 && <span className="block text-xs font-normal text-ux2-sage">lowest</span>}</Td>
                  <Td>{d.budget ? <Chip tone={t > d.budget ? 'red' : 'sage'}>{t > d.budget ? `${fmt(t - d.budget)} over` : `${fmt(d.budget - t)} under`}</Chip> : '—'}</Td>
                  <Td><button type="button" role="switch" aria-checked={b.insuranceOk} aria-label={`${b.vendor} insured`} onClick={() => set(b.id, { insuranceOk: !b.insuranceOk })} className="rounded-full"><Chip tone={b.insuranceOk ? 'sage' : 'red'}>{b.insuranceOk ? 'Certificate on file' : 'No certificate'}</Chip></button></Td>
                  <Td><button type="button" role="switch" aria-checked={b.licenceOk} aria-label={`${b.vendor} licensed`} onClick={() => set(b.id, { licenceOk: !b.licenceOk })} className="rounded-full"><Chip tone={b.licenceOk ? 'sage' : 'ghost'}>{b.licenceOk ? 'Checked' : 'Not checked'}</Chip></button></Td>
                  <Td num>{b.id === d.recommendedBidId ? <Chip tone="navy">Recommended</Chip> : <Button size="sm" variant="ghost" onClick={() => patch({ recommendedBidId: b.id })}>Recommend</Button>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <form aria-label="Add a bid" onSubmit={add} className={FORM}>
        <Field label="Bidder" className="min-w-[180px] flex-1"><input list="bid-invited" value={vendor} onChange={e => setVendor(e.target.value)} className={INPUT} /><datalist id="bid-invited">{d.invited.map(i => <option key={i.vendor} value={i.vendor} />)}</datalist></Field>
        <Field label="Price" className="w-[120px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
        <Field label="Cost of what it leaves out" className="w-[190px]"><input inputMode="decimal" value={addBack} onChange={e => setAddBack(e.target.value)} placeholder="0 if it prices everything" className={INPUT} /></Field>
        <Field label="Warranty" className="w-[140px]"><input value={warranty} onChange={e => setWarranty(e.target.value)} className={INPUT} /></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!vendor.trim() || !money(amount)}>Add bid</Button>
      </form>
      <div className={FORM}>
        <Field label="Why the recommended bid · goes on the agenda and in the minutes" className="min-w-[280px] flex-1"><input value={reason} onChange={e => setReason(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={reason === d.reason} onClick={() => patch({ reason: reason.trim() })}>Save the reason</Button>
      </div>
      <Why>"True cost" adds back anything a bidder left out of the scope, so the lowest headline price does not win by omission. Insurance is read from the vendor's certificates under Building › Contracts when the bid is added, and can be corrected here.</Why>
    </>
  );
}

function Award({ r, patch }: PanelProps<BidRequestData>) {
  const pick = recommended(r.data);
  const [on, setOn] = useState(r.data.awardedOn || todayIso());
  const [vote, setVote] = useState(r.data.vote);
  if (!pick) return <Inner className="text-sm text-ux2-muted">Recommend a bid under "Compare like for like" first.</Inner>;
  return (
    <>
      <Inner><KV label="Recommended">{pick.vendor} · {fmt(trueCost(pick))}</KV><KV label="Why">{r.data.reason || <span className="text-ux2-muted">No reason recorded</span>}</KV><KV label="Bids compared">{r.data.bids.length}</KV></Inner>
      <div className={FORM}>
        <Field label="Awarded on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="The vote, as in the minutes" className="min-w-[220px] flex-1"><input value={vote} onChange={e => setVote(e.target.value)} placeholder="Board, 4–0, one abstained" className={INPUT} /></Field>
        <Button size="sm" disabled={!on} onClick={() => patch({ awardedOn: on, vote: vote.trim() })}>Record the award</Button>
      </div>
      <Why>A board member with a stake in a bidder says so and does not vote; note it in the vote line.</Why>
    </>
  );
}

function Contract({ r, patch, close }: PanelProps<BidRequestData>) {
  const pick = recommended(r.data);
  const vendors = useBuildingStore(s => s.vendors);
  const addVendor = useBuildingStore(s => s.addVendor);
  const addContract = useVendorTrackerStore(s => s.addContract);
  const today = todayIso();
  const [signed, setSigned] = useState(r.data.contractSignedOn || today);
  const [ends, setEnds] = useState(r.data.contractEndsOn || `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`);
  if (!pick) return <Inner className="text-sm text-ux2-muted">No bid has been recommended yet.</Inner>;
  if (r.data.contractSignedOn) return <Inner><KV label="Contract">{pick.vendor} · {fmt(pick.amount)}</KV><KV label="Signed">{r.data.contractSignedOn}</KV><KV label="Ends">{r.data.contractEndsOn || '—'}</KV><KV label="Filed under">Building › Contracts</KV></Inner>;
  const sign = () => {
    let v = vendors.find(x => x.name === pick.vendor);
    if (!v) { addVendor({ name: pick.vendor, service: r.title, contact: '', phone: '', email: '', contract: '', status: 'active' }); v = useBuildingStore.getState().vendors.find(x => x.name === pick.vendor); }
    addContract({ vendorId: v?.id ?? '', vendorName: pick.vendor, title: r.title, startDate: signed, endDate: ends, amount: pick.amount, status: 'active', autoRenew: false, attachments: [], notes: `Awarded ${r.data.awardedOn} from ${r.data.bids.length} bids. ${r.data.reason}`.trim() });
    patch({ contractSignedOn: signed, contractEndsOn: ends });
    close(signed);
  };
  return (
    <>
      <div className={FORM}>
        <Field label="Contract signed" className="w-[170px]"><input type="date" value={signed} max={today} onChange={e => setSigned(e.target.value)} className={INPUT} /></Field>
        <Field label="Contract ends" className="w-[170px]"><input type="date" value={ends} onChange={e => setEnds(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!pick.insuranceOk || !r.data.awardedOn || !signed} onClick={sign}>Sign and file the contract</Button>
      </div>
      <Why>Signing files the contract under Building › Contracts with its end date, adds the vendor if they are new, and closes this action. The scope, the bids and the award stay on its record.</Why>
    </>
  );
}

export const BID_REQUEST_PANELS = { scope: Scope, invite: Invite, compare: Compare, award: Award, contract: Contract };
