import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { answered, judge, type Check, type CheckState, type ComfortRules, type ReadingKind } from '@/lib/comfort';
import { Button, Card, Chip, Inner, Table, Th, Td, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { addReading, saveRules, useComfort } from '../comfort';

const TONE: Record<CheckState, 'ghost' | 'sage' | 'amber' | 'red'> = { off: 'ghost', 'out-of-season': 'ghost', fine: 'sage', due: 'amber', overdue: 'red', below: 'red' };
const WORD: Record<CheckState, string> = { off: 'Not supplied by the building', 'out-of-season': 'Out of season', fine: 'Holding', due: 'A reading is due', overdue: 'A reading is overdue', below: 'Under the minimum' };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const md = (s: string) => new Date(`2001-${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function ReadingForm({ kind, unit, today, onDone }: { kind: ReadingKind; unit?: string; today: string; onDone: (note: string, caseId: string | null) => void }) {
  const me = useAuthStore(s => s.currentUser.name);
  const [k, setK] = useState<ReadingKind>(kind);
  const [on, setOn] = useState(today);
  const [at, setAt] = useState(nowTime());
  const [where, setWhere] = useState(unit ? `Unit ${unit}` : '');
  const [temp, setTemp] = useState('');
  const [u, setU] = useState(unit ?? '');
  const [note, setNote] = useState('');
  const ok = temp.trim() !== '' && Number.isFinite(Number(temp)) && !!on && !!where.trim();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const { reading, repairCaseId } = addReading({ kind: k, on, at, where: where.trim(), temp: Number(temp), by: me, unit: u.trim(), note: note.trim() }, today);
    onDone(reading.repairId ? `${reading.temp}°F is under the minimum. ${repairCaseId ? 'A repair has been opened for it.' : 'It is added to the repair already open.'}` : `${reading.temp}°F logged.`, repairCaseId);
  };
  return (
    <form aria-label="Log a reading" onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Of" className="w-[140px]"><select aria-label="Reading of" value={k} onChange={e => setK(e.target.value as ReadingKind)} className={INPUT}><option value="heat">Heat</option><option value="hot-water">Hot water</option></select></Field>
      <Field label="Temperature, °F" className="w-[140px]"><input inputMode="decimal" value={temp} onChange={e => setTemp(e.target.value)} className={INPUT} /></Field>
      <Field label="Where" className="min-w-[200px] flex-1"><input value={where} onChange={e => setWhere(e.target.value)} placeholder={k === 'heat' ? 'Third-floor hallway' : 'The farthest tap from the heater'} className={INPUT} /></Field>
      <Field label="Unit, if it answers a resident" className="w-[190px]"><input value={u} onChange={e => setU(e.target.value)} className={INPUT} /></Field>
      <Field label="Date" className="w-[160px]"><input type="date" value={on} max={today} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
      <Field label="Time" className="w-[120px]"><input type="time" value={at} onChange={e => setAt(e.target.value)} className={INPUT} /></Field>
      <Field label="Note (optional)" className="min-w-[200px] flex-1"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Radiator bled" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!ok}>Log it</Button><Button type="button" size="sm" variant="ghost" onClick={() => onDone('', null)}>Cancel</Button></div>
    </form>
  );
}

function RulesForm({ rules, today, onClose }: { rules: ComfortRules; today: string; onClose: () => void }) {
  const [d, setD] = useState({ seasonStart: rules.seasonStart, seasonEnd: rules.seasonEnd, dayMin: String(rules.dayMin), nightMin: String(rules.nightMin), hotWaterMin: String(rules.hotWaterMin), heatEvery: String(rules.heatEvery), hotWaterEvery: String(rules.hotWaterEvery) });
  const set = (k: keyof typeof d, v: string) => setD(x => ({ ...x, [k]: v }));
  const n = (v: string, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
  const date = (v: string, fallback: string) => (/^\d{2}-\d{2}$/.test(v) ? v : fallback);
  return (
    <form aria-label="Heat and hot water rules" onSubmit={e => { e.preventDefault(); saveRules({ seasonStart: date(d.seasonStart, rules.seasonStart), seasonEnd: date(d.seasonEnd, rules.seasonEnd), dayMin: n(d.dayMin, rules.dayMin), nightMin: n(d.nightMin, rules.nightMin), hotWaterMin: n(d.hotWaterMin, rules.hotWaterMin), heatEvery: n(d.heatEvery, rules.heatEvery), hotWaterEvery: n(d.hotWaterEvery, rules.hotWaterEvery) }, today); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Season starts, MM-DD" className="w-[160px]"><input value={d.seasonStart} onChange={e => set('seasonStart', e.target.value)} className={INPUT} /></Field>
      <Field label="Season ends, MM-DD" className="w-[160px]"><input value={d.seasonEnd} onChange={e => set('seasonEnd', e.target.value)} className={INPUT} /></Field>
      <Field label="Heat by day, °F" className="w-[130px]"><input inputMode="numeric" value={d.dayMin} onChange={e => set('dayMin', e.target.value)} className={INPUT} /></Field>
      <Field label="Heat overnight, °F" className="w-[150px]"><input inputMode="numeric" value={d.nightMin} onChange={e => set('nightMin', e.target.value)} className={INPUT} /></Field>
      <Field label="Hot water, °F" className="w-[130px]"><input inputMode="numeric" aria-label="Hot water minimum" value={d.hotWaterMin} onChange={e => set('hotWaterMin', e.target.value)} className={INPUT} /></Field>
      <Field label="Heat reading every, days" className="w-[190px]"><input inputMode="numeric" value={d.heatEvery} onChange={e => set('heatEvery', e.target.value)} className={INPUT} /></Field>
      <Field label="Hot water reading every, days" className="w-[220px]"><input inputMode="numeric" value={d.hotWaterEvery} onChange={e => set('hotWaterEvery', e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Save the rules</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
      <span className="w-full text-xs text-ux2-muted">The starting figures are the District's for heat (14 DCMR § 501). For hot water, sources differ: 120°F at the tap, or 110°F measured in the unit according to the Department of Buildings. The app starts from 120°F, the more protective of the two; confirm which applies to your building and set it here.</span>
    </form>
  );
}

/**
 * Building › Care › Upkeep: heat and hot water. Each rule is a check with readings
 * behind it, so there is something to show an inspector or an owner. A
 * resident's request about heat or hot water is answered with a reading.
 */
export default function ComfortCard({ today, isBoard }: { today: string; isBoard: boolean }) {
  const navigate = useNavigate();
  const { doc, heat, water, complaints } = useComfort(today);
  const r = doc.rules;
  const [form, setForm] = useState<{ kind: ReadingKind; unit?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<{ text: string; caseId: string | null } | null>(null);
  const recent = [...doc.readings].sort((a, b) => (b.on + b.at).localeCompare(a.on + a.at)).slice(0, 6);
  const row = (c: Check, label: string, rule: string, when: string, cite: string, supplied: boolean, key: 'heat' | 'hotWater') => (
    <tr key={c.kind} data-check={c.kind} data-state={c.state}>
      <Td><span className="font-semibold">{label}</span><span className="block text-xs text-ux2-muted">{cite}</span></Td>
      <Td>{rule}</Td>
      <Td>{when}</Td>
      <Td className="text-xs">{c.line}</Td>
      <Td><Chip tone={TONE[c.state]}>{WORD[c.state]}</Chip></Td>
      {isBoard && <Td num><span className="flex items-center justify-end gap-2"><label className="flex items-center gap-1.5 text-xs text-ux2-muted"><input type="checkbox" role="switch" aria-label={`The building supplies the ${label.toLowerCase()}`} checked={supplied} onChange={e => saveRules({ [key]: e.target.checked }, today)} />Supplied</label>{supplied && <Button size="sm" variant="ghost" aria-label={`Log a ${label.toLowerCase()} reading`} onClick={() => setForm({ kind: c.kind })}>Log a reading</Button>}</span></Td>}
    </tr>
  );
  return (
    <Card aria-label="Heat and hot water" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[17px] font-semibold text-ux2-ink">Heat and hot water</span>
        <span className="flex flex-wrap items-center gap-2"><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=obligations&section=records')}>The yearly heating inspection</Button>{isBoard && <Button size="sm" variant="ghost" onClick={() => setEditing(v => !v)}>Edit the rules</Button>}</span>
      </div>
      {editing && <RulesForm rules={r} today={today} onClose={() => setEditing(false)} />}
      {form && <ReadingForm key={`${form.kind}:${form.unit ?? ''}`} kind={form.kind} unit={form.unit} today={today} onDone={(text, caseId) => { setForm(null); setNote(text ? { text, caseId } : null); }} />}
      {note && <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink" role="status"><span>{note.text}</span>{note.caseId && <Button size="sm" onClick={() => navigate(`/boardroom?view=case:${note.caseId}`)}>Open the repair</Button>}</Inner>}
      <Table minWidth={900}>
        <thead><tr><Th>Check</Th><Th>What is asked for</Th><Th>When</Th><Th>Last reading</Th><Th>Standing</Th>{isBoard && <Th aria-label="Actions" />}</tr></thead>
        <tbody>
          {row(heat, 'Heat', `${r.dayMin}°F from ${r.dayFrom} to ${r.dayTo}, ${r.nightMin}°F overnight`, `${md(r.seasonStart)} to ${md(r.seasonEnd)}, a reading every ${r.heatEvery} days`, '14 DCMR § 501', r.heat, 'heat')}
          {row(water, 'Hot water', `${r.hotWaterMin}°F or more`, `All year, a reading every ${r.hotWaterEvery} days`, '14 DCMR ch. 6', r.hotWater, 'hotWater')}
        </tbody>
      </Table>

      {complaints.length > 0 && (
        <div className="flex flex-col gap-2" aria-label="Requests about heat or hot water">
          <b className="text-sm font-semibold text-ux2-ink">Residents asking about heat or hot water · {complaints.length}</b>
          {complaints.map(c => { const a = answered(c, doc.readings, r); return (
            <Inner key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink" data-complaint={c.id}>
              <span><b className="font-semibold">{c.unit ? `Unit ${c.unit}` : 'No unit given'}</b> · {c.what}<span className="block text-xs text-ux2-muted">{c.on ? dayLabel(c.on) : ''}{a.readings.length ? ` · ${a.readings.map(x => `${x.temp}°F on ${dayLabel(x.on)}`).join(', ')}` : ' · no reading taken yet'}</span></span>
              <span className="flex items-center gap-2">{a.met ? <Chip tone="sage">Met on {dayLabel(a.met.on)}</Chip> : <Chip tone="amber">Waiting on a reading that meets it</Chip>}{isBoard && <Button size="sm" variant="ghost" aria-label={`Log a reading for ${c.unit ? `unit ${c.unit}` : 'this request'}`} onClick={() => setForm({ kind: c.kind, unit: c.unit })}>Log a reading</Button>}<Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=requests')}>Open requests</Button></span>
            </Inner>
          ); })}
        </div>
      )}

      {recent.length > 0 && (
        <Inner className="flex flex-col gap-1" aria-label="Recent readings">
          <b className="text-xs font-semibold text-ux2-ink">Recent readings</b>
          {recent.map(x => { const j = judge(x, r); return <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ux2-ink" data-reading={x.id}><span>{dayLabel(x.on)}{x.at ? ` ${x.at}` : ''} · {x.kind === 'heat' ? 'Heat' : 'Hot water'} · {x.where}{x.note ? ` · ${x.note}` : ''} · {x.by}</span><span className={j.ok ? '' : 'font-semibold text-ux2-red-ink'}>{x.temp}°F{j.ok ? '' : ` · ${j.short}° under`}</span></div>; })}
        </Inner>
      )}
      <Why>These apply where the building, not each unit, supplies the heat or the hot water: switch one off if each unit has its own. Heat is checked in season, against the daytime or overnight figure for the time the reading was taken. A reading under the minimum opens a repair, and the check stays red until a later reading meets it. A request from a resident that mentions heat or hot water is listed here until a reading taken for their unit meets the rule. The rules are the District's housing code, written for landlords and tenants; an association follows them for the systems it runs.</Why>
    </Card>
  );
}
