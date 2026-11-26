import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore, type InsurancePolicy } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { usePayrollStore } from '@/store/usePayrollStore';
import { fmt } from '@/lib/formatters';
import { parseMoney, rebuildStanding, type RebuildCheck } from '@/lib/caseTools';
import { COVERAGES, coverageOf, standingOf, usd, type Standing } from '@/lib/policyRead';
import type { PolicyDetails, UnitDocument } from '@/types/financial';
import { Button, Card, Chip, Inner, KV, Table, Th, Td, Tile, TileRow, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { emailAnnouncement } from '../../community/notify';
import OwnerPolicyForm from '../insurance/OwnerPolicyForm';
import { readPolicyFile } from '../insurance/readFile';

export const INSURANCE_LOG = 'insurance-log';
interface LogDoc { changes: { on: string; by: string; policy: string; what: string }[]; ownersRequired?: boolean; remindedOn?: string }
const logFrom = (data: unknown): LogDoc => ({ changes: [], ...((data as Partial<LogDoc>) ?? {}) });
const useLog = () => logFrom(useActionRecordsStore(s => s.records.find(r => r.kind === INSURANCE_LOG))?.data);
const saveLog = (changes: Partial<LogDoc>, today: string) => { const st = useActionRecordsStore.getState(); st.setDoc(INSURANCE_LOG, 'Insurance corrections', { ...logFrom(st.doc(INSURANCE_LOG)?.data), ...changes } as unknown as Record<string, unknown>, today); };

const FIELDS: [keyof InsurancePolicy, string][] = [['type', 'coverage'], ['carrier', 'carrier'], ['policyNum', 'policy number'], ['coverage', 'limit'], ['deductible', 'deductible'], ['premium', 'premium'], ['expires', 'expiry']];
type Draft = { type: string; carrier: string; policyNum: string; coverage: string; deductible: string; premium: string; expires: string };
const draftOf = (p?: InsurancePolicy, type = ''): Draft => ({ type: p?.type ?? type, carrier: p?.carrier ?? '', policyNum: p?.policyNum ?? '', coverage: p?.coverage ?? '', deductible: p?.deductible ?? '', premium: p?.premium ?? '', expires: p?.expires ?? '' });

/** Add or correct a policy. A declarations page or certificate, when given, takes a first pass at the fields. */
function PolicyEditor({ policy, type, today, onClose }: { policy?: InsurancePolicy; type?: string; today: string; onClose: () => void }) {
  const me = useAuthStore(s => s.currentUser.name);
  const [d, setD] = useState<Draft>(draftOf(policy, type));
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filled, setFilled] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const set = (k: keyof Draft, v: string) => setD(x => ({ ...x, [k]: v }));
  const read = async (f: File) => {
    setNote(`Reading ${f.name}…`); setFile(f);
    const { read: r, note: n } = await readPolicyFile(f);
    // A document for a different coverage is not poured into this policy.
    const mine = policy ? coverageOf(policy.type) : undefined, theirs = r.coverage ? coverageOf(r.coverage) : undefined;
    if (mine && theirs && mine.id !== theirs.id) { setFile(null); setFilled([]); setNote(`${f.name} reads as a ${theirs.label.toLowerCase()} document, and this is the ${mine.label.toLowerCase()} policy, so nothing was filled in. Open that policy to use it.`); return; }
    const next: Partial<Draft> = {};
    if (r.coverage && !d.type) next.type = r.coverage;
    if (r.carrier) next.carrier = r.carrier;
    if (r.policyNum) next.policyNum = r.policyNum;
    if (r.limit) next.coverage = usd(r.limit);
    if (r.deductible) next.deductible = usd(r.deductible);
    if (r.premium) next.premium = `${usd(r.premium)}/yr`;
    if (r.expires) next.expires = r.expires;
    setD(x => ({ ...x, ...next })); setFilled(Object.keys(next)); setNote(n);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.type.trim()) return;
    const b = useBuildingStore.getState();
    const attach = (id: string) => { if (file) b.addInsuranceAttachment(id, { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, type: file.type || 'application/pdf' }); };
    if (policy) {
      const changed = FIELDS.filter(([k]) => (policy[k] ?? '') !== d[k as keyof Draft]);
      if (changed.length) b.updateInsurance(policy.id, d);
      attach(policy.id);
      if (changed.length || file) saveLog({ changes: [{ on: today, by: me, policy: d.type, what: [...changed.map(([k, label]) => `${label} ${policy[k] ? `from ${policy[k]} ` : ''}to ${d[k as keyof Draft] || 'blank'}`), file && `${file.name} attached`].filter(Boolean).join('; ') }, ...logFrom(useActionRecordsStore.getState().doc(INSURANCE_LOG)?.data).changes].slice(0, 50) }, today);
    } else {
      b.addInsurance(d);
      const created = useBuildingStore.getState().insurance.slice(-1)[0];
      if (created) attach(created.id);
      saveLog({ changes: [{ on: today, by: me, policy: d.type, what: `added${file ? `, read from ${file.name}` : ''}` }, ...logFrom(useActionRecordsStore.getState().doc(INSURANCE_LOG)?.data).changes].slice(0, 50) }, today);
    }
    onClose();
  };
  const mark = (k: string) => (filled.includes(k) ? `${INPUT} !border-ux2-teal` : INPUT);
  return (
    <form aria-label={policy ? `Edit ${policy.type}` : 'Add a policy'} onSubmit={save} className="flex flex-col gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm font-semibold text-ux2-ink">{policy ? `Edit · ${policy.type}` : 'Add a policy'}</b>
        <span className="flex items-center gap-2"><input ref={picker} type="file" accept="application/pdf,.pdf" aria-label="Declarations page or certificate" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} /><Button type="button" size="sm" variant="ghost" onClick={() => picker.current?.click()}>{file ? 'Read a different PDF' : 'Read the declarations page (PDF)'}</Button></span>
      </div>
      {note && <div className="text-xs text-ux2-muted" role="status">{note}{filled.length > 0 && ' The fields it filled are outlined.'}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Coverage" className="min-w-[220px] flex-1"><input list="coverages" value={d.type} onChange={e => set('type', e.target.value)} placeholder="Directors and officers" className={mark('type')} /><datalist id="coverages">{COVERAGES.map(c => <option key={c.id} value={c.label} />)}</datalist></Field>
        <Field label="Carrier" className="w-[220px]"><input value={d.carrier} onChange={e => set('carrier', e.target.value)} className={mark('carrier')} /></Field>
        <Field label="Policy number" className="w-[190px]"><input value={d.policyNum} onChange={e => set('policyNum', e.target.value)} className={mark('policyNum')} /></Field>
        <Field label="Limit" className="w-[150px]"><input value={d.coverage} onChange={e => set('coverage', e.target.value)} placeholder="$2,000,000" className={mark('coverage')} /></Field>
        <Field label="Deductible" className="w-[130px]"><input value={d.deductible} onChange={e => set('deductible', e.target.value)} placeholder="$5,000" className={mark('deductible')} /></Field>
        <Field label="Premium a year" className="w-[150px]"><input value={d.premium} onChange={e => set('premium', e.target.value)} placeholder="$3,200/yr" className={mark('premium')} /></Field>
        <Field label="Expires" className="w-[170px]"><input type="date" value={d.expires} onChange={e => set('expires', e.target.value)} className={mark('expires')} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!d.type.trim()}>{policy ? 'Save' : 'Add the policy'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        {policy && <Button type="button" size="sm" variant="ghost" onClick={() => { if (window.confirm(`Remove ${policy.type} from the list? Its certificates go with it.`)) { useBuildingStore.getState().removeInsurance(policy.id); saveLog({ changes: [{ on: today, by: me, policy: policy.type, what: 'removed' }, ...logFrom(useActionRecordsStore.getState().doc(INSURANCE_LOG)?.data).changes].slice(0, 50) }, today); onClose(); } }}>Remove the policy</Button>}
      </div>
    </form>
  );
}

