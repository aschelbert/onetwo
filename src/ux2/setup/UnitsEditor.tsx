/**
 * Units by hand, on the setup page: add one, add a range (101 to 112), or
 * paste a list; then edit any field in place or remove a unit. Saved through
 * the financial store (and so to the database) as you go. Shows whether
 * ownership adds up to 100%.
 */
import { useState } from 'react';
import { cn } from '@/lib/formatters';
import { useFinancialStore } from '@/store/useFinancialStore';
import type { Unit } from '@/types/financial';
import { parseUnitLines, unitRange, type UnitDraft } from '@/features/setup/unitEntry';
import { Button, Chip } from '../components';

const INPUT = 'h-10 rounded-[10px] border border-ux2-line-strong bg-white px-3 text-sm text-ux2-ink';
const CELL = 'h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ux2-ink hover:border-ux2-line focus:border-ux2-line-strong focus:bg-white';
const num = (v: string) => { const n = Number(v.replace(/[$,%\s]/g, '')); return v.trim() === '' || Number.isNaN(n) ? null : n; };

type Mode = 'one' | 'range' | 'paste';

export default function UnitsEditor() {
  const units = useFinancialStore(s => s.units);
  const addUnit = useFinancialStore(s => s.addUnit);
  const updateUnit = useFinancialStore(s => s.updateUnit);
  const removeUnit = useFinancialStore(s => s.removeUnit);
  const [mode, setMode] = useState<Mode>('one');
  const [one, setOne] = useState({ number: '', owner: '', email: '', pct: '', fee: '' });
  const [range, setRange] = useState({ first: '', last: '', fee: '' });
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<{ tone: 'sage' | 'red'; text: string } | null>(null);

  const exists = (n: string) => units.some(u => u.number.toLowerCase() === n.toLowerCase());
  const add = (drafts: UnitDraft[]) => {
    let added = 0; let updated = 0;
    for (const d of drafts) {
      const existing = units.find(u => u.number.toLowerCase() === d.number.toLowerCase());
      if (existing) {
        const patch: Partial<Unit> = {};
        if (d.owner) patch.owner = d.owner;
        if (d.email) patch.email = d.email;
        if (d.votingPct !== null) patch.votingPct = d.votingPct;
        if (d.monthlyFee !== null) patch.monthlyFee = d.monthlyFee;
        if (Object.keys(patch).length) { updateUnit(existing.number, patch); updated++; }
        continue;
      }
      addUnit({ number: d.number, owner: d.owner, email: d.email, phone: '', monthlyFee: d.monthlyFee ?? 0, votingPct: d.votingPct ?? 0, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null });
      added++;
    }
    return { added, updated };
  };

  const addOne = () => {
    const n = one.number.trim().replace(/^unit\s*/i, '').replace(/^#/, '').toUpperCase();
    if (!n) { setNote({ tone: 'red', text: 'Enter a unit number.' }); return; }
    if (exists(n)) { setNote({ tone: 'red', text: `Unit ${n} is already on the list; edit it below.` }); return; }
    add([{ number: n, owner: one.owner.trim(), email: one.email.trim().toLowerCase(), votingPct: num(one.pct), monthlyFee: num(one.fee) }]);
    setOne({ number: '', owner: '', email: '', pct: '', fee: '' });
    setNote({ tone: 'sage', text: `Unit ${n} added.` });
  };
  const addRange = () => {
    const list = unitRange(range.first, range.last);
    if (!list) { setNote({ tone: 'red', text: 'Give a first and last unit with the same pattern, e.g. 101 and 112, or 1A and 1F (up to 500 units).' }); return; }
    const fresh = list.filter(n => !exists(n));
    add(fresh.map(n => ({ number: n, owner: '', email: '', votingPct: null, monthlyFee: num(range.fee) })));
    setRange({ first: '', last: '', fee: range.fee });
    setNote({ tone: 'sage', text: `${fresh.length} unit${fresh.length === 1 ? '' : 's'} added${fresh.length < list.length ? ` (${list.length - fresh.length} already on the list)` : ''}. Fill in owners below, or import the owner list.` });
  };
  const addPasted = () => {
    const { units: drafts, skipped } = parseUnitLines(paste);
    const { added, updated } = add(drafts);
    setPaste('');
    setNote(skipped.length
      ? { tone: 'red', text: `${added} added, ${updated} updated. ${skipped.length} line${skipped.length === 1 ? ' has' : 's have'} no unit number and ${skipped.length === 1 ? 'was' : 'were'} skipped: ${skipped.slice(0, 2).join(' · ')}${skipped.length > 2 ? '…' : ''}` }
      : { tone: 'sage', text: `${added} added${updated ? `, ${updated} updated` : ''}.` });
  };

  const total = Math.round(units.reduce((t, u) => t + (u.votingPct || 0), 0) * 100) / 100;
  const sorted = [...units].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  return (
    <div data-units-editor className="flex flex-col gap-2.5 rounded-2xl border border-ux2-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm font-semibold">Units {units.length ? <span className="font-normal text-ux2-muted">· {units.length}</span> : null}</span>
        {units.length > 0 && <Chip tone={Math.abs(total - 100) < 0.05 ? 'sage' : total ? 'amber' : 'ghost'}>{total ? `Ownership adds to ${total}%` : 'No ownership % yet'}</Chip>}
      </div>
      <div role="tablist" aria-label="Add units" className="flex flex-wrap gap-1.5">
        {([['one', 'Add a unit'], ['range', 'Add a range'], ['paste', 'Paste a list']] as [Mode, string][]).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setNote(null); }} className={cn('h-9 rounded-full px-3.5 text-xs font-semibold', mode === m ? 'bg-ux2-plum text-white' : 'border border-ux2-line-strong bg-white text-ux2-ink')}>{label}</button>
        ))}
      </div>

      {mode === 'one' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Unit<input className={cn(INPUT, 'w-24')} placeholder="4B" value={one.number} onChange={e => setOne(x => ({ ...x, number: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addOne(); }} /></label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-ux2-muted">Owner<input className={INPUT} placeholder="Name" value={one.owner} onChange={e => setOne(x => ({ ...x, owner: e.target.value }))} /></label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-ux2-muted">Owner email<input type="email" className={INPUT} placeholder="name@example.com" value={one.email} onChange={e => setOne(x => ({ ...x, email: e.target.value }))} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Ownership %<input inputMode="decimal" className={cn(INPUT, 'w-24')} placeholder="3.85" value={one.pct} onChange={e => setOne(x => ({ ...x, pct: e.target.value }))} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Monthly $<input inputMode="decimal" className={cn(INPUT, 'w-24')} placeholder="412" value={one.fee} onChange={e => setOne(x => ({ ...x, fee: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addOne(); }} /></label>
          <Button size="sm" variant="plum" className="h-10" onClick={addOne}>Add unit</Button>
        </div>
      )}
      {mode === 'range' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">First unit<input className={cn(INPUT, 'w-24')} placeholder="101" value={range.first} onChange={e => setRange(x => ({ ...x, first: e.target.value }))} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Last unit<input className={cn(INPUT, 'w-24')} placeholder="112" value={range.last} onChange={e => setRange(x => ({ ...x, last: e.target.value }))} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Monthly $ each (optional)<input inputMode="decimal" className={cn(INPUT, 'w-32')} value={range.fee} onChange={e => setRange(x => ({ ...x, fee: e.target.value }))} /></label>
          <Button size="sm" variant="plum" className="h-10" onClick={addRange}>Add {range.first && range.last && unitRange(range.first, range.last) ? `${unitRange(range.first, range.last)!.length} units` : 'units'}</Button>
          <span className="w-full text-xs text-ux2-muted">Run it once per floor or building (101–112, then 201–212). Letters work too: 1A to 1F.</span>
        </div>
      )}
      {mode === 'paste' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-ux2-muted" htmlFor="setup-units-paste">One unit per line: the unit number, then the owner, email, ownership % and monthly amount in any order, e.g. "4B, Ana Rivera, ana@example.com, 3.85%, $412". A heading row (Unit, Owner, Email…) is fine too.</label>
          <textarea id="setup-units-paste" rows={6} className="w-full rounded-xl border border-ux2-line-strong px-3 py-2 text-sm" value={paste} onChange={e => setPaste(e.target.value)} />
          <Button size="sm" variant="plum" className="self-start" disabled={!paste.trim()} onClick={addPasted}>Add these units</Button>
        </div>
      )}
      {note && <div role="status" className={cn('rounded-xl px-3 py-2 text-sm', note.tone === 'sage' ? 'bg-ux2-sage-tint text-ux2-sage' : 'bg-ux2-red-tint text-ux2-red-ink')}>{note.text}</div>}

      {sorted.length > 0 && (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-ux2-line">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead className="sticky top-0 bg-ux2-surface"><tr className="text-left text-xs text-ux2-muted">
              <th scope="col" className="px-2 py-2 font-semibold">Unit</th><th scope="col" className="px-2 py-2 font-semibold">Owner</th><th scope="col" className="px-2 py-2 font-semibold">Email</th>
              <th scope="col" className="px-2 py-2 font-semibold">Ownership %</th><th scope="col" className="px-2 py-2 font-semibold">Monthly $</th><th scope="col" className="px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr></thead>
            <tbody>
              {sorted.map(u => (
                <tr key={`${u.number}|${u.owner}|${u.email}|${u.votingPct}|${u.monthlyFee}`} data-unit-row={u.number} className="border-t border-ux2-line">
                  <td className="px-2 py-1 font-semibold">{u.number}</td>
                  <td className="px-1 py-1"><input aria-label={`Owner of ${u.number}`} className={CELL} defaultValue={u.owner} onBlur={e => { if (e.target.value !== u.owner) updateUnit(u.number, { owner: e.target.value.trim() }); }} /></td>
                  <td className="px-1 py-1"><input aria-label={`Email for ${u.number}`} type="email" className={CELL} defaultValue={u.email} onBlur={e => { if (e.target.value !== u.email) updateUnit(u.number, { email: e.target.value.trim().toLowerCase() }); }} /></td>
                  <td className="px-1 py-1"><input aria-label={`Ownership % of ${u.number}`} inputMode="decimal" className={cn(CELL, 'w-24')} defaultValue={u.votingPct || ''} onBlur={e => { const n = num(e.target.value); if ((n ?? 0) !== u.votingPct) updateUnit(u.number, { votingPct: n ?? 0 }); }} /></td>
                  <td className="px-1 py-1"><input aria-label={`Monthly assessment for ${u.number}`} inputMode="decimal" className={cn(CELL, 'w-24')} defaultValue={u.monthlyFee || ''} onBlur={e => { const n = num(e.target.value); if ((n ?? 0) !== u.monthlyFee) updateUnit(u.number, { monthlyFee: n ?? 0 }); }} /></td>
                  <td className="px-1 py-1 text-right"><Button size="sm" variant="ghost" aria-label={`Remove unit ${u.number}`} onClick={() => { if (u.balance === 0 && u.payments.length === 0 ? true : window.confirm(`Unit ${u.number} has payments or a balance. Remove it anyway?`)) removeUnit(u.number); }}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
