import { useState, type ReactElement } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { DECISION_LABEL, DENY_GROUNDS, KIND_LABEL, KIND_NOTE, NEED_LABEL, clock, decisionLetter, denialHold, dueFor, type AccommodationData, type Decision, type How, type Need, type RequestKind } from '@/lib/actions/accommodation';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { ACCOMMODATION_SETTINGS, mayHandle, saveAccommodationSettings, settingsFrom } from '../../accommodation';
import { esc, printPage } from '../../tools/docs';
import { AREA, FORM, NOTE } from '../ActionShell';
import type { Panel, PanelProps } from '../RecordAction';

type P = PanelProps<AccommodationData>;
const useSettings = () => settingsFrom(useActionRecordsStore(s => s.records.find(r => r.kind === ACCOMMODATION_SETTINGS))?.data);

/** The day count and who may see the request, shown with every step. */
function Banner({ r }: { r: P['r'] }) {
  const s = useSettings();
  const isBoard = useAuthStore(st => st.currentUser.role) !== 'PROPERTY_MANAGER';
  const c = clock(r.data, s.targetDays, todayIso());
  return (
    <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink" data-accommodation-banner>
      <span className="flex flex-wrap items-center gap-2"><Chip tone="plum">Private</Chip>{c && <Chip tone={c.over ? 'red' : r.data.decidedOn ? 'sage' : 'amber'}>{c.line}</Chip>}<span className="text-xs text-ux2-muted">Seen by board members{isBoard ? (s.managerSees ? ' and the manager' : ' only') : ' and, because the board allows it, the manager'}. Its title and the archive say nothing of who asked or for what.</span></span>
      {isBoard && <span className="flex flex-wrap items-center gap-3 text-xs text-ux2-muted"><label className="flex items-center gap-1.5">Decide within <input aria-label="Days the board gives itself to decide" inputMode="numeric" key={s.targetDays} defaultValue={s.targetDays} onBlur={e => { const n = Math.round(Number(e.target.value)); if (n > 0 && n !== s.targetDays) saveAccommodationSettings({ targetDays: Math.min(60, n) }); }} className="w-12 rounded-[8px] border border-ux2-line-strong px-2 py-1 text-right text-ux2-ink" /> days</label><label className="flex items-center gap-1.5"><input type="checkbox" role="switch" aria-label="The manager may see these requests" checked={s.managerSees} onChange={e => saveAccommodationSettings({ managerSees: e.target.checked })} />The manager may see these</label></span>}
    </Inner>
  );
}

function Log({ r, patch }: P) {
  const units = useFinancialStore(s => s.units);
  const setRecord = useActionRecordsStore(s => s.patch);
  const s = useSettings();
  const d = r.data;
  const [what, setWhat] = useState(d.what);
  const [kind, setKind] = useState<RequestKind>(d.kind);
  const [unit, setUnit] = useState(d.unit);
  const [who, setWho] = useState(d.requester);
  const [behalf, setBehalf] = useState(d.onBehalfBy);
  const [how, setHow] = useState<How>(d.how);
  const [on, setOn] = useState(d.receivedOn || todayIso());
  const ok = !!what.trim() && !!kind && !!who.trim() && !!on;
  return (
    <>
      <Field label="What they asked for, in their words"><textarea aria-label="What they asked for" rows={2} value={what} onChange={e => setWhat(e.target.value)} placeholder="A reserved parking space nearer the garage door" className={AREA} /></Field>
      <div className={FORM}>
        <Field label="Which kind" className="w-[280px]"><select aria-label="Which kind" value={kind} onChange={e => setKind(e.target.value as RequestKind)} className={INPUT}><option value="">Choose</option><option value="accommodation">{KIND_LABEL.accommodation}</option><option value="modification">{KIND_LABEL.modification}</option></select></Field>
        <Field label="Who it is for" className="min-w-[200px] flex-1"><input value={who} onChange={e => setWho(e.target.value)} className={INPUT} /></Field>
        <Field label="Unit" className="w-[120px]"><select aria-label="Unit" value={unit} onChange={e => { setUnit(e.target.value); const x = units.find(y => y.number === e.target.value); if (x && !who.trim()) setWho(x.owner); }} className={INPUT}><option value="">—</option>{units.map(x => <option key={x.number} value={x.number}>{x.number}</option>)}</select></Field>
        <Field label="Asked by someone else? (optional)" className="w-[240px]"><input value={behalf} onChange={e => setBehalf(e.target.value)} placeholder="Her daughter" className={INPUT} /></Field>
        <Field label="How it arrived" className="w-[150px]"><select aria-label="How it arrived" value={how} onChange={e => setHow(e.target.value as How)} className={INPUT}>{(['app', 'email', 'letter', 'phone', 'in person'] as How[]).map(h => <option key={h} value={h}>{h === 'app' ? 'In the app' : h[0].toUpperCase() + h.slice(1)}</option>)}</select></Field>
        <Field label="Received" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!ok} onClick={() => { patch({ what: what.trim(), kind, unit, requester: who.trim(), onBehalfBy: behalf.trim(), how, receivedOn: on }); setRecord(r.id, { dueOn: dueFor(on, s.targetDays) }); }}>Log it</Button>
      </div>
      {kind && <p className={NOTE}>{KIND_NOTE[kind]}</p>}
      <Why>No form is required and no particular words: a request made in person, by phone or by someone else on the person's behalf counts from the day it was made. Log it as it came. The clock runs from that day.</Why>
    </>
  );
}

