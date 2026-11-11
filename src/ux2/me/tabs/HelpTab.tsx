/**
 * Help & Support, to the Me-Help board: Find an answer (teal), the
 * Runbooks / How ONE two works / Guides row, Contact us with the open
 * support threads, the Guides list, Send feedback or start a thread, Legal
 * references, Release notes and Legal. Threads live in the admin project
 * (`support_threads`, `support_messages`), the same tables the production
 * support page reads; replying opens that page in place so its realtime
 * thread keeps working.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import SupportPage from '@/features/support/SupportPage';
import { GUIDES } from '@/features/support/HowItWorksPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { lateFeeAsScheduleItem, useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { adminSupabase } from '@/lib/adminSupabase';
import { refreshComplianceRequirements } from '@/lib/complianceRefresh';
import { ROLE_LABELS } from '@/types/auth';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, PillTabs, SearchInput, SectionLabel, Tile, TileRow, Why } from '../../components';
import { ALL_RUNBOOKS as RUNBOOKS } from '../../boardroom/runbooks';
import { dayLabel } from '../../home/calendar';
import { searchHelp, type HelpHit } from '../help';
import type { MeSnapshot } from '../metrics';

const KIND_TONE: Record<HelpHit['kind'], 'ghost' | 'teal' | 'navy' | 'amber'> = { guide: 'ghost', runbook: 'teal', obligation: 'navy', fee: 'amber' };
const MODULES = ['Home', 'Board Room', 'Funds', 'Building', 'Community', 'Me'];
const PRIORITIES = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }];
const RELEASE_NOTES = [
  { date: '2026-11-07', title: 'Containers rebuilt to the design boards', detail: 'Funds, Board Room, Building, Community and Me now match the redesign, widget for widget' },
  { date: '2026-11-01', title: 'Receipts for every scored event', detail: 'What was counted, when, and the rule, from the Me overview' },
  { date: '2026-10-15', title: 'Statements and taxes in Funds', detail: '1099s for vendors over $600 and Form 1120-H, with their dates' },
];

interface Thread { id: string; subject: string; status: string; priority: string; module: string; updated_at: string; created_by_name: string }

/** Open support threads for this tenant from the admin project. */
function useThreads() {
  const tenant = useTenantContext();
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const live = !tenant.isDemo && !!adminSupabase;
  useEffect(() => {
    if (!live || !adminSupabase) return;
    let cancelled = false;
    (async () => {
      const { data: t } = await adminSupabase.from('tenancies').select('id').eq('slug', tenant.subdomain).maybeSingle();
      if (cancelled || !t) return;
      setTenancyId(t.id);
      const { data } = await adminSupabase.from('support_threads').select('id, subject, status, priority, module, updated_at, created_by_name').eq('tenancy_id', t.id).order('updated_at', { ascending: false }).limit(20);
      if (!cancelled && data) setThreads(data as Thread[]);
    })();
    return () => { cancelled = true; };
  }, [live, tenant.subdomain]);
  const open = threads.filter(t => t.status !== 'closed' && t.status !== 'resolved');
  const create = async (subject: string, module: string, priority: string, body: string, sender: { name: string; role: string }) => {
    if (!live || !adminSupabase || !tenancyId) return null;
    const { data: thread } = await adminSupabase.from('support_threads').insert({ tenancy_id: tenancyId, subject, module, priority, created_by_name: sender.name }).select().single();
    if (!thread) return null;
    await adminSupabase.from('support_messages').insert({ thread_id: thread.id, sender_type: 'tenant', sender_name: sender.name, sender_role: sender.role, body, attachment_url: null });
    setThreads(prev => [thread as Thread, ...prev]);
    return thread as Thread;
  };
  return { live, threads, open, create };
}

