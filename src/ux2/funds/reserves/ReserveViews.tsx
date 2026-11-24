import { useRef, useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { componentsOf, levels, project, type Component, type Level, type PlanAssumptions, type PlanYear } from '@/lib/reservePlan';
import { Button, Chip, Inner, Table, Th, Td, Why, Field, INPUT } from '../../components';
import { changeComponent, planFrom, PLAN_KIND, reserveBalance } from '../../boardroom/reserves';

const num = (s: string) => Math.max(0, Number(String(s).replace(/[^0-9.]/g, '')) || 0);
const FORM = 'flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3';

/** The plan's assumptions and change history, re-read when they change. */
export function usePlanDoc() {
  return planFrom(useActionRecordsStore(s => s.records.find(r => r.kind === PLAN_KIND))?.data);
}

/** The reserve account's balance, re-read when the ledger changes. */
export function useReserveBalance(): number {
  useFinancialStore(s => s.generalLedger);
  return reserveBalance();
}

type Mode = { kind: 'add' } | { kind: 'edit' | 'replace' | 'extend' | 'remove'; id: string } | null;

function ChangeForm({ mode, comp, today, onDone }: { mode: NonNullable<Mode>; comp?: Component; today: string; onDone: () => void }) {
  const me = useAuthStore(s => s.currentUser.name);
  const item = useFinancialStore(s => s.reserveItems.find(i => i.id === (mode.kind === 'add' ? '' : mode.id)));
  const [name, setName] = useState(item?.name ?? '');
  const [cost, setCost] = useState(item ? String(item.estimatedCost) : '');
  const [life, setLife] = useState(item ? String(item.usefulLife) : '');
  const [last, setLast] = useState(mode.kind === 'replace' ? today.slice(0, 4) : item?.lastReplaced ?? '');
  const [years, setYears] = useState('');
  const [why, setWhy] = useState('');
  const title = { add: 'Add a component', edit: `Edit · ${item?.name ?? ''}`, replace: `Replaced · ${item?.name ?? ''}`, extend: `It will last longer or shorter · ${item?.name ?? ''}`, remove: `Remove · ${item?.name ?? ''}` }[mode.kind];
  const ok = !!why.trim() && (mode.kind === 'add' ? !!name.trim() && num(life) > 0 : mode.kind === 'extend' ? !!Math.round(Number(years)) : true);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const done =
      mode.kind === 'add' ? changeComponent({ kind: 'add', name, cost: num(cost), life: num(life), lastReplaced: last }, why, me, today)
      : mode.kind === 'edit' ? changeComponent({ kind: 'edit', id: mode.id, name: name.trim() || undefined, cost: num(cost), life: num(life) || undefined, lastReplaced: last }, why, me, today)
      : mode.kind === 'replace' ? changeComponent({ kind: 'replace', id: mode.id, on: `${last || today.slice(0, 4)}-01-01`, cost: num(cost), life: num(life) || undefined }, why, me, today)
      : mode.kind === 'extend' ? changeComponent({ kind: 'extend', id: mode.id, years: Math.round(Number(years)) }, why, me, today)
      : changeComponent({ kind: 'remove', id: mode.id }, why, me, today);
    if (done || mode.kind === 'edit') onDone();
  };
  return (
    <form aria-label={title} onSubmit={save} className={FORM}>
      <b className="basis-full text-sm font-semibold text-ux2-ink">{title}</b>
      {(mode.kind === 'add' || mode.kind === 'edit') && <Field label="Component" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Roof membrane" className={INPUT} /></Field>}
      {mode.kind !== 'extend' && mode.kind !== 'remove' && <Field label={mode.kind === 'replace' ? 'What it cost' : 'Cost to replace, today'} className="w-[170px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>}
      {mode.kind !== 'extend' && mode.kind !== 'remove' && <Field label="Useful life, years" className="w-[140px]"><input inputMode="numeric" value={life} onChange={e => setLife(e.target.value)} className={INPUT} /></Field>}
      {mode.kind !== 'extend' && mode.kind !== 'remove' && <Field label={mode.kind === 'replace' ? 'Year replaced' : 'Last replaced, year'} className="w-[150px]"><input inputMode="numeric" value={last} onChange={e => setLast(e.target.value)} placeholder={today.slice(0, 4)} className={INPUT} /></Field>}
      {mode.kind === 'extend' && <Field label={`Years later (or minus for sooner) · now ${comp?.replaceYear ?? ''}`} className="w-[260px]"><input inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} placeholder="5" className={INPUT} /></Field>}
      <Field label="Why (kept with the change)" className="min-w-[220px] flex-1"><input value={why} onChange={e => setWhy(e.target.value)} placeholder={mode.kind === 'extend' ? "Vendor's condition report, Sep 2026" : mode.kind === 'remove' ? 'No longer the association\'s to replace' : 'Reserve study, Mar 2025'} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!ok}>{mode.kind === 'remove' ? 'Remove it' : 'Save'}</Button><Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

interface StudyRow { component: string; estimatedCost: number | null; usefulLifeYears: number | null; remainingLifeYears: number | null }

/** Components read out of a reserve study, each offered as an addition or as an update to the one already on file with that name. */
function StudyImport({ today, onDone }: { today: string; onDone: () => void }) {
  const me = useAuthStore(s => s.currentUser.name);
  const items = useFinancialStore(s => s.reserveItems);
  const picker = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<StudyRow[] | null>(null);
  const [file, setFile] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const year = Number(today.slice(0, 4));
  const read = async (f: File) => {
    setNote('Reading…'); setFile(f.name);
    try {
      const [{ pdfLines }, { extractFromPages }] = await Promise.all([import('@/features/setup/pdfText'), import('@/features/setup/extractText')]);
      const found = (extractFromPages(await pdfLines(f), { title: f.name, docType: 'reserve_study', paged: true }).reserves as StudyRow[]).filter(r => r.component && (r.estimatedCost ?? 0) > 0);
      setRows(found); setPicked(new Set(found.map((_, i) => i)));
      setNote(found.length ? '' : 'No component table could be read from that file. Add the components by hand.');
    } catch { setRows(null); setNote('That file could not be read. Add the components by hand.'); }
  };
  const match = (r: StudyRow) => items.find(i => i.name.trim().toLowerCase() === r.component.trim().toLowerCase());
  const apply = () => {
    const why = `Reserve study · ${file}`;
    (rows ?? []).forEach((r, i) => {
      if (!picked.has(i)) return;
      const life = Math.max(1, Math.round(r.usefulLifeYears ?? 20));
      const last = r.remainingLifeYears != null ? String(year - Math.max(0, life - Math.round(r.remainingLifeYears))) : '';
      const have = match(r);
      if (have) changeComponent({ kind: 'edit', id: have.id, cost: r.estimatedCost ?? have.estimatedCost, life, lastReplaced: last || have.lastReplaced }, why, me, today);
      else changeComponent({ kind: 'add', name: r.component, cost: r.estimatedCost ?? 0, life, lastReplaced: last }, why, me, today);
    });
    onDone();
  };
  return (
    <div aria-label="Read a reserve study" className={`${FORM} flex-col !items-stretch`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Read the components from a reserve study</b><span className="flex gap-2"><input ref={picker} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} /><Button size="sm" onClick={() => picker.current?.click()}>{rows ? 'Choose another file' : 'Choose the study (PDF)'}</Button><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></span></div>
      {note && <span className="text-xs text-ux2-muted">{note}</span>}
      {rows && rows.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{rows.map((r, i) => { const have = match(r); return (
            <li key={i}><label className="flex flex-wrap items-center gap-2.5 text-sm text-ux2-ink"><input type="checkbox" className="h-5 w-5" checked={picked.has(i)} onChange={() => setPicked(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} /><b className="font-semibold">{r.component}</b><span className="text-ux2-muted">{fmt(r.estimatedCost ?? 0)} · {r.usefulLifeYears ?? '?'}-year life{r.remainingLifeYears != null ? ` · ${r.remainingLifeYears} left` : ''}</span><Chip tone={have ? 'navy' : 'cyan'}>{have ? 'Updates the one on file' : 'New'}</Chip></label></li>
          ); })}</ul>
          <div><Button size="sm" disabled={!picked.size} onClick={apply}>Bring in {picked.size} component{picked.size === 1 ? '' : 's'}</Button></div>
          <span className="text-xs text-ux2-muted">Read by pattern from the study's table, so check each line against the document. Every line brought in is recorded as a change with the study as its reason.</span>
        </>
      )}
    </div>
  );
}

/**
 * The reserve components, editable where they are shown. A change is saved
 * with its reason and recorded in the reserve funding review that is open
 * (one opens if none is), so the table can be worked from Funds › Planning or
 * from inside the review and the result is the same.
 */
export function ComponentsEditor({ today, canEdit, a }: { today: string; canEdit: boolean; a: PlanAssumptions }) {
  const items = useFinancialStore(s => s.reserveItems);
  const assets = useBuildingStore(s => s.assets);
  const me = useAuthStore(s => s.currentUser.name);
  const year = Number(today.slice(0, 4));
  const comps = componentsOf(items, year, a);
  const [mode, setMode] = useState<Mode>(null);
  const [study, setStudy] = useState(false);
  const linked = new Set(assets.map(x => x.reserveItemId).filter(Boolean));
  const names = new Set(items.map(i => i.name.trim().toLowerCase()));
  // Building assets with a replacement cost that no reserve component covers yet.
  const uncovered = assets.filter(x => !x.reserveItemId && x.replacementCostToday > 0 && !names.has(x.name.trim().toLowerCase()));
  const addAsset = (assetId: string) => {
    const x = assets.find(y => y.id === assetId);
    if (!x) return;
    const last = x.installedDate ? x.installedDate.slice(0, 4) : '';
    if (!changeComponent({ kind: 'add', name: x.name, cost: x.replacementCostToday, life: x.usefulLifeYears || 20, lastReplaced: last }, 'Added from the building\'s asset list', me, today)) return;
    const added = useFinancialStore.getState().reserveItems.slice(-1)[0];
    if (added) useBuildingStore.getState().updateAsset(x.id, { reserveItemId: added.id });
  };
  const total = (f: (c: Component) => number) => comps.reduce((t, c) => t + f(c), 0);
  return (
    <div className="flex flex-col gap-3" data-reserve-components>
      {canEdit && <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { setStudy(v => !v); setMode(null); }}>Read a reserve study</Button><Button size="sm" onClick={() => { setMode({ kind: 'add' }); setStudy(false); }}>Add a component</Button></div>}
      {study && <StudyImport today={today} onDone={() => setStudy(false)} />}
      {mode && <ChangeForm key={`${mode.kind}-${'id' in mode ? mode.id : ''}`} mode={mode} comp={comps.find(c => 'id' in mode && c.id === mode.id)} today={today} onDone={() => setMode(null)} />}
      {comps.length === 0 ? <Inner className="text-sm text-ux2-muted">No reserve components yet. {canEdit ? 'Read them from the reserve study, or add the roof, boiler and elevator by hand.' : 'The board has not listed them.'}</Inner> : (
        <Table minWidth={900}>
          <thead><tr><Th>Component</Th><Th num>Cost today</Th><Th num>Life</Th><Th num>Age</Th><Th>Replace</Th><Th num>Cost then</Th><Th num>Should be set aside by now</Th>{canEdit && <Th aria-label="Change" />}</tr></thead>
          <tbody>
            {comps.map(c => (
              <tr key={c.id} data-component={c.id}>
                <Td className="font-semibold">{c.name}{linked.has(c.id) && <span className="block text-xs font-normal text-ux2-muted">a building asset</span>}</Td>
                <Td num>{fmt(c.cost)}</Td><Td num>{c.life} yr</Td><Td num>{c.age}</Td>
                <Td>{c.replaceYear}{c.replaceYear - year <= 2 && <Chip tone={c.replaceYear <= year ? 'red' : 'amber'} className="ml-2">{c.replaceYear <= year ? 'Due' : `${c.replaceYear - year} year${c.replaceYear - year === 1 ? '' : 's'}`}</Chip>}</Td>
                <Td num>{fmt(c.costThen)}</Td><Td num>{fmt(c.shouldHave)}</Td>
                {canEdit && <Td num><span className="flex flex-wrap justify-end gap-1.5">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setMode({ kind: 'edit', id: c.id })}>Edit</Button>
                  <Button size="sm" variant="ghost" aria-label={`${c.name} was replaced`} onClick={() => setMode({ kind: 'replace', id: c.id })}>Replaced</Button>
                  <Button size="sm" variant="ghost" aria-label={`Change how long ${c.name} will last`} onClick={() => setMode({ kind: 'extend', id: c.id })}>Life</Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => setMode({ kind: 'remove', id: c.id })}>Remove</Button>
                </span></Td>}
              </tr>
            ))}
            <tr className="font-semibold"><Td>All components</Td><Td num>{fmt(total(c => c.cost))}</Td><Td /><Td /><Td /><Td num>{fmt(total(c => c.costThen))}</Td><Td num>{fmt(total(c => c.shouldHave))}</Td>{canEdit && <Td />}</tr>
          </tbody>
        </Table>
      )}
      {canEdit && uncovered.length > 0 && (
        <Inner className="flex flex-col gap-1.5" aria-label="Assets not in the reserves">
          <b className="text-xs font-semibold text-ux2-ink">On the building's asset list, not in the reserves</b>
          {uncovered.slice(0, 6).map(x => <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{x.name} <span className="text-xs text-ux2-muted">· {fmt(x.replacementCostToday)} to replace · {x.usefulLifeYears}-year life</span></span><Button size="sm" variant="ghost" onClick={() => addAsset(x.id)}>Add to the reserves</Button></div>)}
        </Inner>
      )}
      <Why>"Should be set aside by now" is the cost today times the share of the component's life already used. "Cost then" grows today's cost by {a.inflationPct}% a year to the replacement year. A component is brought up to date when it is replaced, when a repair or a condition report changes how long it will last, or when a reserve study gives new figures.</Why>
    </div>
  );
}