const TONE: Record<Standing, 'sage' | 'amber' | 'red' | 'ghost'> = { current: 'sage', expiring: 'amber', lapsed: 'red', unknown: 'ghost' };

function Policies({ today, isBoard }: { today: string; isBoard: boolean }) {
  const policies = useBuildingStore(s => s.insurance);
  const hasEmployees = usePayrollStore(s => s.staff.some(x => x.type === 'employee' && x.status === 'active'));
  const log = useLog();
  const [open, setOpen] = useState<{ id?: string; type?: string } | null>(null);
  const expected = (id: string) => ['property', 'liability', 'do', 'fidelity'].includes(id) || (id === 'workers' && hasEmployees);
  const rows = [
    ...COVERAGES.map(c => ({ c, held: policies.filter(p => coverageOf(p.type)?.id === c.id) })),
  ];
  const other = policies.filter(p => !coverageOf(p.type));
  const premium = policies.reduce((t, p) => t + parseMoney(p.premium), 0);
  const carriers = new Set(policies.map(p => p.carrier).filter(Boolean)).size;
  const missing = rows.filter(r => expected(r.c.id) && r.held.length === 0).length;
  const line = (p: InsurancePolicy, label: string, why?: string) => {
    const st = standingOf(p.expires, today, 60);
    return (
      <tr key={p.id} data-policy={p.id}>
        <Td><span className="font-semibold">{label}</span>{why && <span className="block text-xs text-ux2-muted">{why}</span>}</Td>
        <Td>{p.carrier || <span className="text-ux2-muted">—</span>}<span className="block text-xs text-ux2-muted">{p.policyNum || 'No policy number'}</span></Td>
        <Td num>{p.coverage || '—'}</Td><Td num>{p.deductible || '—'}</Td><Td num>{p.premium || '—'}</Td>
        <Td>{p.expires ? <Chip tone={TONE[st]}>{st === 'lapsed' ? 'Lapsed ' : ''}{dayLabel(p.expires)}</Chip> : <span className="text-ux2-muted">No date</span>}</Td>
        <Td>{p.attachments?.length ? `${p.attachments.length} on file` : <span className="text-ux2-red-ink">Missing</span>}</Td>
        {isBoard && <Td num><Button size="sm" variant="ghost" aria-label={`Edit ${p.type}`} onClick={() => setOpen({ id: p.id })}>Edit</Button></Td>}
      </tr>
    );
  };
  const editing = open?.id ? policies.find(p => p.id === open.id) : undefined;
  return (
    <Card aria-label="The association's policies" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[17px] font-semibold text-ux2-ink">The association's policies</span>
        <span className="flex flex-wrap items-center gap-2"><span className="text-xs text-ux2-muted">{premium ? `${fmt(premium)} a year · ` : ''}{carriers} carrier{carriers === 1 ? '' : 's'}</span>{missing > 0 && <Chip tone="red">{missing} expected and not held</Chip>}{isBoard && <Button size="sm" variant="ghost" onClick={() => setOpen({})}>Add a policy</Button>}</span>
      </div>
      {open && (editing ? <PolicyEditor key={editing.id} policy={editing} today={today} onClose={() => setOpen(null)} /> : <PolicyEditor key={open.type ?? 'new'} type={open.type} today={today} onClose={() => setOpen(null)} />)}
      <Table minWidth={980}>
        <thead><tr><Th>Coverage</Th><Th>Carrier · policy</Th><Th num>Limit</Th><Th num>Deductible</Th><Th num>Premium</Th><Th>Expires</Th><Th>Certificate</Th>{isBoard && <Th aria-label="Actions" />}</tr></thead>
        <tbody>
          {rows.flatMap(({ c, held }) => held.length ? held.map(p => line(p, c.label, c.why)) : [(
            <tr key={c.id} data-not-held={c.id}>
              <Td><span className="font-semibold">{c.label}</span><span className="block text-xs text-ux2-muted">{c.why}</span></Td>
              <Td colSpan={6}><Chip tone={expected(c.id) ? 'red' : 'ghost'}>Not held{expected(c.id) ? '' : ' · not every building carries it'}</Chip></Td>
              {isBoard && <Td num><Button size="sm" variant="ghost" aria-label={`Add ${c.label}`} onClick={() => setOpen({ type: c.label })}>Add</Button></Td>}
            </tr>
          )])}
          {other.map(p => line(p, p.type))}
        </tbody>
      </Table>
      {isBoard && log.changes.length > 0 && <Inner className="flex flex-col gap-1" aria-label="Corrections"><b className="text-xs font-semibold text-ux2-ink">Changes made here</b>{log.changes.slice(0, 5).map((c, i) => <div key={i} className="text-xs text-ux2-ink">{c.on} · {c.by} · {c.policy}: {c.what}</div>)}</Inner>}
      <Why>The list shows the coverages an association usually carries, so one that is not held is a visible row. Reading a declarations page or a certificate fills in what it can find (carrier, policy number, limit, deductible, premium, expiry) and outlines those fields; a person checks them and saves. The renewal action compares quotes and decides the limit; this page is where the result is kept and corrected, and each change is listed.</Why>
    </Card>
  );
}

