import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore, type LegalDocFile, type LegalDocument } from '@/store/useBuildingStore';
import { useReportsStore } from '@/store/useReportsStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, Table, Th, Td, Cell, KV, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { documentsSummary, insuranceStatus, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';
import { DOC_CATALOGUE, DOC_GROUP_LABEL, currentFile, deleteFile, entryFor, groupOf, pastFiles, placeFile, replacedBy, restoreFile, type CatalogueEntry } from '@/features/building/documentCatalogue';
import { DocumentPicker } from '../DocumentPicker';
import { canStoreFiles, downloadDocumentFile, uploadDocumentFile } from '@/lib/services/documentFiles';

type Group = 'governing' | 'policies' | 'insurance' | 'reserve' | 'reports' | 'minutes' | 'contracts';
type Filter = 'all' | Group;
const GROUP_LABEL: Record<Group, string> = DOC_GROUP_LABEL;
const ORDER: Group[] = ['governing', 'policies', 'insurance', 'reserve', 'reports', 'minutes', 'contracts'];

interface DocRow {
  id: string;
  group: Group;
  name: string;
  note: string;
  version: string;
  audience: 'Everyone' | 'Board';
  updated: string;
  updatedIso?: string;
  file: boolean;
  missing?: boolean;
  status?: { label: string; tone: 'red' | 'amber' | 'sage' | 'ghost' };
  legal?: LegalDocument;
  /** A required document with nothing on file: Add file creates it under this entry's name. */
  expected?: CatalogueEntry;
  /** Earlier versions (replaced files and past versions), newest first. */
  past?: LegalDocFile[];
  /** The stored file behind the row, when there is one. */
  download?: { path: string; name: string };
  open?: () => void;
}


const monthYear = (iso: string) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

/** Brings what it wraps into view when it opens (a form opened from a row further down). */
function InView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, []);
  return <div ref={ref}>{children}</div>;
}

const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Upload a file: which documents it is (one file can be several), whether it's
 * the current version or a past one kept as history, and, when it replaces a
 * current file, whether the old one is archived or deleted.
 */