/** The 30-year balance, one bar a year: pale where a component is replaced, red where the balance would be below zero. */
export function PlanChart({ rows, label }: { rows: PlanYear[]; label: string }) {
  const peak = Math.max(1, ...rows.map(r => Math.abs(r.end)));
  const low = rows.reduce((m, r) => (r.end < m.end ? r : m), rows[0]);
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`${label}: ${rows.filter(r => r.end < 0).length ? `below zero in ${rows.filter(r => r.end < 0).map(r => r.year).join(', ')}` : `never below zero; lowest ${fmt(low?.end ?? 0)} in ${low?.year ?? ''}`}`}>
        {rows.map(r => <div key={r.year} title={`${r.year}: ${fmt(r.end)}${r.replaced.length ? ` · replaces ${r.replaced.join(', ')}` : ''}`} className={`min-w-0 flex-1 rounded-t-[3px] ${r.end < 0 ? 'bg-ux2-red-ink' : r.spent > 0 ? 'bg-ux2-cyan' : 'bg-ux2-teal'}`} style={{ height: `${Math.max(3, Math.round((Math.abs(r.end) / peak) * 100))}%` }} />)}
      </div>
      <div className="flex justify-between text-[11px] text-ux2-muted"><span>{rows[0]?.year}</span><span>{low ? `Lowest ${fmt(low.end)} in ${low.year}` : ''}</span><span>{rows[rows.length - 1]?.year}</span></div>
    </Inner>
  );
}

