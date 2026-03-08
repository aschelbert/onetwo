import type { ReportCategory, ReportType } from '@/lib/services/reports';

// ── Category metadata ──

export interface CategoryMeta {
  id: ReportCategory;
  label: string;
  description: string;
  color: { bg: string; text: string; border: string };
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'case_analysis', label: 'Case Analysis', description: 'Financial analysis reports from case workflows', color: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' } },
  { id: 'financial_statements', label: 'Financial Statements', description: 'Formal accounting statements and tax forms', color: { bg: 'bg-sage-50', text: 'text-sage-700', border: 'border-sage-200' } },
  { id: 'board_governance', label: 'Board & Governance', description: 'Board packets, summaries, and compliance reports', color: { bg: 'bg-accent-50', text: 'text-accent-700', border: 'border-accent-200' } },
  { id: 'sales_package', label: 'Sales Package', description: 'Resale and estoppel documents for unit transfers', color: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' } },
  { id: 'operations_risk', label: 'Operations & Risk', description: 'Insurance, vendors, violations, reserves, and elections', color: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' } },
];

export const CATEGORY_MAP: Record<ReportCategory, CategoryMeta> = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<ReportCategory, CategoryMeta>;

// ── Report type metadata ──

export interface ReportTypeMeta {
  type: ReportType;
  category: ReportCategory;
  label: string;
  description: string;
  requiresUnit?: boolean; // true for unit-specific reports (resale cert)
}

export const REPORT_TYPES: ReportTypeMeta[] = [
  // Case Analysis
  { type: 'reconciliation', category: 'case_analysis', label: 'Bank Reconciliation', description: 'Verify all bank and reserve accounts are reconciled' },
  { type: 'budget_variance', category: 'case_analysis', label: 'Budget Variance', description: 'Review each budget category for variances' },
  { type: 'collections_delinquency', category: 'case_analysis', label: 'Collections & Delinquency', description: 'Assessment collection rates and delinquency aging' },
  { type: 'reserve_balances', category: 'case_analysis', label: 'Reserve Balances', description: 'Reserve fund balances and contribution rates' },
  { type: 'year_end_projections', category: 'case_analysis', label: 'Year-End Projections', description: 'Extrapolated year-end financials from YTD actuals' },

  // Financial Statements
  { type: 'balance_sheet', category: 'financial_statements', label: 'Balance Sheet', description: 'Assets, liabilities, and fund balances' },
  { type: 'income_statement', category: 'financial_statements', label: 'Income Statement (P&L)', description: 'Revenue and expense summary for the period' },
  { type: 'budget_vs_actual', category: 'financial_statements', label: 'Budget vs Actual', description: 'Category-level budget comparison report' },
  { type: 'form_1120h', category: 'financial_statements', label: 'Form 1120-H', description: 'Federal homeowners association tax return' },
  { type: 'local_tax_forms', category: 'financial_statements', label: 'Local Tax Forms', description: 'State/jurisdiction-specific tax forms' },

  // Board & Governance
  { type: 'board_packet', category: 'board_governance', label: 'Board Packet', description: 'Comprehensive multi-section board report' },
  { type: 'monthly_summary', category: 'board_governance', label: 'Monthly Summary', description: 'High-level monthly operations summary' },
  { type: 'compliance_report', category: 'board_governance', label: 'Compliance Report', description: 'Compliance status and filing overview' },
  { type: 'financial_snapshot', category: 'board_governance', label: 'Financial Snapshot', description: 'Quick financial health overview' },

  // Sales Package
  { type: 'resale_certificate', category: 'sales_package', label: 'Resale / Estoppel Certificate', description: 'Unit-specific disclosure for resale or refinance', requiresUnit: true },
  { type: 'budget_summary', category: 'sales_package', label: 'Budget Summary', description: 'Current fiscal year budget overview for buyers' },
  { type: 'reserve_study_summary', category: 'sales_package', label: 'Reserve Study Summary', description: 'Reserve fund status and component schedule' },
  { type: 'insurance_certificate', category: 'sales_package', label: 'Insurance Certificate', description: 'Summary of active insurance coverage' },
  { type: 'association_info_sheet', category: 'sales_package', label: 'Association Information Sheet', description: 'General association info, contacts, and rules' },

  // Operations & Risk
  { type: 'insurance_summary', category: 'operations_risk', label: 'Insurance Summary', description: 'Policy portfolio, coverage gaps, renewal timeline, and premium overview' },
  { type: 'vendor_contract_review', category: 'operations_risk', label: 'Vendor & Contract Review', description: 'Active contracts, vendor ratings, open bids, and renewal schedule' },
  { type: 'violation_enforcement', category: 'operations_risk', label: 'Violation & Enforcement', description: 'Violation trends, enforcement actions, open cases, and resolution rates' },
  { type: 'reserve_study', category: 'operations_risk', label: 'Reserve Study Summary', description: 'Reserve fund adequacy, component funding status, and contribution analysis' },
  { type: 'election_results', category: 'operations_risk', label: 'Election Results', description: 'Voter participation, ballot results, proxy usage, and compliance checks' },
];

export const REPORT_TYPE_MAP: Record<ReportType, ReportTypeMeta> = Object.fromEntries(REPORT_TYPES.map(r => [r.type, r])) as Record<ReportType, ReportTypeMeta>;

export function getReportsByCategory(category: ReportCategory): ReportTypeMeta[] {
  return REPORT_TYPES.filter(r => r.category === category);
}