function UploadForm({ start, onClose }: { start?: string[]; onClose: () => void }) {
  useBuildingStore(s => s.legalDocuments); // what it would replace follows the library
  const updateDoc = useBuildingStore(s => s.updateLegalDocument);
  const [file, setFile] = useState<File | null>(null);
  const [names, setNames] = useState<string[]>(start ?? []);
  const [when, setWhen] = useState<'current' | 'past'>('current');
  const [version, setVersion] = useState('');
  const [replaced, setReplaced] = useState<'archive' | 'delete' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nf = file ? { name: file.name, size: sizeLabel(file.size), type: file.type || 'application/pdf' } : null;
  const replacing = nf && when === 'current' ? replacedBy(names, nf) : [];
  const pick = (f: File | null) => {
    setFile(f);
    // A first guess from the file's name; the person confirms it.
    if (f && !names.length) { const e = entryFor(f.name.replace(/\.[a-z0-9]+$/i, '')); if (e) setNames([e.label]); }
  };
  const ready = !!nf && names.length > 0 && (!replacing.length || !!replaced);
  return (
    <form
      aria-label={start?.length ? `Add a file to ${start.join(', ')}` : 'Upload a document'}
      onSubmit={async e => {
        e.preventDefault();
        if (!nf || !ready || !file || saving) return;
        const year = /\b(19|20)\d{2}\b/.exec(version || file.name)?.[0];
        // Store the file first, so the document never lists a file that isn't there.
        const fileId = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        let path: string | undefined;
        if (canStoreFiles()) {
          setSaving(true); setError('');
          path = (await uploadDocumentFile(fileId, file)) ?? undefined;
          setSaving(false);
          if (!path) { setError("The file couldn't be uploaded. Check your connection and try again."); return; }
        }
        const ids = placeFile(names, { ...nf, fileId, path, ...(when === 'past' ? { period: version || year } : {}) }, { past: when === 'past', replaced: replaced ?? 'archive', version: version || year });
        if (when === 'current' && version) for (const id of ids) updateDoc(id, { version });
        onClose();
      }}
      className="flex flex-col gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3"
    >
      <div className="text-sm font-semibold text-ux2-ink">{start?.length ? `${start.join(', ')} · add a file` : 'Upload a document'}</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="File" className="min-w-[220px]"><input type="file" onChange={e => pick(e.target.files?.[0] ?? null)} className="text-sm font-normal" /></Field>
        <div role="radiogroup" aria-label="Which version" className="flex flex-wrap gap-3 text-[13px]">
          <label className="flex items-center gap-1.5"><input type="radio" name="when" checked={when === 'current'} onChange={() => setWhen('current')} />Current version</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="when" checked={when === 'past'} onChange={() => setWhen('past')} />Past version <span className="text-ux2-muted">· kept as history, replaces nothing</span></label>
        </div>
        <Field label={when === 'past' ? 'Year or period' : 'Version or date'} className="w-[150px]"><input value={version} onChange={e => setVersion(e.target.value)} placeholder={when === 'past' ? '2024' : '2026 · amended'} className={INPUT} /></Field>
      </div>
      <DocumentPicker value={names} onChange={setNames} />
      {replacing.length > 0 && (
        <div role="group" aria-label="What it replaces" className="flex flex-col gap-1.5 rounded-xl bg-ux2-amber-tint/60 px-3 py-2.5 text-[13px]">
          <b className="font-semibold text-ux2-ink">This replaces what's on file now</b>
          <ul className="m-0 list-disc pl-5 text-ux2-ink">
            {replacing.map(r => <li key={r.doc.id}>{r.doc.name}: {r.files.map(f => `${f.name}${f.uploadedAt ? ` (${monthYear(f.uploadedAt)})` : ''}`).join(', ')}</li>)}
          </ul>
          <span className="text-ux2-muted">What should happen to {replacing.reduce((n, r) => n + r.files.length, 0) === 1 ? 'it' : 'them'}?</span>
          <span className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" name="replaced" checked={replaced === 'archive'} onChange={() => setReplaced('archive')} />Archive · keep as an earlier version</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="replaced" checked={replaced === 'delete'} onChange={() => setReplaced('delete')} />Delete it</label>
          </span>
        </div>
      )}
      {error && <div role="alert" className="text-[13px] font-semibold text-ux2-red-ink">{error}</div>}
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!ready || saving}>{saving ? 'Uploading…' : when === 'past' ? 'Add past version' : 'Upload'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/** Downloads a stored file through a short-lived link. */
function DownloadButton({ path, name }: { path: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return (
    <Button size="sm" variant="ghost" aria-label={`Download ${name}`} disabled={state === 'busy'} onClick={async () => { setState('busy'); setState((await downloadDocumentFile(path, name)) ? 'idle' : 'failed'); }}>
      {state === 'busy' ? 'Opening…' : state === 'failed' ? "Couldn't open · retry" : 'Download'}
    </Button>
  );
}

/** A document's earlier versions: replaced files and past versions, each can be made current again or deleted. */
function EarlierVersions({ doc, files, isBoard }: { doc: LegalDocument; files: LegalDocFile[]; isBoard: boolean }) {
  return (
    <ul aria-label={`Earlier versions of ${doc.name}`} className="m-0 flex list-none flex-col gap-1.5 p-0">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.uploadedAt}-${i}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-ux2-line bg-white px-3 py-2 text-[13px]">
          <span className="min-w-0 flex-1"><b className="font-semibold">{f.name}</b> <span className="text-ux2-muted">· {f.period ? `${f.period} · ` : ''}added {monthYear(f.uploadedAt)}{f.archived && f.archived !== f.uploadedAt ? ` · archived ${monthYear(f.archived)}` : ''}</span></span>
          {f.path && <DownloadButton path={f.path} name={f.name} />}
          {isBoard && <Button size="sm" variant="ghost" onClick={() => restoreFile(doc.id, f)}>Make current</Button>}
          {isBoard && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${f.name}? This can't be undone.`)) deleteFile(doc.id, f); }}>Delete</Button>}
        </li>
      ))}
    </ul>
  );
}

