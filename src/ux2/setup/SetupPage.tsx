/**
 * /setup — setting up a building, documents first.
 *
 *  1 Documents             PDFs, pasted text and spreadsheets are read in the browser (rules, no AI); all are filed
 *  2 Review what we found  accept, edit or skip each item, with the page and words it came from
 *  3 Fill the gaps         what the documents didn't cover (on the finish page)
 *  4 Get paid online       connect the association's Stripe account; optional, its own page so Stripe can return to it
 *  5–6 Finish              invite people, go live (with 3, one page; each part is short)
 *
 * The step is in the URL (`?step=documents|review|payments|finish`); without
 * one the page opens on the next thing to do.
 */
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/formatters';
import { useTenantContext } from '@/components/TenantProvider';
import { useAuthStore } from '@/store/useAuthStore';
import { Button, Card, Chip } from '../components';
import { DOC_KINDS, DOC_TYPE_LABEL, buildItems, coverage, readByOlderReader, type DocType, type SetupDoc } from '@/features/setup/setupModel';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { ACCEPT, addFiles, addPastedText, isSpreadsheet, retype as retypeDoc } from '@/features/setup/readDocument';
import { unfileSetupDocument } from '@/features/setup/applySetup';
import { FiledAs, PastDocuments, VendorContracts } from './DocFiling';
import { useSetup } from './useSetup';
import ReviewStep from './ReviewStep';
import PaymentsStep from './PaymentsStep';
import FinishStep from './FinishStep';

type Step = 'documents' | 'review' | 'payments' | 'finish';
const STEP_PILLS: { id: string; step: Step; label: string; anchor?: string }[] = [
  { id: 'documents', step: 'documents', label: 'Documents' },
  { id: 'review', step: 'review', label: 'Review what we found' },
  { id: 'gaps', step: 'finish', label: 'Fill the gaps', anchor: 'setup-gaps' },
  { id: 'payments', step: 'payments', label: 'Get paid online' },
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
  // Without a step in the URL, open on the next thing to do, and stay there as things change (adding a document must not jump to Review).
  const [opened] = useState<Step>(s.next.step);
  const step: Step = raw === 'documents' || raw === 'review' || raw === 'payments' || raw === 'finish' ? raw : opened;
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
      {step === 'payments' && <PaymentsStep onBack={() => go('finish', 'setup-gaps')} onNext={() => go('finish', 'setup-invite')} />}
      {step === 'finish' && <FinishStep onReview={() => go('review')} onDocuments={() => go('documents')} onPayments={() => go('payments')} />}
    </div>
  );
}

// ── 1 · Documents ─────────────────────────────────────────────────

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const FILE_TYPES: DocType[] = ['bylaws', 'declaration', 'rules', 'owner_list', 'insurance', 'reserve_study', 'contract', 'budget', 'financial_statement', 'minutes', 'other'];

function foundCount(d: SetupDoc) {
  const r = d.result;
  return r ? r.facts.length + r.units.length + r.board.length + r.insurance.length + r.budget.length + r.reserves.length : 0;
}