function Enough({ today }: { today: string }) {
  const navigate = useNavigate();
  const records = useActionRecordsStore(s => s.records);
  const policies = useBuildingStore(s => s.insurance);
  const check = records.filter(r => r.kind === 'rebuild-check').map(r => r.data as unknown as RebuildCheck).filter(c => c.appraisal > 0).sort((a, b) => (b.decidedOn || b.appraisedOn).localeCompare(a.decidedOn || a.appraisedOn))[0];
  const property = policies.find(p => coverageOf(p.type)?.id === 'property');
  const limit = parseMoney(property?.coverage);
  if (!check) return (
    <Card aria-label="Is the building insured for enough?" className="gap-2">
      <span className="text-[17px] font-semibold text-ux2-ink">Is the building insured for enough?</span>
      <Inner className="text-sm text-ux2-ink">Not checked yet. The check needs the cost to rebuild from an appraisal, and is made in the insurance renewal action before quotes are asked for.{limit ? ` The property limit on file is ${fmt(limit)}.` : ''}</Inner>
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=runbooks&runbook=insurance-renewal')}>See the renewal runbook</Button></div>
    </Card>
  );
  const st = rebuildStanding({ ...check, limit: limit || check.limit }, today);
  return (
    <Card aria-label="Is the building insured for enough?" className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Is the building insured for enough?</span>{st.insuredPct != null && <Chip tone={st.underFloor ? 'red' : 'sage'}>Insured for {st.insuredPct}%{st.underFloor ? ` · under the ${check.floorPct}% floor` : ''}</Chip>}</div>
      <Inner>
        <KV label={`Cost to rebuild · appraisal${check.appraisedOn ? `, ${dayLabel(check.appraisedOn)}` : ''}`}>{fmt(check.appraisal)}</KV>
        <KV label={`Grown for building costs since · ${check.growthPct}% a year`}>{fmt(st.rebuild)}</KV>
        <KV label="Property limit">{fmt(limit || check.limit)}</KV>
        {st.underFloor && <KV label={`To reach ${check.floorPct}%`}>raise the limit by {fmt(Math.max(0, st.floor - (limit || check.limit)))}</KV>}
      </Inner>
      {st.monthsOld != null && st.monthsOld > 36 && <Chip tone="amber" className="self-start">The appraisal is over three years old</Chip>}
      <Why>Below the floor, a partial loss can be paid short. The floor and the limit are the board's to set, in the renewal action; this shows where things stand between renewals, using the limit on the property policy above.</Why>
    </Card>
  );
}

