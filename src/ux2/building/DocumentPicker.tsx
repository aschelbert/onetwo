/**
 * Which documents one file is. A single PDF often holds several (bylaws with
 * the rules and a pets policy in them); ticking each files it once under all
 * of them, so the person never uploads it twice.
 */
import { useState } from 'react';
import { cn } from '@/lib/formatters';
import { DOC_CATALOGUE, DOC_GROUP_LABEL, sameDocument, type DocGroup } from '@/features/building/documentCatalogue';

const GROUPS: DocGroup[] = ['governing', 'policies', 'insurance', 'reserve', 'reports', 'minutes'];

export function DocumentPicker({ value, onChange, suggestions = [], accent = 'navy', label = 'This file is' }: {
  value: string[];
  onChange: (names: string[]) => void;
  /** Documents its text suggests it also is, with the reason ("12 rules for residents · p.14"). */
  suggestions?: { name: string; why: string }[];
  accent?: 'navy' | 'plum';
  label?: string;
}) {
  const [other, setOther] = useState('');
  const has = (name: string) => value.some(v => sameDocument(v, name));
  const toggle = (name: string) => onChange(has(name) ? value.filter(v => !sameDocument(v, name)) : [...value, name]);
  const outside = value.filter(v => !DOC_CATALOGUE.some(e => sameDocument(e.label, v)));
  const box = accent === 'plum' ? 'accent-[#4F46A8]' : 'accent-[#1F2A44]';
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="mb-1 text-xs font-semibold text-ux2-ink">{label} <span className="font-normal text-ux2-muted">· tick every document it holds; it's filed once under each</span></legend>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Found in its text">
          <span className="text-xs text-ux2-muted">Found in its text:</span>
          {suggestions.map(s => (
            <button key={s.name} type="button" onClick={() => toggle(s.name)} className={cn('rounded-full border border-dashed px-2.5 py-1 text-[12px] font-semibold', accent === 'plum' ? 'border-ux2-plum text-ux2-plum hover:bg-ux2-plum-tint' : 'border-ux2-navy text-ux2-navy hover:bg-ux2-surface')}>
              + {s.name} <span className="font-normal opacity-80">· {s.why}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map(g => (
          <div key={g} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">{DOC_GROUP_LABEL[g]}</span>
            {DOC_CATALOGUE.filter(e => e.group === g).map(e => (
              <label key={e.key} className="flex items-center gap-2 text-[13px] text-ux2-ink">
                <input type="checkbox" className={box} checked={has(e.label)} onChange={() => toggle(e.label)} />{e.label}
              </label>
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">Something else</span>
          {outside.map(v => (
            <label key={v} className="flex items-center gap-2 text-[13px] text-ux2-ink"><input type="checkbox" className={box} checked onChange={() => toggle(v)} />{v}</label>
          ))}
          <span className="flex gap-1.5">
            <input aria-label="Another document's name" value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. Parking policy" className="h-8 min-w-0 flex-1 rounded-full border border-ux2-line-strong px-3 text-[13px]" />
            <button type="button" disabled={!other.trim()} onClick={() => { if (!has(other.trim())) onChange([...value, other.trim()]); setOther(''); }} className="h-8 rounded-full border border-ux2-line-strong px-3 text-[12px] font-semibold disabled:opacity-40">Add</button>
          </span>
        </div>
      </div>
    </fieldset>
  );
}
