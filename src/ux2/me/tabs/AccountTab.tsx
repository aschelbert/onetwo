import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why, Field, INPUT } from '../../components';
import StewardshipCard from '../../home/StewardshipCard';
import { dayLabel } from '../../home/calendar';
import { useStoreSnapshot } from '../../runbook/adapters';
import { boardEvents, stewardshipFor } from '../../score/events';
import { bandFor, computeScorecard } from '../../score/stewardship';
import { dimensionLines, lowestDimension, recentReceipts, type MeSnapshot } from '../metrics';

const HOW: Record<string, string> = {
  Timeliness: 'Dues paid by the due date and requests answered by their date. Full credit on time, half a week late, a quarter a month late.',
  Compliance: 'Filings and dated obligations met on time; invoices and assessments paid by their date.',
  Oversight: 'Cases closed and none past their target; for board members, the board checklist.',
  Reach: 'Showing up: meetings attended, in person, remote or by proxy.',
  Impact: 'Ballots cast and board decisions voted on, of the ones you could.',
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-ux2-navy' : 'bg-ux2-line-strong'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function ProfileRow({ label, value, note, onSave, type = 'text', action = 'Change' }: { label: string; value: string; note?: string; onSave?: (v: string) => void; type?: string; action?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  return (
    <Inner className="flex flex-wrap items-center justify-between gap-3">
      {editing && onSave ? (
        <form onSubmit={e => { e.preventDefault(); onSave(v); setEditing(false); }} className="flex flex-1 flex-wrap items-end gap-2">
          <Field label={label} className="min-w-[200px] flex-1"><input type={type} value={v} onChange={e => setV(e.target.value)} className={INPUT} /></Field>
          <Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setV(value); }}>Cancel</Button>
        </form>
      ) : (
        <>
          <Cell title={label} note={`${value || '—'}${note ? ` · ${note}` : ''}`} />
          {onSave && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{action}</Button>}
        </>
      )}
    </Inner>
  );
}

