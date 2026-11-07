import { useState, type ReactNode } from 'react';
import { Tile, TileRow, type TileProps } from './Tile';

export interface TileSection<T extends string = string> {
  id: T;
  tile: Omit<TileProps, 'selected' | 'onClick' | 'role' | 'tabIndex'>;
  /** The detail shown directly under the tiles when this tile is selected. */
  detail: ReactNode;
}

export interface TileSwitcherProps<T extends string = string> {
  sections: TileSection<T>[];
  /** Controlled selection; omit for internal state starting at `defaultId`. */
  value?: T;
  defaultId?: T;
  onChange?: (id: T) => void;
  hint?: ReactNode;
  /** Rendered between the tile row and the selected detail (rules strip, a standing card). */
  between?: ReactNode;
}

/**
 * The tile switcher: tiles act as the table of contents and only the selected
 * tile's detail renders under them, so nothing important sits below the fold.
 * Tap a tile (or press Enter / Space) to switch.
 */
export function TileSwitcher<T extends string = string>({ sections, value, defaultId, onChange, hint, between }: TileSwitcherProps<T>) {
  const [inner, setInner] = useState<T>(defaultId ?? sections[0]?.id);
  const current = value ?? inner;
  const select = (id: T) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const active = sections.find(s => s.id === current) ?? sections[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <TileRow>
          {sections.map(s => (
            <Tile
              key={s.id}
              {...s.tile}
              selected={s.id === current}
              role="button"
              tabIndex={0}
              aria-pressed={s.id === current}
              className={['cursor-pointer', s.tile.className].filter(Boolean).join(' ')}
              onClick={() => select(s.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(s.id);
                }
              }}
            />
          ))}
        </TileRow>
        <div className="text-xs text-ux2-muted">{hint ?? 'Tap a tile to open its detail below. The others stay one tap away.'}</div>
      </div>
      {between}
      <div data-section={active?.id}>{active?.detail}</div>
    </div>
  );
}

export default TileSwitcher;
