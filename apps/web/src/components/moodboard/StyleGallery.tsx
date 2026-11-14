'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Plus } from 'lucide-react';
import type { StyleGalleryStyleView } from '../../lib/kitchen-draft/types';

export interface GalleryTileModel {
  id: string;
  styleId: string;
  /** 1-based number within its style. */
  number: number;
  thumbUrl: string;
  selected: boolean;
  /** Not pressable (offline, or the Moodboard is full and this image is not in it). */
  disabled: boolean;
}

function GalleryTile({ tile, styleName, onToggle }: { tile: GalleryTileModel; styleName: string; onToggle: () => void }) {
  const t = useTranslations('moodboard.gallery');
  const [failed, setFailed] = useState(false);
  const name = t('alt', { style: styleName, n: tile.number });
  return (
    <li className="aspect-[4/3] w-full">
      <button
        type="button"
        aria-pressed={tile.selected}
        aria-disabled={tile.disabled}
        aria-label={name}
        data-testid="moodboard-gallery-image"
        data-gallery-id={tile.id}
        data-style-id={tile.styleId}
        onClick={() => {
          if (!tile.disabled) onToggle();
        }}
        className={`relative flex size-full flex-col justify-between overflow-hidden rounded-lg bg-surface-muted p-2 text-left ${tile.disabled ? 'cursor-not-allowed' : ''}`}
      >
        {failed ? null : (
          <img src={`/api${tile.thumbUrl}`} alt="" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
        )}
        {tile.selected ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg border-[3px] border-primary" /> : null}
        <span className="relative flex justify-end" aria-hidden="true">
          {tile.selected ? (
            <span className="flex size-7 items-center justify-center rounded-pill bg-primary text-white" data-testid="moodboard-gallery-badge" data-state="selected">
              <Check size={16} />
            </span>
          ) : (
            <span
              className={`flex size-7 items-center justify-center rounded-pill ${tile.disabled ? 'bg-surface-muted text-text-muted' : 'bg-surface text-text shadow-[0_1px_2px_#0000001F]'}`}
              data-testid="moodboard-gallery-badge"
              data-state="add"
            >
              <Plus size={16} />
            </span>
          )}
        </span>
        <span className="relative flex" aria-hidden="true">
          <span className="max-w-full truncate rounded-pill bg-surface px-2 py-0.5 text-[12px] leading-4 font-semibold text-text">{styleName}</span>
        </span>
      </button>
    </li>
  );
}

export interface StyleGalleryProps {
  styles: StyleGalleryStyleView[];
  filter: string;
  tiles: GalleryTileModel[];
  styleName: (styleId: string) => string;
  onFilter: (filter: string) => void;
  onToggle: (galleryImageId: string) => void;
}

/** Style filter chips ("All" + one per style; a radiogroup that scrolls horizontally) over one 2-column grid. */
export function StyleGallery({ styles, filter, tiles, styleName, onFilter, onToggle }: StyleGalleryProps) {
  const t = useTranslations('moodboard.gallery');
  const chips = [{ id: 'all', label: t('all') }, ...styles.map((style) => ({ id: style.id, label: styleName(style.id) }))];
  return (
    <>
      <div
        role="radiogroup"
        aria-label={t('filter')}
        data-testid="moodboard-style-filter"
        data-scroll-x
        className="-mx-md flex gap-2 overflow-x-auto px-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((chip) => {
          const checked = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-filter={chip.id}
              onClick={() => onFilter(chip.id)}
              className={`flex h-11 shrink-0 items-center rounded-pill px-md text-small leading-5 font-semibold whitespace-nowrap ${
                checked ? 'bg-primary text-white' : 'bg-surface-muted text-text'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-4" data-testid="moodboard-gallery-grid">
        {tiles.map((tile) => (
          <GalleryTile key={tile.id} tile={tile} styleName={styleName(tile.styleId)} onToggle={() => onToggle(tile.id)} />
        ))}
      </ul>
    </>
  );
}
