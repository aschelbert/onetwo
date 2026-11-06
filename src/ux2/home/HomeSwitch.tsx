import DashboardPage from '@/features/dashboard/DashboardPage';
import { useUx2 } from '../flags';
import HomePage from './HomePage';

/** `/home` and `/dashboard` show the redesigned Home behind ux2.home, the production Dashboard otherwise. */
export default function HomeSwitch() {
  return useUx2('home') ? <HomePage /> : <DashboardPage />;
}
