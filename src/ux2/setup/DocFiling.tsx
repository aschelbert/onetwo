/**
 * Setup step 1, beyond reading: where each file is filed (one file can be
 * several documents), whether it's a past version, past documents kept as
 * history, and vendor contracts.
 */
import { useRef, useState } from 'react';
import { cn } from '@/lib/formatters';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { DOC_CATALOGUE, deleteFile, replacedFiles, sameDocument } from '@/features/building/documentCatalogue';
import { coversOf, suggestedCovers } from '@/features/setup/applySetup';
import { HISTORY_KINDS, type SetupDoc } from '@/features/setup/setupModel';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { ACCEPT, addFiles, setCovers } from '@/features/setup/readDocument';
import { Button, Chip } from '../components';
import { DocumentPicker } from '../building/DocumentPicker';

const labelOf = (key: string) => DOC_CATALOGUE.find(e => e.key === key)?.label ?? key;

/** Under a document in "Your documents": what it's filed as, what its text says it also is, and what it replaced. */
export function FiledAs({ doc }: { doc: SetupDoc }) {
  useBuildingStore(s => s.legalDocuments); // replaced files follow the library
  const [open, setOpen] = useState(false);
  if (doc.status === 'reading' || doc.status === 'error' || doc.pasted) return null;
  const covers = coversOf(doc);
  const filed = !!doc.filedAs;
  const suggestions = suggestedCovers(doc);
  const replaced = replacedFiles(doc.id);
  return (
    <span className="flex basis-full flex-col gap-1.5 border-t border-ux2-line pt-2.5 text-[13px]" data-filed-as={doc.id}>
      <span className="flex flex-wrap items-center gap-1.5">
        {filed ? (
          <>
            <span className="text-ux2-muted">{doc.historical ? `Past version${doc.period ? ` (${doc.period})` : ''} of` : 'Filed as'}</span>
            {covers.map(c => <Chip key={c} tone="plum" className="px-2 py-1">{c}</Chip>)}
            <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="font-semibold text-ux2-plum hover:underline">{open ? 'Done' : 'Change'}</button>
          </>
        ) : (
          <>
            <span className="text-ux2-muted">Not kept in Building › Documents.</span>
            <button type="button" onClick={() => setCovers(doc, covers)} className="font-semibold text-ux2-plum hover:underline">Keep a copy</button>
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ux2-muted">
          <input type="checkbox" className="accent-[#4F46A8]" checked={!!doc.historical} onChange={e => setCovers(doc, covers, e.target.checked)} />
          Past version · history, not read in
        </label>
      </span>
      {filed && !open && suggestions.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ux2-muted">Also in it?</span>
          {suggestions.map(s => (
            <button key={s.name} type="button" onClick={() => setCovers(doc, [...covers, s.name])} className="rounded-full border border-dashed border-ux2-plum px-2.5 py-1 text-[12px] font-semibold text-ux2-plum hover:bg-ux2-plum-tint">
              + {s.name} <span className="font-normal opacity-80">· {s.why}</span>
            </button>
          ))}
        </span>
      )}
      {filed && open && (
        <span className="block rounded-xl border border-ux2-line bg-ux2-surface px-3 py-2.5">
          <DocumentPicker accent="plum" label="This file is" value={covers} suggestions={suggestions} onChange={n => { if (n.length) setCovers(doc, n); }} />
        </span>
      )}
      {replaced.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5 text-ux2-muted">
          Replaces {replaced.map(r => `${r.file.name} on ${r.doc.name}`).join('; ')} · kept as an earlier version.
          <button type="button" onClick={() => { if (window.confirm(`Delete ${replaced.map(r => r.file.name).join(', ')}? This can't be undone.`)) for (const r of replaced) deleteFile(r.doc.id, r.file); }} className="font-semibold text-ux2-red-ink hover:underline">Delete instead</button>
        </span>
      )}
    </span>
  );
}

