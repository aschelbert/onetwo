/**
 * BooksAccounts.tsx -- Chart of Accounts segment for the Books tab.
 * Wraps FLChartOfAccounts with v2FiscalLens awareness --
 * when the flag is on, "Add Account" modals are not rendered.
 *
 * This is a thin wrapper; the full CoA logic lives in FLChartOfAccounts.
 */

import FLChartOfAccounts from './FLChartOfAccounts';

export default function BooksAccounts() {
  return <FLChartOfAccounts />;
}
