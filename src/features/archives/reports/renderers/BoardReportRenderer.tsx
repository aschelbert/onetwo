import type { ReportType } from '@/lib/services/reports';
import { ReportViewer } from '@/features/dashboard/tabs/ReportsTab';

interface Props {
  type: ReportType;
  snapshot: Record<string, any>;
}

export default function BoardReportRenderer({ snapshot }: Props) {
  // Board reports use the existing ReportViewer which renders snapshot sections
  return <ReportViewer snapshot={snapshot} />;
}
