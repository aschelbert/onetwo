import { useState } from 'react';
import type { Action, PersistentAction } from '@/types/issues';
import { ActionReportModal } from './ActionReportModal';

interface StepActionListProps {
  actions: Action[];
  persistent?: PersistentAction[];
  onToggleAction: (actionId: string) => void;
  onNavigate?: (target: string) => void;
  onUpload?: () => void;
}

export function StepActionList({ actions, persistent, onToggleAction, onNavigate, onUpload }: StepActionListProps) {
  const [reportModal, setReportModal] = useState<{ reportType: string; reportDesc: string; label: string } | null>(null);

  const doneCount = actions.filter(a => a.done).length;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">
        Actions ({doneCount}/{actions.length} complete)
      </p>

      <div className="space-y-1.5">
        {actions.map(action => (
          <div key={action.id} className="flex items-start gap-3 group">
            {/* Checkbox */}
            <button
              onClick={() => onToggleAction(action.id)}
              className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                action.done ? 'bg-sage-500 border-sage-500' : 'border-ink-300 group-hover:border-accent-400'
              }`}
            >
              {action.done && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Label + Report button */}
            <div className="flex-1 min-w-0 flex items-start gap-2">
              <span className={`text-sm leading-tight flex-1 ${action.done ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                {action.label}
              </span>

              {action.type === 'report' && action.reportType && (
                <button
                  onClick={() => setReportModal({
                    reportType: action.reportType!,
                    reportDesc: action.reportDesc || '',
                    label: action.label,
                  })}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-accent-50 border border-accent-200 text-accent-700 rounded-lg text-[11px] font-medium hover:bg-accent-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Report
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Persistent utility buttons */}
      {persistent && persistent.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-ink-100">
          {persistent.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                if (p.type === 'link' && p.target && onNavigate) {
                  onNavigate(p.target);
                } else if (p.type === 'upload' && onUpload) {
                  onUpload();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-ink-200 text-ink-700 rounded-lg text-xs font-medium hover:bg-mist-50 hover:border-ink-300 transition-colors"
            >
              {p.type === 'link' ? (
                <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {reportModal && (
        <ActionReportModal
          reportType={reportModal.reportType}
          reportDesc={reportModal.reportDesc}
          label={reportModal.label}
          onClose={() => setReportModal(null)}
        />
      )}
    </div>
  );
}
