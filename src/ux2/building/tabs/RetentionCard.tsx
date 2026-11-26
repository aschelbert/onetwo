import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { periodLabel, activeHolds, type Hold, type RecordKind } from '@/lib/retention';
import { Button, Card, Chip, Inner, Table, Th, Td, Why, Field, INPUT } from '../../components';
import { saveRetention, useRetention } from '../retention';

const id = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Records › Archive: what is kept and for how long. Each kind of record has
 * its own period; the app shows what it holds against it, where the record
 * is incomplete, and what has passed its period. Nothing is deleted from
 * here: disposal is a list the board approves in the year-end close.
 */
export default function RetentionCard({ today }: { today: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const { rows, doc } = useRetention(today);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<RecordKind, string>>>({});
  const [holding, setHolding] = useState(false);
  const [what, setWhat] = useState(''), [unit, setUnit] = useState(''), [why, setWhy] = useState('');
  const holds = activeHolds(doc.holds);
  const last = [...doc.reviews].sort((a, b) => b.on.localeCompare(a.on))[0];
  const due = rows.reduce((t, r) => t + r.due.length, 0);
  const save = () => {
    const periods = { ...doc.periods };
    for (const r of rows) { const v = draft[r.rule.kind]; if (v === undefined) continue; periods[r.rule.kind] = v === 'good' ? null : Math.max(r.rule.floor, Number(v) || r.rule.floor); }
    saveRetention({ periods }, today); setDraft({}); setEditing(false);
  };
  const addHold = (e: React.FormEvent) => {
    e.preventDefault();
    if (!why.trim() || (!what.trim() && !unit.trim())) return;
    const h: Hold = { id: id(), what: what.trim(), unit: unit.trim(), why: why.trim(), placedOn: today, placedBy: me, releasedOn: '' };
    saveRetention({ holds: [...doc.holds, h] }, today); setWhat(''); setUnit(''); setWhy(''); setHolding(false);
  };
  return (
    <Card aria-label="What is kept, and for how long" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[17px] font-semibold text-ux2-ink">What is kept, and for how long</span>
        <span className="flex flex-wrap items-center gap-2">{due > 0 ? <Chip tone="amber">{due} past their period</Chip> : <Chip tone="sage">Nothing past its period</Chip>}{editing ? <><Button size="sm" onClick={save}>Save the schedule</Button><Button size="sm" variant="ghost" onClick={() => { setDraft({}); setEditing(false); }}>Cancel</Button></> : <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit the schedule</Button>}</span>
      </div>
      <Table minWidth={920}>
        <thead><tr><Th>Kind of record</Th><Th>Kept for</Th><Th num>Held</Th><Th>Oldest</Th><Th>Complete?</Th><Th>Due to go</Th></tr></thead>
        <tbody>{rows.map(r => {
          const k = r.rule.kind, v = draft[k] ?? (r.rule.years == null ? 'good' : String(r.rule.years));
          return (
            <tr key={k} data-retention={k}>
              <Td><span className="font-semibold">{r.rule.label}</span><span className="block text-xs text-ux2-muted">{r.rule.why}</span></Td>
              <Td>{editing ? (
                <span className="flex items-center gap-1.5"><select aria-label={`Kept for: ${r.rule.label}`} value={v === 'good' ? 'good' : 'years'} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value === 'good' ? 'good' : String(r.rule.years ?? Math.max(7, r.rule.floor)) }))} className="rounded-[8px] border border-ux2-line-strong bg-white px-2 py-1 text-sm"><option value="good">For good</option><option value="years">Years</option></select>{v !== 'good' && <input aria-label={`Years: ${r.rule.label}`} inputMode="numeric" value={v} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} className="w-14 rounded-[8px] border border-ux2-line-strong px-2 py-1 text-right text-sm" />}{r.rule.floor > 0 && <span className="text-xs text-ux2-muted">at least {r.rule.floor}</span>}</span>
              ) : periodLabel(r.rule)}</Td>
              <Td num>{r.held}</Td>
              <Td>{r.oldest ? r.oldest.slice(0, 7) : <span className="text-ux2-muted">—</span>}</Td>
              <Td>{r.incomplete ? <span className="text-xs text-ux2-red-ink">{r.incomplete}</span> : r.held ? 'Yes' : <span className="text-ux2-muted">Nothing held</span>}</Td>
              <Td className="text-xs">{r.rule.years == null ? 'Never' : r.due.length ? <b className="font-semibold">{r.due.length} · the board decides</b> : r.nextDue ? `From ${r.nextDue.slice(0, 7)}` : '—'}{r.heldBack.length > 0 && <span className="block text-ux2-muted">{r.heldBack.length} held back by a hold</span>}</Td>
            </tr>
          );
        })}</tbody>
      </Table>

      <div className="flex flex-col gap-2" aria-label="Holds">
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">On hold because of a dispute · {holds.length}</b><Button size="sm" variant="ghost" onClick={() => setHolding(v => !v)}>Place a hold</Button></div>
        {holding && (
          <form aria-label="Place a hold" onSubmit={addHold} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
            <Field label="Unit (optional)" className="w-[130px]"><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="402" className={INPUT} /></Field>
            <Field label="Or words in the record's name" className="min-w-[200px] flex-1"><input value={what} onChange={e => setWhat(e.target.value)} placeholder="Apex Roofing" className={INPUT} /></Field>
            <Field label="Why" className="min-w-[240px] flex-1"><input value={why} onChange={e => setWhy(e.target.value)} placeholder="Collections dispute; counsel asked for everything to be kept" className={INPUT} /></Field>
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={!why.trim() || (!what.trim() && !unit.trim())}>Place the hold</Button><Button type="button" size="sm" variant="ghost" onClick={() => setHolding(false)}>Cancel</Button></div>
          </form>
        )}
        {holds.map(h => <Inner key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink" data-hold={h.id}><span><b className="font-semibold">{[h.unit && `Unit ${h.unit}`, h.what].filter(Boolean).join(' · ')}</b> · {h.why}<span className="block text-xs text-ux2-muted">Placed {h.placedOn} by {h.placedBy} · held until released</span></span><Button size="sm" variant="ghost" aria-label={`Release the hold on ${h.unit || h.what}`} onClick={() => { if (window.confirm('Release this hold? Its records go back on the schedule.')) saveRetention({ holds: doc.holds.map(x => (x.id === h.id ? { ...x, releasedOn: today } : x)) }, today); }}>Release</Button></Inner>)}
      </div>

      <Inner className="text-sm text-ux2-ink">{last ? <><b className="font-semibold">Last disposal review: {last.on}</b> · {last.by}{last.vote ? ` · ${last.vote}` : ''} · {last.approved.length ? last.approved.map(a => `${a.count} ${rows.find(r => r.rule.kind === a.kind)?.rule.label.toLowerCase() ?? a.kind}`).join(', ') : 'nothing approved for disposal'}</> : <><b className="font-semibold">No disposal review yet.</b> The board reviews what has passed its period in the year-end close.</>}</Inner>
      <Why>Each kind of record has its own period, and the board can change any of them, down to the shortest a law allows. "Due to go" counts what has passed its period; the app never deletes it. The board approves a list in the year-end close, and whoever holds the records disposes of them. A hold keeps everything for a unit, or everything whose name contains the words given, off that list until it is released. A contract's period starts when it ends, and an owner's documents when they sell; the app does not date either, so those are reviewed by hand. Ask the association's lawyer before disposing of anything.</Why>
    </Card>
  );
}
