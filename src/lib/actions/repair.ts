import type { Photo } from '@/lib/services/photos';
import { permitHold, stepsFrom, usd, type ActionKind } from './types';

/** A maintenance repair: something broken or worn that is fixed, from the report to the paid bill. */
export interface RepairData {
  what: string;
  where: string;
  assetId: string;
  foundBy: string;
  /** The request or inspection it came from, in words. */
  from: string;
  photos: Photo[];
  permit: { answered: boolean; answers: string[]; number: string; finalInspectionOn: string };
  vendor: string;
  estimate: number;
  workOrderId: string;
  doneOn: string;
  photosAfter: Photo[];
  signedOffOn: string;
  signedOffBy: string;
  /** Anything left for the vendor to put right. */
  deficiencies: string;
  paidOn: string;
  /** What the repair did to the reserve component's replacement date, once answered. */
  reserveLife: string;
}

export const REPAIR: ActionKind<RepairData> = {
  kind: 'repair', runbookId: 'maintenance-repair', name: 'Maintenance repair',
  trigger: 'A request, a failed inspection point, or something found broken', blurb: 'Fix something broken or worn: who does it, whether it needs a permit, the sign-off and the bill.',
  catId: 'maintenance', role: 'Vice President', visibility: 'board',
  stepTitles: [['describe', 'Describe what is wrong'], ['permit', 'Permits and approvals'], ['assign', 'Assign it and raise the work order'], ['work', 'The work is done'], ['signoff', 'Sign off the work'], ['paid', 'Pay the bill']],
  how: {
    describe: 'Ticks itself when what is wrong and where are entered',
    permit: 'Ticks itself when the permit questions are answered',
    assign: 'Ticks itself when a vendor and an estimate are entered; raises the work order',
    work: 'Ticks itself when the completion date is entered; held until any permit is on file',
    signoff: "Ticks itself when someone signs off the work; held until any permit's final inspection",
    paid: 'Ticks itself when the work order is paid in Funds',
  },
  blank: () => ({ what: '', where: '', assetId: '', foundBy: '', from: '', photos: [], permit: { answered: false, answers: [], number: '', finalInspectionOn: '' }, vendor: '', estimate: 0, workOrderId: '', doneOn: '', photosAfter: [], signedOffOn: '', signedOffBy: '', deficiencies: '', paidOn: '', reserveLife: '' }),
  steps: (r) => {
    const d = r.data, hold = permitHold(d.permit);
    return stepsFrom(REPAIR, {
      describe: [!!d.what.trim(), [d.what.trim(), d.where.trim(), d.photos.length ? `${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')],
      permit: [d.permit.answered, !d.permit.answered ? '' : hold.needed ? `Permit needed${d.permit.number ? ` · ${d.permit.number}` : ' · not on file yet'}` : 'No permit needed'],
      assign: [!!d.vendor.trim() && !!d.workOrderId, d.vendor ? `${d.vendor} · ${usd(d.estimate)}${d.workOrderId ? ` · ${d.workOrderId}` : ''}` : ''],
      work: [!!d.doneOn, d.doneOn ? `Done ${d.doneOn}` : '', hold.start || (!d.workOrderId ? 'the work order being raised' : '')],
      signoff: [!!d.signedOffOn, d.signedOffOn ? `Signed off ${d.signedOffOn} by ${d.signedOffBy}${d.deficiencies ? ` · to fix: ${d.deficiencies}` : ''}` : '', hold.pay || (!d.doneOn ? 'the work being done' : '')],
      paid: [!!d.paidOn, d.paidOn ? `Paid ${d.paidOn}` : '', !d.signedOffOn ? 'the work being signed off' : ''],
    });
  },
};