const WORD: Record<Standing | 'none', string> = { current: 'Current', expiring: 'Expiring within 30 days', lapsed: 'Lapsed', unknown: 'On file, no expiry date', none: 'None on file' };

function OwnerPolicies({ today, isBoard }: { today: string; isBoard: boolean }) {
  const me = useAuthStore(s => s.currentUser);
  const units = useFinancialStore(s => s.units);
  const docs = useFinancialStore(s => s.unitDocuments);
  const upload = useFinancialStore(s => s.uploadDocument);
  const update = useFinancialStore(s => s.updateDocumentDetails);
  const building = useBuildingStore(s => s.name);
  const log = useLog();
  const required = log.ownersRequired ?? true;
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<{ unit: string; doc?: UnitDocument; file?: File } | null>(null);
  const [note, setNote] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const pickFor = useRef('');
  const rows = useMemo(() => units.map(u => {
    const doc = docs.filter(d => d.unitNumber === u.number && /insur|ho-?6|\bcoi\b/i.test(`${d.docType} ${d.filename}`)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const standing: Standing | 'none' = doc ? standingOf(doc.details?.expires, today) : 'none';
    return { u, doc, standing };
  }), [units, docs, today]);
  const count = (s: Standing | 'none') => rows.filter(r => r.standing === s).length;
  const attention = rows.filter(r => r.standing !== 'current');
  const shown = showAll ? rows : attention;
  const toRemind = attention.filter(r => r.standing !== 'unknown' && r.u.email);
  const remind = async () => {
    setNote('Sending…');
    let sent = 0, last = '';
    for (const r of toRemind) {
      const res = await emailAnnouncement({ title: `${building}: your unit's insurance, unit ${r.u.number}`, body: r.standing === 'none' ? `We have no insurance policy on file for unit ${r.u.number}. Please upload your declarations page under Me › Units.` : `The insurance policy on file for unit ${r.u.number} ${r.standing === 'lapsed' ? 'expired' : 'expires'} ${r.doc?.details?.expires}. Please upload the renewed declarations page under Me › Units.`, category: 'general', postedBy: me.name, recipients: [{ email: r.u.email, name: r.u.owner }] });
      sent += res.sent; if (res.note) last = res.note;
    }
    if (sent) saveLog({ remindedOn: today }, today);
    setNote(sent ? `Reminded ${sent} owner${sent === 1 ? '' : 's'}.` : last || 'No reminder could be sent.');
  };
  const save = async (d: PolicyDetails) => {
    if (!open) return;
    const ok = open.doc ? await update(open.doc.id, d) : open.file ? await upload(open.unit, open.file, 'insurance', true, me.id, me.name, d) : false;
    setNote(ok ? `Unit ${open.unit}'s policy is on file${d.expires ? `, expiring ${d.expires}` : ''}.` : `That could not be saved for unit ${open.unit}. Try again.`);
    setOpen(null);
  };
  return (
    <Card aria-label="Owners' own policies" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[17px] font-semibold text-ux2-ink">Owners' own policies</span>
        {isBoard && <label className="flex items-center gap-2 text-xs font-semibold text-ux2-ink"><input type="checkbox" role="switch" aria-label="The bylaws require owners to carry a policy" checked={required} onChange={e => saveLog({ ownersRequired: e.target.checked }, today)} />The bylaws require owners to carry a policy</label>}
      </div>
      <TileRow>
        <Tile label="Current" value={String(count('current'))} sub={`of ${rows.length} units`} />
        <Tile tone={count('expiring') + count('lapsed') ? 'red' : 'grey'} label="Expiring or lapsed" value={String(count('expiring') + count('lapsed'))} sub={`${count('expiring')} within 30 days · ${count('lapsed')} lapsed`} />
        <Tile label="None on file" value={String(count('none'))} sub={count('unknown') ? `${count('unknown')} more on file with no expiry date` : 'Every file has an expiry date'} />
      </TileRow>
      <input ref={picker} type="file" accept="application/pdf,.pdf,image/*" aria-label="A unit's policy" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setOpen({ unit: pickFor.current, file: f }); }} />
      {open && <OwnerPolicyForm key={`${open.unit}:${open.doc?.id ?? open.file?.name}`} file={open.file} initial={open.doc?.details} by={me.name} today={today} saveLabel={open.doc ? 'Save the correction' : `Put it on file for unit ${open.unit}`} onSave={save} onCancel={() => setOpen(null)} />}
      {note && <Inner className="text-sm text-ux2-ink" role="status">{note}</Inner>}
      {shown.length === 0 ? <Inner className="text-sm text-ux2-muted">Every unit has a current policy on file.</Inner> : (
        <Table minWidth={720}>
          <thead><tr><Th>Unit</Th><Th>Carrier</Th><Th>Expires</Th><Th>Standing</Th>{isBoard && <Th aria-label="Actions" />}</tr></thead>
          <tbody>{shown.map(({ u, doc, standing }) => (
            <tr key={u.number} data-owner-policy={u.number} data-standing={standing}>
              <Td><span className="font-semibold">{u.number}</span><span className="block text-xs text-ux2-muted">{u.owner}</span></Td>
              <Td>{doc?.details?.carrier || <span className="text-ux2-muted">—</span>}{doc && <span className="block text-xs text-ux2-muted">{doc.filename}</span>}</Td>
              <Td>{doc?.details?.expires ? dayLabel(doc.details.expires) : <span className="text-ux2-muted">—</span>}</Td>
              <Td><Chip tone={standing === 'none' ? (required ? 'red' : 'ghost') : TONE[standing]}>{WORD[standing]}</Chip></Td>
              {isBoard && <Td num><span className="flex justify-end gap-1.5">{doc && <Button size="sm" variant="ghost" aria-label={`Enter the details for unit ${u.number}`} onClick={() => setOpen({ unit: u.number, doc })}>{doc.details ? 'Correct' : 'Enter the details'}</Button>}<Button size="sm" variant="ghost" aria-label={`Upload a policy for unit ${u.number}`} onClick={() => { pickFor.current = u.number; picker.current?.click(); }}>Upload</Button></span></Td>}
            </tr>
          ))}</tbody>
        </Table>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show only the ones that need something' : `Show all ${rows.length} units`}</Button>
        {isBoard && required && toRemind.length > 0 && <span className="flex items-center gap-2">{log.remindedOn && <span className="text-xs text-ux2-muted">Last reminded {log.remindedOn}</span>}<Button size="sm" onClick={remind}>Remind the {toRemind.length}</Button></span>}
      </div>
      <Why>Owners upload their own declarations page under Me › Units; the app reads the company, the policy number and the expiry from the PDF, and the owner confirms them. The board can upload one for a unit, or correct what was read. A photo or a scan cannot be read, so its details are typed in. Whether owners must carry a policy is for the bylaws to say: switch it off if they do not, and a missing policy is no longer shown as a problem or reminded.</Why>
    </Card>
  );
}

/** Building › Overview › Insurance: the association's policies, whether the building is insured for enough, and owners' own policies. */
export default function InsuranceTab({ today, isBoard }: { today: string; isBoard: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <Policies today={today} isBoard={isBoard} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
        <Enough today={today} />
        {isBoard && <OwnerPolicies today={today} isBoard={isBoard} />}
      </div>
    </div>
  );
}
