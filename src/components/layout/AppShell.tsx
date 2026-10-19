import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import DemoBar from './DemoBar';
import UndoToastHost from '@/components/ui/UndoToast';

export default function AppShell() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-page">
      <DemoBar />
      <TopNav />
      <main className="flex-1 p-6 pb-[76px] sm:pb-6">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <UndoToastHost />
    </div>
  );
}
