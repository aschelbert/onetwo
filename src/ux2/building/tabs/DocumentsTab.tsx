import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore, type LegalDocument } from '@/store/useBuildingStore';
import { useReportsStore } from '@/store/useReportsStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, Table, Th, Td, Cell, KV, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { documentsSummary, insuranceStatus, type BuildingSnapshot } from '../metrics';
import type { BuildingTab } from '../BuildingModule';

type Group = 'governing' | 'policies' | 'insurance' | 'reserve' | 'reports' | 'minutes' | 'contracts';
type Filter = 'all' | Group;
const GROUP_LABEL: Record<Group, string> = { governing: 'Governing documents', policies: 'Policies', insurance: 'Insurance certificates', reserve: 'Reserve study', reports: 'Annual reports', minutes: 'Minutes', contracts: 'Vendor contracts' };
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
  open?: () => void;
}

function groupOf(d: LegalDocument): Group {
  const n = d.name.toLowerCase();
  if (/reserve study/.test(n)) return 'reserve';
  if (/bylaw|cc&r|covenant|declaration|deed|articles/.test(n)) return 'governing';
  return 'policies';
}

const monthYear = (iso: string) => { if (!iso) return ''; const d = new Date(iso.slice(0, 10) + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

function UploadForm({ doc, onClose }: { doc?: LegalDocument; onClose: () => void }) {
  const addDoc = useBuildingStore(s => s.addLegalDocument);
  const attach = useBuildingStore(s => s.addLegalDocAttachment);
  const docs = useBuildingStore(s => s.legalDocuments);
  const [name, setName] = useState(doc?.name ?? '');
  const [version, setVersion] = useState(doc ? '' : '');
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      aria-label={doc ? `Add file to ${doc.name}` : 'Upload a document'}
      onSubmit={e => {
        e.preventDefault();
        const att = file ? { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, type: file.type || 'application/pdf' } : null;
        if (doc) { if (att) attach(doc.id, att); }
        else {
          if (!name) return;
          addDoc({ name, version: version || '1.0', size: att?.size ?? '', status: 'current' });
          const created = useBuildingStore.getState().legalDocuments.find(d => d.name === name && !docs.some(x => x.id === d.id));
          if (created && att) attach(created.id, att);
        }
        onClose();
      }}
      className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3"
    >
      <div className="w-full text-sm font-semibold text-ux2-ink">{doc ? `${doc.name} · add the file` : 'Upload · a new version keeps the old one underneath it with its date'}</div>
      {!doc && <Field label="Document" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Rules and regulations" className={INPUT} /></Field>}
      {!doc && <Field label="Version" className="w-[140px]"><input value={version} onChange={e => setVersion(e.target.value)} placeholder="2026 · v1" className={INPUT} /></Field>}
      <Field label="File" className="min-w-[220px]"><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm font-normal" /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={doc ? !file : !name}>{doc ? 'Add file' : 'Upload'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
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

  const rows = useMemo<DocRow[]>(() => {
    const out: DocRow[] = [];
    for (const d of snap.legalDocuments) {
      const latest = [...d.attachments].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0];
      const g = groupOf(d);
      out.push({ id: d.id, group: g, name: d.name, note: `${d.version}${latest ? ` · ${latest.name}` : ''}`, version: d.version, audience: 'Everyone', updated: latest ? monthYear(latest.uploadedAt) : 'Never uploaded', updatedIso: latest?.uploadedAt, file: !!latest, missing: !latest, status: d.status === 'review-due' ? { label: 'Review due', tone: 'amber' } : undefined, legal: d });
    }
    for (const p of ins) {
      const pol = snap.insurance.find(x => x.id === p.id)!;
      const latest = [...(pol.attachments ?? [])].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0];
      out.push({ id: `ins:${p.id}`, group: 'insurance', name: `${p.type.replace(/\s*\(.*\)/, '')} certificate`, note: `${p.carrier} · ${pol.coverage} · expires ${dayLabel(p.expires)}`, version: p.expires.slice(0, 4), audience: /D&O|directors/i.test(p.type) ? 'Board' : 'Everyone', updated: latest ? monthYear(latest.uploadedAt) : 'Not on file', file: !!latest, status: p.state === 'lapsed' ? { label: `Expired ${dayLabel(p.expires)}`, tone: 'red' } : p.state === 'expiring' ? { label: `Expires ${dayLabel(p.expires)}`, tone: 'amber' } : undefined, open: () => navigate('/building?section=insurance') });
    }
    for (const r of reports) out.push({ id: `rep:${r.id}`, group: 'reports', name: r.name, note: `${r.periodLabel} · generated by ${r.generatedBy}`, version: r.periodLabel, audience: 'Everyone', updated: monthYear(r.generatedAt), updatedIso: r.generatedAt, file: true, open: () => navigate('/funds?tab=statements') });
    for (const a of archives) out.push({ id: `arch:${a.id}`, group: 'reports', name: `Annual archive · ${a.label.split(' (')[0]}`, note: 'financial statements and the year in review', version: a.label.split(' (')[0], audience: 'Everyone', updated: monthYear(a.createdAt), updatedIso: a.createdAt, file: true, open: () => navigate('/funds?tab=statements') });
    out.push({ id: 'minutes', group: 'minutes', name: 'Minutes archive', note: 'every approved set of board and annual meeting minutes', version: 'with the meetings', audience: 'Everyone', updated: '', file: true, open: () => navigate('/community?tab=meetings') });
    for (const c of contracts) out.push({ id: `con:${c.id}`, group: 'contracts', name: c.title, note: `${c.vendorName} · ${c.status === 'expired' ? `ended ${dayLabel(c.endDate)}` : `ends ${dayLabel(c.endDate)}`}`, version: `${c.startDate.slice(0, 4)}–${c.endDate.slice(2, 4)}`, audience: 'Board', updated: monthYear(c.startDate), updatedIso: c.startDate, file: c.attachments.length > 0, status: c.status === 'expired' ? { label: 'Lapsed', tone: 'red' } : undefined, open: () => navigate('/building?tab=contracts') });
    return out;
  }, [snap.legalDocuments, snap.insurance, ins, reports, archives, contracts, navigate]);

  const counts = ORDER.reduce<Record<string, number>>((acc, g) => { acc[g] = rows.filter(r => r.group === g).length; return acc; }, {});
  const shown = rows
    .filter(r => filter === 'all' || r.group === filter)
    .filter(r => audience === 'all' || r.audience === 'Everyone')
    .filter(r => !q || `${r.name} ${r.note}`.toLowerCase().includes(q.toLowerCase()));
  const groups = ORDER.filter(g => shown.some(r => r.group === g));
  const needs = [
    ...rows.filter(r => r.missing && r.group !== 'contracts').slice(0, 2).map(r => ({ id: r.id, title: `${r.name} ${r.group === 'governing' && /rule/i.test(r.name) ? 'are' : 'is'} missing`, detail: `Its obligation stays open until the file is on file${/rule/i.test(r.name) ? ' · blocks "Publish house rules to owners"' : ''}`, chip: <Chip tone="red">Add file</Chip>, go: () => setUploading(r.id) })),
    ...ins.filter(p => p.state !== 'current').slice(0, 1).map(p => ({ id: `cert:${p.id}`, title: `Insurance certificates ${p.state === 'lapsed' ? 'expired' : 'expire'} ${dayLabel(p.expires)}`, detail: 'New certificates arrive from the renewal runbook', chip: <Chip tone={p.state === 'lapsed' ? 'red' : 'amber'}>{p.state === 'lapsed' ? 'Expired' : `${p.daysLeft} days`}</Chip>, go: () => navigate('/building?section=insurance') })),
    ...docs.reviewDue.slice(0, 1).map(d => ({ id: `rev:${d.id}`, title: `${d.name} is due for review`, detail: 'The reviewed version closes its obligation', chip: <Chip tone="amber">Review due</Chip>, go: () => updateDoc(d.id, { status: 'current' }) })),
  ].slice(0, 3);
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
                          {r.missing && isBoard ? <Button size="sm" onClick={() => setUploading(uploading === r.id ? null : r.id)}>{/rule/i.test(r.name) ? 'Add rules' : 'Add file'}</Button>
                            : r.open ? <Button size="sm" variant="ghost" onClick={r.open}>{r.group === 'minutes' ? 'Open in Community' : 'Open'}</Button>
                            : <Button size="sm" variant="ghost" disabled={!r.file} onClick={() => setUploading(uploading === r.id ? null : r.id)}>{r.file ? 'Download' : 'Add file'}</Button>}
                        </Td>
                      </tr>
                      {uploading === r.id && r.legal && <tr><td colSpan={5} className="px-3 py-2"><UploadForm doc={r.legal} onClose={() => setUploading(null)} /></td></tr>}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        <Why>Uploading a new version keeps the old one underneath it with its date. "Who can see" is Everyone or Board; owners never see contracts or the D&O certificate. Minutes live in Community because meetings do; this row is the way in.</Why>
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
