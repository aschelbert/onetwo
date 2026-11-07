/**
 * Setup step 2 — review what we found. Every item shows the document, page
 * and words it was read from. Items that match across documents (and were
 * read clearly) can be accepted together; the rest wait for a person: two
 * documents that disagree, or a faint scan. Accepting writes the item into
 * the building's records at once (`applyItem`); Change reopens it.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/formatters';
import { Button, Chip } from '../components';
import { FIELD_LABEL, SECTIONS, isClear, itemSummary, type FieldScalar, type Item, type Section, type Source } from '@/features/setup/setupModel';
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

function ItemCard({ item }: { item: Item }) {
  const decision = useSetupStore(s => s.decisions[item.key]);
  const decide = useSetupStore(s => s.decide);
  const undo = useSetupStore(s => s.undo);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const conflicted = item.conflicts.length > 0;
  const fields = Object.entries(item.fields);
  const plain = fields.find(([f]) => !item.conflicts.includes(f))?.[1][0]?.sources;

  const accept = () => {
    const typed: Record<string, FieldScalar> = {};
    for (const [f, v] of Object.entries(edits)) {
      const orig = item.fields[f]?.[0]?.value;
      typed[f] = typeof orig === 'number' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/[$,%]/g, ''))) ? Number(v.replace(/[$,%]/g, '')) : v;
    }
    const savedTo = applyItem(item, picks, editing ? typed : undefined);
    decide(item.key, { status: 'accepted', picks, edits: editing ? typed : undefined, savedTo });
    setEditing(false);
  };

  if (decision) {
    return (
      <div data-setup-item={item.key} data-decision={decision.status} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ux2-line bg-white px-4 py-2.5 text-sm">
        <span className="min-w-0 flex-1"><b className="font-semibold">{item.label}</b> <span className="text-ux2-muted">· {decision.status === 'accepted' ? itemSummary(item, decision.picks) : 'skipped'}</span></span>
        {decision.status === 'accepted' ? <Chip tone="sage">Saved · {decision.savedTo}</Chip> : <Chip tone="ghost">Skipped</Chip>}
        <Button size="sm" variant="ghost" onClick={() => undo(item.key)}>Change</Button>
      </div>
    );
  }

  return (
    <div data-setup-item={item.key} className={cn('grid grid-cols-1 gap-3 rounded-2xl border bg-white px-4 py-3.5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] md:gap-4', conflicted ? 'border-ux2-red' : item.lowConfidence ? 'border-ux2-amber' : 'border-ux2-line')}>
      <div className="flex flex-col items-start gap-2">
        <b className="font-semibold">{item.label}</b>
        {conflicted && <Chip tone="red">Documents disagree</Chip>}
        {!conflicted && item.lowConfidence && <Chip tone="amber">Check the scan</Chip>}
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
            {conflicted && item.conflicts.includes('value') && <p className="m-0 text-xs text-ux2-muted">The newer document usually applies if the board adopted it properly. Not sure? Pick one now and change it later.</p>}
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

export default function ReviewStep({ onDone, onDocuments }: { onDone: () => void; onDocuments: () => void }) {
  const s = useSetup();
  const decide = useSetupStore(x => x.decide);
  const sections = useMemo(() => SECTIONS.map(sec => ({ ...sec, all: s.items.filter(i => i.section === sec.id) })).filter(sec => sec.all.length > 0), [s.items]);
  const firstOpen = sections.find(sec => sec.all.some(i => !s.decisions[i.key]))?.id ?? sections[0]?.id;
  const [chosen, setChosen] = useState<Section | null>(null);
  // Stay on the section you are in when its last item is decided; the "done" bar offers the next one.
  useEffect(() => { if (!chosen && firstOpen) setChosen(firstOpen); }, [chosen, firstOpen]);
  const current = sections.find(sec => sec.id === (chosen ?? firstOpen));

  if (!current) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <p className="m-0 text-sm text-ux2-muted">{s.reading ? `Reading ${s.reading} document${s.reading === 1 ? '' : 's'}. What they hold shows here as soon as each is read.` : 'Nothing to review yet. Add your documents and what they hold shows here.'}</p>
        <div className="flex gap-2"><Button variant="plum" onClick={onDocuments}>Add documents</Button><Button variant="ghost" onClick={onDone}>Fill the gaps</Button></div>
      </div>
    );
  }

  const pendingIn = current.all.filter(i => !s.decisions[i.key]);
  const clearIn = pendingIn.filter(isClear);
  const needLook = pendingIn.length - clearIn.length;
  const acceptClear = () => { for (const it of clearIn) decide(it.key, { status: 'accepted', savedTo: applyItem(it) }); };
  const nextSection = sections.find(sec => sec.id !== current.id && sec.all.some(i => !s.decisions[i.key]));

  return (
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
        {[...pendingIn.filter(i => !isClear(i)), ...pendingIn.filter(isClear)].map(it => <ItemCard key={it.key} item={it} />)}
        {current.all.filter(i => s.decisions[i.key]).map(it => <ItemCard key={it.key} item={it} />)}
        {pendingIn.length === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ux2-sage-tint px-4 py-3 text-sm text-ux2-sage">
            <span className="flex-1 font-semibold">{current.label} is done.</span>
            {nextSection ? <Button size="sm" variant="plum" onClick={() => setChosen(nextSection.id)}>Next: {nextSection.label}</Button> : <Button size="sm" variant="plum" onClick={onDone}>Fill the gaps</Button>}
          </div>
        )}
      </section>
    </div>
  );
}
