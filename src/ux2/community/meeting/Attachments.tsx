/**
 * Attachments on agenda items: a report from the app kept as a point-in-time
 * snapshot, a building document, or an uploaded file. Everyone's attachments
 * ride on the meeting; board-only ones are kept on its private side.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { canStoreFiles, downloadDocumentFile, uploadDocumentFile } from '@/lib/services/documentFiles';
import { Button, Chip, Field, INPUT, PillTabs } from '../../components';
import { REPORTS, buildReport, type ReportSource } from '../meetingReports';
import type { AgendaAttachment, Audience, ReportKind, ReportSnapshot } from '../meetingRecord';

const attId = () => `att_${Math.random().toString(36).slice(2, 10)}`;

export function useReportSource(): ReportSource {
  const fin = useFinancialStore();
  const issues = useIssuesStore(s => s.issues);
  return useMemo(() => ({
    units: fin.units,
    budgetCategories: fin.budgetCategories,
    reserveItems: fin.reserveItems,
    chartOfAccounts: fin.chartOfAccounts,
    generalLedger: fin.generalLedger,
    openRequests: issues.filter(i => i.status !== 'CLOSED' && i.status !== 'RESOLVED').map(i => ({ id: i.id, title: i.title, status: i.status.toLowerCase(), unit: i.unitNumber, created: i.submittedDate })),
    workOrders: fin.workOrders.filter(w => w.status !== 'paid').map(w => ({ id: w.id, title: w.title, status: w.status, vendor: w.vendor, amount: w.amount })),
  }), [fin.units, fin.budgetCategories, fin.reserveItems, fin.chartOfAccounts, fin.generalLedger, fin.workOrders, issues]);
}

/** Re-capture "live" reports and freeze them (when the notice goes out). */
export function freezeLive(atts: AgendaAttachment[], src: ReportSource, today: string): AgendaAttachment[] {
  return atts.map(a => (a.mode === 'live' && a.source === 'report' && a.report ? { ...a, mode: 'frozen', asOf: today, capturedAt: today, snapshot: buildReport(a.report, today, src) } : a));
}

export function attachmentNote(a: AgendaAttachment): string {
  if (a.source === 'report') return a.mode === 'live' ? 'refreshes until the notice goes out' : `${a.asOf && REPORTS[a.report!]?.dated ? `as of ${a.asOf}` : `captured ${a.capturedAt.slice(0, 10)}`}`;
  if (a.source === 'document') return 'Building › Documents';
  return a.size ? `uploaded · ${a.size}` : 'uploaded';
}

export function SnapshotView({ snapshot }: { snapshot: ReportSnapshot }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-ux2-line bg-white p-3">
      <div className="text-[13px] font-semibold text-ux2-ink">{snapshot.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr>{snapshot.columns.map((c, i) => <th key={i} className="border-b border-ux2-line px-2 py-1.5 text-left text-xs font-semibold text-ux2-muted">{c}</th>)}</tr></thead>
          <tbody>
            {snapshot.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="border-b border-ux2-line/60 px-2 py-1.5 text-ux2-ink">{v}</td>)}</tr>)}
            {snapshot.totals && <tr>{snapshot.totals.map((v, j) => <td key={j} className="px-2 py-1.5 font-semibold text-ux2-ink">{v}</td>)}</tr>}
            {snapshot.rows.length === 0 && <tr><td colSpan={snapshot.columns.length} className="px-2 py-2 text-ux2-muted">Nothing to show on this date.</td></tr>}
          </tbody>
        </table>
      </div>
      {snapshot.note && <div className="text-xs text-ux2-muted">{snapshot.note}</div>}
    </div>
  );
}

/** The attachments on one item as chips; a snapshot opens in place, a file downloads. */
export function AttachmentList({ atts, onRemove }: { atts: AgendaAttachment[]; onRemove?: (a: AgendaAttachment) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!atts.length) return null;
  const shown = atts.find(a => a.id === open);
  const openAtt = async (a: AgendaAttachment) => {
    setNote(null);
    if (a.snapshot) { setOpen(open === a.id ? null : a.id); return; }
    if (a.path) { if (!(await downloadDocumentFile(a.path, a.name))) setNote("That file couldn't be downloaded."); return; }
    if (a.source === 'document') { navigate('/building?tab=documents'); return; }
    setNote('This file was added before storage was set up; there is nothing to download.');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {atts.map(a => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-[10px] border border-ux2-line bg-ux2-surface pr-1">
            <button type="button" onClick={() => { void openAtt(a); }} className="flex min-h-[36px] flex-col items-start px-2.5 py-1 text-left">
              <span className="text-[13px] font-semibold text-ux2-ink">{a.name}</span>
              <span className="text-[11px] text-ux2-muted">{attachmentNote(a)}</span>
            </button>
            {a.source === 'report' && a.mode === 'frozen' && <Chip tone="teal">Snapshot</Chip>}
            {a.mode === 'live' && <Chip tone="amber">Live</Chip>}
            {a.audience === 'board' && <Chip tone="navy">Board only</Chip>}
            {onRemove && <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)} className="grid h-8 w-8 place-items-center rounded-full text-ux2-muted hover:bg-white">×</button>}
          </span>
        ))}
      </div>
      {shown?.snapshot && <SnapshotView snapshot={shown.snapshot} />}
      {note && <div role="status" className="text-xs text-ux2-muted">{note}</div>}
    </div>
  );
}

