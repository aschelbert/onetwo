/**
 * Setup steps 3–5 on one page: fill the gaps (only what the documents
 * didn't cover, answered here), invite people (optional, prefilled from the
 * board), go live (the four essentials). Owners are invited at go-live, so
 * their first look is a finished building.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fmt, cn } from '@/lib/formatters';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useSetupStore, type InviteAccess } from '@/features/setup/useSetupStore';
import { ACCESS_OPTIONS, EMAIL_RE, SEATS, accessLabel, invitePayload, parseInviteLines, readRole } from '@/features/setup/invites';
import { applyBudgetTemplate } from '@/features/setup/applySetup';
import { resolve } from '@/features/setup/setupModel';
import { isOpeningEntry } from '@/lib/financial-logic';
import { Button, Chip } from '../components';
import OpeningBalances from '../funds/OpeningBalances';
import { useSetup } from './useSetup';
import UnitsEditor from './UnitsEditor';

const INPUT = 'h-10 rounded-[10px] border border-ux2-line-strong bg-white px-3 text-sm text-ux2-ink';
const Done = () => <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ux2-sage text-white"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>;
const Todo = () => <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-ink-300" />;

function Gap({ id, done, title, note, required, children }: { id: string; done: boolean; title: string; note: string; required?: boolean; children?: React.ReactNode }) {
  const later = useSetupStore(s => s.later.includes(id));
  const setLater = useSetupStore(s => s.setLater);
  return (
    <div data-gap={id} data-done={done ? 'true' : 'false'} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-sm">
      {done ? <Done /> : <Todo />}
      <span className="min-w-[220px] flex-1"><b className="font-semibold">{title}</b>{required && !done && <Chip tone="plum" className="ml-2 px-2 py-1">Needed to go live</Chip>}<span className="block text-xs text-ux2-muted">{note}</span></span>
      {!done && !later && children}
      {!done && !required && <Button size="sm" variant="ghost" onClick={() => setLater(id, !later)}>{later ? 'Do it now' : 'Later'}</Button>}
    </div>
  );
}

async function sendInvites(invitees: { email: string; role: string; unit?: string | null }[], senderName: string) {
  if (!supabase) throw new Error('Invitations are sent from your building’s live account.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to send invitations.');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ invitees, senderName }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as { total?: number; sent?: number; invitations?: { email: string; code?: string; sent: boolean; error?: string }[] };
}

export default function FinishStep({ onReview, onDocuments }: { onReview: () => void; onDocuments: () => void }) {
  const s = useSetup();
  const navigate = useNavigate();
  const tenant = useTenantContext();
  const viewer = useAuthStore(x => x.currentUser);
  const b = useBuildingStore();
  const f = useFinancialStore();
  const invitedBoard = useSetupStore(x => x.invitedBoard);
  const setInvitedBoard = useSetupStore(x => x.setInvitedBoard);

  const [profile, setProfile] = useState({ name: b.name, street: b.address.street, city: b.address.city, state: b.address.state, zip: b.address.zip });
  const [member, setMember] = useState({ name: '', role: 'President', email: '' });
  const [sameFee, setSameFee] = useState('');
  const [splitTotal, setSplitTotal] = useState('');
  const [openingOpen, setOpeningOpen] = useState(false);
  const [fees, setFees] = useState({ dueDay: String(f.hoaDueDay ?? 1), lateFee: f.lateFeeEnabled ? String(f.lateFeeAmount) : '', grace: String(f.lateFeeGraceDays) });
  const [feesSaved, setFeesSaved] = useState(false);
  const [inviteOff, setInviteOff] = useState<string[]>([]);
  const invites = useSetupStore(x => x.invites);
  const addInvites = useSetupStore(x => x.addInvites);
  const removeInvite = useSetupStore(x => x.removeInvite);
  const recordInviteResults = useSetupStore(x => x.recordInviteResults);
  const [person, setPerson] = useState<{ email: string; access: InviteAccess; seat: string; unit: string }>({ email: '', access: 'owner', seat: 'director', unit: '' });
  const [personError, setPersonError] = useState('');
  const [unitsOpen, setUnitsOpen] = useState(f.units.length === 0);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [inviteOwners, setInviteOwners] = useState(true);
  const [note, setNote] = useState<{ tone: 'sage' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const units = f.units;
  const unassessed = units.filter(u => !(u.monthlyFee > 0));
  const monthlyTotalItem = s.items.find(i => i.key === 'fact:monthly_assessment_total' && s.decisions[i.key]?.status === 'accepted');
  const monthlyTotal = monthlyTotalItem ? Number(resolve(monthlyTotalItem, s.decisions[monthlyTotalItem.key]?.picks).value) || 0 : 0;
  const pctTotal = units.reduce((t, u) => t + (u.votingPct || 0), 0);
  const canSplit = monthlyTotal > 0 && units.length > 0 && Math.abs(pctTotal - 100) < 0.5;
  const openingDone = f.generalLedger.some(e => isOpeningEntry(e) || /opening .*balance/i.test(e.memo ?? ''));
  const asOfItem = s.items.find(i => i.key === 'fact:balance_as_of' && s.decisions[i.key]?.status === 'accepted');
  const asOfRaw = asOfItem ? String(resolve(asOfItem, s.decisions[asOfItem.key]?.picks).value ?? '') : '';
  const asOfDefault = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : (() => { const d = new Date(asOfRaw); return asOfRaw && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null; })();
  const today = new Date().toISOString().slice(0, 10);
  const annualFromUnits = units.reduce((t, u) => t + (u.monthlyFee || 0), 0) * 12;
  const noEmail = units.filter(u => u.owner && !u.email);
  const boardWithEmail = b.board.filter(m => m.email);
  const sentEmails = new Set(useSetupStore.getState().invites.filter(i => i.sentAt).map(i => i.email));
  const ownersWithEmail = units.filter(u => u.email && !sentEmails.has(u.email.toLowerCase()));

  const saveProfile = () => {
    if (profile.name.trim()) b.updateName(profile.name.trim());
    b.updateAddress({ street: profile.street.trim(), city: profile.city.trim(), state: profile.state.trim(), zip: profile.zip.trim() });
  };
  const addMember = () => { if (member.name.trim()) { b.addBoardMember({ name: member.name.trim(), role: member.role, email: member.email.trim(), phone: '', term: '' }); setMember({ name: '', role: 'Director', email: '' }); } };
  const pctReady = units.length > 0 && Math.abs(pctTotal - 100) < 0.5;
  const splitTyped = () => { const t = Number(splitTotal.replace(/[$,\s]/g, '')); if (t > 0) for (const u of units) f.updateUnit(u.number, { monthlyFee: Math.round(t * (u.votingPct / 100) * 100) / 100 }); };
  const split = () => { for (const u of units) f.updateUnit(u.number, { monthlyFee: Math.round(monthlyTotal * (u.votingPct / 100) * 100) / 100 }); };
  const applySame = () => { const n = Number(sameFee.replace(/[$,]/g, '')); if (n > 0) for (const u of unassessed) f.updateUnit(u.number, { monthlyFee: n }); };
  const saveFees = () => {
    const due = Number(fees.dueDay); const fee = Number(fees.lateFee.replace(/[$,]/g, '')); const grace = Number(fees.grace);
    if (due >= 1 && due <= 28) f.setHoaDueDay(due);
    f.setLateFeeSettings(fee > 0, fee > 0 ? fee : f.lateFeeAmount, grace >= 0 ? grace : f.lateFeeGraceDays);
    setFeesSaved(true);
  };

  const addPerson = () => {
    const email = person.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setPersonError('Enter an email address.'); return; }
    if (invites.some(i => i.email === email)) { setPersonError('Already on the list.'); return; }
    const unitOk = ACCESS_OPTIONS.find(a => a.id === person.access)?.unit;
    addInvites([{ email, access: person.access, seat: person.access === 'board' ? person.seat : null, unit: unitOk && person.unit.trim() ? person.unit.trim().toUpperCase() : null }]);
    setPerson(p => ({ ...p, email: '', unit: '' }));
    setPersonError('');
  };
  const addPasted = () => {
    const { invites: found, skipped } = parseInviteLines(pasteText, units.map(u => u.number));
    addInvites(found);
    setPasteText('');
    setPasting(false);
    setNote(skipped.length ? { tone: 'red', text: `Added ${found.length}. ${skipped.length} line${skipped.length === 1 ? ' has' : 's have'} no email and ${skipped.length === 1 ? 'was' : 'were'} skipped: ${skipped.slice(0, 2).join(' · ')}${skipped.length > 2 ? '…' : ''}` } : { tone: 'sage', text: `Added ${found.length} ${found.length === 1 ? 'person' : 'people'} to the list.` });
  };

  // Board members already on the roster (with an email) join the same send; the roster's office becomes their seat.
  const rosterToSend = boardWithEmail.filter(m => !inviteOff.includes(m.id) && !invites.some(i => i.email === m.email.toLowerCase()));
  const queued = invites.filter(i => !i.sentAt);
  const toSendCount = queued.length + (invitedBoard ? 0 : rosterToSend.length);

  const sendAll = async () => {
    const roster = invitedBoard ? [] : rosterToSend.map(m => ({ email: m.email.toLowerCase(), access: 'board' as const, seat: readRole(m.role).seat ?? 'director', unit: null }));
    const list = [...queued, ...roster];
    if (!list.length) return;
    setBusy(true); setNote(null);
    try {
      const data = await sendInvites(list.map(invitePayload), viewer.name);
      const at = new Date().toISOString();
      addInvites(roster);
      // What actually happened per person: the invitation exists either way; the email may not have gone out.
      const results = data.invitations ?? list.map(i => ({ email: i.email, sent: true }));
      recordInviteResults(results, at);
      if (roster.length) setInvitedBoard(true);
      // An owner invited to a unit that has no email on file: keep the email on the unit too.
      for (const i of list) {
        if ((i.access === 'owner' || i.access === 'board') && i.unit) {
          const u = units.find(x => x.number.toLowerCase() === i.unit!.toLowerCase());
          if (u && !u.email) f.updateUnit(u.number, { email: i.email });
        }
      }
      const emailed = results.filter(r => r.sent).length;
      const n = results.length;
      const login = `${window.location.origin}/login`;
      setNote(emailed === n
        ? { tone: 'sage', text: `${n} invitation${n === 1 ? '' : 's'} sent.` }
        : results.some(r => !r.sent && /not configured/i.test((r as { error?: string }).error ?? ''))
          ? { tone: 'red', text: `${n} invitation${n === 1 ? '' : 's'} created, but email isn't set up here, so ${emailed ? `only ${emailed} went out` : 'none were emailed'}. Share each code below; people enter it at ${login}.` }
          : { tone: 'red', text: `${emailed} of ${n} invitation emails went out. Share the codes below with the rest; people enter them at ${login}.` });
    } catch (e) { setNote({ tone: 'red', text: e instanceof Error ? e.message : 'Invitations could not be sent.' }); }
    finally { setBusy(false); }
  };

  const goLive = async () => {
    setBusy(true); setNote(null);
    try {
      if (inviteOwners && ownersWithEmail.length) await sendInvites(ownersWithEmail.map(u => ({ email: u.email, role: 'resident', unit: u.number })), viewer.name);
      await tenant.updateOnboardingStep('buildingProfileComplete', true);
      await tenant.updateOnboardingStep('unitsConfigured', true);
      if (s.docs.some(d => d.docType === 'bylaws' || d.docType === 'declaration')) await tenant.updateOnboardingStep('bylawsUploaded', true);
      if (f.budgetCategories.length) await tenant.updateOnboardingStep('financialSetupDone', true);
      if (invitedBoard || inviteOwners || invites.some(i => i.sentAt)) await tenant.updateOnboardingStep('firstUserInvited', true);
      await tenant.updateOnboardingStep('goLive', true);
      navigate('/home');
    } catch (e) {
      setNote({ tone: 'red', text: e instanceof Error ? e.message : 'Going live did not finish. Try again.' });
    } finally { setBusy(false); }
  };

  const essentials = [
    { done: s.ess.profile, label: 'Building name and address' },
    { done: s.ess.units, label: units.length ? `${units.length} units with owners` : 'Units and owners' },
    { done: s.ess.board, label: b.board.length ? `${b.board.length} board member${b.board.length === 1 ? '' : 's'}` : 'At least one board member' },
    { done: s.ess.assessment, label: 'Monthly assessment for every unit' },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      {s.pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ux2-plum-tint px-4 py-3 text-sm text-ux2-plum">
          <span className="flex-1"><b className="font-semibold">{s.pending.length} thing{s.pending.length === 1 ? '' : 's'} from your documents still to review.</b> Accepting them may fill some of these gaps.</span>
          <Button size="sm" variant="plum" onClick={onReview}>Review</Button>
        </div>
      )}

      <section id="setup-gaps" aria-labelledby="gaps-h" className="flex scroll-mt-4 flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <h2 id="gaps-h" className="text-xl font-medium">3 · Fill the gaps</h2>
        <p className="m-0 text-[13px] text-ux2-muted">Only what your documents didn't cover. Each answer saves on its own.</p>
        <Gap id="profile" required done={s.ess.profile} title="Building name and address" note="Shown on statements, notices and invitations.">
          <span className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="sp-name">Building name</label><input id="sp-name" className={cn(INPUT, 'w-52')} placeholder="Building name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            <label className="sr-only" htmlFor="sp-street">Street</label><input id="sp-street" className={cn(INPUT, 'w-52')} placeholder="Street" value={profile.street} onChange={e => setProfile(p => ({ ...p, street: e.target.value }))} />
            <label className="sr-only" htmlFor="sp-city">City</label><input id="sp-city" className={cn(INPUT, 'w-32')} placeholder="City" value={profile.city} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} />
            <label className="sr-only" htmlFor="sp-zip">ZIP</label><input id="sp-zip" className={cn(INPUT, 'w-24')} placeholder="ZIP" value={profile.zip} onChange={e => setProfile(p => ({ ...p, zip: e.target.value }))} />
            <Button size="sm" variant="plum" onClick={saveProfile}>Save</Button>
          </span>
        </Gap>
        <Gap id="units" required done={s.ess.units} title="Units and owners" note={units.length ? `${units.length} units · add more or edit them below` : 'Add them below, or import your owner list (Excel, CSV or PDF) in step 1.'}>
          <Button size="sm" variant="ghost" onClick={onDocuments}>Import the owner list</Button>
        </Gap>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="ghost" className="self-start" aria-expanded={unitsOpen} onClick={() => setUnitsOpen(o => !o)}>{unitsOpen ? 'Hide units' : units.length ? `Add or edit units (${units.length})` : 'Add units by hand'}</Button>
          {unitsOpen && <UnitsEditor />}
        </div>
        <Gap id="assessment" required done={s.ess.assessment} title="Monthly assessment for every unit" note={units.length ? `${unassessed.length} of ${units.length} units have no monthly amount yet.` : 'Add units first.'}>
          {canSplit && <Button size="sm" variant="plum" onClick={split}>Split {fmt(monthlyTotal)} a month by ownership %</Button>}
          {!canSplit && pctReady && (
            <span className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sp-total">Total monthly assessments for the building</label>
              <input id="sp-total" inputMode="decimal" className={cn(INPUT, 'w-36')} placeholder="$ total a month" value={splitTotal} onChange={e => setSplitTotal(e.target.value)} />
              <Button size="sm" variant="ghost" onClick={splitTyped}>Split by ownership %</Button>
            </span>
          )}
          {units.length > 0 && (
            <span className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sp-same">Same monthly amount for each unit</label>
              <input id="sp-same" className={cn(INPUT, 'w-28')} placeholder="$ per unit" value={sameFee} onChange={e => setSameFee(e.target.value)} />
              <Button size="sm" variant="ghost" onClick={applySame}>Same for each</Button>
            </span>
          )}
          {unassessed.length > 0 && (
            <div className="basis-full" data-unit-fees>
              <div className="mb-1.5 text-xs font-semibold text-ux2-muted">Or unit by unit</div>
              <ul className="m-0 grid max-h-[360px] list-none grid-cols-1 gap-1.5 overflow-auto p-0 sm:grid-cols-2">
                {unassessed.map(u => (
                  <li key={u.number} className="flex items-center gap-2 rounded-xl border border-ux2-line bg-ux2-surface px-3 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{u.number}</b>{u.owner ? <span className="text-ux2-muted"> · {u.owner}</span> : null}{u.votingPct ? <span className="text-ux2-muted"> · {u.votingPct}%</span> : null}</span>
                    <label className="flex items-center gap-1 text-xs text-ux2-muted">$
                      <input inputMode="decimal" aria-label={`Monthly assessment for ${u.number}`} className="h-9 w-24 rounded-[10px] border border-ux2-line-strong bg-white px-2 text-sm text-ux2-ink" placeholder="a month"
                        onBlur={e => { const n = Number(e.target.value.replace(/[$,\s]/g, '')); if (e.target.value.trim() && n > 0) f.updateUnit(u.number, { monthlyFee: n }); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Gap>
        <Gap id="board" required done={s.ess.board} title="At least one board member" note="Usually found in the annual meeting minutes.">
          <span className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="sp-bname">Name</label><input id="sp-bname" className={cn(INPUT, 'w-44')} placeholder="Name" value={member.name} onChange={e => setMember(m => ({ ...m, name: e.target.value }))} />
            <label className="sr-only" htmlFor="sp-brole">Office</label>
            <select id="sp-brole" className={cn(INPUT, 'w-36')} value={member.role} onChange={e => setMember(m => ({ ...m, role: e.target.value }))}>{['President', 'Vice President', 'Treasurer', 'Secretary', 'Director'].map(r => <option key={r}>{r}</option>)}</select>
            <label className="sr-only" htmlFor="sp-bemail">Email</label><input id="sp-bemail" type="email" className={cn(INPUT, 'w-52')} placeholder="Email" value={member.email} onChange={e => setMember(m => ({ ...m, email: e.target.value }))} />
            <Button size="sm" variant="plum" onClick={addMember}>Add</Button>
          </span>
        </Gap>
        <Gap id="fees" done={feesSaved} title="Due day and late fee" note="From your bylaws or collection policy: the day assessments are due, and the fee once a payment is late.">
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ux2-muted" htmlFor="sp-due">Due day<input id="sp-due" inputMode="numeric" className={cn(INPUT, 'w-16')} value={fees.dueDay} onChange={e => setFees(x => ({ ...x, dueDay: e.target.value }))} /></label>
            <label className="flex items-center gap-1.5 text-xs text-ux2-muted" htmlFor="sp-fee">Late fee $<input id="sp-fee" inputMode="decimal" className={cn(INPUT, 'w-20')} placeholder="none" value={fees.lateFee} onChange={e => setFees(x => ({ ...x, lateFee: e.target.value }))} /></label>
            <label className="flex items-center gap-1.5 text-xs text-ux2-muted" htmlFor="sp-grace">after<input id="sp-grace" inputMode="numeric" className={cn(INPUT, 'w-16')} value={fees.grace} onChange={e => setFees(x => ({ ...x, grace: e.target.value }))} />days</label>
            <Button size="sm" variant="plum" onClick={saveFees}>Save</Button>
          </span>
        </Gap>
        <Gap id="balances" done={openingDone} title="Opening balances · the state of the books" note="As of one cutover date: the bank balances, what each owner owed or had paid ahead, and the bills not yet paid. Posts to the ledger and closes the books through that date.">
          <Button size="sm" variant="plum" aria-expanded={openingOpen} onClick={() => setOpeningOpen(o => !o)}>{openingOpen ? 'Hide' : 'Enter the opening balances'}</Button>
        </Gap>
        {openingDone && !openingOpen && <div className="-mt-1 pl-1"><Button size="sm" variant="ghost" aria-expanded={openingOpen} onClick={() => setOpeningOpen(true)}>Review or re-enter the opening balances</Button></div>}
        {openingOpen && <div className="rounded-2xl border border-ux2-line bg-white px-4 py-3"><OpeningBalances today={today} defaultAsOf={asOfDefault} /></div>}
        <Gap id="budget" done={f.budgetCategories.length > 0} title="This year's budget" note={f.budgetCategories.length ? `${f.budgetCategories.length} budget lines · ${fmt(f.budgetCategories.reduce((t, c) => t + c.budgeted, 0))} a year` : annualFromUnits ? `Not uploaded. Start from a template sized to ${fmt(annualFromUnits)} a year of assessments, then adjust the lines in Funds › Planning.` : 'Upload it, or set assessments first and start from a template.'}>
          {annualFromUnits > 0 && <Button size="sm" variant="plum" onClick={() => applyBudgetTemplate(annualFromUnits)}>Use the template</Button>}
          <Button size="sm" variant="ghost" onClick={onDocuments}>Add the budget</Button>
        </Gap>
        <Gap id="emails" done={units.length > 0 && noEmail.length === 0} title={noEmail.length ? `Emails for ${noEmail.length} owner${noEmail.length === 1 ? '' : 's'}` : 'Owner emails'} note={noEmail.length ? `${noEmail.length === 1 ? 'Unit' : 'Units'} ${noEmail.slice(0, 4).map(u => u.number).join(', ')}${noEmail.length > 4 ? '…' : ''} ${noEmail.length === 1 ? 'gets' : 'get'} paper notices until you add an email.` : 'Every owner with a unit has an email.'}>
          <Button size="sm" variant="ghost" onClick={() => { setUnitsOpen(true); window.setTimeout(() => document.querySelector('[data-units-editor]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }}>Add them in the units list</Button>
        </Gap>
      </section>

      <section id="setup-invite" aria-labelledby="invite-h" className="flex scroll-mt-4 flex-col gap-3 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="invite-h" className="flex-1 text-xl font-medium">4 · Invite people <span className="text-sm text-ux2-muted">· optional, you can do it after going live</span></h2>
          {toSendCount > 0 && <Button variant="plum" disabled={busy} onClick={() => void sendAll()}>{busy ? 'Sending…' : `Send ${toSendCount} invitation${toSendCount === 1 ? '' : 's'}`}</Button>}
        </div>
        <p className="m-0 text-[13px] text-ux2-muted">Each person gets an email with a one-time code. Their role and unit are set when they accept: owners and residents see their unit, board members their seat.</p>

        <div className="flex flex-col gap-2 rounded-2xl border border-ux2-line bg-white px-4 py-3" data-invite-form>
          <div className="text-sm font-semibold">Add someone</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-ux2-muted">Email
              <input type="email" className={INPUT} placeholder="name@example.com" value={person.email} onChange={e => { setPerson(p => ({ ...p, email: e.target.value })); setPersonError(''); }} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ux2-muted">Role
              <select className={cn(INPUT, 'w-44')} value={person.access} onChange={e => setPerson(p => ({ ...p, access: e.target.value as InviteAccess }))}>
                {ACCESS_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            {person.access === 'board' && (
              <label className="flex flex-col gap-1 text-xs text-ux2-muted">Seat
                <select className={cn(INPUT, 'w-40')} value={person.seat} onChange={e => setPerson(p => ({ ...p, seat: e.target.value }))}>
                  {SEATS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
            )}
            {ACCESS_OPTIONS.find(a => a.id === person.access)?.unit && (
              <label className="flex flex-col gap-1 text-xs text-ux2-muted">Unit{person.access === 'board' ? ' (if an owner)' : ''}
                <input list="setup-unit-list" className={cn(INPUT, 'w-28')} placeholder="e.g. 4B" value={person.unit} onChange={e => setPerson(p => ({ ...p, unit: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} />
              </label>
            )}
            <datalist id="setup-unit-list">{units.map(u => <option key={u.number} value={u.number}>{u.owner}</option>)}</datalist>
            <Button size="sm" variant="plum" className="h-10" onClick={addPerson}>Add</Button>
          </div>
          {personError && <span role="alert" className="text-xs text-ux2-red-ink">{personError}</span>}
          <div>
            <Button size="sm" variant="ghost" aria-expanded={pasting} onClick={() => setPasting(p => !p)}>{pasting ? 'Close' : 'Add several at once'}</Button>
          </div>
          {pasting && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-ux2-muted" htmlFor="setup-invite-paste">One person per line: an email, then the role and unit in any order, e.g. "ana@example.com, treasurer, 4B" or "jo@example.com tenant unit 12". Lines without a role are owners.</label>
              <textarea id="setup-invite-paste" rows={5} className="w-full rounded-xl border border-ux2-line-strong px-3 py-2 text-sm" value={pasteText} onChange={e => setPasteText(e.target.value)} />
              <Button size="sm" variant="plum" className="self-start" disabled={!pasteText.trim()} onClick={addPasted}>Add these</Button>
            </div>
          )}
        </div>

        {(invites.length > 0 || boardWithEmail.length > 0) && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="People to invite">
            {invites.map(i => (
              <li key={i.id} data-invite={i.email} className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3.5 py-2.5 text-sm">
                <span className="min-w-[220px] flex-1 break-words"><b className="font-semibold">{i.email}</b> <span className="text-ux2-muted">· {accessLabel(i)}{i.unit ? ` · Unit ${i.unit}` : ''}</span></span>
                {i.sentAt
                  ? i.emailed === false
                    ? <Chip tone="amber" title="Created, but the email didn't go out. Share the code; they enter it on the sign-in page.">Not emailed · code {i.code ?? '—'}</Chip>
                    : <Chip tone="sage">Sent</Chip>
                  : <Chip tone="plum">Not sent yet</Chip>}
                {!i.sentAt && <Button size="sm" variant="ghost" aria-label={`Remove ${i.email}`} onClick={() => removeInvite(i.id)}>Remove</Button>}
              </li>
            ))}
            {boardWithEmail.filter(m => !invites.some(i => i.email === m.email.toLowerCase())).map(m => (
              <li key={m.id}>
                <label className="flex min-h-[44px] flex-wrap items-center gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3.5 py-2.5 text-sm">
                  <input type="checkbox" checked={!inviteOff.includes(m.id)} disabled={invitedBoard} onChange={e => setInviteOff(x => (e.target.checked ? x.filter(id => id !== m.id) : [...x, m.id]))} className="h-[18px] w-[18px] shrink-0 accent-[#4F46A8]" />
                  <span className="min-w-[200px] flex-1 break-words"><b className="font-semibold">{m.name}</b> <span className="text-ux2-muted">· {m.role} · {m.email} · from the board roster</span></span>
                  {invitedBoard ? <Chip tone="sage">Sent</Chip> : <Chip tone="plum">Not sent yet</Chip>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {note && <div role="status" className={cn('rounded-xl px-3 py-2 text-sm', note.tone === 'sage' ? 'bg-ux2-sage-tint text-ux2-sage' : 'bg-ux2-red-tint text-ux2-red-ink')}>{note.text}</div>}
      </section>

      <section id="setup-live" aria-labelledby="live-h" className="grid scroll-mt-4 grid-cols-1 gap-[18px] rounded-[22px] bg-ux2-plum p-6 text-white md:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <h2 id="live-h" className="text-[22px] font-medium">5 · Go live</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {essentials.map(e => (
              <li key={e.label} className="flex items-center gap-2.5">
                {e.done ? <span aria-hidden="true" className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white text-ux2-plum"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span> : <span aria-hidden="true" className="h-[22px] w-[22px] rounded-full border-[1.5px] border-white/60" />}
                <span>{e.label}{!e.done && <span className="sr-only"> (not done)</span>}</span>
              </li>
            ))}
          </ul>
          {ownersWithEmail.length > 0 && (
            <label className="mt-1 flex min-h-[44px] items-center gap-2.5 text-sm">
              <input type="checkbox" checked={inviteOwners} onChange={e => setInviteOwners(e.target.checked)} className="h-[18px] w-[18px] accent-white" />
              Invite the {ownersWithEmail.length} owner{ownersWithEmail.length === 1 ? '' : 's'} with an email when I go live
            </label>
          )}
          <button type="button" disabled={!s.ready || busy} onClick={() => void goLive()} className="mt-1.5 h-12 rounded-full bg-white text-[15px] font-semibold text-ux2-plum disabled:cursor-not-allowed disabled:bg-white/35 disabled:text-white">
            {busy ? 'Working…' : s.ready ? 'Go live' : `Go live · ${s.missing} essential${s.missing === 1 ? '' : 's'} left`}
          </button>
          {tenant.isDemo && <p className="m-0 text-xs text-white/75">This is the demo: going live does nothing here.</p>}
        </div>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-white/90">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/70">When you go live</div>
          <div>Owners get their invitation{inviteOwners ? '' : ' when you send it'}, and see the building as you've set it up.</div>
          <div>Insurance renewals, contract ends and reserve items show up as duties on the calendar.</div>
          <div>Your building score starts, from what's already in place.</div>
          <div>Anything you left for later can still be done in each module.</div>
        </div>
      </section>
    </div>
  );
}
