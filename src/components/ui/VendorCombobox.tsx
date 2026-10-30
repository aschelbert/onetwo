import { useState, useRef, useEffect, useCallback } from 'react';
import type { Vendor } from '@/store/useBuildingStore';

interface VendorComboboxProps {
  vendors: Vendor[];
  value: { vendorId: string | null; vendorName: string };
  onChange: (vendorId: string | null, vendorName: string) => void;
  onVendorCreated?: (vendor: Vendor) => void;
}

export function VendorCombobox({ vendors, value, onChange, onVendorCreated }: VendorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.vendorName);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query when external value changes
  useEffect(() => {
    setQuery(value.vendorName);
  }, [value.vendorName]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(query.toLowerCase()) ||
    v.service.toLowerCase().includes(query.toLowerCase())
  );

  const exactMatch = vendors.some(v => v.name.toLowerCase() === query.trim().toLowerCase());

  const handleSelect = useCallback((vendor: Vendor) => {
    onChange(vendor.id, vendor.name);
    setQuery(vendor.name);
    setOpen(false);
    setHighlightIdx(-1);
  }, [onChange]);

  const handleAddNew = useCallback(() => {
    const name = query.trim();
    if (!name) return;
    onChange(null, name);
    setOpen(false);
    setHighlightIdx(-1);
  }, [query, onChange]);

  const totalItems = filtered.length + (query.trim() && !exactMatch ? 1 : 0);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => (i + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => (i <= 0 ? totalItems - 1 : i - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < filtered.length) {
          handleSelect(filtered[highlightIdx]);
        } else if (highlightIdx === filtered.length && query.trim() && !exactMatch) {
          handleAddNew();
        } else if (filtered.length === 1) {
          handleSelect(filtered[0]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setHighlightIdx(-1);
        break;
    }
  }, [open, highlightIdx, filtered, totalItems, exactMatch, query, handleSelect, handleAddNew]);

  const handleClear = () => {
    onChange(null, '');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search vendors…"
          className="w-full text-xs border border-ink-200 rounded-md px-2 py-1.5 focus:border-accent-400 focus:outline-none transition-colors"
        />
        {value.vendorName && (
          <button
            onClick={handleClear}
            className="absolute right-1.5 text-ink-400 hover:text-ink-600 text-xs p-0.5"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || (query.trim() && !exactMatch)) && (
        <div className="absolute left-0 top-full mt-1 z-40 w-full bg-white border border-ink-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((v, i) => (
            <button
              key={v.id}
              onClick={() => handleSelect(v)}
              className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                i === highlightIdx ? 'bg-mist-50' : 'hover:bg-mist-50'
              }`}
            >
              <span className="font-medium text-ink-800 truncate">{v.name}</span>
              <span className="text-ink-400 shrink-0">{v.service}</span>
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              onClick={handleAddNew}
              className={`w-full text-left px-3 py-2 text-xs font-medium text-accent-600 border-t border-ink-100 transition-colors ${
                highlightIdx === filtered.length ? 'bg-mist-50' : 'hover:bg-mist-50'
              }`}
            >
              + Add "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
