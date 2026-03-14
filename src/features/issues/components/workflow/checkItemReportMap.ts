import type { CaseStep, CaseCheckItemAttachment } from '@/types/issues';
import type { ReportType } from '@/lib/services/reports';

const SUFFIX = ' — generate or upload';
const LEGAL_SUFFIX = ' — from legal & bylaws';
const INSURANCE_SUFFIX = ' — from insurance';

export function isGenerateOrUploadItem(label: string): boolean {
  return label.toLowerCase().endsWith(SUFFIX);
}

export function isLegalDocItem(label: string): boolean {
  return label.toLowerCase().endsWith(LEGAL_SUFFIX);
}

export function isInsuranceDocItem(label: string): boolean {
  return label.toLowerCase().endsWith(INSURANCE_SUFFIX);
}

export function isDocumentItem(label: string): boolean {
  return isGenerateOrUploadItem(label) || isLegalDocItem(label) || isInsuranceDocItem(label);
}

export function getCleanLabel(label: string): string {
  if (isGenerateOrUploadItem(label)) {
    return label.slice(0, -SUFFIX.length);
  }
  if (isLegalDocItem(label)) {
    return label.slice(0, -LEGAL_SUFFIX.length);
  }
  if (isInsuranceDocItem(label)) {
    return label.slice(0, -INSURANCE_SUFFIX.length);
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

/**
 * Maps a checklist label to the corresponding legal document name in useBuildingStore.legalDocuments.
 */
export function getLegalDocName(label: string): string | null {
  const lower = label.toLowerCase();
  if (lower.includes('bylaws')) return 'Condominium Bylaws';
  if (lower.includes('cc&rs') || lower.includes('declaration')) return 'CC&Rs';
  if (lower.includes('rules & regulations')) return 'Rules & Regulations';
  if (lower.includes('articles of incorporation')) return 'Articles of Incorporation';
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
      if (isDocumentItem(ck.label)) {
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
