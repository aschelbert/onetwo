import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { generateLocalId } from '@/lib/generateId';
import {
  FUNDING_LABEL, PERMIT_QUESTIONS, awardedBid, bidsNeeded, chosenOption, extraPaybackYears, fundingEffects, paybackYears, permitNeeded, projectCost, projectSteps,
  type CapitalProject, type FundingSource, type ProjectStep, type StepKey,
} from '@/lib/capitalProject';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, KV, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { awardContract, closeOut, signOffWork, spendingLimit } from '../capitalImprovement';
import { CAPITAL_HOW } from '../capitalPlan';

const num = (s: string) => Math.max(0, Math.round((Number(String(s).replace(/[^0-9.]/g, '')) || 0) * 100) / 100);
const AREA = 'w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm';
const FORM = 'flex flex-wrap items-end gap-3';
type PanelProps = { p: CapitalProject; step: ProjectStep; patch: (c: Partial<Omit<CapitalProject, 'id'>>) => void };

function NeedPanel({ p, patch }: PanelProps) {
  const assets = useBuildingStore(s => s.assets);
  const reserves = useFinancialStore(s => s.reserveItems);
  const [need, setNeed] = useState(p.need);
  return (
    <>
      <textarea aria-label="Why the job is needed" value={need} onChange={e => setNeed(e.target.value)} rows={3} placeholder="What is wrong or wearing out, how it was found, and what happens if nothing is done" className={AREA} />
      <div className={FORM}>
        <Field label="The asset it replaces or improves" className="min-w-[220px] flex-1"><select value={p.assetId} onChange={e => { const a = assets.find(x => x.id === e.target.value); patch({ assetId: e.target.value, reserveItemId: a?.reserveItemId || p.reserveItemId }); }} className={INPUT}><option value="">None, or not on the asset list</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name} · {a.condition.toLowerCase()}</option>)}</select></Field>
        <Field label="Its reserve component" className="min-w-[220px] flex-1"><select value={p.reserveItemId} onChange={e => patch({ reserveItemId: e.target.value })} className={INPUT}><option value="">None: an improvement, nothing replaced</option>{reserves.filter(r => !r.isContingency).map(r => <option key={r.id} value={r.id}>{r.name} · {fmt(r.estimatedCost)}</option>)}</select></Field>
        <Button size="sm" disabled={!need.trim() || need === p.need} onClick={() => patch({ need: need.trim() })}>Save</Button>
      </div>
      <Why>Tying the project to its reserve component is what lets the close-out reset that component: new cost, full life, nothing set aside.</Why>
    </>
  );
}