function Ask({ r, patch, step }: P) {
  const d = r.data;
  const [need, setNeed] = useState<Need>(d.need);
  const [asked, setAsked] = useState(d.askedOn);
  const [got, setGot] = useState(d.infoReceivedOn);
  const [note, setNote] = useState(d.infoNote);
  return (
    <>
      <div className={FORM}>
        <Field label="Is the need for this change apparent, or already known to the board?" className="min-w-[320px] flex-1"><select aria-label="Is the need apparent" value={need} disabled={!!step.waitsOn} onChange={e => setNeed(e.target.value as Need)} className={INPUT}><option value="">Choose</option>{(['apparent', 'known', 'ask'] as const).map(n => <option key={n} value={n}>{NEED_LABEL[n]}</option>)}</select></Field>
        {need === 'ask' && <>
          <Field label="Asked for on" className="w-[170px]"><input type="date" value={asked} max={todayIso()} onChange={e => setAsked(e.target.value)} className={INPUT} /></Field>
          <Field label="Received on" className="w-[170px]"><input type="date" value={got} max={todayIso()} onChange={e => setGot(e.target.value)} className={INPUT} /></Field>
          <Field label="What was provided, in a line" className="min-w-[260px] flex-1"><input value={note} onChange={e => setNote(e.target.value)} placeholder="A letter from someone who knows them" className={INPUT} /></Field>
        </>}
        <Button size="sm" disabled={!need || !!step.waitsOn} onClick={() => patch(need === 'ask' ? { need, askedOn: asked, infoReceivedOn: got, infoNote: note.trim() } : { need, askedOn: '', infoReceivedOn: '', infoNote: '' })}>Save</Button>
      </div>
      {need === 'ask' && <p className={NOTE}>Ask only for something reliable that shows the change is needed because of a disability: a letter from a doctor, a therapist, a social worker or someone else who knows them. Do not ask what the condition is, how severe it is, or for medical records, and do not write any of that here.</p>}
      {(need === 'apparent' || need === 'known') && <p className={NOTE}>Then nothing more is asked for. Go on to the decision.</p>}
      <Why>What the board may ask for is narrow, and asking for more than is needed is itself a problem. If you are unsure whether something may be asked, ask the association's lawyer before you ask the resident.</Why>
    </>
  );
}