export default function HelpTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const building = useBuildingStore();
  const schedule = useFeeScheduleStore(s => s.fees);
  const lateFeeEnabled = useFinancialStore(s => s.lateFeeEnabled);
  const lateFeeAmount = useFinancialStore(s => s.lateFeeAmount);
  const lateFeeGraceDays = useFinancialStore(s => s.lateFeeGraceDays);
  // The late fee is set under Billing rules; it reads here next to the schedule.
  const fees = useMemo(() => [...(lateFeeEnabled ? [lateFeeAsScheduleItem({ lateFeeEnabled, lateFeeAmount, lateFeeGraceDays })] : []), ...schedule], [schedule, lateFeeEnabled, lateFeeAmount, lateFeeGraceDays]);
  const currentRole = useAuthStore(s => s.currentRole);
  const { live, open, create } = useThreads();
  const [q, setQ] = useState('');
  const [gq, setGq] = useState('');
  const [showThread, setShowThread] = useState(false);
  const [kind, setKind] = useState<'feedback' | 'thread'>('feedback');
  const [subject, setSubject] = useState('');
  const [module, setModule] = useState('Home');
  const [priority, setPriority] = useState('medium');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const obligations = useMemo(() => refreshComplianceRequirements({
    state: building.address.state,
    legalDocuments: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
    insurance: building.insurance.map(p => ({ type: p.type, expires: p.expires })),
    boardCount: building.board.length,
    hasManagement: !!building.management.company,
  }).categories.flatMap(c => c.items), [building.address.state, building.legalDocuments, building.insurance, building.board.length, building.management.company]);
  const routes = useMemo(() => ({ obligations: '/building?tab=obligations', runbooks: '/boardroom?tab=runbooks', fees: '/funds?tab=settings&section=fees' }), []);
  const src = useMemo(() => ({
    guides: GUIDES.map(g => ({ id: g.id, title: g.title, summary: g.summary, route: g.route, howTos: g.howTos })),
    obligations: obligations.map(o => ({ id: o.id, task: o.task, due: o.due, role: o.role, legalRef: o.legalRef })),
    fees: fees.map(f => ({ id: f.id, name: f.name, amount: f.amount, amountType: f.amountType, frequency: f.frequency, description: f.description })),
    routes,
  }), [obligations, fees, routes]);
  const hits = useMemo(() => searchHelp(q, src), [q, src]);
  const nextDue = obligations.filter(o => o.due >= snap.today).sort((a, b) => a.due.localeCompare(b.due))[0];
  const lateFee = fees.find(f => /late/i.test(f.name));
  const examples = [
    nextDue ? { label: `Due before ${dayLabel(nextDue.due)} · Obligations`, q: nextDue.task.split(' ').slice(0, 2).join(' ') } : null,
    RUNBOOKS[0] ? { label: `${RUNBOOKS[0].name} · Runbook`, q: RUNBOOKS[0].name.split(' ')[0] } : null,
    lateFee ? { label: `${lateFee.name} · Fee schedule`, q: lateFee.name } : null,
  ].filter((x): x is { label: string; q: string } => !!x);

  const legalRefs = useMemo(() => {
    const seen = new Map<string, { title: string; detail: string; ref: string }>();
    for (const o of obligations) {
      if (!o.legalRef || seen.has(o.legalRef) || seen.size >= 3) continue;
      seen.set(o.legalRef, { title: o.task, detail: `${o.role} · due ${dayLabel(o.due)}`, ref: o.legalRef });
    }
    const out = [...seen.values()];
    for (const d of building.legalDocuments.filter(d => /bylaw|cc&r|declaration/i.test(d.name)).slice(0, 2)) out.push({ title: d.name, detail: d.status === 'current' ? 'Current; the full text is in Building › Documents' : 'Review due; upload the current version in Building › Documents', ref: `${d.name}${d.version ? ` · ${d.version}` : ''}` });
    return out;
  }, [obligations, building.legalDocuments]);
  const missingRules = !building.legalDocuments.some(d => /rule/i.test(d.name));

  const guides = GUIDES.filter(g => !gq || `${g.title} ${g.summary}`.toLowerCase().includes(gq.toLowerCase()));
  const minutes = (g: (typeof GUIDES)[number]) => 3 + Math.min(4, g.howTos.length);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { setNote('A subject and a message, please.'); return; }
    if (!live) { setNote(`In the demo building nothing is sent. On a live building this ${kind === 'feedback' ? 'feedback' : 'thread'} goes to support, and replies land here and in ${snap.viewer.email}.`); return; }
    const t = await create(kind === 'feedback' ? `Feedback: ${subject.trim()}` : subject.trim(), module, kind === 'feedback' ? 'low' : priority, message.trim(), { name: snap.viewer.name, role: ROLE_LABELS[currentRole] });
    if (t) { setNote(`${kind === 'feedback' ? 'Feedback sent' : 'Thread started'}. Replies land here and in ${snap.viewer.email}.`); setSubject(''); setMessage(''); setShowThread(true); } else setNote('That did not go through. Email support@getonetwo.com instead.');
  };

  return (
    <div className="flex flex-col gap-5">
      <Card tone="teal" aria-label="Find an answer">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel className="text-white/[0.66]">Find an answer</SectionLabel><span className="text-xs text-white/[0.7]">Guides, runbooks, rules and the law</span></div>
        <input aria-label="Search help" value={q} onChange={e => setQ(e.target.value)} placeholder="Search guides, runbooks, rules and the law" className="h-11 rounded-full border border-white/30 bg-white px-4 text-sm text-ux2-ink" />
        {q ? (hits.length === 0 ? <p className="text-sm text-white/[0.85]">Nothing matched. Try one word, or ask below.</p> : (
          <ul className="m-0 list-none divide-y divide-white/15 p-0">
            {hits.map((h, i) => (
              <li key={i}>
                <button type="button" onClick={() => navigate(h.path)} className="flex w-full items-start gap-3 py-2 text-left hover:underline">
                  <Chip tone={KIND_TONE[h.kind]}>{h.kind}</Chip>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{h.title}</span><span className="block text-xs text-white/[0.8]">{h.detail}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )) : (
          <div className="flex flex-wrap gap-1.5">{examples.map(x => <button key={x.label} type="button" onClick={() => setQ(x.q)} className="h-9 rounded-full border border-white/30 bg-white/10 px-3.5 text-xs font-semibold text-white hover:bg-white/20">{x.label}</button>)}</div>
        )}
        <p className="text-xs text-white/[0.7]">Matches by keyword across the {GUIDES.length} guides, {RUNBOOKS.length} runbooks, this building's rules and the legal references below, and takes you to the page that holds the answer.</p>
      </Card>

      <TileRow>
        <Tile tone="grey" label="Runbooks" meta={<span className="text-xs text-ux2-muted">where most answers live</span>} value={RUNBOOKS.length} className="min-h-[200px]" sub="Every obligation has steps, dates and a letter ready." action={<><span>Board Room › Runbooks</span><Button size="sm" variant="ghost" onClick={() => navigate(routes.runbooks)}>Open</Button></>} />
        <Card aria-label="How ONE two works" className="min-h-[200px]">
          <div className="flex items-center justify-between gap-2"><SectionLabel>How ONE two works</SectionLabel><span className="text-xs text-ux2-muted">4 short reads</span></div>
          <div className="flex flex-col gap-1.5">
            {[
              { title: 'Runbooks', detail: 'Every obligation has steps, dates and a letter ready', path: routes.runbooks },
              { title: 'Stewardship score', detail: 'Five dimensions, scored monthly, a receipt for each event', path: '/account' },
              { title: 'Obligations', detail: `${obligations.length} this year from the law, the bylaws and policies`, path: routes.obligations },
              { title: 'Who sees what', detail: 'Owners, residents, board, counsel and accountant', path: '/admin/users' },
            ].map(c => (
              <button key={c.title} type="button" onClick={() => navigate(c.path)} className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-3.5 py-2 text-left hover:bg-ux2-teal-tint">
                <Cell title={c.title} note={c.detail} /><span className="text-ux2-muted">›</span>
              </button>
            ))}
          </div>
        </Card>
        <Tile tone="grey" label="Guides" meta={<span className="text-xs text-ux2-muted">step by step, below</span>} value={GUIDES.length} className="min-h-[200px]" sub="Each guide opens the module it describes, with the steps shown in place." action={<><span>Guides · {guides.length} listed</span><Button size="sm" variant="ghost" onClick={() => document.getElementById('guides-card')?.scrollIntoView({ behavior: 'smooth' })}>Below ›</Button></>} />
      </TileRow>

      <Card aria-label="Contact us">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Contact us</SectionLabel><Chip tone="sage">All systems normal</Chip></div>
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="Email" note="support@getonetwo.com · answered within a business day" /><a href={`mailto:support@getonetwo.com?subject=${encodeURIComponent(`${snap.viewer.name} · ${building.name || 'ONE two'}`)}`} className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Write</a></Inner>
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="Chat" note="Mon to Fri, 9 to 6 ET · a person, not a bot" /><Button size="sm" variant="ghost" onClick={() => { setKind('thread'); document.getElementById('thread-card')?.scrollIntoView({ behavior: 'smooth' }); }}>Start chat</Button></Inner>
        {open.slice(0, 3).map(t => (
          <Inner key={t.id} data-thread={t.id} className="flex flex-wrap items-center justify-between gap-3"><Cell title={`Open thread · ${t.subject}`} note={`${t.module} · ${t.priority} priority · updated ${dayLabel(t.updated_at.slice(0, 10))}`} /><Button size="sm" variant="ghost" onClick={() => setShowThread(v => !v)}>{showThread ? 'Hide' : 'Reply'}</Button></Inner>
        ))}
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="New support thread" note="subject, module, priority" /><Button size="sm" variant="ghost" onClick={() => { setKind('thread'); document.getElementById('thread-card')?.scrollIntoView({ behavior: 'smooth' }); }}>Start</Button></Inner>
        {showThread && live && <div className="ux2-legacy rounded-[14px] bg-white p-3"><SupportPage /></div>}
      </Card>

      <Card id="guides-card" aria-label="Guides">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Guides</SectionLabel><SearchInput value={gq} onChange={setGq} placeholder="Search guides" label="Search guides" /></div>
        <div className="flex flex-col gap-1.5">
          {guides.map(g => (
            <button key={g.id} type="button" onClick={() => navigate(g.route)} className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-3.5 py-2.5 text-left hover:bg-ux2-surface">
              <Cell title={g.title} note={g.summary} /><span className="shrink-0 text-xs text-ux2-muted">{minutes(g)} min</span>
            </button>
          ))}
          {guides.length === 0 && <Inner className="text-sm text-ux2-muted">No guide matches. Try the search at the top.</Inner>}
        </div>
        <Why>Each guide opens the module it describes, with the steps shown in place. More in How ONE two works, above.</Why>
      </Card>

      <Card id="thread-card" aria-label="Send feedback or start a thread">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Send feedback or start a thread</SectionLabel><PillTabs size="filter" surface="white" aria-label="Message kind" value={kind} onChange={setKind} tabs={[{ id: 'feedback', label: 'Feedback' }, { id: 'thread', label: 'Support thread' }]} /></div>
        <form onSubmit={send} className="flex flex-col gap-3">
          <Field label="Subject"><input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} /></Field>
          <Field label="Module"><div role="radiogroup" aria-label="Module" className="flex flex-wrap gap-1.5">{MODULES.map(m => <button key={m} type="button" role="radio" aria-checked={module === m} onClick={() => setModule(m)} className={`h-9 rounded-full border px-3.5 text-xs font-semibold ${module === m ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>{m}</button>)}</div></Field>
          {kind === 'thread' && <Field label="Priority"><div role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-1.5">{PRIORITIES.map(p => <button key={p.id} type="button" role="radio" aria-checked={priority === p.id} onClick={() => setPriority(p.id)} className={`h-9 rounded-full border px-3.5 text-xs font-semibold ${priority === p.id ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>{p.label}</button>)}</div></Field>}
          <Field label="Message"><textarea aria-label="Message" value={message} onChange={e => setMessage(e.target.value)} rows={4} className="w-full rounded-2xl border border-ux2-line-strong bg-white px-3.5 py-2.5 text-sm text-ux2-ink" /></Field>
          <div className="flex flex-wrap items-center gap-2"><Button type="submit">Send</Button><Button type="button" variant="ghost" onClick={() => { setKind('thread'); setShowThread(true); setNote(live ? 'Attach a screenshot from the thread below.' : 'Screenshots attach to a live support thread.'); }}>Attach a screenshot</Button><span className="text-xs text-ux2-muted">Replies land here and in your email.</span></div>
        </form>
        {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}
      </Card>

      <Card aria-label="Legal references">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Legal references</SectionLabel><span className="text-xs text-ux2-muted">the sections the app uses</span></div>
        <div className="flex flex-col gap-1.5">
          {legalRefs.map(r => <Inner key={r.ref} className="flex flex-wrap items-center justify-between gap-3"><Cell title={r.title} note={r.detail} /><Chip tone="ghost">{r.ref}</Chip></Inner>)}
          {legalRefs.length === 0 && <Inner className="text-sm text-ux2-muted">Set the building's state and upload the bylaws; the references the app relies on list here.</Inner>}
        </div>
        <Why>Plain words here; the full text is in Building › Documents.{missingRules ? ' The rules are still missing; Building › Documents flags them until they are uploaded.' : ''}</Why>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card aria-label="Release notes">
          <SectionLabel>Release notes · last {RELEASE_NOTES.length}</SectionLabel>
          <div className="flex flex-col gap-1.5">{RELEASE_NOTES.map(n => <Inner key={n.date} className="flex items-start justify-between gap-3"><Cell title={n.title} note={n.detail} /><span className="shrink-0 text-xs text-ux2-muted">{dayLabel(n.date)}</span></Inner>)}</div>
        </Card>
        <Card aria-label="Legal">
          <SectionLabel>Legal</SectionLabel>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Terms of service" /><a href="/terms.html" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Read</a></Inner>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Privacy policy" /><a href="/privacy.html" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Read</a></Inner>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Data export" note="Download everything about you, from My Account" /><Button size="sm" variant="ghost" onClick={() => navigate('/account')}>My Account ›</Button></Inner>
        </Card>
      </div>
    </div>
  );
}
