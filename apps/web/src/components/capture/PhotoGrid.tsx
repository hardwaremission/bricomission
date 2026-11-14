'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, ImagePlus, Loader, RefreshCw, Trash2, X } from 'lucide-react';
import type { UploadTile } from '../../lib/kitchen-draft/capture-state';
import type { KitchenPhotoView } from '../../lib/kitchen-draft/types';
import { isRetryable, PHOTO_ACCEPT, type UploadErrorCode } from '../../lib/kitchen-draft/upload';

const ERROR_KEY: Partial<Record<UploadErrorCode, 'tooLarge' | 'unsupported' | 'tooSmall'>> = {
  photo_too_large: 'tooLarge',
  photo_unsupported_type: 'unsupported',
  photo_too_small: 'tooSmall',
};

export const TILE = 'relative aspect-[4/3] w-full overflow-hidden rounded-lg';

/** Server photo: its thumbnail through the /api proxy, or the neutral placeholder if it cannot load. */
function PhotoTile({ photo, index, disabled, onRemove }: { photo: KitchenPhotoView; index: number; disabled: boolean; onRemove: () => void }) {
  const t = useTranslations('capture.photos');
  const [failed, setFailed] = useState(false);
  return (
    <li data-testid="capture-photo-tile" data-state="ready" data-photo-id={photo.id} className={`${TILE} flex justify-end bg-surface-muted p-1`}>
      {failed ? null : (
        // Plain <img>: a same-origin, cookie-authorized thumbnail (next/image would proxy it).
        <img
          src={`/api${photo.thumbUrl}`}
          alt={t('alt', { n: index + 1 })}
          onError={() => setFailed(true)}
          data-testid="capture-photo-img"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t('remove', { n: index + 1 })}
        data-testid="capture-photo-remove"
        className="relative flex size-11 items-center justify-center rounded-pill disabled:opacity-60"
      >
        <span className="flex size-8 items-center justify-center rounded-pill bg-surface text-text shadow-[0_1px_2px_#0000001F]">
          <X size={16} aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

/**
 * Local upload tile (queued, uploading, processing or error). Also used by the Moodboard for
 * reference photos (same states and copy); `testIdPrefix` names the screen in the test ids.
 */
export function UploadingTile({
  tile,
  index,
  disabled,
  onRetry,
  onRemove,
  testIdPrefix = 'capture-photo',
}: {
  tile: UploadTile;
  index: number;
  disabled: boolean;
  onRetry: () => void;
  onRemove: () => void;
  testIdPrefix?: string;
}) {
  const t = useTranslations('capture.photos');
  if (tile.status === 'error' && tile.error) {
    const key = ERROR_KEY[tile.error] ?? 'failed';
    return (
      <li
        data-testid={`${testIdPrefix}-tile`}
        data-state="error"
        data-error={tile.error}
        className={`${TILE} flex flex-col items-center justify-center gap-2 border-2 border-danger bg-surface p-2`}
      >
        <p className="flex w-full gap-1.5 text-[12px] leading-4 font-semibold text-danger">
          <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 grow">{t(`errors.${key}`)}</span>
        </p>
        <div className="flex w-full justify-center gap-1">
          {isRetryable(tile.error) ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              aria-label={t('retry')}
              data-testid={`${testIdPrefix}-retry`}
              className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-primary disabled:opacity-60"
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('remove', { n: index + 1 })}
            data-testid={`${testIdPrefix}-remove`}
            className="flex size-11 items-center justify-center rounded-pill bg-surface-muted text-text"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      </li>
    );
  }
  return (
    <li data-testid={`${testIdPrefix}-tile`} data-state={tile.status} className={`${TILE} flex flex-col items-center justify-center gap-2 bg-surface-muted px-md`}>
      {tile.status === 'uploading' ? (
        <>
          <span className="text-center text-small leading-5 font-semibold text-text">{t('uploading', { percent: tile.progress })}</span>
          <span
            role="progressbar"
            aria-label={t('uploading', { percent: tile.progress })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={tile.progress}
            className="flex h-1.5 w-full overflow-hidden rounded-pill bg-border"
          >
            <span className="h-full rounded-pill bg-primary transition-[width]" style={{ width: `${tile.progress}%` }} />
          </span>
        </>
      ) : tile.status === 'processing' ? (
        <>
          <Loader size={20} aria-hidden="true" className="animate-spin text-primary" />
          <span className="text-center text-small leading-5 font-semibold text-text">{t('processing')}</span>
        </>
      ) : (
        <span className="text-center text-small leading-5 text-text-muted">{t('queued')}</span>
      )}
    </li>
  );
}

export interface PhotoGridProps {
  photos: KitchenPhotoView[];
  uploads: UploadTile[];
  removing: string[];
  canEdit: boolean;
  limitReached: boolean;
  maxPhotos: number;
  onFiles: (files: File[]) => void;
  onRemovePhoto: (photoId: string) => void;
  onRetryUpload: (localId: string) => void;
  onRemoveUpload: (localId: string) => void;
}

/** Photo grid: 2 flexible columns, 4:3 tiles, gap 16 on both axes; the add tile comes last. */
export function PhotoGrid({ photos, uploads, removing, canEdit, limitReached, maxPhotos, onFiles, onRemovePhoto, onRetryUpload, onRemoveUpload }: PhotoGridProps) {
  const t = useTranslations('capture.photos');
  const addDisabled = !canEdit || limitReached;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-4" data-testid="capture-photo-grid">
        {photos.map((photo, index) => (
          <PhotoTile key={photo.id} photo={photo} index={index} disabled={!canEdit || removing.includes(photo.id)} onRemove={() => onRemovePhoto(photo.id)} />
        ))}
        {uploads.map((tile, index) => (
          <UploadingTile
            key={tile.localId}
            tile={tile}
            index={photos.length + index}
            disabled={!canEdit}
            onRetry={() => onRetryUpload(tile.localId)}
            onRemove={() => onRemoveUpload(tile.localId)}
          />
        ))}
        <li className="aspect-[4/3] w-full">
          <button
            type="button"
            data-testid="capture-add-photo"
            aria-disabled={addDisabled}
            onClick={() => {
              if (!addDisabled) inputRef.current?.click();
            }}
            className={`flex size-full flex-col items-center justify-center gap-2 rounded-lg border border-border ${
              addDisabled ? 'cursor-not-allowed bg-surface-muted text-text-muted' : 'bg-surface text-primary'
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
            data-testid="capture-file-input"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (files.length > 0) onFiles(files);
            }}
          />
        </li>
      </ul>
      {limitReached ? <p className="text-small leading-5 text-text-muted" data-testid="capture-limit">{t('limitReached', { max: maxPhotos })}</p> : null}
    </>
  );
}