/** Attach to an item: a report from the app, a building document, or an upload. */
export function AttachPanel({ itemTitle, today, by, onAdd, onClose }: { itemTitle: string; today: string; by: string; onAdd: (a: AgendaAttachment) => void; onClose: () => void }) {
  const src = useReportSource();
  const docs = useBuildingStore(s => s.legalDocuments);
  const [source, setSource] = useState<'report' | 'document' | 'upload'>('report');
  const [asOf, setAsOf] = useState(today);
  const [mode, setMode] = useState<'frozen' | 'live'>('frozen');
  const [audience, setAudience] = useState<Audience | 'default'>('default');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aud = (k?: ReportKind): Audience => (audience === 'default' ? (k ? REPORTS[k].audience : 'all') : audience);

  const addReport = (k: ReportKind) => {
    onAdd({ id: attId(), name: REPORTS[k].label, source: 'report', report: k, asOf, mode, audience: aud(k), capturedAt: today, capturedBy: by, snapshot: buildReport(k, mode === 'live' ? today : asOf, src) });
  };
  const upload = async (file: File) => {
    setBusy(true); setNote(null);
    const id = attId();
    const path = canStoreFiles() ? await uploadDocumentFile(`meeting-${id}`, file) : null;
    setBusy(false);
    if (canStoreFiles() && !path) { setNote("The file couldn't be uploaded. Try again."); return; }
    onAdd({ id, name: file.name, source: 'upload', mode: 'frozen', audience: aud(), capturedAt: today, capturedBy: by, path: path ?? undefined, size: `${Math.max(1, Math.round(file.size / 1024))} KB` });
    if (!path) setNote('Demo mode: the file is listed but not stored.');
  };

  return (
    <div aria-label={`Attach to ${itemTitle}`} role="group" className="flex flex-col gap-2 rounded-[12px] bg-ux2-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ux2-ink">Attach to “{itemTitle}”</span>
        <PillTabs size="filter" aria-label="Attachment source" value={source} onChange={setSource} tabs={[{ id: 'report', label: 'A report from the app' }, { id: 'document', label: 'From Documents' }, { id: 'upload', label: 'Upload' }]} />
      </div>
      {source === 'report' && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="As of"><input type="date" value={asOf} max={today} onChange={e => setAsOf(e.target.value)} disabled={mode === 'live'} className={INPUT} /></Field>
            <Field label="Keep it"><select value={mode} onChange={e => setMode(e.target.value as 'frozen' | 'live')} className={INPUT}><option value="frozen">Frozen as captured</option><option value="live">Refresh until the notice goes out</option></select></Field>
            <Field label="Who sees it"><select value={audience} onChange={e => setAudience(e.target.value as Audience | 'default')} className={INPUT}><option value="default">Usual for the report</option><option value="all">Everyone</option><option value="board">Board only</option></select></Field>
          </div>
          {(Object.keys(REPORTS) as ReportKind[]).map(k => (
            <div key={k} className="flex items-center justify-between gap-2 border-t border-ux2-line/70 py-1.5 text-sm">
              <span className="text-ux2-ink">{REPORTS[k].label} <span className="text-ux2-muted">· {REPORTS[k].from}{REPORTS[k].audience === 'board' ? ' · board only' : ''}</span></span>
              <Button size="sm" variant="ghost" onClick={() => addReport(k)}>Add</Button>
            </div>
          ))}
        </>
      )}
      {source === 'document' && (docs.length ? docs.map(d => (
        <div key={d.id} className="flex items-center justify-between gap-2 border-t border-ux2-line/70 py-1.5 text-sm">
          <span className="text-ux2-ink">{d.name} <span className="text-ux2-muted">· {d.version}</span></span>
          <Button size="sm" variant="ghost" onClick={() => { const f = d.attachments.find(x => !x.archived); onAdd({ id: attId(), name: d.name, source: 'document', mode: 'frozen', audience: aud(), capturedAt: today, capturedBy: by, documentId: d.id, path: f?.path, size: f?.size }); }}>Add</Button>
        </div>
      )) : <div className="text-sm text-ux2-muted">No documents on file yet.</div>)}
      {source === 'upload' && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" aria-label="Choose a file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : 'Choose a file'}</Button>
          <select aria-label="Who sees it" value={audience} onChange={e => setAudience(e.target.value as Audience | 'default')} className={`${INPUT} w-auto`}><option value="default">Everyone</option><option value="board">Board only</option></select>
        </div>
      )}
      {note && <div role="status" className="text-xs text-ux2-muted">{note}</div>}
      <div><Button size="sm" variant="ghost" onClick={onClose}>Done</Button></div>
    </div>
  );
}
