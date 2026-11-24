import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { uploadPhotos } from '@/lib/services/photos';
import type { RepairData } from '@/lib/actions/repair';
import { Button, Inner, KV, Why, Field, INPUT, PhotoPicker, PhotoStrip } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM, money } from '../ActionShell';
import PermitQuestions from '../PermitQuestions';
import type { PanelProps } from '../RecordAction';
import { recordCase } from '../../recordActions';
import { useIssuesStore } from '@/store/useIssuesStore';

function Describe({ r, patch }: PanelProps<RepairData>) {
  const assets = useBuildingStore(s => s.assets);
  const me = useAuthStore(s => s.currentUser.name);
  const [what, setWhat] = useState(r.data.what);
  const [where, setWhere] = useState(r.data.where);
  const [assetId, setAssetId] = useState(r.data.assetId);
  return (
    <>
      {r.data.from && <Inner className="text-xs text-ux2-muted">From: {r.data.from}</Inner>}
      <Field label="What is wrong"><textarea aria-label="What is wrong" rows={3} value={what} onChange={e => setWhat(e.target.value)} className={AREA} /></Field>
      <div className={FORM}>
        <Field label="Where" className="min-w-[200px] flex-1"><input value={where} onChange={e => setWhere(e.target.value)} placeholder="North parapet, roof" className={INPUT} /></Field>
        <Field label="Asset" className="w-[240px]"><select value={assetId} onChange={e => setAssetId(e.target.value)} className={INPUT}><option value="">None, or not listed</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Button size="sm" disabled={!what.trim()} onClick={() => patch({ what: what.trim(), where: where.trim(), assetId, foundBy: r.data.foundBy || me })}>Save</Button>
      </div>
      <PhotoStrip photos={r.data.photos} />
      <div><PhotoPicker label="Add photos of the problem" onPick={files => { void uploadPhotos(`repairs/${r.id}`, files, me).then(up => { if (up.photos.length) patch({ photos: [...r.data.photos, ...up.photos] }); }); }} /></div>
      <Why>Tying the repair to its asset puts it in that system's history, where repeated repairs make the case for replacing it.</Why>
    </>
  );
}

