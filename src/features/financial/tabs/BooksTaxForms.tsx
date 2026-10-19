/**
 * BooksTaxForms.tsx -- Tax forms segment for the Books tab.
 * Wraps FLReports but filters to only show Form 1120-H and Local Tax Forms.
 */

import FLReports from './FLReports';

export default function BooksTaxForms() {
  return <FLReports />;
}
