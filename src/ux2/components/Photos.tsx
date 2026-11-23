import { useEffect, useRef, useState } from 'react';
import { MAX_PHOTOS, photoUrl, type Photo } from '@/lib/services/photos';
import { Button } from './Button';

/** Thumbnails of stored photos; each opens full size in a new tab. */
export function PhotoStrip({ photos, className }: { photos?: Photo[]; className?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = (photos ?? []).map(p => p.id).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all((photos ?? []).map(async p => [p.id, await photoUrl(p)] as const)).then(pairs => {
      if (live) setUrls(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => !!x[1])));
    });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!photos?.length) return null;
  return (
    <ul aria-label="Photos" className={`m-0 flex list-none flex-wrap gap-2 p-0 ${className ?? ''}`}>
      {photos.map(p => (
        <li key={p.id}>
          {urls[p.id]
            ? <a href={urls[p.id]} target="_blank" rel="noopener noreferrer" title={p.name}><img src={urls[p.id]} alt={p.name} className="h-20 w-20 rounded-[10px] border border-ux2-line object-cover" /></a>
            : <span title={p.name} className="grid h-20 w-20 place-items-center rounded-[10px] border border-ux2-line bg-ux2-surface px-1 text-center text-[10px] text-ux2-muted">{p.name}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A button that picks images from the device; the caller decides what to do with them. */
export function PhotoPicker({ label = 'Add a photo', onPick, max = MAX_PHOTOS, disabled, size = 'sm' }: { label?: string; onPick: (files: File[]) => void; max?: number; disabled?: boolean; size?: 'sm' | 'md' }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden aria-hidden="true" tabIndex={-1} onChange={e => { const files = Array.from(e.target.files ?? []).slice(0, max); e.target.value = ''; if (files.length) onPick(files); }} />
      <Button type="button" size={size} variant="ghost" disabled={disabled} onClick={() => input.current?.click()}>{label}</Button>
    </>
  );
}
