import { useState } from 'react';
import { fmt } from '@/lib/formatters';
import { parseBylawsPdf, toPartialConfig, type BylawsParseResult, type Confidence } from '@/lib/parseBylawsPdf';
import type { BylawsConfig } from '@/store/useBuildingStore';
import FileUpload from '@/components/ui/FileUpload';

interface BylawsGovernanceSectionProps {
  bylawsConfig: BylawsConfig;
  updateBylawsConfig: (config: Partial<BylawsConfig>) => void;
  isBoard: boolean;
}

const MONTH_LABELS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CADENCE_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
  '': 'Not set',
};

type UIState = 'idle' | 'parsing' | 'review';

type ConfigKey = keyof BylawsConfig;

const FIELD_DEFS: { key: ConfigKey; label: string; format: (v: any) => string }[] = [
  { key: 'boardSpendingLimit', label: 'Spending Limit', format: (v: number) => fmt(v) },
  { key: 'quorumPct', label: 'Quorum', format: (v: number) => v + '%' },
  { key: 'fiscalYearStartMonth', label: 'Fiscal Year Start', format: (v: number) => MONTH_LABELS[v] || 'Not set' },
  { key: 'annualMeetingMonth', label: 'Annual Meeting Month', format: (v: number) => MONTH_LABELS[v] || 'Not set' },
  { key: 'meetingCadence', label: 'Meeting Cadence', format: (v: string) => CADENCE_LABELS[v] || v },
  { key: 'boardNoticeHours', label: 'Board Notice', format: (v: number) => v + ' hours' },
  { key: 'assessmentCapPct', label: 'Assessment Cap', format: (v: number) => v + '%' },
  { key: 'ownerVoteThreshold', label: 'Owner Vote Threshold', format: (v: number) => v + '%' },
];

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const styles: Record<Confidence, string> = {
    high: 'bg-sage-100 text-sage-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}

export default function BylawsGovernanceSection({ bylawsConfig, updateBylawsConfig, isBoard }: BylawsGovernanceSectionProps) {
  const [uiState, setUiState] = useState<UIState>('idle');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<BylawsConfig>(bylawsConfig);
  const [parseResult, setParseResult] = useState<BylawsParseResult | null>(null);
  const [reviewForm, setReviewForm] = useState<BylawsConfig>(bylawsConfig);
  const [parseError, setParseError] = useState('');

  const handleFileSelected = async (file: { name: string; size: string; type: string; dataUrl?: string }) => {
    if (!file.dataUrl) return;
    setParseError('');
    setUiState('parsing');

    try {
      const result = await parseBylawsPdf(file.dataUrl);

      if (result.textLength < 50) {
        setParseError('This PDF appears to be scanned — text extraction requires a text-based PDF.');
        setUiState('idle');
        return;
      }

      const extracted = toPartialConfig(result);
      if (Object.keys(extracted).length === 0) {
        setParseError('No governance values were found in this PDF. You can enter values manually using the Edit button.');
        setUiState('idle');
        return;
      }

      setParseResult(result);
      setReviewForm({ ...bylawsConfig, ...extracted });
      setUiState('review');
    } catch {
      setParseError('Failed to read this PDF. Make sure it is a valid, text-based PDF file.');
      setUiState('idle');
    }
  };

  const saveReview = () => {
    updateBylawsConfig(reviewForm);
    setParseResult(null);
    setUiState('idle');
  };

  const cancelReview = () => {
    setParseResult(null);
    setUiState('idle');
  };

  const saveEdit = () => {
    updateBylawsConfig(editForm);
    setEditing(false);
  };

  const startEdit = () => {
    setEditForm(bylawsConfig);
    setEditing(true);
  };

  // ─── Parsing state ─────────────────────────────────────────
  if (uiState === 'parsing') {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-xl font-bold text-ink-900">Bylaws & Governance Facts</h3>
        <div className="flex items-center gap-3 p-6 bg-mist-50 border border-mist-200 rounded-lg">
          <div className="h-5 w-5 border-2 border-accent-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-700">Extracting values from PDF...</p>
        </div>
      </div>
    );
  }

  // ─── Review state ──────────────────────────────────────────
  if (uiState === 'review' && parseResult) {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-xl font-bold text-ink-900">Review Extracted Values</h3>
        <p className="text-xs text-ink-500">
          Extracted from {parseResult.pagesExtracted} page{parseResult.pagesExtracted !== 1 ? 's' : ''}. Review and adjust values before saving.
        </p>

        <div className="space-y-3">
          {FIELD_DEFS.map(({ key, label }) => {
            const extracted = parseResult[key as keyof BylawsParseResult] as any;
            const found = extracted && typeof extracted === 'object' && 'value' in extracted;

            return (
              <div key={key} className="bg-white border border-ink-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-ink-700">{label}</span>
                  {found ? (
                    <ConfidenceBadge confidence={extracted.confidence} />
                  ) : (
                    <span className="text-[10px] text-ink-400 italic">(not found — using current value)</span>
                  )}
                </div>

                {key === 'meetingCadence' ? (
                  <select
                    value={reviewForm.meetingCadence}
                    onChange={e => setReviewForm(f => ({ ...f, meetingCadence: e.target.value as BylawsConfig['meetingCadence'] }))}
                    className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="monthly">Monthly</option>
                    <option value="bimonthly">Bimonthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                ) : key === 'fiscalYearStartMonth' || key === 'annualMeetingMonth' ? (
                  <select
                    value={reviewForm[key]}
                    onChange={e => setReviewForm(f => ({ ...f, [key]: parseInt(e.target.value, 10) }))}
                    className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm"
                  >
                    {MONTH_LABELS.slice(1).map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={reviewForm[key] as number}
                    onChange={e => setReviewForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm"
                  />
                )}

                {found && (
                  <p className="text-[10px] text-ink-400 mt-1 italic">
                    p.{extracted.pageNumber}: "{extracted.sourceSnippet}"
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={saveReview} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save</button>
          <button onClick={cancelReview} className="px-4 py-1.5 bg-ink-100 text-ink-600 rounded-lg text-xs font-semibold hover:bg-ink-200">Cancel</button>
        </div>
      </div>
    );
  }

  // ─── Idle state ────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl font-bold text-ink-900">Bylaws & Governance Facts</h3>
          <p className="text-xs text-ink-500 mt-0.5">These values come from your bylaws and are used for meeting scheduling, spending approvals, and compliance tracking.</p>
        </div>
        {isBoard && !editing && (
          <button onClick={startEdit} className="text-xs text-accent-600 font-medium hover:text-accent-800">Edit</button>
        )}
        {editing && (
          <button onClick={() => setEditing(false)} className="text-xs text-accent-600 font-medium hover:text-accent-800">Cancel</button>
        )}
      </div>

      {isBoard && !editing && (
        <div>
          <FileUpload accept=".pdf" label="Upload bylaws PDF to extract governance values" onFileSelected={handleFileSelected} />
        </div>
      )}

      {parseError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">{parseError}</p>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink-500 block mb-1">Spending Limit ($)</label>
              <input type="number" value={editForm.boardSpendingLimit} onChange={e => setEditForm(f => ({ ...f, boardSpendingLimit: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Quorum %</label>
              <input type="number" value={editForm.quorumPct} onChange={e => setEditForm(f => ({ ...f, quorumPct: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Fiscal Year Start</label>
              <select value={editForm.fiscalYearStartMonth} onChange={e => setEditForm(f => ({ ...f, fiscalYearStartMonth: parseInt(e.target.value, 10) }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm">
                {MONTH_LABELS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Annual Meeting</label>
              <select value={editForm.annualMeetingMonth} onChange={e => setEditForm(f => ({ ...f, annualMeetingMonth: parseInt(e.target.value, 10) }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm">
                {MONTH_LABELS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Meeting Cadence</label>
              <select value={editForm.meetingCadence} onChange={e => setEditForm(f => ({ ...f, meetingCadence: e.target.value as BylawsConfig['meetingCadence'] }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm">
                <option value="">Not set</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bimonthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Board Notice (hours)</label>
              <input type="number" value={editForm.boardNoticeHours} onChange={e => setEditForm(f => ({ ...f, boardNoticeHours: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Assessment Cap %</label>
              <input type="number" value={editForm.assessmentCapPct} onChange={e => setEditForm(f => ({ ...f, assessmentCapPct: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-500 block mb-1">Owner Vote Threshold %</label>
              <input type="number" value={editForm.ownerVoteThreshold} onChange={e => setEditForm(f => ({ ...f, ownerVoteThreshold: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-ink-200 rounded text-sm" />
            </div>
          </div>
          <button onClick={saveEdit} className="px-4 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">Save Configuration</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FIELD_DEFS.map(({ key, label, format }) => (
            <div key={key} className="bg-white border border-ink-100 rounded-lg p-3">
              <p className="text-xs text-ink-500 mb-1">{label}</p>
              <p className="text-sm font-bold text-ink-900">{format(bylawsConfig[key])}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
