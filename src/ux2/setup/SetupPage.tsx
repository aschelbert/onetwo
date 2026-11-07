/**
 * /setup — setting up a building, documents first.
 *
 *  1 Documents             drop the building's documents; each is read in the background
 *  2 Review what we found  accept, edit or skip each item, with the page and words it came from
 *  3–5 Finish              fill the gaps, invite people, go live (one page; each part is short)
 *
 * The step is in the URL (`?step=documents|review|finish`); without one the
 * page opens on the next thing to do.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/formatters';
import { useTenantContext } from '@/components/TenantProvider';
import { useAuthStore } from '@/store/useAuthStore';
import { Button, Card, Chip } from '../components';
import { DOC_KINDS, DOC_TYPE_LABEL, buildItems, type SetupDoc } from '@/features/setup/setupModel';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { ACCEPT, addAndRead, canRetry, readOne, readingAvailable } from '@/features/setup/readDocument';
import { useSetup } from './useSetup';
import ReviewStep from './ReviewStep';
import FinishStep from './FinishStep';

type Step = 'documents' | 'review' | 'finish';
const STEP_PILLS: { id: string; step: Step; label: string; anchor?: string }[] = [
  { id: 'documents', step: 'documents', label: 'Documents' },
  { id: 'review', step: 'review', label: 'Review what we found' },
  { id: 'gaps', step: 'finish', label: 'Fill the gaps', anchor: 'setup-gaps' },
  { id: 'invite', step: 'finish', label: 'Invite people', anchor: 'setup-invite' },
  { id: 'live', step: 'finish', label: 'Go live', anchor: 'setup-live' },
];

export default function SetupPage() {
  const tenant = useTenantContext();
  const role = useAuthStore(s => s.currentRole);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const s = useSetup();
  const raw = params.get('step');
  const step: Step = raw === 'documents' || raw === 'review' || raw === 'finish' ? raw : s.next.step;
  const go = (next: Step, anchor?: string) => {
    setParams(prev => { const q = new URLSearchParams(prev); q.set('step', next); return q; });
    window.setTimeout(() => (anchor ? document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : window.scrollTo({ top: 0 })), 50);
  };

  if (role === 'RESIDENT') {
    return <Card><p className="m-0 text-sm text-ux2-muted">Setup is for the board. Your building's board is setting things up; you'll get an invitation when it's ready.</p></Card>;
  }

  return (
    <div data-page="ux2-setup" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">Set up {tenant.name}</h1>
          <Chip tone="plum" className="h-8 px-3">{s.pct}% · about {s.minutes} minute{s.minutes === 1 ? '' : 's'} left</Chip>
        </div>
        <Button variant="ghost" onClick={() => navigate('/home')}>Save and leave</Button>
      </div>
      <nav aria-label="Setup steps" className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full border border-ux2-line bg-ux2-surface p-[3px]">
        {STEP_PILLS.map((p, i) => {
          const on = p.step === step && (p.step !== 'finish' || p.id === 'gaps');
          const count = p.id === 'review' && s.pending.length ? s.pending.length : 0;
          return (
            <button key={p.id} type="button" aria-current={on ? 'step' : undefined} onClick={() => go(p.step, p.anchor)}
              className={cn('flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold', on ? 'bg-ux2-plum text-white' : 'text-ink-700 hover:bg-white')}>
              <span className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-current text-[11px] font-bold">{i + 1}</span>
              <span className="whitespace-nowrap">{p.label}</span>
              {count > 0 && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', on ? 'bg-white text-ux2-plum' : 'bg-ux2-plum-tint text-ux2-plum')}>{count}</span>}
            </button>
          );
        })}
      </nav>
      {step === 'documents' && <DocumentsStep onReview={() => go('review')} onByHand={() => go('finish')} />}
      {step === 'review' && <ReviewStep onDone={() => go('finish')} onDocuments={() => go('documents')} />}
      {step === 'finish' && <FinishStep onReview={() => go('review')} onDocuments={() => go('documents')} />}
    </div>
  );
}

// ── 1 · Documents ─────────────────────────────────────────────────

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function foundCount(d: SetupDoc) {
  const r = d.result;
  if (!r) return 0;
  return r.facts.length + r.units.length + r.board.length + r.insurance.length + r.vendors.length + r.budget.length + r.reserves.length;
}

function DocumentsStep({ onReview, onByHand }: { onReview: () => void; onByHand: () => void }) {
  const s = useSetup();
  const removeDoc = useSetupStore(x => x.removeDoc);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [available, setAvailable] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { let on = true; readingAvailable().then(v => { if (on) setAvailable(v); }); return () => { on = false; }; }, []);

  const add = (list: FileList | null) => { if (list?.length) void addAndRead(Array.from(list)); };
  const byKind = (types: string[]) => s.docs.filter(d => d.result && types.includes(d.result.docType));
  const items = buildItems(s.docs);
  const counts = (sec: string) => items.filter(i => i.section === sec).length;
  const conflicts = items.filter(i => i.conflicts.length > 0).length;
  const summary = [
    counts('units') && `${counts('units')} units`, counts('board') && `${counts('board')} board members`, counts('insurance') && `${counts('insurance')} policies`,
    counts('rules') && `${counts('rules')} rules`, counts('budget') && `${counts('budget')} budget lines`, counts('reserves') && `${counts('reserves')} reserve items`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        {available === false && (
          <div role="status" className="rounded-2xl border border-ux2-amber/30 bg-ux2-amber-tint px-4 py-3 text-sm text-ux2-amber">
            <b className="font-semibold">Document reading isn't switched on for this building yet.</b> You can still add documents now; they're read as soon as it's on. Or set the building up by hand.
          </div>
        )}
        {available === null && (
          <div role="status" className="rounded-2xl border border-ux2-line bg-ux2-surface px-4 py-3 text-sm text-ux2-muted">This is the demo, so documents can't be read here. In your building's account they are.</div>
        )}
        <label
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={cn('flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[22px] border-2 border-dashed border-ux2-plum px-6 py-9 text-center transition-colors', drag ? 'bg-[#DCDAF3]' : 'bg-ux2-plum-tint')}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4F46A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <span className="text-lg font-semibold text-ux2-ink">Drop your building's documents here</span>
          <span className="text-sm text-ux2-muted">PDF, a photo of the page, CSV or Excel. Scanned pages too. Drop them all at once; we sort them by type.</span>
          <span className="mt-1 inline-flex h-11 items-center rounded-full bg-ux2-plum px-5 text-sm font-semibold text-white">Choose files</span>
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={e => { add(e.target.files); e.target.value = ''; }} />
        </label>

        {s.docs.length > 0 && (
          <section aria-label="Your documents" className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Your documents · {s.read} of {s.docs.length} read</div>
            {s.docs.map(d => (
              <div key={d.id} data-setup-doc={d.status} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ux2-line bg-white px-4 py-3">
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{d.result?.title || d.name}</b>
                  <span className="block text-[13px] text-ux2-muted">
                    {d.status === 'read' && d.result ? `${DOC_TYPE_LABEL[d.result.docType]} · ${d.result.pageCount ? `${d.result.pageCount} pages · ` : ''}${foundCount(d)} found${d.filedAs ? ' · filed in Building › Documents' : ''}` : `${d.name} · ${fmtSize(d.size)}`}
                  </span>
                  {d.status === 'error' && <span className="block text-[13px] text-ux2-red-ink">{d.error}</span>}
                  {d.status === 'reading' && <span aria-hidden="true" className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-ux2-line"><span className="block h-1 w-1/3 animate-pulse rounded-full bg-ux2-plum" /></span>}
                </span>
                {d.status === 'read' && <Chip tone="sage">Read</Chip>}
                {d.status === 'reading' && <Chip tone="plum">Reading</Chip>}
                {d.status === 'error' && <>{canRetry(d.id) && <Button size="sm" variant="ghost" onClick={() => void readOne(d.id)}>Try again</Button>}<Chip tone="red">Not read</Chip></>}
                {d.status !== 'reading' && <Button size="sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => removeDoc(d.id)}>Remove</Button>}
              </div>
            ))}
          </section>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">What to upload</div>
          <span className="text-[13px] text-ux2-muted">Each one fills in the parts of the app listed under it</span>
        </div>
        {DOC_KINDS.map(k => {
          const got = byKind(k.types);
          return (
            <div key={k.id} data-doc-kind={k.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl border border-ux2-line bg-white px-4 py-3.5">
              <span aria-hidden="true" className={cn('grid h-9 w-9 place-items-center rounded-[10px]', got.length ? 'bg-ux2-sage-tint text-ux2-sage' : 'border border-dashed border-ink-300 bg-ux2-surface text-ux2-muted')}>
                {got.length ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
              </span>
              <span className="min-w-0">
                <b className="font-semibold">{k.label}</b>
                {got.length > 0 && <span className="text-[13px] text-ux2-muted"> · {got.map(d => d.name).join(', ')}</span>}
                <span className="mt-1.5 flex flex-wrap gap-1.5">{k.fills.map(f => <span key={f} className="rounded-full border border-ux2-line bg-ux2-surface px-2 py-1 text-[11px] font-semibold text-ink-700">{f}</span>)}</span>
              </span>
              {got.length ? <Chip tone="sage">Read</Chip> : <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>Upload</Button>}
            </div>
          );
        })}
      </div>

      <aside className="flex flex-col gap-3.5">
        <Card tone="white">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">How it works</div>
          {[
            ['We read each document.', 'Bylaws, budgets, policies, owner lists, minutes. Scans too. You can leave while it reads.'],
            ['You confirm what we found.', 'Each item shows the page it came from. Nothing is saved until you accept it.'],
            ["We ask only for what's missing.", 'A short list of gaps, then invite people and go live.'],
          ].map(([t, d], i) => (
            <div key={t} className="flex items-start gap-3 text-sm leading-relaxed"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ux2-plum text-[11px] font-bold text-white">{i + 1}</span><span><b className="font-semibold">{t}</b> <span className="text-ux2-muted">{d}</span></span></div>
          ))}
        </Card>
        {s.items.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-[22px] bg-ux2-plum px-[22px] py-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/75">Found so far</div>
            <div className="text-[40px] font-medium leading-none">{s.items.length}</div>
            <div className="text-sm leading-relaxed text-white/[0.88]">{summary}.{conflicts > 0 && ` ${conflicts} need${conflicts === 1 ? 's' : ''} a look: the documents disagree.`}</div>
            <button type="button" onClick={onReview} className="h-11 rounded-full bg-white text-sm font-semibold text-ux2-plum">Review what we found</button>
          </div>
        )}
        <Card tone="white">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">No documents to hand?</div>
          <p className="m-0 text-sm leading-relaxed text-ux2-muted">Skip to the essentials. You can add documents later and review what they hold then.</p>
          <Button variant="ghost" className="self-start" onClick={onByHand}>Set it up by hand</Button>
        </Card>
      </aside>
    </div>
  );
}
