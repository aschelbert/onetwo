import type { CaseCheckItem } from '@/types/issues';
import type { ReportType } from '@/lib/services/reports';
import { isGenerateOrUploadItem, getCleanLabel, getReportMapping } from './checkItemReportMap';

interface StepChecklistProps {
  checks: CaseCheckItem[];
  onToggle: (checkId: string) => void;
  onGenerate?: (checkId: string, reportType: ReportType) => void;
  onUpload?: (checkId: string) => void;
}

export function StepChecklist({ checks, onToggle, onGenerate, onUpload }: StepChecklistProps) {
  return (
    <div className="space-y-1.5">
      {checks.map(ck => {
        const isDocItem = isGenerateOrUploadItem(ck.label);
        const cleanLabel = isDocItem ? getCleanLabel(ck.label) : ck.label;
        const reportType = isDocItem ? getReportMapping(ck.label) : null;

        return (
          <div key={ck.id} className="flex items-start gap-2.5 group">
            <button
              onClick={(e) => { e.preventDefault(); onToggle(ck.id); }}
              className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                ck.checked ? 'bg-sage-500 border-sage-500' : 'border-ink-300 group-hover:border-accent-400'
              }`}
            >
              {ck.checked && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <span className={`text-sm leading-tight ${ck.checked ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                {cleanLabel}
              </span>

              {/* Attachment badge or action buttons */}
              {isDocItem && (
                <div className="mt-1">
                  {ck.attachment ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                      ck.attachment.source === 'generated'
                        ? 'bg-accent-50 text-accent-700 border border-accent-200'
                        : 'bg-sage-50 text-sage-700 border border-sage-200'
                    }`}>
                      {ck.attachment.source === 'generated' ? '⚙' : '📎'} {ck.attachment.name}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {reportType && onGenerate && (
                        <button
                          onClick={(e) => { e.preventDefault(); onGenerate(ck.id, reportType); }}
                          className="text-[11px] font-medium text-accent-600 hover:text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-2 py-0.5 hover:bg-accent-100 transition-colors"
                        >
                          Generate
                        </button>
                      )}
                      {onUpload && (
                        <button
                          onClick={(e) => { e.preventDefault(); onUpload(ck.id); }}
                          className="text-[11px] font-medium text-ink-500 hover:text-ink-600 border border-dashed border-ink-300 rounded-lg px-2 py-0.5 hover:bg-ink-50 transition-colors"
                        >
                          Upload
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