function OptionsPanel({ p, patch }: PanelProps) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [rebate, setRebate] = useState('');
  const [saves, setSaves] = useState('');
  const [reason, setReason] = useState(p.optionReason);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    patch({ options: [...p.options, { id: generateLocalId('opt'), name: name.trim(), cost: num(cost), rebate: num(rebate), savesPerYear: num(saves), notes: '' }] });
    setName(''); setCost(''); setRebate(''); setSaves('');
  };
  return (
    <>
      {p.options.length > 0 && (
        <Table minWidth={620}>
          <thead><tr><Th>Option</Th><Th num>Cost</Th><Th num>Rebate</Th><Th num>Saves a year</Th><Th>Pays back</Th><Th aria-label="Choose" /></tr></thead>
          <tbody>
            {p.options.map(o => {
              const own = paybackYears(o), extra = extraPaybackYears(o, p.options);
              return (
                <tr key={o.id} className={o.id === p.chosenOptionId ? 'bg-ux2-teal-tint' : ''}>
                  <Td className="font-semibold">{o.name}</Td><Td num>{fmt(o.cost)}</Td><Td num>{o.rebate ? fmt(o.rebate) : '—'}</Td><Td num>{o.savesPerYear ? fmt(o.savesPerYear) : '—'}</Td>
                  <Td>{extra != null ? <Chip tone={extra <= 3 ? 'sage' : 'amber'}>Extra pays back in {extra} years</Chip> : own != null ? <Chip tone={own <= 3 ? 'sage' : 'amber'}>{own} years</Chip> : <span className="text-ux2-muted">No saving</span>}</Td>
                  <Td num><span className="flex justify-end gap-1.5">{o.id === p.chosenOptionId ? <Chip tone="navy">Chosen</Chip> : <Button size="sm" variant="ghost" onClick={() => patch({ chosenOptionId: o.id })}>Choose</Button>}<Button size="sm" variant="ghost" aria-label={`Remove ${o.name}`} onClick={() => patch({ options: p.options.filter(x => x.id !== o.id), chosenOptionId: p.chosenOptionId === o.id ? '' : p.chosenOptionId })}>Remove</Button></span></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <form aria-label="Add an option" onSubmit={add} className={FORM}>
        <Field label="Option" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Same again · a better unit · do nothing this year" className={INPUT} /></Field>
        <Field label="Cost" className="w-[120px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} className={INPUT} /></Field>
        <Field label="Rebate" className="w-[110px]"><input inputMode="decimal" value={rebate} onChange={e => setRebate(e.target.value)} className={INPUT} /></Field>
        <Field label="Saves a year" className="w-[120px]"><input inputMode="decimal" value={saves} onChange={e => setSaves(e.target.value)} className={INPUT} /></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!name.trim()}>Add option</Button>
      </form>
      <div className={FORM}>
        <Field label="Why the chosen one · goes in the minutes" className="min-w-[260px] flex-1"><input value={reason} onChange={e => setReason(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={reason === p.optionReason} onClick={() => patch({ optionReason: reason.trim() })}>Save the reason</Button>
      </div>
      <Why>List "same again", anything better, and doing nothing, so each one's cost is seen. Payback is cost less rebate over what it saves a year; for a dearer option it is the extra cost over the extra saving, against the cheapest on the list.</Why>
    </>
  );
}

function FundingPanel({ p, patch }: PanelProps) {
  const units = useFinancialStore(s => s.units.length);
  const reserveNeeded = useFinancialStore(s => s.reserveItems.reduce((t, r) => t + r.estimatedCost, 0));
  const getBalanceSheet = useFinancialStore(s => s.getBalanceSheet);
  const ledger = useFinancialStore(s => s.generalLedger);
  const cash = useMemo(() => (getBalanceSheet() as { assets: { operating: number; reserves: number } }).assets, [getBalanceSheet, ledger]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = projectCost(p);
  const [decidedOn, setDecidedOn] = useState(p.funding.decidedOn || todayIso());
  const [vote, setVote] = useState(p.funding.vote);
  const rows = fundingEffects(amount, { units, reserveCash: cash?.reserves ?? 0, reserveNeeded, operatingCash: cash?.operating ?? 0 });
  return (
    <>
      <Table minWidth={620}>
        <thead><tr><Th>Way to pay · {fmt(amount)}</Th><Th>What it does</Th><Th>Who decides</Th><Th aria-label="Choose" /></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.source} className={p.funding.source === r.source ? 'bg-ux2-teal-tint' : ''}>
              <Td className="font-semibold">{FUNDING_LABEL[r.source]}</Td><Td>{r.effect}</Td><Td>{r.decides}</Td>
              <Td num>{p.funding.source === r.source ? <Chip tone="navy">Chosen</Chip> : <Button size="sm" variant="ghost" disabled={!r.possible} onClick={() => patch({ funding: { ...p.funding, source: r.source as FundingSource } })}>Choose</Button>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className={FORM}>
        <Field label="Decided on" className="w-[170px]"><input type="date" value={decidedOn} max={todayIso()} onChange={e => setDecidedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="The vote, as in the minutes" className="min-w-[240px] flex-1"><input value={vote} onChange={e => setVote(e.target.value)} placeholder="Board, 5–0 · or owners, 34 of 50" className={INPUT} /></Field>
        <Button size="sm" disabled={!p.funding.source || !decidedOn} onClick={() => patch({ funding: { source: p.funding.source, decidedOn, vote: vote.trim() } })}>Record the decision</Button>
      </div>
      <Why>The reserve and cash figures are this building's, from Funds, today. A special assessment or a loan needs the owners' vote; the loan line is an illustration at 7% over 7 years until a lender quotes.</Why>
    </>
  );
}

function PermitPanel({ p, patch }: PanelProps) {
  const [answers, setAnswers] = useState<string[]>(p.permit.answers);
  const [pulledBy, setPulledBy] = useState(p.permit.pulledBy);
  const [number, setNumber] = useState(p.permit.number);
  const [issuedOn, setIssuedOn] = useState(p.permit.issuedOn);
  const [finalOn, setFinalOn] = useState(p.permit.finalInspectionOn);
  const needed = answers.length > 0;
  const toggle = (id: string) => setAnswers(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  return (
    <>
      <Inner className="flex flex-col gap-2">
        {PERMIT_QUESTIONS.map(q => (
          <label key={q.id} className="flex items-start gap-2.5 text-sm text-ux2-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={answers.includes(q.id)} onChange={() => toggle(q.id)} /><span>{q.label}{q.also && answers.includes(q.id) && <span className="block text-xs text-ux2-amber">{q.also}</span>}</span></label>
        ))}
      </Inner>
      <Inner className={needed ? 'border-ux2-teal' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">{needed ? 'A building permit is needed' : 'No permit is needed, on these answers'}</b>{needed && <Chip tone={number.trim() ? 'sage' : 'amber'}>{number.trim() ? 'On file' : 'Not on file yet'}</Chip>}</div>
        {needed && (
          <div className={`${FORM} mt-2`}>
            <Field label="Who pulls it" className="w-[230px]"><select value={pulledBy} onChange={e => setPulledBy(e.target.value as 'contractor' | 'association')} className={INPUT}><option value="contractor">The contractor, as a term of the scope</option><option value="association">The association</option></select></Field>
            <Field label="Permit number" className="w-[170px]"><input value={number} onChange={e => setNumber(e.target.value)} className={INPUT} /></Field>
            <Field label="Issued" className="w-[160px]"><input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} className={INPUT} /></Field>
            <Field label="Final inspection passed" className="w-[180px]"><input type="date" value={finalOn} onChange={e => setFinalOn(e.target.value)} className={INPUT} /></Field>
          </div>
        )}
      </Inner>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Why className="min-w-[240px] flex-1">{needed ? 'Work cannot be marked started until the permit number is entered, and the final payment waits on the permit\'s final inspection. Come back to this step to enter them.' : 'Answering is the step. With every box clear, "no permit needed" goes on the record.'} The permit office decides in the end; these questions are the District's list of work that usually needs one.</Why>
        <Button size="sm" onClick={() => patch({ permit: { answered: true, answers, pulledBy, number: needed ? number.trim() : '', issuedOn: needed ? issuedOn : '', finalInspectionOn: needed ? finalOn : '' } })}>{p.permit.answered ? 'Save' : 'Save the answers'}</Button>
      </div>
    </>
  );
}

function BidsPanel({ p, patch }: PanelProps) {
  const vendors = useBuildingStore(s => s.vendors);
  const wanted = bidsNeeded(p, spendingLimit());
  const [scope, setScope] = useState(p.scope || (permitNeeded(p) && p.permit.pulledBy === 'contractor' ? 'The contractor obtains the building permit and books its inspections.\n' : ''));
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [meets, setMeets] = useState(true);
  const [insured, setInsured] = useState(false);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim() || !num(amount)) return;
    patch({ bids: [...p.bids, { id: generateLocalId('bid'), vendor: vendor.trim(), amount: num(amount), meetsScope: meets, insuranceOk: insured, notes: '' }] });
    setVendor(''); setAmount(''); setMeets(true); setInsured(false);
  };
  return (
    <>
      <Field label="Scope of work · what every bidder prices"><textarea aria-label="Scope of work" value={scope} onChange={e => setScope(e.target.value)} rows={5} placeholder="What is to be done and how · work hours · timetable · insurance required · warranty · when bids are due" className={AREA} /></Field>
      <div><Button size="sm" disabled={!scope.trim() || scope.trim() === p.scope} onClick={() => patch({ scope: scope.trim() })}>Save the scope</Button></div>
      <SectionLabel>Bids · {p.bids.length} of {wanted} needed</SectionLabel>
      {p.bids.length > 0 && (
        <Table minWidth={560}>
          <thead><tr><Th>Bidder</Th><Th num>Price</Th><Th>Whole scope</Th><Th>Insurance certificate</Th><Th aria-label="Remove" /></tr></thead>
          <tbody>{p.bids.map(b => <tr key={b.id}><Td className="font-semibold">{b.vendor}</Td><Td num>{fmt(b.amount)}</Td><Td>{b.meetsScope ? 'Yes' : <Chip tone="amber">Leaves something out</Chip>}</Td><Td>{b.insuranceOk ? <Chip tone="sage">On file</Chip> : <Chip tone="red">None</Chip>}</Td><Td num><Button size="sm" variant="ghost" aria-label={`Remove ${b.vendor}'s bid`} disabled={p.awardedBidId === b.id} onClick={() => patch({ bids: p.bids.filter(x => x.id !== b.id) })}>Remove</Button></Td></tr>)}</tbody>
        </Table>
      )}
      <form aria-label="Add a bid" onSubmit={add} className={FORM}>
        <Field label="Bidder" className="min-w-[200px] flex-1"><input list="project-vendors" value={vendor} onChange={e => setVendor(e.target.value)} className={INPUT} /><datalist id="project-vendors">{vendors.filter(v => v.status === 'active').map(v => <option key={v.id} value={v.name} />)}</datalist></Field>
        <Field label="Price" className="w-[130px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={meets} onChange={e => setMeets(e.target.checked)} />Prices the whole scope</label>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={insured} onChange={e => setInsured(e.target.checked)} />Certificate on file</label>
        <Button type="submit" size="sm" variant="ghost" disabled={!vendor.trim() || !num(amount)}>Add bid</Button>
      </form>
      <Why>{wanted > 1 ? `Over the ${fmt(spendingLimit())} limit, so three bids are needed.` : 'Under the spending limit, so one bid is enough.'} Every bidder gets the same scope, so the prices can be compared.</Why>
    </>
  );
}

function AwardPanel({ p, step }: PanelProps) {
  const [bidId, setBidId] = useState(p.awardedBidId || [...p.bids].filter(b => b.meetsScope).sort((a, b) => a.amount - b.amount)[0]?.id || '');
  const [reason, setReason] = useState(p.awardReason);
  const [signedOn, setSignedOn] = useState(p.contractSignedOn || todayIso());
  const bid = p.bids.find(b => b.id === bidId);
  const budget = chosenOption(p)?.cost ?? 0;
  if (p.bids.length === 0) return <Inner className="text-sm text-ux2-muted">No bids yet. Add them under "Scope of work and bids".</Inner>;
  return (
    <>
      <Inner className="flex flex-col gap-2">
        {p.bids.map(b => (
          <label key={b.id} className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ux2-ink">
            <span className="flex items-center gap-2.5"><input type="radio" name="award" className="h-5 w-5" checked={bidId === b.id} disabled={!!p.contractSignedOn} onChange={() => setBidId(b.id)} /><b className="font-semibold">{b.vendor}</b> {fmt(b.amount)}{budget > 0 && b.amount > budget ? <Chip tone="amber">{fmt(b.amount - budget)} over the option's cost</Chip> : null}</span>
            <span className="flex gap-1.5">{!b.meetsScope && <Chip tone="amber">Leaves something out</Chip>}{b.insuranceOk ? <Chip tone="sage">Insured</Chip> : <Chip tone="red">No certificate</Chip>}</span>
          </label>
        ))}
      </Inner>
      {bid && !bid.insuranceOk && <div role="alert" className="rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink">{bid.vendor} has no certificate of insurance on file. The contract waits on it: tick "Certificate on file" on the bid once it arrives.</div>}
      {p.contractSignedOn ? <Inner><KV label="Awarded to">{awardedBid(p)?.vendor} · {fmt(awardedBid(p)?.amount ?? 0)}</KV><KV label="Contract signed">{p.contractSignedOn}</KV><KV label="Work order">{p.workOrderId || '—'}</KV>{p.awardReason && <KV label="Why">{p.awardReason}</KV>}</Inner> : (
        <div className={FORM}>
          <Field label="Why this bid · goes in the minutes" className="min-w-[240px] flex-1"><input value={reason} onChange={e => setReason(e.target.value)} className={INPUT} /></Field>
          <Field label="Contract signed" className="w-[170px]"><input type="date" value={signedOn} max={todayIso()} onChange={e => setSignedOn(e.target.value)} className={INPUT} /></Field>
          <Button size="sm" disabled={!bid || !bid.insuranceOk || !signedOn} onClick={() => awardContract(p.id, bidId, reason, signedOn)}>Award and raise the work order</Button>
        </div>
      )}
      <Why>Awarding raises an approved work order for the contract price, so the bill is paid through Funds like any other. {step.waitsOn ? `Waiting on ${step.waitsOn}.` : ''}</Why>
    </>
  );
}

function OwnersPanel({ p, patch }: PanelProps) {
  const navigate = useNavigate();
  const [on, setOn] = useState(p.ownersToldOn || todayIso());
  return (
    <>
      <div className={FORM}>
        <Field label="Owners were told on" className="w-[180px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!on} onClick={() => patch({ ownersToldOn: on, ownersNotAffected: false })}>Record the notice</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=notices')}>Write the notice</Button>
        <Button size="sm" variant="ghost" onClick={() => patch({ ownersNotAffected: true, ownersToldOn: '' })}>Owners are not affected</Button>
      </div>
      <Why>What is being done, when, what will be closed or noisy, and who to call. A job that changes nothing for owners can skip the notice; that is recorded too.</Why>
    </>
  );
}

function WorkPanel({ p, patch, step }: PanelProps) {
  const [on, setOn] = useState(p.workStartedOn || todayIso());
  return (
    <>
      {step.waitsOn && <div role="alert" className="rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink">Work cannot be marked started yet: waiting on {step.waitsOn}.</div>}
      <div className={FORM}>
        <Field label="Work started" className="w-[180px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !on} onClick={() => patch({ workStartedOn: on })}>Record the start</Button>
      </div>
      <Why>Look at the work while it is in progress, not only at the end: some of it will be hidden once it is finished. {permitNeeded(p) ? `Permit ${p.permit.number || 'not yet on file'}; its inspections are booked by ${p.permit.pulledBy === 'contractor' ? 'the contractor' : 'the association'}.` : ''}</Why>
    </>
  );
}

function PayPanel({ p, step }: PanelProps) {
  const navigate = useNavigate();
  const me = useAuthStore(s => s.currentUser.name);
  const wo = useFinancialStore(s => s.workOrders.find(w => w.id === p.workOrderId));
  const [on, setOn] = useState(p.signedOffOn || todayIso());
  return (
    <>
      {step.waitsOn && <div role="alert" className="rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink">The final payment waits on {step.waitsOn}. Enter its date under "Permits and approvals".</div>}
      <Inner>
        <KV label="Contract">{awardedBid(p)?.vendor ?? '—'} · {fmt(awardedBid(p)?.amount ?? 0)}</KV>
        <KV label="Work signed off">{p.signedOffOn ? `${p.signedOffOn} by ${p.signedOffBy}` : 'Not yet'}</KV>
        <KV label="Work order">{wo ? `${wo.id} · ${wo.status === 'paid' ? `paid ${wo.paidDate ?? ''}` : wo.status === 'invoiced' ? 'invoice in, waiting to be paid' : 'waiting on the invoice'}` : '—'}</KV>
      </Inner>
      {!p.signedOffOn && (
        <div className={FORM}>
          <Field label="Final inspection of the work" className="w-[200px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
          <Button size="sm" disabled={!!step.waitsOn || !p.workStartedOn || !on} onClick={() => signOffWork(p.id, me, on)}>I checked it: sign off as {me}</Button>
        </div>
      )}
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=expenses&section=bills')}>Enter the invoice and pay it in Funds › Bills</Button></div>
      <Why>Signing off says the finished work was inspected and matches the scope. The invoice is entered and paid in Funds against the work order raised at the award; this step ticks itself when it is paid.</Why>
    </>
  );
}

function CloseoutPanel({ p }: PanelProps) {
  const reserve = useFinancialStore(s => s.reserveItems.find(r => r.id === p.reserveItemId));
  const asset = useBuildingStore(s => s.assets.find(a => a.id === p.assetId));
  const [on, setOn] = useState(todayIso());
  const [life, setLife] = useState(String(reserve?.usefulLife || asset?.usefulLifeYears || 20));
  const [warranty, setWarranty] = useState('');
  const ready = !!p.paidOn && !!p.signedOffOn;
  if (p.closedOn) return <Inner><KV label="Closed out">{p.closedOn}</KV><KV label="Final cost">{fmt(projectCost(p))}</KV><KV label="Useful life">{p.newLifeYears} years</KV>{p.warrantyUntil && <KV label="Warranty until">{p.warrantyUntil}</KV>}</Inner>;
  return (
    <>
      <Inner>
        <KV label="Reserve component">{reserve ? `${reserve.name}: cost becomes ${fmt(projectCost(p))}, full life again, nothing set aside` : 'None tied to this project'}</KV>
        <KV label="Asset">{asset ? `${asset.name}: marked new, condition excellent` : 'None tied to this project'}</KV>
      </Inner>
      <div className={FORM}>
        <Field label="Closed out on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Useful life of what was installed (years)" className="w-[250px]"><input inputMode="numeric" value={life} onChange={e => setLife(e.target.value)} className={INPUT} /></Field>
        <Field label="Warranty runs until" className="w-[180px]"><input type="date" value={warranty} onChange={e => setWarranty(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!ready || !on || !(Number(life) > 0)} onClick={() => closeOut(p.id, on, Number(life), warranty)}>Close out</Button>
      </div>
      <Why>{ready ? 'Closing out resets the reserve plan and the asset list from this job, records the warranty, and closes the action.' : 'Close-out opens once the work is signed off and the bill is paid.'}</Why>
    </>
  );
}

const PANELS: Record<StepKey, (props: PanelProps) => ReactElement> = { need: NeedPanel, options: OptionsPanel, funding: FundingPanel, permit: PermitPanel, bids: BidsPanel, award: AwardPanel, owners: OwnersPanel, work: WorkPanel, pay: PayPanel, closeout: CloseoutPanel };

/** The Board Room action for a capital improvement: ten steps on the left, the open step's work on the right. */
export default function ProjectAction({ projectId, caseId, onBack, onOpenRecord }: { projectId: string; caseId: string; onBack: () => void; onOpenRecord: () => void }) {
  const project = useCapitalProjectsStore(s => s.projects.find(p => p.id === projectId));
  const patchProject = useCapitalProjectsStore(s => s.patch);
  const saveError = useCapitalProjectsStore(s => s.saveError);
  const limit = useBuildingStore(s => s.bylawsConfig?.boardSpendingLimit) || 5000;
  const steps = useMemo(() => (project ? projectSteps(project, limit) : []), [project, limit]);
  const current = steps.find(s => !s.done);
  const [picked, setPicked] = useState<StepKey | null>(null);
  if (!project) {
    return <div className="flex flex-col gap-4"><button type="button" onClick={onBack} className="self-start text-sm font-semibold text-ux2-teal hover:underline">← Current Actions</button><Card><Inner className="text-sm text-ux2-muted">This action's project is no longer on file.</Inner></Card></div>;
  }
  const open = steps.find(s => s.key === (picked ?? current?.key ?? 'closeout'))!;
  const Panel = PANELS[open.key];
  const at = steps.indexOf(open) + 1;
  return (
    <div data-page="ux2-project-action" data-project={project.id} data-case={caseId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="text-sm font-semibold text-ux2-teal hover:underline">← Current Actions</button>
          <h1 className="m-0 text-[28px] font-medium tracking-[-0.01em] text-ux2-ink">{project.title}</h1>
          <div className="text-[13px] text-ux2-muted">Capital improvement · opened {project.openedOn}{projectCost(project) ? ` · ${fmt(projectCost(project))}` : ''}{project.funding.source ? ` · ${FUNDING_LABEL[project.funding.source].toLowerCase()}` : ''}</div>
        </div>
        <span className="flex flex-wrap items-center gap-2"><Chip tone={current ? 'navy' : 'sage'}>{current ? `Step ${steps.indexOf(current) + 1} of ${steps.length}` : 'Closed out'}</Chip><Button size="sm" variant="ghost" onClick={onOpenRecord}>Notes and decision trail</Button></span>
      </div>
      {saveError && <div role="alert" className="rounded-[10px] bg-ux2-red-tint px-3 py-2 text-xs text-ux2-ink">{saveError}</div>}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <Card aria-label="Steps" className="gap-2">
          <SectionLabel>Steps</SectionLabel>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {steps.map((s, i) => {
              const isOpen = s.key === open.key;
              return (
                <li key={s.key}>
                  <button type="button" aria-current={isOpen ? 'step' : undefined} data-step={s.key} data-done={s.done ? '1' : '0'} onClick={() => setPicked(s.key)} className={`flex w-full items-start gap-3 rounded-[14px] border px-3 py-2 text-left ${isOpen ? 'border-ux2-teal bg-white' : 'border-transparent hover:bg-white'}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-ux2-navy text-white' : s.key === current?.key ? 'bg-ux2-teal text-white' : 'border border-ux2-line-strong bg-white text-ux2-muted'}`}>{i + 1}</span>
                    <span className="min-w-0"><span className="block text-[13px] font-semibold text-ux2-ink">{s.title}</span><span className="block text-xs text-ux2-muted">{s.summary || (s.waitsOn ? `Waits on ${s.waitsOn}` : s.key === current?.key ? 'You are here' : '')}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
        <Card aria-label={`Step ${at}, ${open.title}`} className="gap-3 border-ux2-teal">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-semibold text-ux2-ink">Step {at} · {open.title}</h2>{open.done ? <Chip tone="sage">Done</Chip> : open.waitsOn ? <Chip tone="amber">Waits on {open.waitsOn}</Chip> : null}</div>
          <Panel key={`${project.id}:${open.key}`} p={project} step={open} patch={c => patchProject(project.id, c)} />
          <p className="m-0 text-xs text-ux2-dim">{CAPITAL_HOW[open.key]}.</p>
        </Card>
      </div>
    </div>
  );
}
