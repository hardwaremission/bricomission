import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { KitchenDraftView, KitchenPhotoView, StartKitchenDraftResponse } from '@bricomission/shared-types';
import { OBJECT_STORAGE, ObjectNotFoundError, type ObjectStorage } from '../storage/object-storage.js';
import { StyleGalleryService } from '../style-gallery/style-gallery.service.js';
import { generateDraftToken, hashDraftToken } from './draft-token.js';
import { draftError, PHOTO_ERROR_STATUS } from './kitchen-draft.errors.js';
import {
  type Clock,
  expiryFrom,
  KITCHEN_CLOCK,
  KITCHEN_DRAFT_CONFIG,
  type KitchenDraftConfig,
} from './kitchen-projects.config.js';
import {
  KITCHEN_DRAFT_REPOSITORY,
  type KitchenDraftRecord,
  type KitchenDraftRepository,
  type KitchenPhotoRecord,
  type KitchenProjectRecord,
} from './kitchen-drafts.repository.js';
import { validateMeasurements } from './measurements.js';
import { type GalleryLookup, MOODBOARD_LIMITS, moodboardItemView } from './moodboard/moodboard.js';
import { PHOTO_LIMITS, PhotoRejectedError, processPhoto } from './photo-processor.js';

export type PhotoVariant = 'thumb' | 'full';

/**
 * What a photo mutation acts on: an anonymous draft (default; slides its expiry, draft content URLs)
 * or a claimed project's owner edit (simulations-ux-overhaul, Decision 14; no expiry, owner content URLs).
 */
export type EditTarget = Pick<KitchenDraftRecord, 'id' | 'photos'>;
export type EditMode = 'draft' | 'owner';

export function photosPathOf(mode: EditMode, projectId: string): string {
  return mode === 'owner' ? `/kitchen-projects/${projectId}/photos` : PHOTOS_PATH;
}

const PHOTOS_PATH = '/kitchen-projects/drafts/current/photos';

/** `photosPath` is the draft photo route by default, the owner route for claimed projects. */
export function photoView(photo: KitchenPhotoRecord, photosPath = PHOTOS_PATH): KitchenPhotoView {
  return {
    id: photo.id,
    position: photo.position,
    width: photo.width,
    height: photo.height,
    thumbUrl: `${photosPath}/${photo.id}/content?variant=thumb`,
    fullUrl: `${photosPath}/${photo.id}/content?variant=full`,
  };
}

export function draftView(draft: KitchenDraftRecord, gallery: GalleryLookup): KitchenDraftView {
  return {
    id: draft.id,
    status: 'draft',
    measurements: { ...draft.measurements },
    photos: draft.photos.map((photo) => photoView(photo)),
    moodboard: draft.moodboard.map((item) => moodboardItemView(item, gallery)),
    limits: { maxPhotos: PHOTO_LIMITS.maxPhotos, maxPhotoBytes: PHOTO_LIMITS.maxBytes, maxMoodboardItems: MOODBOARD_LIMITS.maxItems },
    expiresAt: draft.expiresAt.toISOString(),
  };
}

export function photoKeys(projectId: string, photoId: string): { fullKey: string; thumbKey: string } {
  const base = `kitchen-projects/${projectId}/photos/${photoId}`;
  return { fullKey: `${base}/full.jpg`, thumbKey: `${base}/thumb.jpg` };
}

/**
 * Anonymous kitchen drafts: creation (capacity cap), measurements, photo upload (validate,
 * normalize, store two objects, then insert the row under a lock), photo content and delete.
 * Every successful mutation moves `expiresAt` to now + DRAFT_TTL_DAYS. Database failures give
 * 503; logs carry error class names only.
 */
@Injectable()
export class KitchenDraftsService {
  private readonly logger = new Logger(KitchenDraftsService.name);

  constructor(
    @Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(KITCHEN_DRAFT_CONFIG) private readonly config: KitchenDraftConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly gallery: StyleGalleryService,
  ) {}

  view(draft: KitchenDraftRecord): KitchenDraftView {
    return draftView(draft, this.gallery);
  }

