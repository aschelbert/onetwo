import { useState } from 'react';
import type { CaseStep } from '@/types/issues';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';

interface BidComparisonPanelProps {
  caseId: string;
  stepIdx: number;
  step: CaseStep;
  onOpenBidModal?: () => void;
}

export function BidComparisonPanel({ caseId, stepIdx, step, onOpenBidModal }: BidComparisonPanelProps) {
  const store = useIssuesStore();
  const bc = step.bidCollection;
  const [rationale, setRationale] = useState(bc?.selectionRationale || '');

  if (!bc) return null;

  const bids = bc.bids;
  const minRequired = bc.minimumBids;
  const remaining = Math.max(0, minRequired - bids.length);
  const lowestBid = bids.length > 0 ? Math.min(...bids.map(b => b.amount)) : 0;
  const selectedBid = bids.find(b => b.id === bc.selectedBidId);
  const isNotLowest = selectedBid && selectedBid.amount > lowestBid;

  const handleSelect = (bidId: string) => {
    if (rationale.trim()) {
      store.selectBid(caseId, stepIdx, bidId, rationale.trim());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Competitive Bids ({minRequired} required)</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bids.length >= minRequired ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>
          {bids.length}/{minRequired}
        </span>
      </div>

      {remaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 font-medium">
          ⚠ {remaining} more bid{remaining !== 1 ? 's' : ''} required before selection
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bids.map(bid => (
          <div
            key={bid.id}
            className={`rounded-lg border p-4 transition-all ${
              bc.selectedBidId === bid.id
                ? 'border-sage-400 bg-sage-50 ring-2 ring-sage-200'
                : 'border-ink-100 bg-white hover:border-ink-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-ink-900">{bid.vendorName}</p>
              <p className="text-sm font-bold text-ink-900">{fmt(bid.amount)}</p>
            </div>
            <div className="space-y-1 text-xs text-ink-500">
              <p><span className="font-medium text-ink-600">Scope:</span> {bid.scope}</p>
              <p><span className="font-medium text-ink-600">Timeline:</span> {bid.timeline}</p>
              <p><span className="font-medium text-ink-600">Warranty:</span> {bid.warranty}</p>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {bid.insuranceVerified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold">✓ Insured</span>}
              {bid.licenseVerified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage-100 text-sage-700 font-semibold">✓ Licensed</span>}
              {!bid.insuranceVerified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold">✗ Insurance</span>}
              {!bid.licenseVerified && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold">✗ License</span>}
            </div>
            {bid.notes && <p className="text-[11px] text-ink-400 mt-2">{bid.notes}</p>}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-ink-50">
              <span className="text-[10px] text-ink-400">{bid.submittedDate}</span>
              <div className="flex gap-2">
                {bids.length >= minRequired && bc.selectedBidId !== bid.id && (
                  <button onClick={() => handleSelect(bid.id)} className="text-[10px] font-semibold text-accent-600 hover:text-accent-800">Select</button>
                )}
                <button onClick={() => store.removeBid(caseId, stepIdx, bid.id)} className="text-[10px] font-semibold text-red-400 hover:text-red-600">Remove</button>
              </div>
            </div>
          </div>
        ))}

        {/* Add Bid Card */}
        <button
          onClick={onOpenBidModal}
          className="rounded-lg border-2 border-dashed border-ink-200 p-4 flex flex-col items-center justify-center text-ink-400 hover:border-accent-300 hover:text-accent-600 transition-all min-h-[120px]"
        >
          <span className="text-2xl mb-1">+</span>
          <span className="text-xs font-semibold">Add Bid</span>
        </button>
      </div>

      {/* Selection Rationale */}
      {bids.length >= minRequired && (
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1">Selection Rationale *</label>
          <textarea
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            placeholder="Document why this bid was selected..."
          />
        </div>
      )}

      {isNotLowest && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
          ⚠ Selected bid is not the lowest. Ensure rationale documents why.
        </div>
      )}

      {bc.completedDate && (
        <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
          <span className="text-sage-600">✓</span>
          <p className="text-sm text-sage-800 font-medium">Bid selected: {selectedBid?.vendorName} — {bc.completedDate}</p>
        </div>
      )}
    </div>
  );
}
