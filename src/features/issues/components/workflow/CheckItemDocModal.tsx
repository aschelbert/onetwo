import { useState } from 'react';
import type { ReportType } from '@/lib/services/reports';
import type { CaseCheckItemAttachment } from '@/types/issues';
import { generateReportSnapshot } from '@/features/archives/reports/reportGenerators';
import SalesPackageRenderer from '@/features/archives/reports/renderers/SalesPackageRenderer';
import FileUpload from '@/components/ui/FileUpload';

interface CheckItemDocModalProps {
  checkLabel: string;
  reportType: ReportType | null;
  unitNumber?: string;
  onAttach: (attachment: CaseCheckItemAttachment) => void;
  onClose: () => void;
}

export function CheckItemDocModal({ checkLabel, reportType, unitNumber, onAttach, onClose }: CheckItemDocModalProps) {
  const [tab, setTab] = useState<'generate' | 'upload'>(reportType ? 'generate' : 'upload');

  const snapshot = reportType ? generateReportSnapshot(reportType, { unitNumber }) : null;

  const handleGenerate = () => {
    if (!reportType) return;
    const today = new Date().toISOString().split('T')[0];
    onAttach({
      name: `${checkLabel}.pdf`,
      type: 'pdf',
      date: today,
      size: 'Generated',
      source: 'generated',
      reportType,
    });
  };

  const handleUpload = (file: { name: string; size: string; type: string; dataUrl?: string }) => {
    const today = new Date().toISOString().split('T')[0];
    onAttach({
      name: file.name,
      type: file.type,
      date: today,
      size: file.size,
      source: 'uploaded',
      dataUrl: file.dataUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{checkLabel}</h2>
            <p className="text-xs text-ink-500 mt-0.5">Generate from system data or upload an external file</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-ink-100 px-6">
          {reportType && (
            <button
              onClick={() => setTab('generate')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === 'generate' ? 'border-accent-600 text-accent-700' : 'border-transparent text-ink-400 hover:text-ink-600'
              }`}
            >
              Generate
            </button>
          )}
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'upload' ? 'border-accent-600 text-accent-700' : 'border-transparent text-ink-400 hover:text-ink-600'
            }`}
          >
            Upload
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === 'generate' && reportType && snapshot ? (
            <div className="space-y-4">
              <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                <p className="text-xs text-ink-500">Preview generated from current system data. Click "Attach" to add this document to the checklist item.</p>
              </div>
              <SalesPackageRenderer type={reportType} snapshot={snapshot} />
              <button
                onClick={handleGenerate}
                className="w-full py-2.5 rounded-xl bg-accent-600 text-white text-sm font-semibold hover:bg-accent-700 transition-colors shadow-sm"
              >
                Attach Generated Document
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
                <p className="text-xs text-ink-500">Upload an external document for "{checkLabel}".</p>
              </div>
              <FileUpload
                onFileSelected={handleUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                label={`Upload ${checkLabel}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
