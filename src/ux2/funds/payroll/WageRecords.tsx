import { useState } from 'react';
import { usePayrollStore } from '@/store/usePayrollStore';
import { fmt } from '@/lib/formatters';
import { WAGE_YEARS, wageRecord, weeks, type WageFacts } from '@/lib/retention';
import { Card, Chip, Inner, KV, Table, Th, Td, Why, Field, INPUT } from '../../components';
import { useToolDoc } from '../../boardroom/tools/docs';
import { BLANK_WAGE, type WageExtra } from '../../building/retention';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The wage record for each employee: what the District's wage law has an
 * employer keep, set against what the app holds, with the hours by workweek.
 * Contractors are not employees and have no wage record.
 */
export default function WageRecords({ today }: { today: string }) {
  const all = usePayrollStore(s => s.staff);
  const staff = all.filter(s => s.type === 'employee');
  const [staffId, setStaffId] = useState('');
  if (!staff.length) return <Card aria-label="Wage records" className="gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Wage records</span><Inner className="text-sm text-ux2-muted">The association has no employees on payroll, so it keeps no wage records. Contractors are paid by 1099.</Inner></Card>;
  const s = staff.find(x => x.id === staffId) ?? staff[0];
  return (
    <Card aria-label="Wage records" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Wage records · kept at least {WAGE_YEARS} years</span>{staff.length > 1 && <select aria-label="Employee" value={s.id} onChange={e => setStaffId(e.target.value)} className="h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-sm text-ux2-ink">{staff.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</div>
      <Record key={s.id} staffId={s.id} today={today} />
      <Why>The District's wage law (D.C. Code § 32-1008) has an employer keep, for each employee: name, address and occupation; date of birth if under 19; the rate of pay and the amount paid each period; and the time worked each day and each week, for at least {WAGE_YEARS} years, or longer where a federal rule asks. Hours that have been paid cannot be deleted for {WAGE_YEARS} years; a mistake is corrected with an edit. A pay run prices an hourly employee's hours past 40 in a week at one and a half times. Confirm withholding, and who is exempt from overtime, with the payroll provider or the accountant.</Why>
    </Card>
  );
}

function Record({ staffId, today }: { staffId: string; today: string }) {
  const s = usePayrollStore(st => st.staff.find(x => x.id === staffId))!;
  const runs = usePayrollStore(st => st.payRuns);
  const entries = usePayrollStore(st => st.timeEntries);
  const [extra, save] = useToolDoc<WageExtra>('wage-facts', staffId, BLANK_WAGE);
  const [address, setAddress] = useState(extra.address);
  const [dob, setDob] = useState(extra.dob);
  const facts: WageFacts = {
    name: s.name, occupation: s.role, rate: s.rate, ...extra,
    paid: runs.filter(r => r.staffId === staffId && r.status === 'paid').map(r => ({ start: r.periodStart, end: r.periodEnd, gross: r.grossPay })),
    days: entries.filter(e => e.staffId === staffId).map(e => ({ date: e.date, hours: e.hours })),
  };
  const checks = wageRecord(facts);
  const missing = checks.filter(c => !c.ok).length;
  const wk = weeks(facts.days).slice(0, 6);
  const oldest = facts.days.map(d => d.date).sort()[0];
  return (
    <div className="flex flex-col gap-3" data-wage-record={staffId} data-missing={missing}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ux2-ink"><b className="font-semibold">{s.name}</b>· {s.role}{missing ? <Chip tone="red">{missing} thing{missing === 1 ? '' : 's'} missing</Chip> : <Chip tone="sage">Complete record</Chip>}{oldest && <span className="text-xs text-ux2-muted">oldest hours held: {oldest}</span>}</div>
      <Inner>{checks.map(c => <KV key={c.item} label={c.item}><span className={c.ok ? '' : 'text-ux2-red-ink'}>{c.detail}</span></KV>)}</Inner>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Home address" className="min-w-[260px] flex-1"><input value={address} onChange={e => setAddress(e.target.value)} onBlur={() => { if (address.trim() !== extra.address) save({ address: address.trim() }); }} placeholder="Street, city, state, zip" className={INPUT} /></Field>
        <Field label="Under 19?" className="w-[170px]"><select aria-label="Under 19?" value={extra.under19 == null ? '' : extra.under19 ? 'yes' : 'no'} onChange={e => save({ under19: e.target.value === '' ? null : e.target.value === 'yes' })} className={INPUT}><option value="">Not answered</option><option value="no">No, 19 or over</option><option value="yes">Yes</option></select></Field>
        {extra.under19 && <Field label="Date of birth" className="w-[170px]"><input type="date" value={dob} max={today} onChange={e => setDob(e.target.value)} onBlur={() => { if (dob !== extra.dob) save({ dob }); }} className={INPUT} /></Field>}
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={extra.exempt} onChange={e => save({ exempt: e.target.checked })} />Salaried and exempt from overtime</label>
      </div>
      {wk.length === 0 ? <Inner className="text-sm text-ux2-muted">No hours are recorded yet. Enter each day's hours under Payroll below.</Inner> : (
        <Table minWidth={760}>
          <thead><tr><Th>Week of</Th>{DAYS.map(d => <Th key={d} num>{d}</Th>)}<Th num>Week</Th><Th>Paid at</Th></tr></thead>
          <tbody>{wk.map(w => (
            <tr key={w.start} data-week={w.start}>
              <Td className="font-semibold">{w.start}</Td>
              {w.days.map((h, i) => <Td key={i} num>{h || <span className="text-ux2-muted">—</span>}</Td>)}
              <Td num><b className="font-semibold">{w.hours}</b></Td>
              <Td className="text-xs">{w.over40 > 0 && !extra.exempt ? <><b className="font-semibold">{w.hours - w.over40} at {fmt(s.rate)}</b> · {w.over40} at time and a half, {fmt(s.rate * 1.5)}</> : `${w.hours} at ${fmt(s.rate)}`}</Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}
