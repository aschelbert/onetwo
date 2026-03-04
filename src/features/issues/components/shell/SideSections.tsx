import type { CaseTrackerCase } from '@/types/issues';

interface SideSectionsProps {
  c: CaseTrackerCase;
  onUploadDoc: () => void;
  onSendComm: () => void;
  onRecordVote: () => void;
  onFiscalLens: () => void;
  onExport: () => void;
}

/**
 * Documents, Communications, Board Vote rows + action buttons at bottom of left sidebar.
 * Each section shows icon + title + count + action button.
 * Bottom row has two equal-width buttons: Fiscal Lens and Export.
 */
export function SideSections({ c, onUploadDoc, onSendComm, onRecordVote, onFiscalLens, onExport }: SideSectionsProps) {
  const docCount = c.attachments ? c.attachments.length : 0;
  const commCount = c.comms ? c.comms.length : 0;
  const hasVote = !!c.boardVotes;

  return (
    <div className="px-4 pb-4">
      {/* Documents */}
      <div className="flex items-center justify-between py-2.5 border-b border-ink-100">
        <span className="text-[13px] text-ink-600">
          📎 Documents {docCount > 0 && <span className="text-ink-400">({docCount})</span>}
        </span>
        <button onClick={onUploadDoc} className="text-[10px] font-semibold text-accent-500 hover:text-accent-600">
          + Upload
        </button>
      </div>

      {/* Communications */}
      <div className="flex items-center justify-between py-2.5 border-b border-ink-100">
        <span className="text-[13px] text-ink-600">
          📨 Communications {commCount > 0 && <span className="text-ink-400">({commCount})</span>}
        </span>
        <button onClick={onSendComm} className="text-[10px] font-semibold text-accent-500 hover:text-accent-600">
          + Send
        </button>
      </div>

      {/* Board Vote */}
      <div className="flex items-center justify-between py-2.5 border-b border-ink-100">
        <span className="text-[13px] text-ink-600">
          🗳 Board Vote {hasVote && <span className="text-ink-400">(1)</span>}
        </span>
        <button onClick={onRecordVote} className="text-[10px] font-semibold text-accent-500 hover:text-accent-600">
          + Record
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 mt-3">
        <button
          onClick={onFiscalLens}
          className="flex-1 py-1.5 bg-ink-50 border border-ink-200 rounded-lg text-[11px] font-semibold text-ink-600 hover:bg-ink-100"
        >
          📈 Fiscal Lens
        </button>
        <button
          onClick={onExport}
          className="flex-1 py-1.5 bg-ink-50 border border-ink-200 rounded-lg text-[11px] font-semibold text-ink-600 hover:bg-ink-100"
        >
          📤 Export
        </button>
      </div>
    </div>
  );
}
