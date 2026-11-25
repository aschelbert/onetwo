import { useEffect, useState } from 'react';
import type { PolicyDetails } from '@/types/financial';
import { Button, Field, INPUT } from '../../components';
import { readPolicyFile } from './readFile';

/**
 * The details of a unit owner's policy: read from the file when one is given,
 * then confirmed or corrected by a person. Used by the owner when uploading
 * and by the board when correcting.
 */
export default function OwnerPolicyForm({ file, initial, by, today, saveLabel, onSave, onCancel }: { file?: File; initial?: PolicyDetails | null; by: string; today: string; saveLabel: string; onSave: (d: PolicyDetails) => void | Promise<void>; onCancel: () => void }) {
  const [carrier, setCarrier] = useState(initial?.carrier ?? '');
  const [policyNum, setPolicyNum] = useState(initial?.policyNum ?? '');
  const [expires, setExpires] = useState(initial?.expires ?? '');
  const [note, setNote] = useState(file ? `Reading ${file.name}…` : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file) return;
    let live = true;
    void readPolicyFile(file).then(({ read, note }) => {
      if (!live) return;
      if (read.carrier) setCarrier(read.carrier);
      if (read.policyNum) setPolicyNum(read.policyNum);
      if (read.expires) setExpires(read.expires);
      setNote(note);
    });
    return () => { live = false; };
  }, [file]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSave({ carrier: carrier.trim(), policyNum: policyNum.trim(), expires, confirmedBy: by, confirmedOn: today });
    setBusy(false);
  };
  return (
    <form aria-label="Policy details" onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      {note && <div className="w-full text-xs text-ux2-muted" role="status">{note}</div>}
      <Field label="Insurance company" className="min-w-[200px] flex-1"><input value={carrier} onChange={e => setCarrier(e.target.value)} className={INPUT} /></Field>
      <Field label="Policy number" className="w-[190px]"><input value={policyNum} onChange={e => setPolicyNum(e.target.value)} className={INPUT} /></Field>
      <Field label="Expires" className="w-[170px]"><input type="date" value={expires} onChange={e => setExpires(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy || !expires}>{busy ? 'Saving…' : saveLabel}</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
