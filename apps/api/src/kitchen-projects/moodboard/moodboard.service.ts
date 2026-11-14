import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { MoodboardItemView } from '@bricomission/shared-types';
import { OBJECT_STORAGE, ObjectNotFoundError, type ObjectStorage } from '../../storage/object-storage.js';
import { GALLERY_ID_PATTERN, StyleGalleryService } from '../../style-gallery/style-gallery.service.js';
import { draftError, PHOTO_ERROR_STATUS } from '../kitchen-draft.errors.js';
import { type Clock, expiryFrom, KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, type KitchenDraftConfig } from '../kitchen-projects.config.js';
import {
  type AddMoodboardItemResult,
  KITCHEN_DRAFT_REPOSITORY,
  type KitchenDraftRecord,
  type KitchenDraftRepository,
  type NewMoodboardItem,
} from '../kitchen-drafts.repository.js';
import type { PhotoVariant } from '../kitchen-drafts.service.js';
import { PhotoRejectedError, processPhoto } from '../photo-processor.js';
import { MOODBOARD_LIMITS, moodboardItemView, moodboardKeys } from './moodboard.js';

/**
 * The Moodboard of an anonymous draft (feature moodboard-selection): add a Style Gallery image
 * (idempotent), upload an own reference photo (the Capture photo pipeline, unchanged), read an
 * upload's content and remove an item. At most 12 items, re-checked under the draft row lock.
 * Every change slides the draft expiry. Logs carry error class names only.
 */
@Injectable()
export class MoodboardService {
  private readonly logger = new Logger(MoodboardService.name);

  constructor(
    @Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(KITCHEN_DRAFT_CONFIG) private readonly config: KitchenDraftConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly gallery: StyleGalleryService,
  ) {}

  /** `created: false` when the image was already in the Moodboard (the existing item is returned). */
  async addGalleryItem(draft: KitchenDraftRecord, body: unknown): Promise<{ item: MoodboardItemView; created: boolean }> {
    const galleryImageId = (body as { galleryImageId?: unknown } | null)?.galleryImageId;
    if (typeof body !== 'object' || body === null || Array.isArray(body) || typeof galleryImageId !== 'string') {
      throw new BadRequestException();
    }
    const image = GALLERY_ID_PATTERN.test(galleryImageId) ? this.gallery.find(galleryImageId) : null;
    if (!image) throw draftError(HttpStatus.BAD_REQUEST, 'gallery_image_unknown');
    const existing = draft.moodboard.find((item) => item.galleryImageId === image.id);
    if (existing) return { item: moodboardItemView(existing, this.gallery), created: false };
    if (draft.moodboard.length >= MOODBOARD_LIMITS.maxItems) throw draftError(HttpStatus.CONFLICT, 'moodboard_limit_reached');
    const result = await this.db(() =>
      this.repo.addMoodboardItem(
        draft.id,
        {
          id: randomUUID(),
          source: 'gallery',
          galleryImageId: image.id,
          fullKey: null,
          thumbKey: null,
          width: image.width,
          height: image.height,
          byteSize: null,
        },
        MOODBOARD_LIMITS.maxItems,
        this.expiry(),
      ),
    );
    if (result === 'limit_reached') throw draftError(HttpStatus.CONFLICT, 'moodboard_limit_reached');
    return { item: moodboardItemView(result.item, this.gallery), created: result.created };
  }

  async addUpload(draft: KitchenDraftRecord, file: Buffer): Promise<MoodboardItemView> {
    // Cheap check before decoding; re-checked under the row lock on insert.
    if (draft.moodboard.length >= MOODBOARD_LIMITS.maxItems) throw draftError(HttpStatus.CONFLICT, 'moodboard_limit_reached');
    let processed;
    try {
      processed = await processPhoto(file);
    } catch (error) {
      if (error instanceof PhotoRejectedError) throw draftError(PHOTO_ERROR_STATUS[error.code], error.code);
      throw error;
    }
    const itemId = randomUUID();
    const keys = moodboardKeys(draft.id, itemId);
    const stored: string[] = [];
    try {
      await this.storage.put(keys.fullKey, processed.full, 'image/jpeg');
      stored.push(keys.fullKey);
      await this.storage.put(keys.thumbKey, processed.thumb, 'image/jpeg');
    } catch (error) {
      this.logger.warn(`Reference store failed (${error instanceof Error ? error.name : 'unknown'})`);
      if (stored.length > 0) await this.deleteObjectsQuietly(stored);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
    const item: NewMoodboardItem = {
      id: itemId,
      source: 'upload',
      galleryImageId: null,
      ...keys,
      width: processed.width,
      height: processed.height,
      byteSize: processed.full.length,
    };
    let result: AddMoodboardItemResult;
    try {
      result = await this.repo.addMoodboardItem(draft.id, item, MOODBOARD_LIMITS.maxItems, this.expiry());
    } catch (error) {
      this.logger.warn(`Reference insert failed (${error instanceof Error ? error.name : 'unknown'})`);
      await this.deleteObjectsQuietly([keys.fullKey, keys.thumbKey]);
      throw new ServiceUnavailableException();
    }
    if (result === 'limit_reached') {
      await this.deleteObjectsQuietly([keys.fullKey, keys.thumbKey]);
      throw draftError(HttpStatus.CONFLICT, 'moodboard_limit_reached');
    }
    return moodboardItemView(result.item, this.gallery);
  }

  /** Upload items only: gallery images are served by the public gallery route. */
  async content(draft: KitchenDraftRecord, itemId: string, variant: PhotoVariant): Promise<Readable> {
    const item = draft.moodboard.find((candidate) => candidate.id === itemId);
    const key = variant === 'thumb' ? item?.thumbKey : item?.fullKey;
    if (!item || item.source !== 'upload' || !key) throw new NotFoundException();
    try {
      const { body } = await this.storage.getStream(key);
      return body;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw new NotFoundException();
      this.logger.warn(`Reference read failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
  }

  async remove(draft: KitchenDraftRecord, itemId: string): Promise<void> {
    const item = draft.moodboard.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException();
    if (item.source === 'upload' && item.fullKey && item.thumbKey) {
      // Objects first (idempotent): a storage failure leaves the row, so a retry can finish.
      try {
        await this.storage.deleteMany([item.fullKey, item.thumbKey]);
      } catch (error) {
        this.logger.warn(`Reference object delete failed (${error instanceof Error ? error.name : 'unknown'})`);
        throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
      }
    }
    const deleted = await this.db(() => this.repo.deleteMoodboardItem(draft.id, itemId, this.expiry()));
    if (!deleted) throw new NotFoundException();
  }

  private expiry(): Date {
    return expiryFrom(this.clock(), this.config.ttlDays);
  }

  private async deleteObjectsQuietly(keys: string[]): Promise<void> {
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Orphan reference objects left (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Moodboard database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
