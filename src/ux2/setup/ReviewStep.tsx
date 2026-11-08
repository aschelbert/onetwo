/**
 * Setup step 2 — review what we found. Every item shows the document and the
 * page and words (or spreadsheet row) it came from. Items that match across documents (and were
 * read clearly) can be accepted together; the rest wait for a person: two
 * documents that disagree, or a faint scan. Accepting writes the item into
 * the building's records at once (`applyItem`); Change reopens it.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/formatters';
import { Button, Chip } from '../components';
import { Link } from 'react-router-dom';
import { DOC_KINDS, FIELD_LABEL, SECTIONS, SECTION_GOES, coverage, isClear, itemSummary, missingFee, pathFor, readByOlderReader, type FieldScalar, type Item, type Section, type Source } from '@/features/setup/setupModel';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { applyItem } from '@/features/setup/applySetup';
import { useSetup } from './useSetup';

function SourceLine({ sources }: { sources: Source[] }) {
  const first = sources[0];
  if (!first) return null;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed text-ux2-muted">
      <span className="whitespace-nowrap font-semibold text-ux2-plum">{first.docName}{first.page ? ` p.${first.page}` : ''}</span>
      {first.quote && <q className="italic text-ink-700">{first.quote}</q>}
      {sources.length > 1 && <span>· also in {sources.slice(1).map(x => `${x.docName}${x.page ? ` p.${x.page}` : ''}`).join(', ')}</span>}
    </span>
  );
}

function ItemCard({ item, fee = '', onFee }: { item: Item; fee?: string; onFee?: (v: string) => void }) {
  const decision = useSetupStore(s => s.decisions[item.key]);
  const decide = useSetupStore(s => s.decide);
  const undo = useSetupStore(s => s.undo);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // A unit with no monthly amount in any document: enter it here before accepting.
  const setFee = (v: string) => onFee?.(v);
  const noFee = missingFee(item);
  const conflicted = item.conflicts.length > 0;
  const fields = Object.entries(item.fields);
  const plain = fields.find(([f]) => !item.conflicts.includes(f))?.[1][0]?.sources;

  const accept = () => {
    const typed: Record<string, FieldScalar> = {};
    for (const [f, v] of Object.entries(edits)) {
      const orig = item.fields[f]?.[0]?.value;
      typed[f] = typeof orig === 'number' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/[$,%]/g, ''))) ? Number(v.replace(/[$,%]/g, '')) : v;
    }
    const feeNum = Number(fee.replace(/[$,\s]/g, ''));
    const all: Record<string, FieldScalar> = { ...(editing ? typed : {}), ...(noFee && fee.trim() && !Number.isNaN(feeNum) ? { monthlyFee: feeNum } : {}) };
    const extra = Object.keys(all).length ? all : undefined;
    const savedTo = applyItem(item, picks, extra);
    decide(item.key, { status: 'accepted', picks, edits: extra, savedTo });
    setEditing(false);
  };

  if (decision) {
    return (
      <div data-setup-item={item.key} data-decision={decision.status} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ux2-line bg-white px-4 py-2.5 text-sm">
        <span className="min-w-0 flex-1"><b className="font-semibold">{item.label}</b> <span className="text-ux2-muted">· {decision.status === 'accepted' ? itemSummary(item, decision.picks, decision.edits) : 'skipped'}</span></span>
        {decision.status === 'accepted'
          ? (pathFor(decision.savedTo)
            ? <Link to={pathFor(decision.savedTo)!} className="inline-flex items-center gap-1 rounded-full bg-ux2-sage-tint px-[11px] py-[6px] text-xs font-semibold text-ux2-sage hover:underline">Saved to {decision.savedTo} ↗</Link>
            : <Chip tone="sage">Saved · {decision.savedTo}</Chip>)
          : <Chip tone="ghost">Skipped</Chip>}
        <Button size="sm" variant="ghost" onClick={() => undo(item.key)}>Change</Button>
      </div>
    );
  }

  return (
    <div data-setup-item={item.key} className={cn('grid grid-cols-1 gap-3 rounded-2xl border bg-white px-4 py-3.5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] md:gap-4', conflicted ? 'border-ux2-red' : item.lowConfidence ? 'border-ux2-amber' : 'border-ux2-line')}>
      <div className="flex flex-col items-start gap-2">
        <b className="font-semibold">{item.label}</b>
        {conflicted && <Chip tone="red">Documents disagree</Chip>}
        {!conflicted && item.lowConfidence && <Chip tone="amber">Check the source</Chip>}
        {noFee && <Chip tone="amber">No monthly amount</Chip>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {editing ? (
          fields.map(([f, vals]) => (
            <label key={f} className="flex flex-col gap-1 text-xs text-ux2-muted">
              {fields.length > 1 || f !== 'value' ? FIELD_LABEL[f] ?? f : item.label}
              <input className="h-10 rounded-[10px] border border-ux2-line-strong px-3 text-sm text-ux2-ink" defaultValue={String(vals[picks[f] ?? 0].value)} onChange={e => setEdits(x => ({ ...x, [f]: e.target.value }))} />
            </label>
          ))
        ) : (
          <>
            {item.conflicts.map(f => (
              <fieldset key={f} className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 p-0 text-xs font-semibold text-ux2-muted">{f === 'value' ? 'Which applies?' : `${FIELD_LABEL[f] ?? f} · which applies?`}</legend>
                {item.fields[f].map((v, i) => (
                  <label key={i} className={cn('flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm', (picks[f] ?? 0) === i ? 'border-ux2-plum bg-ux2-plum-tint' : 'border-ux2-line-strong bg-white')}>
                    <input type="radio" name={`${item.key}:${f}`} checked={(picks[f] ?? 0) === i} onChange={() => setPicks(p => ({ ...p, [f]: i }))} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#4F46A8]" />
                    <span className="flex min-w-0 flex-col gap-0.5"><b className="font-semibold">{v.display}</b><SourceLine sources={v.sources} /></span>
                  </label>
                ))}
              </fieldset>
            ))}
            {(!conflicted || fields.length > item.conflicts.length) && (
              <>
                <div className="text-[15px]">{itemSummary(item, picks)}</div>
                {plain && <SourceLine sources={plain} />}
              </>
            )}
            {conflicted && item.conflicts.includes('value') && <p className="m-0 text-xs text-ux2-muted">Not sure which is current? Pick one now and change it later.</p>}
            {noFee && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-ux2-muted">Monthly assessment for this unit $
                <input inputMode="decimal" aria-label={`Monthly assessment for ${item.label}`} className="h-9 w-28 rounded-[10px] border border-ux2-line-strong bg-white px-3 text-sm text-ux2-ink" placeholder="e.g. 412" value={fee} onChange={e => setFee(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') accept(); }} />
                <span>optional now; you can set it later in Fill the gaps</span>
              </label>
            )}
          </>
        )}
      </div>
      <div className="flex flex-row flex-wrap items-start gap-1.5">
        <Button size="sm" variant="plum" onClick={accept}>{editing ? 'Save' : conflicted ? 'Use this' : 'Accept'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(e => !e)}>{editing ? 'Cancel' : 'Edit'}</Button>
        {!editing && <Button size="sm" variant="ghost" aria-label={`Skip ${item.label}`} onClick={() => decide(item.key, { status: 'skipped' })}>Skip</Button>}
      </div>
    </div>
  );
}

/** What each document turned out to hold, which of the requested documents that covers, and where it goes. */
function Assessment({ onDocuments }: { onDocuments: () => void }) {
  const s = useSetup();
  if (!s.docs.length) return null;
  const covered = new Set(s.docs.flatMap(d => (d.result && !d.historical ? coverage(d.result).map(c => c.kind) : [])));
  const missing = DOC_KINDS.filter(k => k.imports && !covered.has(k.id));
  return (
    <section aria-labelledby="assess-h" data-widget="setup-assessment" className="flex flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
      <h2 id="assess-h" className="m-0 text-lg font-medium">What we found in your documents, and where it goes</h2>
      {s.docs.map(d => {
        const cov = d.result && !d.historical ? coverage(d.result) : [];
        return (
          <div key={d.id} data-assess-doc={d.name} className="flex flex-col gap-1.5 rounded-2xl border border-ux2-line bg-white px-4 py-3">
            <div className="text-sm"><b className="font-semibold">{d.name}</b>{d.result?.pageCount ? <span className="text-ux2-muted"> · {d.result.pageCount} pages</span> : null}</div>
            {d.status === 'reading' && <span className="text-[13px] text-ux2-muted">Still opening…</span>}
            {d.status === 'error' && <span className="text-[13px] text-ux2-red-ink">{d.error}</span>}
            {d.historical ? <span className="text-[13px] text-ux2-muted">Past version{d.period ? ` (${d.period})` : ''} · kept as history, not read into the building</span>
              : d.status === 'filed' && <span className="text-[13px] text-ux2-amber">{d.note ?? 'Filed in Building › Documents; nothing was read from it.'}</span>}
            {d.filedAs && d.covers && d.covers.length > 1 && <span className="text-[13px] text-ux2-muted">Filed once under {d.covers.join(', ')}</span>}
            {d.status === 'read' && cov.length === 0 && <span className="text-[13px] text-ux2-muted">Nothing found that setup can use.</span>}
            {readByOlderReader(d) && <span className="text-[13px] text-ux2-amber">Read by an earlier version of setup, so board duties, owner obligations and rules weren't looked for. Remove it in step 1 and add it again.</span>}
            {cov.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {cov.map(c => (
                  <li key={c.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <Chip tone="plum" className="px-2 py-1">{c.label}</Chip>
                    <span>{c.count} {c.unit}{c.pages ? <span className="text-ux2-muted"> · {c.pages}</span> : null}</span>
                    <span className="text-ux2-muted">→ {c.goes}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ux2-muted">
          <span>Not found in anything yet: {missing.map(k => k.label.replace(/ \(.*\)$/, '')).join(', ')}.</span>
          <Button size="sm" variant="ghost" onClick={onDocuments}>Add documents</Button>
        </div>
      )}
    </section>
  );
}

export default function ReviewStep({ onDone, onDocuments }: { onDone: () => void; onDocuments: () => void }) {
  const s = useSetup();
  const decide = useSetupStore(x => x.decide);
  const sections = useMemo(() => SECTIONS.map(sec => ({ ...sec, all: s.items.filter(i => i.section === sec.id) })).filter(sec => sec.all.length > 0), [s.items]);
  const firstOpen = sections.find(sec => sec.all.some(i => !s.decisions[i.key]))?.id ?? sections[0]?.id;
  const [chosen, setChosen] = useState<Section | null>(null);
  const [fees, setFees] = useState<Record<string, string>>({});
  // Stay on the section you are in when its last item is decided; the "done" bar offers the next one.
  useEffect(() => { if (!chosen && firstOpen) setChosen(firstOpen); }, [chosen, firstOpen]);
  const current = sections.find(sec => sec.id === (chosen ?? firstOpen));

  if (!current) {
    return (
      <div className="flex flex-col gap-[18px]">
      <Assessment onDocuments={onDocuments} />
      <div className="flex flex-col items-start gap-3 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <p className="m-0 text-sm text-ux2-muted">Nothing found to review yet. Add your bylaws, owner list or budget (PDF, spreadsheet or pasted text) and what they hold shows here.</p>
        <div className="flex gap-2"><Button variant="plum" onClick={onDocuments}>Add documents</Button><Button variant="ghost" onClick={onDone}>Fill the gaps</Button></div>
      </div>
      </div>
    );
  }

  const pendingIn = current.all.filter(i => !s.decisions[i.key]);
  const clearIn = pendingIn.filter(isClear);
  const needLook = pendingIn.length - clearIn.length;
  const acceptClear = () => {
    for (const it of clearIn) {
      // A monthly amount typed into a unit's card goes in with the bulk accept too.
      const n = Number((fees[it.key] ?? '').replace(/[$,\s]/g, ''));
      const edits = missingFee(it) && fees[it.key]?.trim() && !Number.isNaN(n) ? { monthlyFee: n } : undefined;
      decide(it.key, { status: 'accepted', edits, savedTo: applyItem(it, undefined, edits) });
    }
  };
  const nextSection = sections.find(sec => sec.id !== current.id && sec.all.some(i => !s.decisions[i.key]));

  return (
    <div className="flex flex-col gap-[18px]">
    <Assessment onDocuments={onDocuments} />
    <div className="grid grid-cols-1 items-start gap-[22px] lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="What we found" className="flex gap-1.5 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {sections.map(sec => {
          const left = sec.all.filter(i => !s.decisions[i.key]).length;
          const on = sec.id === current.id;
          return (
            <button key={sec.id} type="button" aria-current={on ? 'true' : undefined} onClick={() => setChosen(sec.id)}
              className={cn('flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm', on ? 'bg-ux2-plum-tint font-semibold text-ux2-plum' : 'text-ink-700 hover:bg-ux2-surface')}>
              <span className="flex-1 whitespace-nowrap">{sec.label}</span>
              {left ? <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', on ? 'bg-ux2-plum text-white' : 'bg-ux2-plum-tint text-ux2-plum')}>{left}</span> : <Chip tone="sage" className="px-2 py-1">Done</Chip>}
            </button>
          );
        })}
        <p className="m-0 hidden px-3 py-2.5 text-xs leading-relaxed text-ux2-muted lg:block">Anything you skip, or that no document covered, is asked in Fill the gaps.</p>
      </nav>

      <section aria-labelledby="review-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="review-h" className="flex-1 text-xl font-medium">{current.label} <span className="text-sm text-ux2-muted">· {current.all.length} found{needLook ? ` · ${needLook} need${needLook === 1 ? 's' : ''} a look` : ''}</span></h2>
          {clearIn.length > 1 && <Button variant="plum" onClick={acceptClear}>Accept the {clearIn.length} that match</Button>}
        </div>
        <p className="m-0 text-[13px] text-ux2-muted">Accepted items go to <b className="font-semibold text-ux2-ink">{SECTION_GOES[current.id]}</b>.</p>
        {current.id === 'units' && pendingIn.some(missingFee) && (
          <p className="m-0 rounded-xl bg-ux2-amber-tint px-3 py-2 text-[13px] text-ux2-amber">{pendingIn.filter(missingFee).length} of these units have no monthly amount in your documents. Enter each one below as you accept it, or accept them now and set the amounts in Fill the gaps, unit by unit, by ownership % or the same for each.</p>
        )}
        {[...pendingIn.filter(i => !isClear(i)), ...pendingIn.filter(isClear)].map(it => <ItemCard key={it.key} item={it} fee={fees[it.key] ?? ''} onFee={v => setFees(x => ({ ...x, [it.key]: v }))} />)}
        {current.all.filter(i => s.decisions[i.key]).map(it => <ItemCard key={it.key} item={it} />)}
        {pendingIn.length === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ux2-sage-tint px-4 py-3 text-sm text-ux2-sage">
            <span className="flex-1 font-semibold">{current.label} is done.</span>
            {nextSection ? <Button size="sm" variant="plum" onClick={() => setChosen(nextSection.id)}>Next: {nextSection.label}</Button> : <Button size="sm" variant="plum" onClick={onDone}>Fill the gaps</Button>}
          </div>
        )}
      </section>
    </div>
    </div>
  );
}
