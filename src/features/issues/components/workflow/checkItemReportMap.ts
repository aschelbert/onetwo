import type { CaseStep, CaseCheckItemAttachment } from '@/types/issues';
import type { ReportType } from '@/lib/services/reports';

const SUFFIX = ' — generate or upload';

export function isGenerateOrUploadItem(label: string): boolean {
  return label.toLowerCase().endsWith(SUFFIX);
}

export function getCleanLabel(label: string): string {
  if (isGenerateOrUploadItem(label)) {
    return label.slice(0, -SUFFIX.length);
  }
  return label;
}

const LABEL_REPORT_MAP: Array<{ keywords: string[]; reportType: ReportType }> = [
  { keywords: ['current adopted budget'], reportType: 'budget_summary' },
  { keywords: ['reserve study summary', 'reserve study'], reportType: 'reserve_study_summary' },
  { keywords: ['insurance certificate', 'insurance'], reportType: 'insurance_certificate' },
];

export function getReportMapping(label: string): ReportType | null {
  const lower = label.toLowerCase();
  for (const entry of LABEL_REPORT_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.reportType;
    }
  }
  return null;
}

export interface AggregatedDoc {
  stepIdx: number;
  stepLabel: string;
  checkId: string;
  checkLabel: string;
  attachment: CaseCheckItemAttachment | undefined;
}

export function aggregateCheckAttachments(steps: CaseStep[], fromIdx: number, toIdx: number): AggregatedDoc[] {
  const docs: AggregatedDoc[] = [];
  for (let i = fromIdx; i <= toIdx && i < steps.length; i++) {
    const step = steps[i];
    if (!step.checks) continue;
    for (const ck of step.checks) {
      if (isGenerateOrUploadItem(ck.label)) {
        docs.push({
          stepIdx: i,
          stepLabel: step.s,
          checkId: ck.id,
          checkLabel: getCleanLabel(ck.label),
          attachment: ck.attachment,
        });
      }
    }
  }
  return docs;
}
