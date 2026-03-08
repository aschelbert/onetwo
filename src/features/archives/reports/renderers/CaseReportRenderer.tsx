import type { ReportType } from '@/lib/services/reports';
import {
  ReconciliationReport,
  BudgetVarianceReport,
  CollectionsReport,
  ReserveBalancesReport,
  YearEndProjectionsReport,
} from '@/features/issues/components/workflow/ActionReportModal';

const COMPONENTS: Partial<Record<ReportType, () => React.ReactElement>> = {
  reconciliation: ReconciliationReport,
  budget_variance: BudgetVarianceReport,
  collections_delinquency: CollectionsReport,
  reserve_balances: ReserveBalancesReport,
  year_end_projections: YearEndProjectionsReport,
};

interface Props {
  type: ReportType;
  snapshot: Record<string, any>;
}

export default function CaseReportRenderer({ type }: Props) {
  // Case reports render live data from hooks (snapshot is saved for audit trail)
  const Component = COMPONENTS[type];
  if (!Component) return <p className="text-sm text-ink-400">Unknown case report type.</p>;
  return <Component />;
}