/** The three contribution levels with what each leads to, and the plan drawn at the one looked at. */
export function LevelsView({ today, a, monthly, onPick, pickLabel, picked }: { today: string; a: PlanAssumptions; monthly: number; onPick?: (l: Level) => void; pickLabel?: string; picked?: string }) {
  const items = useFinancialStore(s => s.reserveItems);
  const units = Math.max(1, useFinancialStore(s => s.units.length));
  const balance = useReserveBalance();
  const year = Number(today.slice(0, 4));
  const comps = componentsOf(items, year, a);
  const all = levels(balance, monthly, comps, year, a);
  const [shown, setShown] = useState<string>(picked || 'today');
  const level = all.find(l => l.id === shown) ?? all[0];
  return (
    <div className="flex flex-col gap-3" data-reserve-levels>
      <Table minWidth={640}>
        <thead><tr><Th>Level</Th><Th num>A month</Th><Th num>A unit, a month</Th><Th>First short year</Th><Th num>Funded in 10 years</Th><Th aria-label="Show or pick" /></tr></thead>
        <tbody>{all.map(l => (
          <tr key={l.id} data-level={l.id} className={shown === l.id ? 'bg-ux2-teal-tint/50' : ''}>
            <Td><b className="font-semibold">{l.label}</b><span className="block text-xs text-ux2-muted">{l.note}</span></Td>
            <Td num>{fmt(l.monthly)}</Td><Td num>{fmt(Math.round(l.monthly / units))}</Td>
            <Td>{l.short ? <Chip tone="red">{l.short.year} · short {fmt(l.short.by)}</Chip> : <Chip tone="sage">None</Chip>}</Td>
            <Td num>{l.pctIn10 == null ? '—' : `${l.pctIn10}%`}</Td>
            <Td num><span className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" aria-pressed={shown === l.id} onClick={() => setShown(l.id)}>Show</Button>{onPick && <Button size="sm" variant={picked === l.id ? 'primary' : 'ghost'} onClick={() => onPick(l)}>{picked === l.id ? 'Picked' : pickLabel ?? 'Pick'}</Button>}</span></Td>
          </tr>
        ))}</tbody>
      </Table>
      <PlanChart rows={project(balance, level.monthly, comps, year, a)} label={`Projected reserve balance at ${fmt(level.monthly)} a month`} />
    </div>
  );
}
