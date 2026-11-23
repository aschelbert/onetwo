import { useRef, useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { canStoreFiles, uploadDocumentFile } from '@/lib/services/documentFiles';
import { generateLocalId } from '@/lib/generateId';
import { blankRebuildCheck, parseMoney, rebuildStanding, type RebuildCheck } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, KV, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { useToolDoc } from './docs';
import BoardVoteRoll from './BoardVoteRoll';

const FORM = 'flex flex-wrap items-end gap-3';
const AREA = 'w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm';
const NOTE = 'rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink';
const whole = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^0-9.]/g, '')) || 0));

// ── Collections: ask the board to write the balance off ──────────────────────
export interface WriteOff { reason: string; askedOn: string; askedBy: string; voteOn: string; inFavor: number; against: number; amount: number; postedOn: string }
const BLANK_WRITE_OFF: WriteOff = { reason: '', askedOn: '', askedBy: '', voteOn: '', inFavor: 0, against: 0, amount: 0, postedOn: '' };

/** Post a write-off the board has passed, and close the collections action. Returns the amount written off. */
export function postWriteOff(unitNum: string, caseId: string, w: WriteOff, today: string = todayIso()): number {
  if (!w.voteOn || w.inFavor <= w.against || w.postedOn) return 0;
  const amount = useFinancialStore.getState().writeOffUnit(unitNum, w.reason || 'Board vote ' + w.voteOn, today);
  useIssuesStore.getState().closeCaseWithReason(caseId, 'Written off', 'The board voted ' + w.inFavor + ' to ' + w.against + ' on ' + w.voteOn + ' to write off ' + fmt(amount) + '. ' + w.reason);
  return amount;
}