/** Optional: past documents, each filed as an earlier version under its document. */
export function PastDocuments() {
  const docs = useSetupStore(s => s.docs);
  const input = useRef<HTMLInputElement>(null);
  const kind = useRef<(typeof HISTORY_KINDS)[number] | null>(null);
  return (
    <section aria-label="Past documents" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Optional · past documents</div>
        <span className="text-[13px] text-ux2-muted">Kept as history in Building › Documents; they aren't read into the building</span>
      </div>
      <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Add past files" onChange={e => { const k = kind.current; if (k && e.target.files?.length) void addFiles(Array.from(e.target.files), { docType: k.docType, covers: [labelOf(k.entry)] }); e.target.value = ''; }} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HISTORY_KINDS.map(k => {
          const added = docs.filter(d => d.historical && (d.covers ?? []).some(c => sameDocument(c, labelOf(k.entry))));
          return (
            <div key={k.id} data-history-kind={k.id} className="flex items-center gap-3 rounded-2xl border border-ux2-line bg-white px-4 py-3">
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{k.label}</b>
                <span className="block text-[13px] text-ux2-muted">{added.length ? `${added.length} added · ${added.map(d => d.period ?? d.name).join(', ')}` : k.hint}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => { kind.current = k; input.current?.click(); }}>{added.length ? 'Add more' : 'Add'}</Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const SETUP_NOTE = 'Added in setup';
const norm = (s: string) => s.trim().toLowerCase();
const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const INPUT = 'h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-[13px]';

/** Optional: vendor contracts, added to Building › Contracts with their vendor. */
export function VendorContracts() {
  const contracts = useVendorTrackerStore(s => s.contracts).filter(c => c.notes === SETUP_NOTE);
  const remove = useVendorTrackerStore(s => s.deleteContract);
  const empty = { vendor: '', service: '', start: '', end: '', amount: '', autoRenew: false };
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const ready = f.vendor.trim() && f.start && f.end;
  const add = () => {
    if (!ready) return;
    const b = useBuildingStore.getState();
    let v = b.vendors.find(x => norm(x.name) === norm(f.vendor));
    if (!v) {
      b.addVendor({ name: f.vendor.trim(), service: f.service.trim(), contact: '', phone: '', email: '', contract: `ends ${f.end}`, status: 'active' });
      v = useBuildingStore.getState().vendors.find(x => norm(x.name) === norm(f.vendor));
    }
    const today = new Date().toISOString().slice(0, 10);
    useVendorTrackerStore.getState().addContract({
      vendorId: v?.id ?? '', vendorName: f.vendor.trim(), title: `${f.service.trim() || f.vendor.trim()} contract`, startDate: f.start, endDate: f.end,
      amount: Number(f.amount.replace(/[$,]/g, '')) || 0, status: f.end < today ? 'expired' : 'active', autoRenew: f.autoRenew,
      attachments: file ? [{ name: file.name, size: sizeLabel(file.size) }] : [], notes: SETUP_NOTE,
    });
    setF(empty); setFile(null);
  };
  return (
    <section aria-label="Vendor contracts" className="flex flex-col gap-2.5 rounded-2xl border border-ux2-line bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Optional · vendor contracts</span>
          <span className="text-[13px] text-ux2-muted">Management, landscaping, elevator, cleaning… Each goes to Building › Contracts with its vendor and end date, so renewals show up in time.</span>
        </span>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Add a contract'}</Button>
      </div>
      {contracts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {contracts.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-ux2-surface px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1"><b className="font-semibold">{c.vendorName}</b> <span className="text-ux2-muted">· {c.title} · {c.startDate} to {c.endDate}{c.autoRenew ? ' · renews itself' : ''}{c.attachments.length ? ` · ${c.attachments[0].name}` : ''}</span></span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${c.vendorName} contract`} onClick={() => remove(c.id)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form aria-label="Add a vendor contract" onSubmit={e => { e.preventDefault(); add(); }} className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Vendor<input className={cn(INPUT, 'min-w-[160px]')} value={f.vendor} onChange={e => setF({ ...f, vendor: e.target.value })} placeholder="Acme Elevator" /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">For<input className={cn(INPUT, 'min-w-[140px]')} value={f.service} onChange={e => setF({ ...f, service: e.target.value })} placeholder="Elevator maintenance" /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Starts<input type="date" className={INPUT} value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">Ends<input type="date" className={INPUT} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">A year<input className={cn(INPUT, 'w-[110px]')} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="$12,000" /></label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-ux2-muted"><input type="checkbox" className="accent-[#4F46A8]" checked={f.autoRenew} onChange={e => setF({ ...f, autoRenew: e.target.checked })} />Renews itself</label>
          <label className="flex flex-col gap-1 text-xs text-ux2-muted">File (optional)<input type="file" accept={ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" /></label>
          <Button type="submit" size="sm" variant="plum" disabled={!ready}>Add contract</Button>
        </form>
      )}
    </section>
  );
}
