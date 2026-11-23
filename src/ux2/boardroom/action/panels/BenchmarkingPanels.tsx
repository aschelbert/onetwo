import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { benchmarkCsv, missingMonths, monthLabel, utilitiesFrom } from '@/lib/utilities';
import { benchmarkDue, type BenchmarkingData } from '@/lib/actions/benchmarking';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { FORM, NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';

function Covered({ r, patch }: PanelProps<BenchmarkingData>) {
  const [note, setNote] = useState(r.data.coveredNote);
  if (r.data.covered) return <Inner className="text-sm text-ux2-ink">{r.data.covered === 'yes' ? 'The building is covered.' : 'The building is not covered.'} {r.data.coveredNote}</Inner>;
  return (
    <>
      <Inner><KV label="Gross floor area on file">{r.data.sqft ? `${r.data.sqft.toLocaleString('en-US')} sq ft` : 'Not entered'}</KV><KV label="The rule">Buildings over 50,000 gross square feet report; the District has been extending it to smaller ones</KV></Inner>
      <div className={FORM}>
        <Field label="Note (the DC building ID, or why it is not covered)" className="min-w-[260px] flex-1"><input value={note} onChange={e => setNote(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" onClick={() => patch({ covered: 'yes', coveredNote: note.trim() })}>It is covered</Button>
        <Button size="sm" variant="ghost" onClick={() => patch({ covered: 'no', coveredNote: note.trim() })}>It is not: close this</Button>
      </div>
      <Why>Check the Department of Energy and Environment's covered building list for this address. The list, not the floor area on file here, decides.</Why>
    </>
  );
}

function Months({ r }: PanelProps<BenchmarkingData>) {
  const navigate = useNavigate();
  const doc = utilitiesFrom(useActionRecordsStore(s => s.records.find(x => x.kind === 'utilities'))?.data);
  return (
    <>
      {doc.meters.length === 0 ? <p className={NOTE}>No meters are entered yet. Add each meter the association pays for under Building › Utilities.</p> : (
        <Inner className="flex flex-col gap-1.5">{doc.meters.map(m => { const miss = missingMonths(doc, m.id, r.data.year); return <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span><b className="font-semibold">{m.name}</b>{miss.length > 0 && <span className="block text-xs text-ux2-muted">Missing {miss.map(x => monthLabel(x).slice(0, 3)).join(', ')}</span>}</span><Chip tone={miss.length ? 'amber' : 'sage'}>{12 - miss.length} of 12</Chip></div>; })}</Inner>
      )}
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=utilities')}>Enter the missing bills</Button></div>
      <Why>Nothing is typed twice: bills are entered through the year under Building › Utilities. The District asks for whole-building data, so units on their own meters need the utility's aggregated figures, requested from the utility.</Why>
    </>
  );
}

function Details({ r, patch }: PanelProps<BenchmarkingData>) {
  const [sqft, setSqft] = useState(r.data.sqft ? String(r.data.sqft) : '');
  const [occ, setOcc] = useState(r.data.occupants ? String(r.data.occupants) : '');
  const [hours, setHours] = useState(r.data.hours);
  const n = (s: string) => Math.max(0, Math.round(Number(s.replace(/[^0-9.]/g, '')) || 0));
  return (
    <>
      <div className={FORM}>
        <Field label="Gross floor area, sq ft" className="w-[190px]"><input inputMode="numeric" value={sqft} onChange={e => setSqft(e.target.value)} className={INPUT} /></Field>
        <Field label="Units occupied, or residents" className="w-[200px]"><input inputMode="numeric" value={occ} onChange={e => setOcc(e.target.value)} className={INPUT} /></Field>
        <Field label="Operating hours" className="min-w-[200px] flex-1"><input value={hours} onChange={e => setHours(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!n(sqft) || !n(occ)} onClick={() => patch({ sqft: n(sqft), occupants: n(occ), hours: hours.trim(), detailsOn: todayIso() })}>{r.data.detailsOn ? 'Update' : 'Confirm the details'}</Button>
      </div>
      <Why>Portfolio Manager asks for these alongside the meter data. They are kept on this report so next year starts from them.</Why>
    </>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Submit({ r, patch, step }: PanelProps<BenchmarkingData>) {
  const doc = utilitiesFrom(useActionRecordsStore(s => s.records.find(x => x.kind === 'utilities'))?.data);
  const [on, setOn] = useState(r.data.submittedOn || todayIso());
  return (
    <>
      <Inner><KV label="Report for">{r.data.year}</KV><KV label="Due">{benchmarkDue(r.data.year)}</KV><KV label="File">{r.data.downloadedOn ? `Downloaded ${r.data.downloadedOn}` : 'Not downloaded yet'}</KV></Inner>
      <div className={FORM}>
        <Button size="sm" variant="ghost" disabled={!doc.meters.length} onClick={() => { download(`benchmarking-${r.data.year}.csv`, benchmarkCsv(doc, r.data.year)); patch({ downloadedOn: todayIso() }); }}>Download the {r.data.year} meter data</Button>
        <Field label="Submitted in Portfolio Manager on" className="w-[240px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !on} onClick={() => patch({ submittedOn: on })}>Record the submission date</Button>
      </div>
      <Why>The file is a spreadsheet of every meter's monthly use and cost, one row a month, to enter or upload in ENERGY STAR Portfolio Manager. The board submits the report there itself; nothing is sent from here.</Why>
    </>
  );
}

function Record({ r, patch, step }: PanelProps<BenchmarkingData>) {
  const [conf, setConf] = useState(r.data.confirmation);
  if (r.closedOn && r.data.confirmation) return <Inner className="text-sm text-ux2-ink">Recorded: confirmation {r.data.confirmation}, submitted {r.data.submittedOn}. It is on file under Building › Obligations.</Inner>;
  return (
    <>
      <div className={FORM}>
        <Field label="Confirmation, or the Portfolio Manager or DC building ID" className="min-w-[260px] flex-1"><input value={conf} onChange={e => setConf(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !conf.trim()} onClick={() => patch({ confirmation: conf.trim() })}>Record it and close</Button>
      </div>
      <Why>This fills in "Energy and water benchmarking report" under Building › Obligations, where next year's due date is tracked.</Why>
    </>
  );
}

export const BENCHMARKING_PANELS = { covered: Covered, months: Months, details: Details, submit: Submit, record: Record };
