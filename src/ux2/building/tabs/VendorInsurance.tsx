import { useRef, useState } from 'react';
import { useBuildingStore, type Vendor, type VendorCertificate } from '@/store/useBuildingStore';
import { canStoreFiles, downloadDocumentFile, uploadDocumentFile } from '@/lib/services/documentFiles';
import { generateLocalId } from '@/lib/generateId';
import { COVERAGES, certificateState, coverageLabel, vendorInsuranceStatus, type VendorInsuranceStatus } from '@/lib/vendorInsurance';
import { Button, Chip, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';

export function insuranceChip(s: VendorInsuranceStatus): { tone: 'red' | 'amber' | 'sage' | 'ghost'; label: string } {
  if (s.state === 'missing') return { tone: s.count ? 'amber' : 'ghost', label: s.count ? 'No liability cert' : 'None on file' };
  if (s.state === 'lapsed') return { tone: 'red', label: s.worst?.expires ? `Lapsed ${dayLabel(s.worst.expires)}` : 'Lapsed' };
  if (s.state === 'expiring') return { tone: 'amber', label: `Expires ${dayLabel(s.worst!.expires)}` };
  return { tone: 'sage', label: `Current to ${dayLabel(s.worst!.expires)}` };
}

/** A vendor's certificates of insurance: what is on file, and a form to add one from the certificate they sent. */
export default function VendorInsurance({ vendor, today, isBoard, onClose }: { vendor: Vendor; today: string; isBoard: boolean; onClose: () => void }) {
  const updateVendor = useBuildingStore(s => s.updateVendor);
  const certs = [...(vendor.insurance ?? [])].sort((a, b) => (b.expires || '').localeCompare(a.expires || ''));
  const status = vendorInsuranceStatus(vendor, today);
  const [coverage, setCoverage] = useState<VendorCertificate['coverage']>(certs.some(c => c.coverage === 'general_liability') ? 'workers_comp' : 'general_liability');
  const [carrier, setCarrier] = useState('');
  const [policyNum, setPolicyNum] = useState('');
  const [limit, setLimit] = useState('');
  const [expires, setExpires] = useState('');
  const [additionalInsured, setAdditionalInsured] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expires) return;
    setBusy(true);
    const id = generateLocalId('coi');
    let stored: VendorCertificate['file'];
    if (file) {
      const path = canStoreFiles() ? await uploadDocumentFile(id, file) : null;
      if (path) stored = { name: file.name, path };
      else setNote(canStoreFiles() ? 'The certificate was recorded, but the file could not be uploaded. Try attaching it again.' : 'The certificate was recorded. Files are kept once the building is connected.');
    }
    const cert: VendorCertificate = { id, coverage, carrier: carrier.trim(), policyNum: policyNum.trim(), limit: limit.trim(), expires, additionalInsured, file: stored, addedAt: today };
    updateVendor(vendor.id, { insurance: [...(vendor.insurance ?? []), cert] });
    setCarrier(''); setPolicyNum(''); setLimit(''); setExpires(''); setAdditionalInsured(false); setFile(null);
    if (picker.current) picker.current.value = '';
    setBusy(false);
  };
  const remove = (id: string) => updateVendor(vendor.id, { insurance: (vendor.insurance ?? []).filter(c => c.id !== id) });

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ux2-ink">Insurance · {vendor.name}</div>
        <span className="flex items-center gap-2"><Chip tone={insuranceChip(status).tone}>{insuranceChip(status).label}</Chip><Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button></span>
      </div>
      {certs.length === 0 ? <p className="m-0 text-sm text-ux2-muted">No certificate of insurance on file. Ask the vendor for one before they work on the property: it should show general liability, and workers’ compensation if they have employees.</p> : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {certs.map(c => {
            const st = certificateState(c, today);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-ux2-line px-3 py-2 text-sm text-ux2-ink">
                <span className="min-w-0"><b className="font-semibold">{coverageLabel(c.coverage)}</b>{c.limit ? ` · ${c.limit}` : ''}<span className="block text-xs text-ux2-muted">{[c.carrier, c.policyNum && `policy ${c.policyNum}`, c.additionalInsured && 'association named as additional insured'].filter(Boolean).join(' · ') || 'No carrier recorded'}</span></span>
                <span className="flex items-center gap-2">
                  <Chip tone={st === 'lapsed' ? 'red' : st === 'expiring' ? 'amber' : 'sage'}>{st === 'lapsed' ? 'Lapsed' : 'Expires'} {c.expires ? dayLabel(c.expires) : ''}</Chip>
                  {c.file && <button type="button" onClick={() => { void downloadDocumentFile(c.file!.path, c.file!.name); }} className="text-xs font-semibold text-ux2-teal hover:underline">Open</button>}
                  {isBoard && <button type="button" aria-label={`Remove ${coverageLabel(c.coverage)} certificate`} onClick={() => remove(c.id)} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {isBoard && (
        <form aria-label={`Add a certificate for ${vendor.name}`} onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-ux2-line pt-2.5">
          <Field label="Coverage" className="w-[190px]"><select value={coverage} onChange={e => setCoverage(e.target.value as VendorCertificate['coverage'])} className={INPUT}>{COVERAGES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <Field label="Insurer" className="w-[170px]"><input value={carrier} onChange={e => setCarrier(e.target.value)} className={INPUT} /></Field>
          <Field label="Policy number" className="w-[150px]"><input value={policyNum} onChange={e => setPolicyNum(e.target.value)} className={INPUT} /></Field>
          <Field label="Limit" className="w-[170px]"><input value={limit} onChange={e => setLimit(e.target.value)} placeholder="$1,000,000 per occurrence" className={INPUT} /></Field>
          <Field label="Expires" className="w-[150px]"><input type="date" value={expires} onChange={e => setExpires(e.target.value)} className={INPUT} /></Field>
          <Field label="Certificate file" className="w-[220px]"><input ref={picker} type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-xs" /></Field>
          <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={additionalInsured} onChange={e => setAdditionalInsured(e.target.checked)} />Names the association as additional insured</label>
          <Button type="submit" size="sm" disabled={!expires || busy}>{busy ? 'Saving…' : 'Add certificate'}</Button>
        </form>
      )}
      {note && <div role="status" className="text-xs text-ux2-muted">{note}</div>}
    </div>
  );
}
