'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, ImageUp, X } from 'lucide-react';
import type { UploadTile } from '../../lib/kitchen-draft/capture-state';
import type { MoodboardItemView } from '../../lib/kitchen-draft/types';
import { PHOTO_ACCEPT } from '../../lib/kitchen-draft/upload';
import { TILE, UploadingTile } from '../capture/PhotoGrid';

export interface MoodboardGridItem {
  item: MoodboardItemView;
  /** Image alt text and remove-button name, already localized. */
  alt: string;
  removeLabel: string;
  /** Source label: "Your photo" or the style name. */
  label: string;
}

/** One Moodboard Item: thumbnail (or the neutral placeholder), Remove top-right, source label bottom-left. */
function ItemTile({ entry, disabled, onRemove }: { entry: MoodboardGridItem; disabled: boolean; onRemove: () => void }) {
  const [failed, setFailed] = useState(false);
  const { item } = entry;
  return (
    <li
      data-testid="moodboard-item"
      data-item-id={item.id}
      data-source={item.source}
      data-gallery-id={item.galleryImageId ?? undefined}
      className={`${TILE} flex flex-col justify-between bg-surface-muted p-1`}
    >
      {failed ? null : (
        // Plain <img>: same-origin thumbnails through the /api proxy (next/image would proxy them).
        <img src={`/api${item.thumbUrl}`} alt={entry.alt} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      )}
      <div className="relative flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={entry.removeLabel}
          data-testid="moodboard-item-remove"
          className="flex size-11 items-center justify-center rounded-pill disabled:opacity-60"
        >
          <span className="flex size-8 items-center justify-center rounded-pill bg-surface text-text shadow-[0_1px_2px_#0000001F]">
            <X size={16} aria-hidden="true" />
          </span>
        </button>
      </div>
      <div className="relative flex pb-1 pl-1">
        <span className="flex max-w-full items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[12px] leading-4 font-semibold text-text">
          {item.source === 'upload' ? <ImageUp size={12} aria-hidden="true" className="shrink-0" /> : null}
          <span className="truncate">{entry.label}</span>
        </span>
      </div>
    </li>
  );
}

export interface MoodboardGridProps {
  entries: MoodboardGridItem[];
  uploads: UploadTile[];
  removing: string[];
  canEdit: boolean;
  limitReached: boolean;
  onFiles: (files: File[]) => void;
  onRemoveItem: (itemId: string) => void;
  onRetryUpload: (localId: string) => void;
  onRemoveUpload: (localId: string) => void;
}

/** "Your moodboard": 2 flexible columns, 4:3 tiles, gap 16; items by position, upload tiles, then the add tile. */
export function MoodboardGrid({ entries, uploads, removing, canEdit, limitReached, onFiles, onRemoveItem, onRetryUpload, onRemoveUpload }: MoodboardGridProps) {
  const t = useTranslations('moodboard.board');
  const addDisabled = !canEdit || limitReached;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <ul className="grid grid-cols-2 gap-4" data-testid="moodboard-grid">
      {entries.map((entry) => (
        <ItemTile key={entry.item.id} entry={entry} disabled={!canEdit || removing.includes(entry.item.id)} onRemove={() => onRemoveItem(entry.item.id)} />
      ))}
      {uploads.map((tile, index) => (
        <UploadingTile
          key={tile.localId}
          tile={tile}
          index={entries.length + index}
          disabled={!canEdit}
          onRetry={() => onRetryUpload(tile.localId)}
          onRemove={() => onRemoveUpload(tile.localId)}
          testIdPrefix="moodboard-upload"
        />
      ))}
      <li className="aspect-[4/3] w-full">
        <button
          type="button"
          data-testid="moodboard-add-reference"
          aria-disabled={addDisabled}
          onClick={() => {
            if (!addDisabled) inputRef.current?.click();
          }}
          className={`flex size-full flex-col items-center justify-center gap-2 rounded-lg ${
            addDisabled ? 'cursor-not-allowed bg-surface-muted text-text-muted' : 'border border-border bg-surface text-primary'
          }`}
        >
          <ImagePlus size={24} aria-hidden="true" />
          <span className="text-small leading-5 font-semibold">{t('add')}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={PHOTO_ACCEPT}
          disabled={addDisabled}
          data-testid="moodboard-file-input"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) onFiles(files);
          }}
        />
      </li>
    </ul>
  );
}
