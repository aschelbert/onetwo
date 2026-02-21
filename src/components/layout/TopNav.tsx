import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials } from '@/lib/formatters';
import { ROLE_LABELS } from '@/types/auth';
import { ChevronDown, User, Home, Users, LogOut } from 'lucide-react';

export default function TopNav() {
  const { currentUser, currentRole, signOut } = useAuthStore();
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
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="4" fill="#3D3D3D" />
              <rect x="13.5" y="7" width="5" height="18" rx="1" fill="white" />
              <rect x="7" y="13.5" width="18" height="5" rx="1" fill="white" />
            </svg>
            <div>
              <h1 className="font-display text-base font-bold text-ink-900 leading-tight">
                Sunny Acres Condominium HOA
              </h1>
              <p className="text-xs text-ink-400">
                powered by <span className="font-bold">ONE two</span> HOA GovOps
              </p>
            </div>
          </div>

          {/* User area */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-ink-800">{currentUser.name}</p>
              <p className="text-xs text-ink-400">{ROLE_LABELS[currentRole]}</p>
            </div>

            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 group"
              >
                <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center text-white text-xs font-bold group-hover:bg-accent-600 transition-colors">
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
                    My Account
                  </button>
                  <button
                    onClick={() => goTo('/my-unit')}
                    className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3"
                  >
                    <Home className="w-4 h-4 text-ink-400" />
                    My Unit
                  </button>
                  {(currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER') && (
                    <button
                      onClick={() => goTo('/admin/users')}
                      className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3"
                    >
                      <Users className="w-4 h-4 text-ink-400" />
                      User Management
                    </button>
                  )}
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
