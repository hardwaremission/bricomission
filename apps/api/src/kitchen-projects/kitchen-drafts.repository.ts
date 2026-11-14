import { Injectable } from '@nestjs/common';
import type { KitchenMeasurements } from '@bricomission/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';

export interface KitchenPhotoRecord {
  id: string;
  position: number;
  fullKey: string;
  thumbKey: string;
  width: number;
  height: number;
  byteSize: number;
}

/** A Moodboard Item row (moodboard-selection). Gallery items have no keys; uploads have both. */
export interface MoodboardItemRecord {
  id: string;
  position: number;
  source: 'gallery' | 'upload';
  galleryImageId: string | null;
  fullKey: string | null;
  thumbKey: string | null;
  width: number;
  height: number;
  byteSize: number | null;
}

export interface KitchenDraftRecord {
  id: string;
  status: 'draft';
  measurements: KitchenMeasurements;
  expiresAt: Date;
  /** Ordered by position. */
  photos: KitchenPhotoRecord[];
  /** Ordered by position. */
  moodboard: MoodboardItemRecord[];
}

export type NewKitchenPhoto = Omit<KitchenPhotoRecord, 'position'>;
export type NewMoodboardItem = Omit<MoodboardItemRecord, 'position'>;

/** Result of {@link KitchenDraftRepository.addMoodboardItem}. */
export type AddMoodboardItemResult = { item: MoodboardItemRecord; created: boolean } | 'limit_reached';

/** Persistence of anonymous kitchen drafts. Tests use an in-memory implementation. */
export interface KitchenDraftRepository {
  countOpen(now: Date): Promise<number>;
  create(input: { tokenHash: Buffer; expiresAt: Date }): Promise<KitchenDraftRecord>;
  /** The draft whose token hash matches, if it is a `draft` with `expiresAt > now`. */
  findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<KitchenDraftRecord | null>;
  updateMeasurements(id: string, measurements: KitchenMeasurements, expiresAt: Date): Promise<KitchenDraftRecord>;
  /**
   * Appends a photo at position = current count, under a row lock on the draft that re-checks
   * the limit. Returns `limit_reached` when the draft already holds `maxPhotos` photos.
   */
  addPhoto(id: string, photo: NewKitchenPhoto, maxPhotos: number, expiresAt: Date): Promise<KitchenPhotoRecord | 'limit_reached'>;
  /** Deletes the photo and compacts the positions after it. Null when it is not in this draft. */
  deletePhoto(id: string, photoId: string, expiresAt: Date): Promise<KitchenPhotoRecord | null>;
  /**
   * Appends a Moodboard Item at position = current count, under a row lock on the draft that
   * re-checks the limit. A gallery image already in the Moodboard is returned as is
   * (`created: false`, nothing changes). Returns `limit_reached` when the draft already holds
   * `maxItems` items.
   */
  addMoodboardItem(id: string, item: NewMoodboardItem, maxItems: number, expiresAt: Date): Promise<AddMoodboardItemResult>;
  /** Deletes the item and compacts the positions after it. Null when it is not in this draft. */
  deleteMoodboardItem(id: string, itemId: string, expiresAt: Date): Promise<MoodboardItemRecord | null>;
  /** Up to `limit` drafts with `expiresAt <= now`, with their object keys (photos and Moodboard uploads). */
  findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>>;
  deleteDrafts(ids: readonly string[]): Promise<number>;
}

export const KITCHEN_DRAFT_REPOSITORY = Symbol('KITCHEN_DRAFT_REPOSITORY');

const PHOTO_SELECT = { id: true, position: true, fullKey: true, thumbKey: true, width: true, height: true, byteSize: true } as const;
const MOODBOARD_SELECT = {
  id: true,
  position: true,
  source: true,
  galleryImageId: true,
  fullKey: true,
  thumbKey: true,
  width: true,
  height: true,
  byteSize: true,
} as const;
const DRAFT_SELECT = {
  id: true,
  status: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  expiresAt: true,
  photos: { select: PHOTO_SELECT, orderBy: { position: 'asc' } },
  moodboardItems: { select: MOODBOARD_SELECT, orderBy: { position: 'asc' } },
} as const;

interface DraftRow {
  id: string;
  status: 'draft';
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  expiresAt: Date;
  photos: KitchenPhotoRecord[];
  moodboardItems: MoodboardItemRecord[];
}

function toRecord(row: DraftRow): KitchenDraftRecord {
  return {
    id: row.id,
    status: row.status,
    measurements: { lengthCm: row.lengthCm, widthCm: row.widthCm, heightCm: row.heightCm },
    expiresAt: row.expiresAt,
    photos: row.photos,
    moodboard: row.moodboardItems,
  };
}

