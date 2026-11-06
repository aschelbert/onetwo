import FinancialPage from '@/features/financial/FinancialPage';
import { useUx2 } from '../flags';
import FundsPage from './FundsPage';

/** `/funds` and `/financial` show the redesigned Funds behind ux2.funds, the production Fiscal Lens otherwise. */
export default function FundsSwitch() {
  return useUx2('funds') ? <FundsPage /> : <FinancialPage />;
}