function Assign({ r, patch }: PanelProps<RepairData>) {
  const vendors = useBuildingStore(s => s.vendors).filter(v => v.status === 'active');
  const accts = useFinancialStore(s => s.chartOfAccounts).filter(a => a.type === 'expense' && a.sub !== 'header');
  const [vendor, setVendor] = useState(r.data.vendor);
  const [estimate, setEstimate] = useState(r.data.estimate ? String(r.data.estimate) : '');
  const [acct, setAcct] = useState(accts.find(a => /maint|repair/i.test(a.name))?.num ?? accts[0]?.num ?? '5010');
  if (r.data.workOrderId) return <Inner><KV label="Assigned to">{r.data.vendor}</KV><KV label="Estimate">{fmt(r.data.estimate)}</KV><KV label="Work order">{r.data.workOrderId}</KV></Inner>;
  const raise = () => {
    const fin = useFinancialStore.getState();
    const linked = recordCase(useIssuesStore.getState().cases, r);
    fin.createWorkOrder({ title: r.title, vendor: vendor.trim() || 'Building staff', amount: money(estimate), acctNum: acct, caseId: linked?.id });
    const id = useFinancialStore.getState().workOrders.slice(-1)[0]?.id ?? '';
    patch({ vendor: vendor.trim() || 'Building staff', estimate: money(estimate), workOrderId: id });
  };
  return (
    <>
      <div className={FORM}>
        <Field label="Who does it" className="min-w-[200px] flex-1"><input list="repair-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor, or building staff" className={INPUT} /><datalist id="repair-vendors">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist></Field>
        <Field label="Estimate" className="w-[130px]"><input inputMode="decimal" value={estimate} onChange={e => setEstimate(e.target.value)} placeholder="$" className={INPUT} /></Field>
        <Field label="Budget line" className="w-[230px]"><select value={acct} onChange={e => setAcct(e.target.value)} className={INPUT}>{accts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></Field>
        <Button size="sm" disabled={!vendor.trim()} onClick={raise}>Assign and raise the work order</Button>
      </div>
      <Why>The work order starts as a draft in Funds › Expenses, where it is approved under the building's spending rules. Over the bylaws limit, it needs a spending decision first.</Why>
    </>
  );
}

function Work({ r, patch, step }: PanelProps<RepairData>) {
  const me = useAuthStore(s => s.currentUser.name);
  const [on, setOn] = useState(r.data.doneOn || todayIso());
  return (
    <>
      <div className={FORM}>
        <Field label="Work finished" className="w-[180px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !on} onClick={() => patch({ doneOn: on })}>Record it as done</Button>
      </div>
      <PhotoStrip photos={r.data.photosAfter} />
      <div><PhotoPicker label="Add photos of the finished work" onPick={files => { void uploadPhotos(`repairs/${r.id}`, files, me).then(up => { if (up.photos.length) patch({ photosAfter: [...r.data.photosAfter, ...up.photos] }); }); }} /></div>
      <Why>Before-and-after photos stay with the repair and with the asset's history.</Why>
    </>
  );
}

function SignOff({ r, patch, step }: PanelProps<RepairData>) {
  const me = useAuthStore(s => s.currentUser.name);
  const [notes, setNotes] = useState(r.data.deficiencies);
  if (r.data.signedOffOn) return <Inner><KV label="Signed off">{r.data.signedOffOn} by {r.data.signedOffBy}</KV>{r.data.deficiencies && <KV label="Still to put right">{r.data.deficiencies}</KV>}</Inner>;
  const sign = () => {
    const today = todayIso();
    if (r.data.workOrderId) useFinancialStore.getState().signOffWorkOrder(r.data.workOrderId, me, notes, today);
    patch({ signedOffOn: today, signedOffBy: me, deficiencies: notes.trim() });
  };
  return (
    <>
      <div className={FORM}>
        <Field label="Anything the vendor still has to put right (leave blank if none)" className="min-w-[280px] flex-1"><input value={notes} onChange={e => setNotes(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn} onClick={sign}>I checked it: sign off as {me}</Button>
      </div>
      <Why>Signing off says the work was inspected and matches what was ordered. It also signs off the work order, so the bill can be approved for payment.</Why>
    </>
  );
}

function Paid({ r, close }: PanelProps<RepairData>) {
  const navigate = useNavigate();
  const wo = useFinancialStore(s => s.workOrders.find(w => w.id === r.data.workOrderId));
  return (
    <>
      <Inner><KV label="Work order">{wo ? `${wo.id} · ${wo.vendor} · ${fmt(wo.amount)}` : '—'}</KV><KV label="Standing">{!wo ? '—' : wo.status === 'paid' ? `Paid ${wo.paidDate ?? ''}` : wo.status === 'invoiced' ? 'Invoice in, waiting to be paid' : wo.status === 'approved' ? 'Approved, waiting on the invoice' : 'Draft, waiting on approval'}</KV></Inner>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=expenses&section=bills')}>Open Funds › Bills</Button>
        {r.data.paidOn && !r.closedOn && <Button size="sm" onClick={() => close(todayIso())}>Close the repair</Button>}
        {!r.data.workOrderId && r.data.signedOffOn && !r.closedOn && <Button size="sm" onClick={() => close(todayIso())}>No bill: close the repair</Button>}
      </div>
      <Why>The invoice is entered and paid in Funds against the work order. This step ticks itself when it is paid.</Why>
    </>
  );
}

export const REPAIR_PANELS = {
  describe: Describe,
  permit: ({ r, patch }: PanelProps<RepairData>) => <PermitQuestions value={r.data.permit} onSave={permit => patch({ permit })} />,
  assign: Assign, work: Work, signoff: SignOff, paid: Paid,
};