export function WriteOffTool({ unitNum, caseId, sourceId }: { unitNum: string; caseId: string; sourceId: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const unit = useFinancialStore(s => s.units.find(u => u.number === unitNum));
  const [w, save] = useToolDoc<WriteOff>('write-off', sourceId, BLANK_WRITE_OFF);
  const [reason, setReason] = useState(w.reason);
  const owed = unit?.balance ?? 0;
  const passed = !!w.voteOn && w.inFavor > w.against;
  return (
    <Card aria-label="Write off the balance" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>When it cannot be collected · ask the board to write it off</SectionLabel>{w.postedOn ? <Chip tone="sage">Written off {w.postedOn}</Chip> : w.voteOn ? <Chip tone={passed ? 'navy' : 'red'}>{passed ? 'Passed' : 'Failed'} {w.inFavor} to {w.against}</Chip> : w.askedOn ? <Chip tone="amber">Waits on the board's vote</Chip> : null}</div>
      <Inner><KV label={'Unit ' + unitNum + ' owes'}>{fmt(w.postedOn ? 0 : owed)}</KV>{w.postedOn && <KV label="Written off">{fmt(w.amount)}</KV>}{w.reason && <KV label="Why">{w.reason}</KV>}</Inner>
      {!w.askedOn && (
        <>
          <Field label="Why it cannot be collected (this goes to the board)"><textarea aria-label="Why it cannot be collected" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Unit sold at foreclosure; the lender's payment covered six months; the former owner cannot be found" className={AREA} /></Field>
          <div><Button size="sm" disabled={!reason.trim() || owed <= 0} onClick={() => save({ reason: reason.trim(), askedOn: todayIso(), askedBy: me })}>Ask the board</Button></div>
        </>
      )}
      {w.askedOn && !w.voteOn && <BoardVoteRoll caseId={caseId} motion={'Write off ' + fmt(owed) + ' owed by unit ' + unitNum + ': ' + w.reason} onClose={v => save({ voteOn: v.on, inFavor: v.inFavor, against: v.against })} />}
      {passed && !w.postedOn && <div><Button size="sm" onClick={() => { const amount = postWriteOff(unitNum, caseId, w); save({ amount, postedOn: todayIso() }); }}>Write off {fmt(owed)} and close this action</Button></div>}
      <Why>Nothing is written off without a recorded board vote. The charges stay as billed, so the year's income is unchanged; the loss is taken against the allowance for doubtful accounts first and bad debt expense after that. Money that arrives later is recorded as a payment in Funds.</Why>
    </Card>
  );
}

// ── Insurance renewal: is the building insured for enough, and the new certificate ──
export function InsuranceTools({ policyId, sourceId }: { policyId: string; sourceId: string }) {
  const policy = useBuildingStore(s => s.insurance.find(p => p.id === policyId));
  const update = useBuildingStore(s => s.updateInsurance);
  const attach = useBuildingStore(s => s.addInsuranceAttachment);
  const today = todayIso();
  const limitNow = parseMoney(policy?.coverage);
  const [c, save] = useToolDoc<RebuildCheck>('rebuild-check', sourceId, blankRebuildCheck(limitNow));
  const [appraisal, setAppraisal] = useState(c.appraisal ? String(c.appraisal) : '');
  const [appraisedOn, setAppraisedOn] = useState(c.appraisedOn);
  const [growth, setGrowth] = useState(String(c.growthPct));
  const [floorPct, setFloorPct] = useState(String(c.floorPct));
  const [reason, setReason] = useState(c.reason);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  if (!policy) return null;
  const st = rebuildStanding({ ...c, limit: c.limit || limitNow }, today);
  const choose = (amount: number) => save({ chosenLimit: amount, reason: amount < st.floor ? reason.trim() : '', decidedOn: today });
  const upload = async (file: File) => {
    setBusy(true);
    if (canStoreFiles()) await uploadDocumentFile(generateLocalId('ins'), file);
    attach(policyId, { name: file.name, size: Math.max(1, Math.round(file.size / 1024)) + ' KB', type: file.type || 'file' });
    setBusy(false);
  };
  return (
    <Card aria-label="Insured for enough" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Is the building insured for enough · {policy.type}</SectionLabel>{c.decidedOn ? <Chip tone="sage">Quote at {fmt(c.chosenLimit)}</Chip> : st.insuredPct != null ? <Chip tone={st.underFloor ? 'red' : 'sage'}>Insured for {st.insuredPct}%</Chip> : null}</div>
      <div className={FORM}>
        <Field label="Cost to rebuild, from the last appraisal" className="w-[240px]"><input inputMode="numeric" value={appraisal} onChange={e => setAppraisal(e.target.value)} placeholder="$" className={INPUT} /></Field>
        <Field label="Appraised on" className="w-[170px]"><input type="date" value={appraisedOn} max={today} onChange={e => setAppraisedOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Building costs rise, % a year" className="w-[190px]"><input inputMode="decimal" value={growth} onChange={e => setGrowth(e.target.value)} className={INPUT} /></Field>
        <Field label="Floor, % of rebuild cost" className="w-[170px]"><input inputMode="numeric" value={floorPct} onChange={e => setFloorPct(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" variant="ghost" disabled={!whole(appraisal)} onClick={() => save({ appraisal: whole(appraisal), appraisedOn, growthPct: Number(growth) || 0, floorPct: whole(floorPct) || 80, limit: limitNow, decidedOn: '', chosenLimit: 0 })}>Work it out</Button>
      </div>
      {st.rebuild > 0 && (
        <>
          <Inner><KV label="Rebuild cost today">{fmt(st.rebuild)}</KV><KV label="Limit on the expiring policy">{fmt(c.limit || limitNow)}</KV><KV label="Insured for">{st.insuredPct}%{st.underFloor ? ' · under the ' + c.floorPct + '% floor' : ''}</KV><KV label={'The ' + c.floorPct + '% floor'}>{fmt(st.floor)}</KV></Inner>
          {st.monthsOld != null && st.monthsOld > 36 && <p className={NOTE}>The appraisal is {Math.round(st.monthsOld / 12)} years old. Consider ordering a new one before relying on this figure.</p>}
          <Field label="If the board keeps a limit under the floor, its reason"><input value={reason} onChange={e => setReason(e.target.value)} className={INPUT} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => choose(st.rebuild)}>Quote at {fmt(st.rebuild)} · full rebuild cost</Button>
            <Button size="sm" variant="ghost" onClick={() => choose(st.floor)}>{fmt(st.floor)} · the floor</Button>
            <Button size="sm" variant="ghost" disabled={(c.limit || limitNow) < st.floor && !reason.trim()} onClick={() => choose(c.limit || limitNow)}>{fmt(c.limit || limitNow)} · as now</Button>
          </div>
        </>
      )}
      {c.decidedOn && <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>Ask the broker to quote at {fmt(c.chosenLimit)}.{c.reason ? ' Reason for staying under the floor: ' + c.reason : ''}</span><Button size="sm" variant="ghost" onClick={() => update(policyId, { coverage: fmt(c.chosenLimit) })}>The policy is bound: write this limit onto it</Button></Inner>}
      <Inner className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ux2-ink"><b className="font-semibold">Certificate or declarations page</b><span className="block text-xs text-ux2-muted">{policy.attachments.length ? policy.attachments.map(a => a.name + ' · ' + a.uploadedAt).join(' · ') : 'Nothing attached to this policy yet'}</span></span>
        <span><input ref={picker} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} /><Button size="sm" variant="ghost" disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Uploading' : 'Upload the new certificate'}</Button></span>
      </Inner>
      <Why>The check runs before the quotes come back, the one moment it can change them. The rebuild cost is the appraisal grown for building costs since; the appraiser's figure, not this estimate, is what an insurer relies on. Keeping a limit under the floor is allowed, with the board's reason recorded.</Why>
    </Card>
  );
}