export default function AccountTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const store = useStoreSnapshot(snap.today);
  const board = useBuildingStore(s => s.board);
  const user = useAuthStore(s => s.currentUser);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const units = useFinancialStore(s => s.units);
  const tenant = useTenantContext();
  const view = useMemo(() => stewardshipFor(store), [store]);
  const lines = dimensionLines(view.you, view.building.dims);
  const recent = recentReceipts(view.events, snap.today, 3);
  const lowest = lowestDimension(view.you);
  const leaderboard = useMemo(() => snap.viewer.isBoard
    ? board.map(b => ({ name: b.name, role: b.role, score: computeScorecard(boardEvents(store, { name: b.name, officerTitle: b.role })).total, you: b.name === snap.viewer.name })).sort((a, b) => b.score - a.score)
    : [], [board, store, snap.viewer]);
  const rank = leaderboard.findIndex(l => l.you) + 1;
  const ahead = rank > 1 ? leaderboard[rank - 2] : null;
  const me = board.find(b => b.name === snap.viewer.name);
  const mine = units.filter(u => snap.viewer.linkedUnits.includes(u.number));
  const [prefs, setPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('onetwo-ux2-prefs') || '{}'); } catch { return {}; } });
  const setPref = (k: string, v: unknown) => { const next = { ...prefs, [k]: v }; setPrefs(next); try { localStorage.setItem('onetwo-ux2-prefs', JSON.stringify(next)); } catch { /* ignore */ } };
  const digest = prefs.digest ?? true;
  const weekly = prefs.weekly ?? true;
  const cards = prefs.cards ?? true;
  const letters: string[] = prefs.letters ?? ['In-app', 'Email'];
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: user, units: mine, events: view.events }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `my-data-${snap.today}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StewardshipCard you={view.you} events={view.events} buildingDims={view.building.dims} buildingTotal={view.building.total} group={view.group} subject={`${bandFor(view.you.total)} · ${snap.viewer.officerTitle ?? (snap.viewer.isBoard ? 'board member' : 'owner')} · this year`} />
        <Card aria-label="This month" className="gap-2">
          <div className="flex items-center justify-between gap-2"><SectionLabel>This month</SectionLabel><Chip tone="ghost">{view.events.length} events behind this score</Chip></div>
          <div><span className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-ux2-ink">{view.you.total}</span><span className="text-sm text-ux2-muted"> composite · {bandFor(view.you.total)}</span></div>
          <div className="text-xs text-ux2-muted">Last {recent.length} scored events, each with a receipt</div>
          {recent.length === 0 ? <Why>Nothing scored yet.</Why> : recent.map(e => (
            <Inner key={e.id} className="flex items-center justify-between gap-3">
              <Cell title={e.label} note={`${dayLabel(e.date)} · ${e.reason ?? ''}`} />
              <span className="flex items-center gap-1.5"><Chip tone={e.earned >= e.available ? 'teal' : e.earned > 0 ? 'amber' : 'red'}>{e.dimension} {e.earned > 0 ? `+${e.points}` : '0'}</Chip><Chip tone="ghost">Receipt</Chip></span>
            </Inner>
          ))}
          <Inner className="flex items-center justify-between gap-3"><Cell title="All events" note="by dimension, since you joined" /><button type="button" onClick={() => navigate('/community')} className="text-xs font-semibold text-ux2-teal hover:underline">Overview ›</button></Inner>
        </Card>
        {snap.viewer.isBoard ? (
          <Card tone="red" aria-label="On the board" className="gap-1">
            <SectionLabel className="text-white/[0.75]">On the board</SectionLabel>
            <div className="text-2xl font-semibold">{snap.viewer.officerTitle ?? 'Board member'}</div>
            {rank > 0 && <div><span className="text-[34px] font-semibold leading-none tracking-[-0.03em]">{rank}</span><span className="text-sm text-white/[0.8]"> of {leaderboard.length} on the leaderboard</span></div>}
            <div className="mt-1">
              {me?.term && <div className="flex justify-between border-b border-white/[0.15] py-1.5 text-sm"><span className="text-white/[0.8]">Term</span><b className="font-semibold">{me.term}</b></div>}
              {ahead && <div className="flex justify-between border-b border-white/[0.15] py-1.5 text-sm"><span className="text-white/[0.8]">Ahead of you</span><b className="font-semibold">{ahead.name.split(' ')[0]} · {ahead.score}</b></div>}
              <div className="flex justify-between py-1.5 text-sm"><span className="text-white/[0.8]">Board mean · building avg</span><b className="font-semibold">{leaderboard.length ? Math.round(leaderboard.reduce((t, l) => t + l.score, 0) / leaderboard.length) : '—'} · {view.building.total}</b></div>
            </div>
            <button type="button" onClick={() => navigate('/community')} className="mt-auto flex items-center justify-between rounded-xl bg-white/[0.12] px-3 py-2 text-left text-[13px] text-white"><span><b className="font-semibold">Full leaderboard</b> · Community › Overview</span><Chip tone="white" className="!bg-white !text-ux2-red-ink">Open</Chip></button>
          </Card>
        ) : (
          <Card tone="teal" aria-label="Your place">
            <SectionLabel className="text-white/[0.66]">Among the owners</SectionLabel>
            <div className="text-2xl font-semibold">{view.you.total} · {bandFor(view.you.total)}</div>
            <p className="m-0 text-sm text-white/[0.85]">Owners average {view.building.total}. Lift {lowest} first: {HOW[lowest]}</p>
            <button type="button" onClick={() => navigate('/community')} className="self-start text-xs font-semibold text-white underline-offset-2 hover:underline">The leaderboard · Community › Overview</button>
          </Card>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${snap.viewer.isBoard && leaderboard.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <Card tone="cyan" aria-label="By dimension" className="gap-2">
          <div className="flex items-center justify-between gap-2"><SectionLabel className="text-ux2-navy/[0.65]">By dimension</SectionLabel><span className="text-xs font-semibold text-ux2-navy underline">How the score works</span></div>
          {lines.map(l => (
            <div key={l.dimension} className="flex items-center gap-3 rounded-[14px] bg-white px-3.5 py-2.5">
              <Chip tone={l.dimension === 'Timeliness' ? 'teal' : l.dimension === 'Compliance' ? 'sage' : l.dimension === 'Oversight' ? 'plum' : l.dimension === 'Reach' ? 'amber' : 'ghost'} className="w-[96px] justify-center">{l.dimension}</Chip>
              <span className="min-w-0 flex-1 text-xs text-ux2-ink">{HOW[l.dimension]} · {l.earned} of {l.available} credit{l.available === 1 ? '' : 's'}</span>
              <b className="w-8 text-right text-lg font-semibold text-ux2-ink">{l.pct}</b>
            </div>
          ))}
          <Why className="text-ux2-navy/[0.7]">Timeliness and Compliance weigh 35 points each, Oversight, Reach and Impact 10 each. Scored monthly; receipts for every event are above.</Why>
        </Card>
        {snap.viewer.isBoard && leaderboard.length > 0 && (
          <Card tone="teal" aria-label="Board leaderboard" className="gap-2">
            <div className="flex items-center justify-between gap-2"><SectionLabel className="text-white/[0.66]">Board leaderboard</SectionLabel><span className="text-xs text-white/[0.66]">composite · band</span></div>
            {leaderboard.map((l, i) => (
              <div key={l.name} className={`flex items-center gap-3 rounded-[14px] px-3 py-2 ${l.you ? 'border border-white bg-white/[0.12]' : 'bg-white/[0.08]'}`}>
                <span className="w-5 text-right text-sm font-semibold text-white/[0.6]">{i + 1}</span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.15] text-[11px] font-bold text-white">{l.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white"><b className="font-semibold">{l.you ? 'You' : l.name.split(' ')[0]}</b> · {l.role}</span>
                <Chip tone={l.score >= 90 ? 'cyan' : l.score >= 80 ? 'sage' : l.score >= 70 ? 'amber' : 'red'}>{bandFor(l.score)} · {l.score}</Chip>
              </div>
            ))}
            <Why className="text-white/[0.7]">Board mean {leaderboard.length ? Math.round(leaderboard.reduce((t, l) => t + l.score, 0) / leaderboard.length) : '—'} against the building average of {view.building.total}. Only board members see this list.</Why>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card aria-label="Profile" className="gap-2">
            <SectionLabel>Profile</SectionLabel>
            <ProfileRow label="Name" value={user.name} onSave={v => updateProfile({ name: v })} />
            <ProfileRow label="Email" value={user.email} note="verified" type="email" onSave={v => updateProfile({ email: v })} />
            <ProfileRow label="Phone" value={user.phone} note="for the directory and support calls only" type="tel" onSave={v => updateProfile({ phone: v })} />
            <ProfileRow label="Password" value="••••••••" note="change from the sign-in page" onSave={() => navigate('/reset-password')} />
            <ProfileRow label="Two-factor sign-in" value="off" note="set it up from the sign-in page" />
            <Inner className="flex items-center justify-between gap-3"><Cell title="Linked units" note={snap.viewer.linkedUnits.length ? snap.viewer.linkedUnits.map(u => `${u} · owner`).join(', ') : 'none'} /><Button size="sm" variant="ghost" onClick={() => navigate('/my-unit')}>My Unit</Button></Inner>
          </Card>
          <Card aria-label="Preferences" className="gap-2.5">
            <SectionLabel>Preferences</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Language"><select value={prefs.language ?? 'en-US'} onChange={e => setPref('language', e.target.value)} className={INPUT}><option value="en-US">English (US)</option><option value="es">Español</option></select></Field>
              <Field label="Time zone"><select value={prefs.tz ?? 'America/New_York'} onChange={e => setPref('tz', e.target.value)} className={INPUT}><option value="America/New_York">Eastern · Washington DC</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option></select></Field>
            </div>
            <div className="text-xs font-semibold text-ux2-muted">How letters reach me</div>
            <div className="flex flex-wrap gap-1.5">{['In-app', 'Email', 'Mail'].map(m => <button key={m} type="button" onClick={() => setPref('letters', letters.includes(m) ? letters.filter(x => x !== m) : [...letters, m])} className="rounded-full"><Chip tone={letters.includes(m) ? 'navy' : 'ghost'}>{m}</Chip></button>)}</div>
            <Why>Notices, demand letters and meeting packets. Pick more than one. Certified mail is always sent on paper, whatever you choose here.</Why>
          </Card>
          <Card aria-label="Danger zone" className="gap-2">
            <SectionLabel>Danger zone</SectionLabel>
            <Inner className="flex items-center justify-between gap-3"><Cell title="Download my data" note="Profile, unit ledger, receipts and scored events as a file" /><Button size="sm" variant="ghost" onClick={exportData}>Download</Button></Inner>
            <Inner className="flex items-center justify-between gap-3"><Cell title="Delete account" note={`Your ${snap.viewer.isBoard ? 'board seat and ' : ''}unit records stay with the building; your sign-in goes away`} /><Button size="sm" variant="danger" onClick={() => navigate('/support')}>Delete…</Button></Inner>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card aria-label="Notifications" className="gap-2">
            <SectionLabel>Notifications</SectionLabel>
            {[
              ['Home cards', 'Approvals, replies, meeting and vote reminders', cards, (v: boolean) => setPref('cards', v)],
              ['Daily digest email, 7am', 'New posts, requests and what is due today', digest, (v: boolean) => { setPref('digest', v); updateProfile({ notifications: { ...user.notifications, email: v } }); }],
              ['Weekly board digest, Monday', 'Cases, bills awaiting approval, obligations', weekly, (v: boolean) => setPref('weekly', v)],
            ].map(([t, d, on, set]) => <Inner key={String(t)} className="flex items-center justify-between gap-3"><Cell title={String(t)} note={String(d)} /><Toggle on={on as boolean} onChange={set as (v: boolean) => void} label={String(t)} /></Inner>)}
          </Card>
          <Card aria-label="Units on this account" className="gap-2">
            <div className="flex items-center justify-between gap-2"><SectionLabel>Units on this account</SectionLabel>{mine.length > 1 && <button type="button" onClick={() => navigate('/my-unit')} className="text-xs font-semibold text-ux2-teal hover:underline">See both units together</button>}</div>
            {mine.length === 0 ? <Why>No unit linked yet.</Why> : mine.map(u => (
              <Inner key={u.number} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{u.number}</span><Cell title={`Unit ${u.number} · ${u.owner === user.name ? 'owner-occupant' : 'owner'}`} note={`${u.moveIn ? `Since ${dayLabel(u.moveIn)} · ` : ''}dues ${fmt(u.monthlyFee)} · ${u.balance > 0 ? `${fmt(u.balance)} open` : 'current'}`} /></span>
                <Button size="sm" variant="ghost" onClick={() => navigate('/my-unit')}>Open</Button>
              </Inner>
            ))}
            <Inner className="flex items-center justify-between gap-3"><Cell title="Link a unit you own" note="Enter the unit; the board checks the deed on record and the unit joins this sign-in. Votes stay one per unit." /><Button size="sm" variant="ghost" onClick={() => navigate('/my-unit')}>Link a unit</Button></Inner>
          </Card>
          <Card aria-label="Switch building" className="gap-2">
            <SectionLabel>Switch building</SectionLabel>
            <Inner className="flex items-center justify-between gap-3"><Cell title={tenant.name} note={`${snap.viewer.officerTitle ?? snap.viewer.role.replace('_', ' ').toLowerCase()}${snap.viewer.linkedUnits[0] ? ` · Unit ${snap.viewer.linkedUnits[0]}` : ''}`} /><Chip tone="navy">Current</Chip></Inner>
            <Button size="sm" variant="ghost" className="self-start" onClick={() => navigate('/login')}>Add a building</Button>
            <Why>One sign-in, one building at a time. Add another and the avatar menu lets you switch.</Why>
          </Card>
        </div>
      </div>
    </div>
  );
}
