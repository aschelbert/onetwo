import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePayrollStore } from '@/store/usePayrollStore';
import { fmt } from '@/lib/formatters';
import { due, type PayrollFilingData, type PayrollReturn } from '@/lib/actions/payrollFiling';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { FORM, NOTE, money } from '../ActionShell';
import type { PanelProps } from '../RecordAction';
import { wagesIn } from '../../recordActions';

function Check({ r, patch }: PanelProps<PayrollFilingData>) {
  const navigate = useNavigate();
  const staff = usePayrollStore(s => s.staff);
  const runs = usePayrollStore(s => s.payRuns).filter(p => p.periodEnd >= r.data.periodStart && p.periodEnd <= r.data.periodEnd);
  const employees = new Set(staff.filter(s => s.type === 'employee').map(s => s.id));
  const paid = runs.filter(p => p.status === 'paid' && employees.has(p.staffId));
  const unpaid = runs.filter(p => p.status !== 'paid' && employees.has(p.staffId));
  const wages = wagesIn(r.data.periodStart, r.data.periodEnd);
  return (
    <>
      <Inner><KV label="Quarter">{r.data.periodStart} to {r.data.periodEnd}</KV><KV label="Pay runs paid to employees">{paid.length}</KV><KV label="Gross wages">{fmt(wages)}</KV>{unpaid.length > 0 && <KV label="Pay runs not yet paid"><Chip tone="amber">{unpaid.length}</Chip></KV>}</Inner>
      {r.data.wagesCheckedOn ? <Inner className="text-sm text-ux2-ink">Checked {r.data.wagesCheckedOn} at {fmt(r.data.wages)}.</Inner> : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => patch({ wages, wagesCheckedOn: todayIso() })}>The wage records are complete</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=expenses&section=payroll')}>Open staff and payroll</Button>
        </div>
      )}
      <Why>Before anything is filed: every pay period in the quarter has a paid pay run, with the hours behind it. The District asks employers to keep wage and hour records for at least three years.</Why>
    </>
  );
}

function ReturnRow({ x, locked, onChange }: { x: PayrollReturn; locked: boolean; onChange: (c: Partial<PayrollReturn>) => void }) {
  const [on, setOn] = useState(todayIso());
  const [conf, setConf] = useState('');
  const late = !x.filedOn && x.applies && x.dueOn < todayIso();
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span><b className="text-sm font-semibold text-ux2-ink">{x.name}</b><span className="block text-xs text-ux2-muted">To {x.to} · due {x.dueOn}</span></span>
        <span className="flex items-center gap-2">{!x.applies ? <Chip tone="ghost">Does not apply</Chip> : x.filedOn ? <Chip tone="sage">Filed {x.filedOn}{x.confirmation ? ` · ${x.confirmation}` : ''}</Chip> : <Chip tone={late ? 'red' : 'amber'}>{late ? 'Past due' : 'To file'}</Chip>}{!locked && !x.filedOn && <Button size="sm" variant="ghost" onClick={() => onChange({ applies: !x.applies })}>{x.applies ? 'Does not apply' : 'It applies'}</Button>}{!locked && x.filedOn && <Button size="sm" variant="ghost" onClick={() => onChange({ filedOn: '', confirmation: '' })}>Undo</Button>}</span></div>
      {x.applies && !x.filedOn && !locked && (
        <div className={FORM}>
          <Field label="Filed on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
          <Field label="Confirmation number" className="min-w-[180px] flex-1"><input value={conf} onChange={e => setConf(e.target.value)} className={INPUT} /></Field>
          <Button size="sm" disabled={!on} onClick={() => onChange({ filedOn: on, confirmation: conf.trim() })}>Record as filed</Button>
        </div>
      )}
    </Inner>
  );
}

function FileReturns({ r, patch, step }: PanelProps<PayrollFilingData>) {
  const set = (id: string, c: Partial<PayrollReturn>) => patch({ returns: r.data.returns.map(x => (x.id === id ? { ...x, ...c } : x)) });
  return (
    <>
      {step.waitsOn && <p className={NOTE}>Check the wage records first.</p>}
      <div className="flex flex-col gap-2">{r.data.returns.map(x => <ReturnRow key={x.id} x={x} locked={!!r.closedOn || !!step.waitsOn} onChange={c => set(x.id, c)} />)}</div>
      <Why>The returns themselves are filed by the payroll provider or the accountant, or on each agency's own site. This step records that each went in, with its confirmation. Which returns apply to this building, and their exact due dates, are for the provider or accountant to confirm.</Why>
    </>
  );
}

function Pay({ r, patch }: PanelProps<PayrollFilingData>) {
  const [amount, setAmount] = useState(r.data.paid ? String(r.data.paid) : '');
  const [on, setOn] = useState(r.data.paidOn || todayIso());
  const [note, setNote] = useState(r.data.paidNote);
  if (r.data.paidOn) return <Inner><KV label="Paid">{r.data.paid ? fmt(r.data.paid) : 'Nothing owed'}</KV><KV label="On">{r.data.paidOn}</KV>{r.data.paidNote && <KV label="Note">{r.data.paidNote}</KV>}</Inner>;
  return (
    <>
      <div className={FORM}>
        <Field label="Paid with the returns" className="w-[150px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$" className={INPUT} /></Field>
        <Field label="On" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Note" className="min-w-[200px] flex-1"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Paid by the payroll provider from operating" className={INPUT} /></Field>
        <Button size="sm" disabled={!on} onClick={() => patch({ paid: money(amount), paidOn: on, paidNote: note.trim() })}>{money(amount) ? 'Record the payment' : 'Nothing was owed'}</Button>
      </div>
      <Why>This records what was paid and when. It does not post to the ledger: withholding is posted with each pay run, and a payment made outside a pay run is entered in Funds.</Why>
    </>
  );
}

function Proof({ r, patch, close, step }: PanelProps<PayrollFilingData>) {
  if (r.data.proofOn) return <Inner className="text-sm text-ux2-ink">Filed {r.data.proofOn}. Keep the confirmations with the quarter's wage records for at least three years.</Inner>;
  return (
    <>
      <Inner>{due(r.data).map(x => <KV key={x.id} label={x.name}>{x.filedOn ? `${x.filedOn}${x.confirmation ? ` · ${x.confirmation}` : ''}` : 'Not filed'}</KV>)}</Inner>
      <div><Button size="sm" disabled={!!step.waitsOn} onClick={() => { const t = todayIso(); patch({ proofOn: t }); close(t); }}>The confirmations are filed: close</Button></div>
      <Why>The confirmation numbers stay on this action, which is where a past quarter's filings are looked up.</Why>
    </>
  );
}

export const PAYROLL_FILING_PANELS = { check: Check, file: FileReturns, pay: Pay, proof: Proof };