function DocumentsStep({ onReview, onByHand }: { onReview: () => void; onByHand: () => void }) {
  const s = useSetup();
  const removeDoc = useSetupStore(x => x.removeDoc);
  const resetSetup = useSetupStore(x => x.reset);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const add = (list: FileList | null) => { if (list?.length) void addFiles(Array.from(list)); };
  const byKind = (types: DocType[]) => s.docs.filter(d => !d.historical && d.docType && types.includes(d.docType) && (d.status === 'read' || d.status === 'filed'));
  // A kind is also covered when its content was found inside another document (an ownership exhibit in the bylaws).
  const foundIn = (kind: string) => s.docs.flatMap(d => (d.result && !d.historical ? coverage(d.result).filter(c => c.kind === kind).map(c => ({ doc: d, c })) : []));
  const items = buildItems(s.docs);
  const counts = (sec: string) => items.filter(i => i.section === sec).length;
  const summary = [
    counts('profile') + counts('rules') + counts('accounts') && `${counts('profile') + counts('rules') + counts('accounts')} settings`, counts('units') && `${counts('units')} units`,
    counts('board') && `${counts('board')} board members`, counts('duties') + counts('obligations') + counts('houserules') && `${counts('duties') + counts('obligations') + counts('houserules')} clauses (duties, owner obligations, rules)`, counts('insurance') && `${counts('insurance')} policies`, counts('budget') && `${counts('budget')} budget lines`, counts('reserves') && `${counts('reserves')} reserve items`,
  ].filter(Boolean).join(' · ');
  const retype = (d: SetupDoc, t: DocType) => retypeDoc(d, t);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState({ text: '', type: 'bylaws' as DocType, label: '' });

  return (
    <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        <label
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={cn('flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[22px] border-2 border-dashed border-ux2-plum px-6 py-9 text-center transition-colors', drag ? 'bg-[#DCDAF3]' : 'bg-ux2-plum-tint')}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4F46A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <span className="text-lg font-semibold text-ux2-ink">Drop your building's documents here</span>
          <span className="text-sm text-ux2-muted">PDFs and spreadsheets (CSV or Excel). We read their text in your browser for settings, units, officers and budget lines, and file each one in Building › Documents.</span>
          <span className="mt-1 inline-flex h-11 items-center rounded-full bg-ux2-plum px-5 text-sm font-semibold text-white">Choose files</span>
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={e => { add(e.target.files); e.target.value = ''; }} />
        </label>

        <div className="flex flex-col gap-2.5 rounded-2xl border border-ux2-line bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-sm"><b className="font-semibold">Or paste text</b> <span className="text-ux2-muted">from a Word file, an email or a web page.</span></span>
            <Button size="sm" variant="ghost" aria-expanded={pasting} onClick={() => setPasting(p => !p)}>{pasting ? 'Close' : 'Paste text'}</Button>
          </div>
          {pasting && (
            <div className="flex flex-col gap-2">
              <label className="sr-only" htmlFor="setup-paste">Text to read</label>
              <textarea id="setup-paste" rows={7} className="w-full rounded-xl border border-ux2-line-strong px-3 py-2 text-sm" placeholder="Paste a section of your bylaws, the owner list, the officers from your minutes…" value={paste.text} onChange={e => setPaste(x => ({ ...x, text: e.target.value }))} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-ux2-muted">It's from
                  <select className="h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-[13px] text-ux2-ink" value={paste.type} onChange={e => setPaste(x => ({ ...x, type: e.target.value as DocType }))}>
                    {FILE_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="sr-only" htmlFor="setup-paste-label">Name</label>
                <input id="setup-paste-label" className="h-9 min-w-[160px] flex-1 rounded-full border border-ux2-line-strong px-3 text-[13px]" placeholder="Name (optional), e.g. Bylaws article 6" value={paste.label} onChange={e => setPaste(x => ({ ...x, label: e.target.value }))} />
                <Button size="sm" variant="plum" disabled={!paste.text.trim()} onClick={() => { addPastedText(paste.text, paste.type, paste.label); setPaste({ text: '', type: paste.type, label: '' }); setPasting(false); }}>Read it</Button>
              </div>
            </div>
          )}
        </div>

        {s.docs.length > 0 && (
          <section aria-label="Your documents" className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Your documents · {s.docs.filter(d => d.status === 'read').length} with things to review · {s.docs.filter(d => d.status === 'filed').length} filed only</div>
            {s.docs.map(d => (
              <div key={d.id} data-setup-doc={d.status} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ux2-line bg-white px-4 py-3">
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{d.name}</b>
                  <span className="block text-[13px] text-ux2-muted">
                    {d.status === 'read' && d.result ? `${DOC_TYPE_LABEL[d.result.docType]} · ${d.result.pageCount ? `${d.result.pageCount} pages · ` : ''}${foundCount(d)} found to review${d.filedAs ? ' · filed in Building › Documents' : ''}` : d.status === 'filed' ? (d.note ?? 'Filed in Building › Documents') : fmtSize(d.size)}
                  </span>
                  {d.result && <span className="mt-1.5 flex flex-wrap gap-1.5">{coverage(d.result).map(c => <Chip key={c.kind} tone="plum" className="px-2 py-1">{c.label} · {c.count}</Chip>)}</span>}
                  {d.status === 'error' && <span className="block text-[13px] text-ux2-red-ink">{d.error}</span>}
                  {readByOlderReader(d) && <span className="block text-[13px] text-ux2-amber">Read by an earlier version of setup. Remove it and add it again to find board duties, owner obligations and rules.</span>}
                </span>
                {(d.status === 'filed' || (d.status === 'read' && !isSpreadsheet(d.name))) && (
                  <label className="flex items-center gap-2 text-xs text-ux2-muted">What is it?
                    <select className="h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-[13px] text-ux2-ink" value={d.docType ?? 'other'} onChange={e => retype(d, e.target.value as DocType)}>
                      {FILE_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
                    </select>
                  </label>
                )}
                {d.status === 'read' && <Chip tone="sage">Read</Chip>}
                {d.status === 'filed' && <Chip tone="plum">Filed</Chip>}
                {d.status === 'reading' && <Chip tone="plum">Opening</Chip>}
                {d.status === 'error' && <Chip tone="red">Not read</Chip>}
                {d.status !== 'reading' && <Button size="sm" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => { unfileSetupDocument(d); removeDoc(d.id); }}>Remove</Button>}
                <FiledAs doc={d} />
              </div>
            ))}
          </section>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">What to add</div>
          <span className="text-[13px] text-ux2-muted">Each one fills in the parts of the app listed under it</span>
        </div>
        {DOC_KINDS.map(k => {
          const typed = byKind(k.types);
          const found = foundIn(k.id).filter(x => !typed.includes(x.doc));
          const got = [...typed, ...found.map(x => x.doc)];
          return (
            <div key={k.id} data-doc-kind={k.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-2xl border border-ux2-line bg-white px-4 py-3.5">
              <span aria-hidden="true" className={cn('grid h-9 w-9 place-items-center rounded-[10px]', got.length ? 'bg-ux2-sage-tint text-ux2-sage' : 'border border-dashed border-ink-300 bg-ux2-surface text-ux2-muted')}>
                {got.length ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
              </span>
              <span className="min-w-0">
                <b className="font-semibold">{k.label}</b>
                {typed.length > 0 && <span className="text-[13px] text-ux2-muted"> · {typed.map(d => d.name).join(', ')}</span>}
                {found.length > 0 && <span className="block text-[13px] text-ux2-sage">Found in {found.map(x => `${x.doc.name}${x.c.pages ? ` (${x.c.pages})` : ''}: ${x.c.count} ${x.c.unit}`).join('; ')}</span>}
                <span className="mt-1.5 flex flex-wrap gap-1.5">{k.fills.map(f => <span key={f} className={cn('rounded-full border px-2 py-1 text-[11px] font-semibold', k.imports ? 'border-ux2-plum/30 bg-ux2-plum-tint text-ux2-plum' : 'border-ux2-line bg-ux2-surface text-ink-700')}>{f}</span>)}</span>
              </span>
              {got.length ? <Chip tone="sage">{got.some(d => d.status === 'read') ? 'Read' : 'Filed'}</Chip> : <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>Add</Button>}
            </div>
          );
        })}
        <VendorContracts />
        <PastDocuments />
      </div>

      <aside className="flex flex-col gap-3.5">
        <Card tone="white">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">How it works</div>
          {[
            ['We read the text, in your browser.', 'PDFs and pasted text are scanned for settings (late fee, due day, quorum, notice), units, officers, budget lines and policy details. Spreadsheets are matched by their column headings.'],
            ['You confirm each item.', 'Every item shows the page and the sentence or row it came from. Nothing is saved until you accept it.'],
            ["We ask only for what's missing.", 'Anything not found is a short question in Fill the gaps. Scanned pages with no text are filed for reference.'],
          ].map(([t, d], i) => (
            <div key={t} className="flex items-start gap-3 text-sm leading-relaxed"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ux2-plum text-[11px] font-bold text-white">{i + 1}</span><span><b className="font-semibold">{t}</b> <span className="text-ux2-muted">{d}</span></span></div>
          ))}
        </Card>
        {s.items.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-[22px] bg-ux2-plum px-[22px] py-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/75">To review</div>
            <div className="text-[40px] font-medium leading-none">{s.pending.length}</div>
            <div className="text-sm leading-relaxed text-white/[0.88]">{summary}.</div>
            <button type="button" onClick={onReview} className="h-11 rounded-full bg-white text-sm font-semibold text-ux2-plum">Review what we found</button>
          </div>
        )}
        <Card tone="white">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">No documents to hand?</div>
          <p className="m-0 text-sm leading-relaxed text-ux2-muted">Skip to the essentials and type them in. You can add documents later.</p>
          <Button variant="ghost" className="self-start" onClick={onByHand}>Set it up by hand</Button>
        </Card>
        {s.docs.length > 0 && (
          <Card tone="white">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Start over</div>
            <p className="m-0 text-sm leading-relaxed text-ux2-muted">Clears this page's documents and review decisions. What you already accepted stays in the building.</p>
            <Button variant="ghost" className="self-start" onClick={() => { if (window.confirm('Clear the documents and decisions on this page? What you accepted stays in the building.')) resetSetup(); }}>Start over</Button>
          </Card>
        )}
      </aside>
    </div>
  );
}