function Decide({ r, patch, step }: P) {
  const me = useAuthStore(s => s.currentUser.name);
  const d = r.data;
  const [decision, setDecision] = useState<Decision>(d.decision);
  const [on, setOn] = useState(d.decidedOn || todayIso());
  const [conditions, setConditions] = useState(d.conditions);
  const [ground, setGround] = useState(d.denyGround);
  const [why, setWhy] = useState(d.denyWhy);
  const [alt, setAlt] = useState(d.alternativeDiscussed);
  const [lawyerOn, setLawyerOn] = useState(d.lawyerOn);
  const [lawyerBy, setLawyerBy] = useState(d.lawyerBy);
  const draft: AccommodationData = { ...d, decision, decidedOn: on, conditions: conditions.trim(), denyGround: ground, denyWhy: why.trim(), alternativeDiscussed: alt, lawyerOn, lawyerBy: lawyerBy.trim() };
  const hold = denialHold(draft);
  const blocked = !decision || !on || (decision === 'alternative' && !conditions.trim()) || (!!step.waitsOn && decision !== 'deny');
  if (d.decision && d.decidedOn && !denialHold(d)) return <Inner className="text-sm text-ux2-ink"><b className="font-semibold">{DECISION_LABEL[d.decision]}</b> on {d.decidedOn}.{d.conditions ? ` ${d.conditions}.` : ''}{d.decision === 'deny' ? ` Reviewed by ${d.lawyerBy || 'the lawyer'} on ${d.lawyerOn}.` : ''} <button type="button" className="font-semibold text-ux2-teal underline" onClick={() => patch({ decidedOn: '' })}>Change it</button></Inner>;
  return (
    <>
      <Inner><KV label="Asked for">{d.what || '—'}</KV><KV label="Kind">{d.kind ? KIND_LABEL[d.kind] : '—'}</KV><KV label="What shows the need">{d.need === 'ask' ? d.infoNote || 'Provided' : d.need ? NEED_LABEL[d.need] : '—'}</KV></Inner>
      <div className={FORM}>
        <Field label="The decision" className="w-[340px]"><select aria-label="The decision" value={decision} onChange={e => setDecision(e.target.value as Decision)} className={INPUT}><option value="">Choose</option><option value="grant">Grant as asked</option><option value="alternative">Grant something different, agreed with them</option><option value="deny">Deny</option></select></Field>
        {decision !== 'deny' && <Field label={decision === 'alternative' ? 'What was agreed' : 'Conditions, if any'} className="min-w-[260px] flex-1"><input aria-label="Conditions" value={conditions} onChange={e => setConditions(e.target.value)} placeholder={decision === 'alternative' ? 'Space 16, the next nearest' : 'For as long as they live in the unit'} className={INPUT} /></Field>}
        <Field label="Decided on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
      </div>
      {decision === 'deny' && (
        <Inner className="flex flex-col gap-2" aria-label="A denial">
          <b className="text-sm font-semibold text-ux2-ink">A denial needs all of these, and is held until the lawyer has seen it</b>
          <Field label="The ground it rests on"><select aria-label="The ground it rests on" value={ground} onChange={e => setGround(e.target.value)} className={INPUT}><option value="">Choose</option>{DENY_GROUNDS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>
          <Field label="The board's reasons, in its own words (this goes in the letter)"><textarea aria-label="The board's reasons" rows={2} value={why} onChange={e => setWhy(e.target.value)} className={AREA} /></Field>
          <label className="flex items-start gap-2 text-sm text-ux2-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={alt} onChange={e => setAlt(e.target.checked)} />Something else that might meet the need was discussed with them first, and nothing workable was found</label>
          <div className={FORM}>
            <Field label="Reviewed by the association's lawyer on" className="w-[280px]"><input type="date" aria-label="Lawyer reviewed on" value={lawyerOn} max={todayIso()} onChange={e => setLawyerOn(e.target.value)} className={INPUT} /></Field>
            <Field label="Lawyer" className="min-w-[200px] flex-1"><input value={lawyerBy} onChange={e => setLawyerBy(e.target.value)} className={INPUT} /></Field>
          </div>
          {hold && <span className="text-xs text-ux2-red-ink">Still needed: {hold}.</span>}
        </Inner>
      )}
      <div className={FORM}><Button size="sm" disabled={blocked || !!hold} onClick={() => patch({ ...draft, lawyerBy: draft.lawyerBy || (decision === 'deny' ? me : '') })}>Record the decision</Button>{step.waitsOn && <span className="text-xs text-ux2-muted">Waiting on {step.waitsOn}.</span>}</div>
      <Why>Decide quickly: the law gives no number of days, and a long delay can count as a refusal. If the request cannot be granted as asked, talk to the person about what else would meet the need before deciding. The rules in this area have been changing, most recently for assistance animals, which is why a denial is held for the lawyer. The minutes should say only that an accommodation request was decided, with no name, unit or reason.</Why>
    </>
  );
}

function Tell({ r, patch, step }: P) {
  const me = useAuthStore(s => s.currentUser.name);
  const building = useBuildingStore(s => s.name);
  const d = r.data;
  const [on, setOn] = useState(d.toldOn || todayIso());
  const [how, setHow] = useState(d.toldHow || 'By letter');
  if (step.waitsOn) return <Inner className="text-sm text-ux2-muted">The letter is written from the decision, once there is one.</Inner>;
  const letter = decisionLetter(d, building, me);
  return (
    <>
      <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[12px] border border-ux2-line bg-white px-3.5 py-3 font-sans text-sm text-ux2-ink" data-decision-letter>{letter}</pre>
      <div className={FORM}>
        <Button size="sm" variant="ghost" onClick={() => printPage('Decision', `<pre style="font:14px/1.6 system-ui;white-space:pre-wrap">${esc(letter)}</pre>`)}>Print the letter</Button>
        <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(letter); }}>Copy it</Button>
        <Field label="Sent on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="How" className="w-[200px]"><input value={how} onChange={e => setHow(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!on} onClick={() => patch({ toldOn: on, toldHow: how.trim() })}>They have been told</Button>
      </div>
      <Why>Send it to the person directly, not through a notice or a shared inbox. The letter says what was decided and any conditions; it never says why the request was made. If the request was made in the app, they also see the decision under Community › Requests from the moment this is recorded.</Why>
    </>
  );
}

