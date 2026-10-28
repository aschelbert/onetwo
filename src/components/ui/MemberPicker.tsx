import { useState, useRef, useEffect } from 'react';
import type { BuildingMember } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';

interface MemberPickerProps {
  members: BuildingMember[];
  selected: string[];
  onChange: (names: string[]) => void;
  onInvite: () => void;
  placeholder?: string;
}

export default function MemberPicker({ members, selected, onChange, onInvite, placeholder = 'Select owner(s)…' }: MemberPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Auto-focus search when opened
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const q = search.toLowerCase();
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  );

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter(n => n !== name)
        : [...selected, name],
    );
  };

  const removePill = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(n => n !== name));
  };

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        onClick={() => setOpen(!open)}
        className="w-full min-h-[38px] px-2 py-1.5 border border-ink-200 rounded-lg text-sm cursor-pointer flex flex-wrap items-center gap-1"
      >
        {selected.length === 0 && (
          <span className="text-ink-400 px-1">{placeholder}</span>
        )}
        {selected.map(name => (
          <span
            key={name}
            className="inline-flex items-center gap-1 bg-accent-100 text-accent-700 text-xs font-medium px-2 py-0.5 rounded-full"
          >
            {name}
            <button
              type="button"
              onClick={e => removePill(name, e)}
              className="text-accent-400 hover:text-accent-700 leading-none"
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white border border-ink-200 rounded-lg shadow-lg">
          {/* Search */}
          <div className="p-2 border-b border-ink-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full px-2.5 py-1.5 border border-ink-200 rounded text-sm focus:outline-none focus:border-accent-400"
            />
          </div>

          {/* Member list */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-ink-400 text-center py-3">No members found.</p>
            )}
            {filtered.map(m => {
              const checked = selected.includes(m.name);
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-mist-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.name)}
                    className="rounded"
                  />
                  <div className="h-7 w-7 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-[10px]">{initials(m.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{m.name}</p>
                    <p className="text-xs text-ink-400 truncate">{m.email}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-ink-100 text-ink-600 shrink-0">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Footer: Invite */}
          <div className="border-t border-ink-100 p-2">
            <button
              type="button"
              onClick={() => { onInvite(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50 rounded transition-colors"
            >
              + Invite new user
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