/** The stored object keys of a photo or Moodboard upload (gallery items have none). */
export function objectKeys(item: { fullKey: string | null; thumbKey: string | null }): string[] {
  return [item.fullKey, item.thumbKey].filter((key): key is string => key !== null);
}

@Injectable()
export class PrismaKitchenDraftRepository implements KitchenDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  countOpen(now: Date): Promise<number> {
    return this.prisma.kitchenProject.count({ where: { status: 'draft', expiresAt: { gt: now } } });
  }

  async create({ tokenHash, expiresAt }: { tokenHash: Buffer; expiresAt: Date }): Promise<KitchenDraftRecord> {
    const row = await this.prisma.kitchenProject.create({
      data: { draftTokenHash: new Uint8Array(tokenHash), expiresAt },
      select: DRAFT_SELECT,
    });
    return toRecord(row);
  }

  async findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<KitchenDraftRecord | null> {
    const row = await this.prisma.kitchenProject.findFirst({
      where: { draftTokenHash: new Uint8Array(tokenHash), status: 'draft', expiresAt: { gt: now } },
      select: DRAFT_SELECT,
    });
    return row ? toRecord(row) : null;
  }

  async updateMeasurements(id: string, measurements: KitchenMeasurements, expiresAt: Date): Promise<KitchenDraftRecord> {
    const row = await this.prisma.kitchenProject.update({
      where: { id },
      data: { ...measurements, expiresAt },
      select: DRAFT_SELECT,
    });
    return toRecord(row);
  }

  addPhoto(id: string, photo: NewKitchenPhoto, maxPhotos: number, expiresAt: Date): Promise<KitchenPhotoRecord | 'limit_reached'> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent uploads to the same draft.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const count = await tx.kitchenPhoto.count({ where: { kitchenProjectId: id } });
      if (count >= maxPhotos) return 'limit_reached' as const;
      const created = await tx.kitchenPhoto.create({
        data: { ...photo, kitchenProjectId: id, position: count },
        select: PHOTO_SELECT,
      });
      await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return created;
    });
  }

  deletePhoto(id: string, photoId: string, expiresAt: Date): Promise<KitchenPhotoRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const photo = await tx.kitchenPhoto.findFirst({ where: { id: photoId, kitchenProjectId: id }, select: PHOTO_SELECT });
      if (!photo) return null;
      await tx.kitchenPhoto.delete({ where: { id: photoId } });
      await tx.kitchenPhoto.updateMany({
        where: { kitchenProjectId: id, position: { gt: photo.position } },
        data: { position: { decrement: 1 } },
      });
      await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return photo;
    });
  }

  addMoodboardItem(id: string, item: NewMoodboardItem, maxItems: number, expiresAt: Date): Promise<AddMoodboardItemResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent Moodboard changes to the same draft.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      if (item.galleryImageId !== null) {
        const existing = await tx.moodboardItem.findFirst({
          where: { kitchenProjectId: id, galleryImageId: item.galleryImageId },
          select: MOODBOARD_SELECT,
        });
        if (existing) return { item: existing, created: false };
      }
      const count = await tx.moodboardItem.count({ where: { kitchenProjectId: id } });
      if (count >= maxItems) return 'limit_reached' as const;
      const created = await tx.moodboardItem.create({
        data: { ...item, kitchenProjectId: id, position: count },
        select: MOODBOARD_SELECT,
      });
      await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return { item: created, created: true };
    });
  }

  deleteMoodboardItem(id: string, itemId: string, expiresAt: Date): Promise<MoodboardItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const item = await tx.moodboardItem.findFirst({ where: { id: itemId, kitchenProjectId: id }, select: MOODBOARD_SELECT });
      if (!item) return null;
      await tx.moodboardItem.delete({ where: { id: itemId } });
      await tx.moodboardItem.updateMany({
        where: { kitchenProjectId: id, position: { gt: item.position } },
        data: { position: { decrement: 1 } },
      });
      await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return item;
    });
  }

  async findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>> {
    const rows = await this.prisma.kitchenProject.findMany({
      where: { status: 'draft', expiresAt: { lte: now } },
      select: {
        id: true,
        photos: { select: { fullKey: true, thumbKey: true } },
        moodboardItems: { where: { source: 'upload' }, select: { fullKey: true, thumbKey: true } },
      },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, keys: [...row.photos, ...row.moodboardItems].flatMap(objectKeys) }));
  }

  async deleteDrafts(ids: readonly string[]): Promise<number> {
    const { count } = await this.prisma.kitchenProject.deleteMany({ where: { id: { in: [...ids] }, status: 'draft' } });
    return count;
  }
}
