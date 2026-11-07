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
import { useSetupStore } from '@/features/setup/useSetupStore';
import { applyBudgetTemplate, postOpening } from '@/features/setup/applySetup';
import { itemSummary, resolve } from '@/features/setup/setupModel';
import { Button, Chip } from '../components';
import { useSetup } from './useSetup';

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
  return data;
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
  const [balances, setBalances] = useState({ operating: '', reserve: '' });
  const [inviteOff, setInviteOff] = useState<string[]>([]);
  const [inviteOwners, setInviteOwners] = useState(true);
  const [note, setNote] = useState<{ tone: 'sage' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const units = f.units;
  const unassessed = units.filter(u => !(u.monthlyFee > 0));
  const monthlyTotalItem = s.items.find(i => i.key === 'fact:monthly_assessment_total' && s.decisions[i.key]?.status === 'accepted');
  const monthlyTotal = monthlyTotalItem ? Number(resolve(monthlyTotalItem, s.decisions[monthlyTotalItem.key]?.picks).value) || 0 : 0;
  const pctTotal = units.reduce((t, u) => t + (u.votingPct || 0), 0);
  const canSplit = monthlyTotal > 0 && units.length > 0 && Math.abs(pctTotal - 100) < 0.5;
  const openingDone = f.generalLedger.some(e => /opening .*balance/i.test(e.memo ?? ''));
  const annualFromUnits = units.reduce((t, u) => t + (u.monthlyFee || 0), 0) * 12;
  const noEmail = units.filter(u => u.owner && !u.email);
  const boardWithEmail = b.board.filter(m => m.email);
  const ownersWithEmail = units.filter(u => u.email);
  const rulesOnFile = s.items.filter(i => s.decisions[i.key]?.savedTo === 'Rules on file');

  const saveProfile = () => {
    if (profile.name.trim()) b.updateName(profile.name.trim());
    b.updateAddress({ street: profile.street.trim(), city: profile.city.trim(), state: profile.state.trim(), zip: profile.zip.trim() });
  };
  const addMember = () => { if (member.name.trim()) { b.addBoardMember({ name: member.name.trim(), role: member.role, email: member.email.trim(), phone: '', term: '' }); setMember({ name: '', role: 'Director', email: '' }); } };
  const split = () => { for (const u of units) f.updateUnit(u.number, { monthlyFee: Math.round(monthlyTotal * (u.votingPct / 100) * 100) / 100 }); };
  const applySame = () => { const n = Number(sameFee.replace(/[$,]/g, '')); if (n > 0) for (const u of unassessed) f.updateUnit(u.number, { monthlyFee: n }); };
  const saveBalances = () => {
    const op = Number(balances.operating.replace(/[$,]/g, '')); const rs = Number(balances.reserve.replace(/[$,]/g, ''));
    if (op > 0) postOpening('operating', op);
    if (rs > 0) postOpening('reserve', rs);
  };

  const inviteBoard = async () => {
    const list = boardWithEmail.filter(m => !inviteOff.includes(m.id)).map(m => ({ email: m.email, role: 'board_member' }));
    if (!list.length) return;
    setBusy(true); setNote(null);
    try { await sendInvites(list, viewer.name); setInvitedBoard(true); setNote({ tone: 'sage', text: `${list.length} board invitation${list.length === 1 ? '' : 's'} sent.` }); }
    catch (e) { setNote({ tone: 'red', text: e instanceof Error ? e.message : 'Invitations could not be sent.' }); }
    finally { setBusy(false); }
  };

  const goLive = async () => {
    setBusy(true); setNote(null);
    try {
      if (inviteOwners && ownersWithEmail.length) await sendInvites(ownersWithEmail.map(u => ({ email: u.email, role: 'resident', unit: u.number })), viewer.name);
      await tenant.updateOnboardingStep('buildingProfileComplete', true);
      await tenant.updateOnboardingStep('unitsConfigured', true);
      if (s.docs.some(d => d.result && ['bylaws', 'declaration'].includes(d.result.docType))) await tenant.updateOnboardingStep('bylawsUploaded', true);
      if (f.budgetCategories.length) await tenant.updateOnboardingStep('financialSetupDone', true);
      if (invitedBoard || inviteOwners) await tenant.updateOnboardingStep('firstUserInvited', true);
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
        <Gap id="units" required done={s.ess.units} title="Units and owners" note="Best from your owner list (Excel or CSV); or add them in Building › Directory.">
          <Button size="sm" variant="plum" onClick={onDocuments}>Upload the owner list</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory')}>Add by hand</Button>
        </Gap>
        <Gap id="assessment" required done={s.ess.assessment} title="Monthly assessment for every unit" note={units.length ? `${unassessed.length} of ${units.length} units have no monthly amount yet.` : 'Add units first.'}>
          {canSplit && <Button size="sm" variant="plum" onClick={split}>Split {fmt(monthlyTotal)} a month by ownership %</Button>}
          {units.length > 0 && (
            <span className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sp-same">Same monthly amount for each unit</label>
              <input id="sp-same" className={cn(INPUT, 'w-28')} placeholder="$ per unit" value={sameFee} onChange={e => setSameFee(e.target.value)} />
              <Button size="sm" variant={canSplit ? 'ghost' : 'plum'} onClick={applySame}>Same for each</Button>
            </span>
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
        <Gap id="balances" done={openingDone} title="Bank accounts and opening balances" note="From your last bank statements. Type today's balances, or upload a statement.">
          <span className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="sp-op">Operating balance</label><input id="sp-op" className={cn(INPUT, 'w-32')} placeholder="Operating $" value={balances.operating} onChange={e => setBalances(x => ({ ...x, operating: e.target.value }))} />
            <label className="sr-only" htmlFor="sp-rs">Reserve balance</label><input id="sp-rs" className={cn(INPUT, 'w-32')} placeholder="Reserve $" value={balances.reserve} onChange={e => setBalances(x => ({ ...x, reserve: e.target.value }))} />
            <Button size="sm" variant="plum" onClick={saveBalances}>Save</Button>
          </span>
        </Gap>
        <Gap id="budget" done={f.budgetCategories.length > 0} title="This year's budget" note={f.budgetCategories.length ? `${f.budgetCategories.length} budget lines · ${fmt(f.budgetCategories.reduce((t, c) => t + c.budgeted, 0))} a year` : annualFromUnits ? `Not uploaded. Start from a template sized to ${fmt(annualFromUnits)} a year of assessments, then adjust the lines in Funds › Planning.` : 'Upload it, or set assessments first and start from a template.'}>
          {annualFromUnits > 0 && <Button size="sm" variant="plum" onClick={() => applyBudgetTemplate(annualFromUnits)}>Use the template</Button>}
          <Button size="sm" variant="ghost" onClick={onDocuments}>Upload the budget</Button>
        </Gap>
        <Gap id="emails" done={units.length > 0 && noEmail.length === 0} title={noEmail.length ? `Emails for ${noEmail.length} owner${noEmail.length === 1 ? '' : 's'}` : 'Owner emails'} note={noEmail.length ? `${noEmail.length === 1 ? 'Unit' : 'Units'} ${noEmail.slice(0, 4).map(u => u.number).join(', ')}${noEmail.length > 4 ? '…' : ''} ${noEmail.length === 1 ? 'gets' : 'get'} paper notices until you add an email.` : 'Every owner with a unit has an email.'}>
          <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=directory')}>Add in Directory</Button>
        </Gap>
      </section>

      <section id="setup-invite" aria-labelledby="invite-h" className="flex scroll-mt-4 flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="invite-h" className="flex-1 text-xl font-medium">4 · Invite people <span className="text-sm text-ux2-muted">· optional, you can do it after going live</span></h2>
          {boardWithEmail.length > 0 && <Button variant="plum" disabled={busy} onClick={() => void inviteBoard()}>{invitedBoard ? 'Send again' : `Send ${boardWithEmail.filter(m => !inviteOff.includes(m.id)).length} board invites`}</Button>}
        </div>
        {boardWithEmail.length === 0 && <p className="m-0 text-sm text-ux2-muted">Add board members with an email (in the gaps above, or from your minutes) and they show here.</p>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {boardWithEmail.map(m => (
            <label key={m.id} className="flex min-h-[44px] items-center gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-2.5 text-sm">
              <input type="checkbox" checked={!inviteOff.includes(m.id)} onChange={e => setInviteOff(x => (e.target.checked ? x.filter(id => id !== m.id) : [...x, m.id]))} className="h-[18px] w-[18px] shrink-0 accent-[#4F46A8]" />
              <span className="min-w-0 flex-1"><b className="font-semibold">{m.name}</b> <span className="text-ux2-muted">· {m.role} · {m.email}</span></span>
            </label>
          ))}
        </div>
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
          {rulesOnFile.length > 0 && (
            <>
              <div className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/70">Rules on file from your documents</div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">{rulesOnFile.map(i => <li key={i.key}><b className="font-semibold">{i.label}:</b> {itemSummary(i, s.decisions[i.key]?.picks)}</li>)}</ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
