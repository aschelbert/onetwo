import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { UTILITIES, missingMonths, monthLabel, monthsOf, paybackYears, readBill, spikeOf, totalsFor, utilitiesFrom, type Meter, type Utility, type UtilitiesDoc } from '@/lib/utilities';
import { stageOf } from '@/lib/actions';
import { benchmarkDue, type BenchmarkingData } from '@/lib/actions/benchmarking';
import type { UtilitySpikeData } from '@/lib/actions/utilitySpike';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Tile, TileRow, Why, Field, INPUT } from '../../components';
import { benchmarkingApplies, enterBill, recordCase, saveUtilitiesDoc, startBenchmarking } from '../../boardroom/recordActions';

const num = (s: string) => Math.max(0, Number(String(s).replace(/[^0-9.]/g, '')) || 0);
const id = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.round(n).toLocaleString('en-US'));

function BillForm({ doc, today, onDone }: { doc: UtilitiesDoc; today: string; onDone: (caseId: string | null) => void }) {
  const accts = useFinancialStore(s => s.chartOfAccounts);
  const post = useFinancialStore(s => s.postManualEntry);
  const expense = accts.filter(a => a.type === 'expense' && a.sub !== 'header');
  const cash = accts.filter(a => a.type === 'asset' && a.sub !== 'header');
  const [meterId, setMeterId] = useState(doc.meters[0]?.id ?? '');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [use, setUse] = useState('');
  const [cost, setCost] = useState('');
  const [estimated, setEstimated] = useState(false);
  const [toLedger, setToLedger] = useState(false);
  const [debit, setDebit] = useState(expense.find(a => /utilit|electric|water|gas/i.test(a.name))?.num ?? expense[0]?.num ?? '');
  const [credit, setCredit] = useState(cash.find(a => /operating/i.test(a.name))?.num ?? cash[0]?.num ?? '');
  const meter = doc.meters.find(m => m.id === meterId);
  const picker = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState('');
  const readPdf = async (file: File) => {
    if (!meter) return;
    try {
      const { pdfLines } = await import('@/features/setup/pdfText');
      const found = readBill((await pdfLines(file)).flat().join('\n'), meter.utility);
      if (found.use != null) setUse(String(found.use));
      if (found.cost != null) setCost(String(found.cost));
      if (found.month && found.month <= today.slice(0, 7)) setMonth(found.month);
      if (found.estimated) setEstimated(true);
      const got = [found.use != null && 'use', found.cost != null && 'cost', found.month && 'month'].filter(Boolean);
      setRead(got.length ? `Read ${got.join(', ')} from ${file.name}. Check each figure against the bill before saving.` : `Nothing could be read from ${file.name}. Type the figures in.`);
    } catch { setRead(`${file.name} could not be read. Type the figures in.`); }
  };
  const replacing = doc.bills.some(b => b.meterId === meterId && b.month === month);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meter || !month || !use) return;
    const opened = enterBill({ meterId, month, use: num(use), cost: num(cost), estimated }, today);
    if (toLedger && num(cost) > 0 && debit && credit) post(today, `${meter.name} · ${monthLabel(month)}`, debit, credit, num(cost));
    onDone(opened);
  };
  return (
    <form aria-label="Enter a bill" onSubmit={save} className="flex flex-col gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Meter" className="w-[220px]"><select value={meterId} onChange={e => setMeterId(e.target.value)} className={INPUT}>{doc.meters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Month it covers" className="w-[170px]"><input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)} className={INPUT} /></Field>
        <Field label={`Use${meter ? `, ${UTILITIES[meter.utility].unit}` : ''}`} className="w-[150px]"><input inputMode="decimal" value={use} onChange={e => setUse(e.target.value)} className={INPUT} /></Field>
        <Field label="Cost" className="w-[130px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={estimated} onChange={e => setEstimated(e.target.checked)} />Estimated read</label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={toLedger} onChange={e => setToLedger(e.target.checked)} />Also post the expense to the ledger</label>
        {toLedger && <><Field label="Expense account" className="w-[230px]"><select value={debit} onChange={e => setDebit(e.target.value)} className={INPUT}>{expense.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></Field><Field label="Paid from" className="w-[230px]"><select value={credit} onChange={e => setCredit(e.target.value)} className={INPUT}>{cash.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></Field></>}
        <span className="pb-0.5"><input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readPdf(f); e.target.value = ''; }} /><Button type="button" size="sm" variant="ghost" onClick={() => picker.current?.click()}>Read a PDF bill</Button></span>
        <Button type="submit" size="sm" disabled={!meter || !month || !use}>{replacing ? 'Replace that month' : 'Save the bill'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
      </div>
      {read && <span className="text-xs font-semibold text-ux2-ink">{read}</span>}
      <span className="text-xs text-ux2-muted">Leave the ledger box off when the bill is paid through a work order or already entered in Funds, so the expense is not counted twice.</span>
    </form>
  );
}

function MeterForm({ onAdd, onClose }: { onAdd: (m: Meter) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [utility, setUtility] = useState<Utility>('electricity');
  const [account, setAccount] = useState('');
  return (
    <form aria-label="Add a meter" onSubmit={e => { e.preventDefault(); if (name.trim()) onAdd({ id: id('m'), name: name.trim(), utility, account: account.trim() }); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Meter" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="House electric" className={INPUT} /></Field>
      <Field label="Utility" className="w-[200px]"><select value={utility} onChange={e => setUtility(e.target.value as Utility)} className={INPUT}>{(Object.keys(UTILITIES) as Utility[]).map(u => <option key={u} value={u}>{UTILITIES[u].label} · {UTILITIES[u].unit}</option>)}</select></Field>
      <Field label="Account number" className="w-[180px]"><input value={account} onChange={e => setAccount(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name.trim()}>Add the meter</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/** Building › Care › Utilities: meters and bills, what a year cost, the months that spiked, and how ready the benchmarking report is. */
export default function UtilitiesTab({ today, isBoard }: { today: string; isBoard: boolean }) {
  const navigate = useNavigate();
  const records = useActionRecordsStore(s => s.records);
  const cases = useIssuesStore(s => s.cases);
  const doc = utilitiesFrom(records.find(r => r.kind === 'utilities')?.data);
  const year = Number(today.slice(0, 4));
  const [form, setForm] = useState<'' | 'bill' | 'meter' | 'project'>('');
  const [chart, setChart] = useState<Utility | ''>('');
  const totals = totalsFor(doc, year);
  const shown: Utility | undefined = chart || totals[0]?.utility;
  const open = (r: { kind: string; id: string }) => { const c = recordCase(cases, r); if (c) navigate(`/boardroom?view=case:${c.id}`); };
  const spikes = records.filter(r => r.kind === 'utility-spike');
  const save = (d: UtilitiesDoc) => saveUtilitiesDoc(d, today);

  const meters = new Set(doc.meters.filter(m => m.utility === shown).map(m => m.id));
  const byMonth = monthsOf(year).map(m => ({ month: m, use: doc.bills.filter(b => meters.has(b.meterId) && b.month === m).reduce((t, b) => t + b.use, 0), spike: spikes.find(s => { const d = s.data as unknown as UtilitySpikeData; return d.month === m && meters.has(d.meterId); }) }));
  const peak = Math.max(1, ...byMonth.map(b => b.use));

  const applies = benchmarkingApplies();
  const reportYear = year - 1;
  const report = records.find(r => r.kind === 'benchmarking' && (r.data as unknown as BenchmarkingData).year === reportYear);
  const [pName, setPName] = useState(''); const [pCost, setPCost] = useState(''); const [pRebate, setPRebate] = useState(''); const [pSaves, setPSaves] = useState('');

  return (
    <div className="flex flex-col gap-4">
      {isBoard && <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setForm(form === 'meter' ? '' : 'meter')}>Add a meter</Button><Button size="sm" disabled={!doc.meters.length} onClick={() => setForm(form === 'bill' ? '' : 'bill')}>Enter a bill</Button></div>}
      {form === 'meter' && <MeterForm onAdd={m => { save({ ...doc, meters: [...doc.meters, m] }); setForm(''); }} onClose={() => setForm('')} />}
      {form === 'bill' && <BillForm doc={doc} today={today} onDone={caseId => { setForm(''); if (caseId) navigate(`/boardroom?view=case:${caseId}`); }} />}

      {doc.meters.length === 0 ? (
        <Card><Inner className="text-sm text-ux2-muted">No meters yet. {isBoard ? 'Add each meter the association pays for, then enter its bills month by month.' : 'The board has not entered the building\'s utility meters.'}</Inner></Card>
      ) : (
        <>
          <TileRow>
            {totals.map(t => { const change = t.lastYearCost ? Math.round(((t.cost - t.lastYearCost) / t.lastYearCost) * 100) : null; return <Tile key={t.utility} label={`${UTILITIES[t.utility].label} · ${year}`} value={`${big(t.use)} ${UTILITIES[t.utility].unit}`} sub={`${fmt(t.cost)}${change == null ? '' : ` · ${Math.abs(change)}% ${change <= 0 ? 'less' : 'more'} than the same months last year`}`} />; })}
            <Tile tone="navy" label="All utilities" value={fmt(totals.reduce((t, x) => t + x.cost, 0))} sub={`so far in ${year}`} />
          </TileRow>

          <Card aria-label="Use by month" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>{shown ? UTILITIES[shown].label : 'Use'}, by month · {year}</SectionLabel><span className="flex gap-2">{totals.map(t => <button key={t.utility} type="button" aria-pressed={shown === t.utility} onClick={() => setChart(t.utility)} className="rounded-full"><Chip tone={shown === t.utility ? 'navy' : 'ghost'}>{UTILITIES[t.utility].label}</Chip></button>)}</span></div>
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${shown ? UTILITIES[shown].label : ''} use by month`}>
              {byMonth.map(b => <div key={b.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><div title={`${monthLabel(b.month)}: ${b.use.toLocaleString('en-US')}`} className={`w-full rounded-t-[6px] ${b.spike ? 'bg-ux2-red-ink' : 'bg-ux2-teal'}`} style={{ height: `${Math.round((b.use / peak) * 100)}%`, minHeight: b.use ? 2 : 0 }} /><span className="text-[10px] text-ux2-muted">{monthLabel(b.month).slice(0, 3)}</span></div>)}
            </div>
            {byMonth.filter(b => b.spike).map(b => { const d = b.spike!.data as unknown as UtilitySpikeData; return <Inner key={b.month} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{monthLabel(b.month)}: {d.use.toLocaleString('en-US')} {d.unit} against a usual {d.usual.toLocaleString('en-US')} · the bill was {fmt(d.cost)}</span><Button size="sm" variant="ghost" onClick={() => open(b.spike!)}>{b.spike!.closedOn ? 'Read what was found' : `Open the action · ${stageOf(b.spike!).split(' · ')[0].toLowerCase()}`}</Button></Inner>; })}
            <Why>A bill more than half again above the same month's usual opens a utility spike action the day it is entered. The cause is found and fixed there; this chart is where the month and the outcome are read afterwards.</Why>
          </Card>

          <Card aria-label="Meters and bills" className="gap-3">
            <SectionLabel>Meters and bills</SectionLabel>
            <Table minWidth={640}>
              <thead><tr><Th>Meter</Th><Th>Billed in</Th><Th>Last bill</Th><Th num>Use</Th><Th num>Cost</Th><Th>{year}</Th>{isBoard && <Th><span className="sr-only">Remove</span></Th>}</tr></thead>
              <tbody>
                {doc.meters.map(m => { const bills = doc.bills.filter(b => b.meterId === m.id).sort((a, b) => b.month.localeCompare(a.month)); const last = bills[0]; const missing = missingMonths(doc, m.id, year).filter(x => x < today.slice(0, 7)).length; const spike = last && spikeOf(last, doc.bills);
                  return <tr key={m.id} data-meter={m.id}><Td><b className="font-semibold">{m.name}</b>{m.account && <span className="block text-xs text-ux2-muted">{m.account}</span>}</Td><Td>{UTILITIES[m.utility].unit}</Td><Td>{last ? <>{monthLabel(last.month)}{last.estimated && <span className="block text-xs text-ux2-muted">estimated</span>}</> : '—'}</Td><Td num>{last ? last.use.toLocaleString('en-US') : '—'}{spike && <span className="block text-xs text-ux2-red-ink">{spike.ratio}× usual</span>}</Td><Td num>{last ? fmt(last.cost) : '—'}</Td><Td><Chip tone={missing ? 'amber' : 'sage'}>{missing ? `${missing} month${missing === 1 ? '' : 's'} missing` : 'Up to date'}</Chip></Td>{isBoard && <Td>{bills.length === 0 && <button type="button" onClick={() => save({ ...doc, meters: doc.meters.filter(x => x.id !== m.id) })} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button>}</Td>}</tr>; })}
              </tbody>
            </Table>
          </Card>

          <Card aria-label="Projects that would cut the bills" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Projects that would cut the bills</SectionLabel>{isBoard && <Button size="sm" variant="ghost" onClick={() => setForm(form === 'project' ? '' : 'project')}>Add one</Button>}</div>
            {form === 'project' && (
              <form aria-label="Add a saving project" onSubmit={e => { e.preventDefault(); if (!pName.trim()) return; save({ ...doc, projects: [...doc.projects, { id: id('p'), name: pName.trim(), cost: num(pCost), rebate: num(pRebate), savesPerYear: num(pSaves) }] }); setPName(''); setPCost(''); setPRebate(''); setPSaves(''); setForm(''); }} className="flex flex-wrap items-end gap-3">
                <Field label="Project" className="min-w-[200px] flex-1"><input value={pName} onChange={e => setPName(e.target.value)} placeholder="LED lighting, garage and stairs" className={INPUT} /></Field>
                <Field label="Cost" className="w-[120px]"><input inputMode="decimal" value={pCost} onChange={e => setPCost(e.target.value)} className={INPUT} /></Field>
                <Field label="Rebate" className="w-[120px]"><input inputMode="decimal" value={pRebate} onChange={e => setPRebate(e.target.value)} className={INPUT} /></Field>
                <Field label="Saves a year" className="w-[130px]"><input inputMode="decimal" value={pSaves} onChange={e => setPSaves(e.target.value)} className={INPUT} /></Field>
                <Button type="submit" size="sm" disabled={!pName.trim()}>Add</Button>
              </form>
            )}
            {doc.projects.length === 0 ? <Inner className="text-sm text-ux2-muted">None listed yet.</Inner> : (
              <Table minWidth={560}>
                <thead><tr><Th>Project</Th><Th num>Cost</Th><Th num>Rebate</Th><Th num>Saves a year</Th><Th num>Pays back</Th>{isBoard && <Th><span className="sr-only">Remove</span></Th>}</tr></thead>
                <tbody>{doc.projects.map(p => { const pb = paybackYears(p); return <tr key={p.id}><Td><b className="font-semibold">{p.name}</b></Td><Td num>{fmt(p.cost)}</Td><Td num>{fmt(p.rebate)}</Td><Td num>{fmt(p.savesPerYear)}</Td><Td num>{pb == null ? '—' : `${pb} years`}</Td>{isBoard && <Td><button type="button" onClick={() => save({ ...doc, projects: doc.projects.filter(x => x.id !== p.id) })} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button></Td>}</tr>; })}</tbody>
              </Table>
            )}
            <Why>Payback is the cost less any rebate, divided by the yearly saving. The saving is the board's estimate; this year's rates are {totals.filter(t => t.rate > 0).map(t => `$${t.rate.toFixed(t.rate < 0.1 ? 4 : 2)} a ${UTILITIES[t.utility].unit.replace(/s$/, '')}`).join(', ') || 'shown once bills are entered'}.</Why>
          </Card>
        </>
      )}

      {applies !== 'no' && (
        <Card aria-label="Benchmarking report" className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Benchmarking report for {reportYear} · due {benchmarkDue(reportYear)}</SectionLabel>{report ? <Chip tone={report.closedOn ? 'sage' : 'navy'}>{stageOf(report)}</Chip> : applies === 'check' ? <Chip tone="ghost">Check if it applies</Chip> : null}</div>
          <Inner className="flex flex-col gap-1">{doc.meters.length === 0 ? <span className="text-sm text-ux2-muted">No meters entered.</span> : doc.meters.map(m => { const miss = missingMonths(doc, m.id, reportYear).length; return <div key={m.id} className="flex justify-between gap-2 text-sm text-ux2-ink"><span>{m.name}</span><span className={miss ? 'text-ux2-amber' : ''}>{12 - miss} of 12 months entered</span></div>; })}</Inner>
          {isBoard && <div>{report ? <Button size="sm" variant="ghost" onClick={() => open(report)}>Open the benchmarking action</Button> : <Button size="sm" onClick={() => { const { caseId } = startBenchmarking(today, reportYear); if (caseId) navigate(`/boardroom?view=case:${caseId}`); }}>Start the benchmarking action</Button>}</div>}
          <Why>The report needs what this tab already holds: twelve months of every meter. The action checks them, builds the file and records the submission.</Why>
        </Card>
      )}
    </div>
  );
}
