import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { usePMContext } from '@/components/PMProvider';
import { getInitials } from '@/lib/formatters';
import { ChevronDown, User, HelpCircle, LogOut } from 'lucide-react';

export default function PortfolioTopNav() {
  const { currentUser, signOut } = useAuthStore();
  const { company } = usePMContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <nav className="bg-white border-b border-ink-200 sticky top-0 z-50">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/portfolio')}>
            <img src="/onetwo-logo.jpg" alt="ONE two" className="w-9 h-9 rounded object-cover" />
            <div>
              <h1 className="font-display text-base font-bold text-ink-900 leading-tight">
                {company.name}
              </h1>
              <p className="text-xs text-ink-400">
                powered by <span className="font-bold">ONE two</span> Property Portfolio
              </p>
            </div>
          </div>

          {/* User area */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-ink-800">{currentUser.name}</p>
              <p className="text-xs text-ink-400">Property Portfolio</p>
            </div>

            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 group"
              >
                <div className="w-8 h-8 rounded-full bg-navy-900 flex items-center justify-center text-white text-xs font-bold group-hover:bg-navy-700 transition-colors">
                  {getInitials(currentUser.name)}
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-ink-400 group-hover:text-ink-600 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-ink-100 py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-ink-100">
                    <p className="text-sm font-semibold text-ink-900">{currentUser.name}</p>
                    <p className="text-xs text-ink-400">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={() => goTo('/account')}
                    className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3"
                  >
                    <User className="w-4 h-4 text-ink-400" />
                    Account
                  </button>
                  <button
                    onClick={() => goTo('/support')}
                    className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3"
                  >
                    <HelpCircle className="w-4 h-4 text-ink-400" />
                    Help & Support
                  </button>
                  <div className="border-t border-ink-100 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setOpen(false);
                        signOut();
                        navigate('/login');
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                    >
                      <LogOut className="w-4 h-4 text-red-400" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