export default function DocumentsTab({ snap, section, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: BuildingTab, section?: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  const docs = documentsSummary(snap);
  const ins = insuranceStatus(snap);
  const reports = useReportsStore(s => s.reports);
  const archives = useArchiveStore(s => s.archives);
  const contracts = useVendorTrackerStore(s => s.contracts);
  const updateDoc = useBuildingStore(s => s.updateLegalDocument);
  const [filter, setFilter] = useState<Filter>(section === 'reports' || section === 'archives' ? 'reports' : section === 'certificates' ? 'insurance' : 'all');
  const [audience, setAudience] = useState<'all' | 'owners'>('all');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [openPast, setOpenPast] = useState<string | null>(null);

  const rows = useMemo<DocRow[]>(() => {
    const out: DocRow[] = [];
    // One row per document: copies with the same catalogue entry (or, outside the catalogue, the same name)
    // collapse into the newest copy that has a current file.
    const buckets = new Map<string, { entry?: CatalogueEntry; docs: LegalDocument[] }>();
    for (const d of snap.legalDocuments) {
      const entry = entryFor(d.name);
      const k = entry ? `cat:${entry.key}` : `name:${d.name.trim().toLowerCase()}`;
      const b = buckets.get(k) ?? { entry, docs: [] };
      b.docs.push(d);
      buckets.set(k, b);
    }
    const pushDoc = (d: LegalDocument, copies: number, entry?: CatalogueEntry) => {
      const cur = currentFile(d);
      const past = pastFiles(d);
      const extra = copies > 1 ? ` · ${copies - 1} other ${copies - 1 === 1 ? 'copy' : 'copies'}` : '';
      const earlier = past.length ? ` · ${past.length} earlier ${past.length === 1 ? 'version' : 'versions'}` : '';
      // A required document with only past versions is still missing its current one.
      const missing = !cur && (!past.length || !!entry?.required);
      out.push({ id: d.id, group: entry?.group ?? groupOf(d.name), name: entry?.label ?? d.name, note: `${entry ? `${entry.note} · ` : ''}${cur ? cur.name : past.length ? 'past versions only' : d.version}${cur && !cur.path && canStoreFiles() ? ' · added before files were stored: add it again to download' : ''}${earlier}${extra}`, version: d.version, audience: entry?.audience ?? 'Everyone', updated: cur ? monthYear(cur.uploadedAt) : past.length ? monthYear(past[0].uploadedAt) : 'Never uploaded', updatedIso: cur?.uploadedAt, file: !!cur, missing, status: d.status === 'review-due' ? { label: 'Review due', tone: 'amber' } : undefined, legal: d, past, download: cur?.path ? { path: cur.path, name: cur.name } : undefined });
    };
    const score = (d: LegalDocument) => (currentFile(d) ? 2 : d.attachments.length ? 1 : 0);
    const best = (docs: LegalDocument[]) => [...docs].sort((a, b) => score(b) - score(a) || (currentFile(b)?.uploadedAt || '').localeCompare(currentFile(a)?.uploadedAt || ''))[0];
    for (const entry of DOC_CATALOGUE) {
      const b = buckets.get(`cat:${entry.key}`);
      if (b) pushDoc(best(b.docs), b.docs.length, entry);
      else if (entry.required) out.push({ id: `need:${entry.key}`, group: entry.group, name: entry.label, note: entry.note, version: '', audience: entry.audience, updated: 'Never uploaded', file: false, missing: true, expected: entry });
    }
    for (const [k, b] of buckets) if (k.startsWith('name:')) pushDoc(best(b.docs), b.docs.length);
    for (const p of ins) {
      const pol = snap.insurance.find(x => x.id === p.id)!;
      const latest = [...(pol.attachments ?? [])].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0];
      out.push({ id: `ins:${p.id}`, group: 'insurance', name: `${p.type.replace(/\s*\(.*\)/, '')} certificate`, note: `${p.carrier} · ${pol.coverage} · expires ${dayLabel(p.expires)}`, version: p.expires.slice(0, 4), audience: /D&O|directors/i.test(p.type) ? 'Board' : 'Everyone', updated: latest ? monthYear(latest.uploadedAt) : 'Not on file', file: !!latest, status: p.state === 'lapsed' ? { label: `Expired ${dayLabel(p.expires)}`, tone: 'red' } : p.state === 'expiring' ? { label: `Expires ${dayLabel(p.expires)}`, tone: 'amber' } : undefined, open: () => navigate('/building?section=insurance') });
    }
    for (const r of reports) out.push({ id: `rep:${r.id}`, group: 'reports', name: r.name, note: `${r.periodLabel} · generated by ${r.generatedBy}`, version: r.periodLabel, audience: 'Everyone', updated: monthYear(r.generatedAt), updatedIso: r.generatedAt, file: true, open: () => navigate('/funds?tab=statements') });
    for (const a of archives) out.push({ id: `arch:${a.id}`, group: 'reports', name: `Annual archive · ${a.label.split(' (')[0]}`, note: 'financial statements and the year in review', version: a.label.split(' (')[0], audience: 'Everyone', updated: monthYear(a.createdAt), updatedIso: a.createdAt, file: true, open: () => navigate('/funds?tab=statements') });
    out.push({ id: 'minutes', group: 'minutes', name: 'Minutes archive', note: 'every approved set of board and annual meeting minutes', version: 'with the meetings', audience: 'Everyone', updated: '', file: true, open: () => navigate('/community?tab=meetings') });
    for (const c of contracts) out.push({ id: `con:${c.id}`, group: 'contracts', name: c.title, note: `${c.vendorName} · ${c.status === 'expired' ? `ended ${dayLabel(c.endDate)}` : `ends ${dayLabel(c.endDate)}`}`, version: `${c.startDate.slice(0, 4)}–${c.endDate.slice(2, 4)}`, audience: 'Board', updated: monthYear(c.startDate), updatedIso: c.startDate, file: c.attachments.length > 0, status: c.status === 'expired' ? { label: 'Lapsed', tone: 'red' } : undefined, download: c.attachments[0]?.path ? { path: c.attachments[0].path, name: c.attachments[0].name } : undefined, open: () => navigate('/building?tab=contracts') });
    return out;
  }, [snap.legalDocuments, snap.insurance, ins, reports, archives, contracts, navigate]);

  const counts = ORDER.reduce<Record<string, number>>((acc, g) => { acc[g] = rows.filter(r => r.group === g).length; return acc; }, {});
  const shown = rows
    .filter(r => filter === 'all' || r.group === filter)
    .filter(r => audience === 'all' || r.audience === 'Everyone')
    .filter(r => !q || `${r.name} ${r.note}`.toLowerCase().includes(q.toLowerCase()));
  const groups = ORDER.filter(g => shown.some(r => r.group === g));
  const needs = [
    ...rows.filter(r => r.missing && r.group !== 'contracts').slice(0, 2).map(r => ({ id: r.id, title: `${r.name} ${/rules|plats|regulations/i.test(r.name) ? 'are' : 'is'} missing`, detail: `Its obligation stays open until the file is on file${/rule/i.test(r.name) ? ' · blocks "Publish house rules to owners"' : ''}`, chip: <Chip tone="red">Add file</Chip>, go: () => setUploading(r.id) })),
    ...ins.filter(p => p.state !== 'current').slice(0, 1).map(p => ({ id: `cert:${p.id}`, title: `Insurance certificates ${p.state === 'lapsed' ? 'expired' : 'expire'} ${dayLabel(p.expires)}`, detail: 'New certificates arrive from the renewal runbook', chip: <Chip tone={p.state === 'lapsed' ? 'red' : 'amber'}>{p.state === 'lapsed' ? 'Expired' : `${p.daysLeft} days`}</Chip>, go: () => navigate('/building?section=insurance') })),
    ...docs.reviewDue.slice(0, 1).map(d => ({ id: `rev:${d.id}`, title: `${d.name} is due for review`, detail: 'The reviewed version closes its obligation', chip: <Chip tone="amber">Review due</Chip>, go: () => updateDoc(d.id, { status: 'current' }) })),
  ].slice(0, 3);
  // A row's upload form and earlier versions open above the table, at full width (the table scrolls sideways on a phone).
  const uploadRow = rows.find(r => r.id === uploading && (r.legal || r.expected));
  const pastRow = rows.find(r => r.id === openPast);
  const storage = snap.legalDocuments.reduce((t, d) => t + d.attachments.reduce((u, a) => { const m = /([\d.]+)\s*(KB|MB)/i.exec(a.size); return u + (m ? Number(m[1]) * (m[2].toUpperCase() === 'MB' ? 1024 : 1) : 0); }, 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <HeaderActions><SearchInput value={q} onChange={setQ} placeholder="Search documents" label="Search documents" className="h-11" />{isBoard && <Button onClick={() => setUploading(uploading === 'new' ? null : 'new')}>Upload</Button>}</HeaderActions>
      {uploading === 'new' && <UploadForm onClose={() => setUploading(null)} />}

      {needs.length > 0 && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">A missing document leaves its obligation open until it is on file</span></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {needs.map(n => (
              <button key={n.id} type="button" onClick={n.go} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
                <span className="min-w-0"><span className="block text-sm font-semibold text-ux2-ink">{n.title}</span><span className="block text-xs text-ux2-muted">{n.detail}</span></span>{n.chip}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Document groups" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: `All · ${rows.length}` }, ...ORDER.map(g => ({ id: g, label: g === 'minutes' ? 'Minutes' : `${GROUP_LABEL[g].split(' ')[0]} · ${counts[g]}` }))]} />
        <PillTabs size="filter" aria-label="Audience" value={audience} onChange={setAudience} tabs={[{ id: 'all', label: 'Everyone + Board' }, { id: 'owners', label: 'What owners see' }]} />
      </div>

      <Card aria-label="Document library" className="gap-2.5">
        {uploadRow && <InView key={`up:${uploadRow.id}`}><UploadForm start={[uploadRow.name]} onClose={() => setUploading(null)} /></InView>}
        {pastRow?.legal && pastRow.past && (
          <InView key={`past:${pastRow.id}`}>
            <div className="flex flex-col gap-2 rounded-[14px] border border-ux2-line bg-ux2-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-ux2-ink">{pastRow.name} · earlier versions</span><Button size="sm" variant="ghost" onClick={() => setOpenPast(null)}>Close</Button></div>
              <EarlierVersions doc={pastRow.legal} files={pastRow.past} isBoard={isBoard} />
            </div>
          </InView>
        )}
        {shown.length === 0 ? <Inner className="text-sm text-ux2-muted">No document matches.</Inner> : (
          <Table minWidth={760}>
            <thead><tr><Th>Document</Th><Th>Version / date</Th><Th>Who can see</Th><Th>Last updated</Th><Th num>Download</Th></tr></thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g}>
                  <tr><td colSpan={5} className="bg-ux2-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">{GROUP_LABEL[g]} · {shown.filter(r => r.group === g).length}</td></tr>
                  {shown.filter(r => r.group === g).map(r => (
                    <Fragment key={r.id}>
                      <tr className={cn(r.missing && 'bg-ux2-red-tint/50')}>
                        <Td><Cell title={r.name} note={r.note} /></Td>
                        <Td>{r.missing ? <span className="font-semibold text-ux2-red-ink">Missing</span> : r.version}</Td>
                        <Td><Chip tone={r.audience === 'Everyone' ? 'teal' : 'ghost'}>{r.audience}</Chip></Td>
                        <Td className="whitespace-nowrap text-ux2-muted">{r.updated || '—'}{r.status && <Chip tone={r.status.tone} className="ml-1.5">{r.status.label}</Chip>}</Td>
                        <Td num>
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            {r.download && <DownloadButton path={r.download.path} name={r.download.name} />}
                            {!!r.past?.length && <Button size="sm" variant="ghost" aria-expanded={openPast === r.id} onClick={() => setOpenPast(openPast === r.id ? null : r.id)}>Earlier · {r.past.length}</Button>}
                            {r.missing && isBoard ? <Button size="sm" onClick={() => setUploading(uploading === r.id ? null : r.id)}>{/rule/i.test(r.name) ? 'Add rules' : 'Add file'}</Button>
                              : r.open ? <Button size="sm" variant="ghost" onClick={r.open}>{r.group === 'minutes' ? 'Open in Community' : 'Open'}</Button>
                              : r.legal && isBoard ? <Button size="sm" variant="ghost" onClick={() => setUploading(uploading === r.id ? null : r.id)}>New version</Button>
                              : null}
                          </span>
                        </Td>
                      </tr>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        <Why>One file can be several documents: tick each one it holds (bylaws with the rules and a pets policy in them) and it's filed once under all of them. A new current version asks whether to archive the one it replaces (kept under Earlier, with its date) or delete it; a past version (last year's budget, old minutes) is added as history and replaces nothing. "Who can see" is Everyone or Board; owners never see contracts or the D&O certificate. Minutes live in Community because meetings do; this row is the way in.</Why>
      </Card>
      <Why>A document with a date on it closes the obligation it proves. Those closures show in <button type="button" onClick={() => navigate('/building?tab=obligations')} className="font-semibold text-ux2-teal hover:underline">Obligations</button>, in the Board Room decision trail and as Pulse items on Home; this page is just the library.</Why>

      <Card aria-label="Document settings" className="gap-2.5">
        <SectionLabel>Settings</SectionLabel>
        <Inner className="py-1">
          <KV label="Default for a new upload">Board only <span className="text-xs font-normal text-ux2-muted">· change per document</span></KV>
          <KV label="Owner download">On <span className="text-xs font-normal text-ux2-muted">· watermarked with unit</span></KV>
          <KV label="Resale packet">Bylaws, CC&Rs, rules, policies, budget, reserve study</KV>
          <KV label="Keep old versions">Forever</KV>
          <KV label="Storage">{storage > 1024 ? `${(storage / 1024).toFixed(0)} MB` : `${Math.round(storage)} KB`} <span className="text-xs font-normal text-ux2-muted">· no limit</span></KV>
        </Inner>
        <Why>The resale certificate pulls from this list, so a missing document shows up there too. Templates for letters and notices are not documents; they live in the Board Room outbox.</Why>
      </Card>
    </div>
  );
}