function Place({ r, patch, close, step }: P) {
  const d = r.data;
  const [on, setOn] = useState(d.inPlaceOn || todayIso());
  const [staff, setStaff] = useState(d.staffNote);
  const [follow, setFollow] = useState(d.followOn);
  if (d.decision === 'deny') return <Inner className="text-sm text-ux2-ink">Nothing to put in place. The record stays private, with the reasons and the lawyer's review, should the request be raised again.</Inner>;
  if (d.inPlaceOn) return <Inner className="text-sm text-ux2-ink">In place since {d.inPlaceOn}.{d.staffNote ? ` Staff are told: "${d.staffNote}".` : ''}{d.followOn ? ` Went on to: ${d.followOn}.` : ''}</Inner>;
  return (
    <>
      <div className={FORM}>
        <Field label="In place on" className="w-[170px]"><input type="date" value={on} max={todayIso()} disabled={!!step.waitsOn} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="What staff are told, with no reason given" className="min-w-[280px] flex-1"><input aria-label="What staff are told" value={staff} onChange={e => setStaff(e.target.value)} placeholder="Space 14 is unit 304's · the dog in 304 is permitted" className={INPUT} /></Field>
        {d.kind === 'modification' && <Field label="The permit or request it went on to" className="min-w-[240px] flex-1"><input value={follow} onChange={e => setFollow(e.target.value)} placeholder="Architectural request · permit B2601234" className={INPUT} /></Field>}
        <Button size="sm" disabled={!on || !!step.waitsOn} onClick={() => { patch({ inPlaceOn: on, staffNote: staff.trim(), followOn: follow.trim() }); close(on); }}>It is in place</Button>
      </div>
      <Why>Tell staff only what they need to act on it. Before a violation notice or a pet fee is raised against this unit, check here: an approved exception is not a violation.{d.kind === 'modification' ? ' A physical change still goes through the permit questions and, where the bylaws ask, an architectural request.' : ''}</Why>
    </>
  );
}

/** Wraps each step so only the people who may see these requests do; the day count and the privacy line sit above every step. */
const guarded = (Step: (p: P) => ReactElement | null): Panel => function Guarded(props: P) {
  const role = useAuthStore(s => s.currentUser.role);
  const s = useSettings();
  if (!mayHandle(role, s)) return <Inner className="text-sm text-ux2-ink" data-accommodation-private><b className="font-semibold">This request is private to the board.</b> A board member can let the manager see these from the action itself.</Inner>;
  return <><Banner r={props.r} /><Step {...props} /></>;
};

export const ACCOMMODATION_PANELS: Record<string, Panel> = { log: guarded(Log), ask: guarded(Ask), decide: guarded(Decide), tell: guarded(Tell), place: guarded(Place) };