  async start(): Promise<StartKitchenDraftResponse> {
    const now = this.clock();
    const open = await this.db(() => this.repo.countOpen(now));
    if (open >= this.config.maxOpen) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'draft_capacity');
    const draftToken = generateDraftToken();
    const draft = await this.db(() => this.repo.create({ tokenHash: hashDraftToken(draftToken), expiresAt: this.expiry(now) }));
    return { draft: this.view(draft), draftToken };
  }

  async updateMeasurements(draft: KitchenDraftRecord, body: unknown): Promise<KitchenDraftView> {
    const result = validateMeasurements(body);
    if (!result.ok) throw draftError(HttpStatus.BAD_REQUEST, 'invalid_measurements', { fields: result.fields });
    const updated = await this.db(() => this.repo.updateMeasurements(draft.id, result.value, this.expiry(this.clock())));
    return this.view(updated);
  }

  /** Owner edit of a claimed project: the same validation, then the stored measurements are replaced. */
  async updateProjectMeasurements(project: { id: string }, body: unknown): Promise<KitchenProjectRecord> {
    const result = validateMeasurements(body);
    if (!result.ok) throw draftError(HttpStatus.BAD_REQUEST, 'invalid_measurements', { fields: result.fields });
    return this.db(() => this.repo.updateProjectMeasurements(project.id, result.value));
  }

  async addPhoto(draft: EditTarget, file: Buffer, mode: EditMode = 'draft'): Promise<KitchenPhotoView> {
    // Cheap check before decoding; re-checked under the row lock on insert.
    if (draft.photos.length >= PHOTO_LIMITS.maxPhotos) throw draftError(HttpStatus.CONFLICT, 'photo_limit_reached');
    let processed;
    try {
      processed = await processPhoto(file);
    } catch (error) {
      if (error instanceof PhotoRejectedError) throw draftError(PHOTO_ERROR_STATUS[error.code], error.code);
      throw error;
    }
    const photoId = randomUUID();
    const keys = photoKeys(draft.id, photoId);
    const stored: string[] = [];
    try {
      await this.storage.put(keys.fullKey, processed.full, 'image/jpeg');
      stored.push(keys.fullKey);
      await this.storage.put(keys.thumbKey, processed.thumb, 'image/jpeg');
    } catch (error) {
      this.logger.warn(`Photo store failed (${error instanceof Error ? error.name : 'unknown'})`);
      // Only what was written needs removing (nothing when storage is simply down).
      if (stored.length > 0) await this.deleteObjectsQuietly(stored);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
    let created: KitchenPhotoRecord | 'limit_reached';
    try {
      created = await this.repo.addPhoto(
        draft.id,
        { id: photoId, ...keys, width: processed.width, height: processed.height, byteSize: processed.full.length },
        PHOTO_LIMITS.maxPhotos,
        this.expiryFor(mode),
      );
    } catch (error) {
      this.logger.warn(`Photo insert failed (${error instanceof Error ? error.name : 'unknown'})`);
      await this.deleteObjectsQuietly([keys.fullKey, keys.thumbKey]);
      throw new ServiceUnavailableException();
    }
    if (created === 'limit_reached') {
      await this.deleteObjectsQuietly([keys.fullKey, keys.thumbKey]);
      throw draftError(HttpStatus.CONFLICT, 'photo_limit_reached');
    }
    return photoView(created, photosPathOf(mode, draft.id));
  }

  /** Also serves the owner content route of claimed projects (only `photos` is read). */
  async photoContent(draft: Pick<KitchenDraftRecord, 'photos'>, photoId: string, variant: PhotoVariant): Promise<Readable> {
    const photo = draft.photos.find((candidate) => candidate.id === photoId);
    if (!photo) throw new NotFoundException();
    try {
      const { body } = await this.storage.getStream(variant === 'thumb' ? photo.thumbKey : photo.fullKey);
      return body;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw new NotFoundException();
      this.logger.warn(`Photo read failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
  }

  async deletePhoto(draft: EditTarget, photoId: string, mode: EditMode = 'draft'): Promise<void> {
    const photo = draft.photos.find((candidate) => candidate.id === photoId);
    if (!photo) throw new NotFoundException();
    // Objects first (idempotent): a storage failure leaves the row, so a retry can finish.
    try {
      await this.storage.deleteMany([photo.fullKey, photo.thumbKey]);
    } catch (error) {
      this.logger.warn(`Photo object delete failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
    const deleted = await this.db(() => this.repo.deletePhoto(draft.id, photoId, this.expiryFor(mode)));
    if (!deleted) throw new NotFoundException();
  }

  private expiryFor(mode: EditMode): Date | null {
    return mode === 'owner' ? null : this.expiry(this.clock());
  }

  private expiry(now: Date): Date {
    return expiryFrom(now, this.config.ttlDays);
  }

  private async deleteObjectsQuietly(keys: string[]): Promise<void> {
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Orphan photo objects left (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Draft database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}

