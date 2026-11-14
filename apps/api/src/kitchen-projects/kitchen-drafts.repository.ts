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

export interface KitchenDraftRecord {
  id: string;
  status: 'draft';
  measurements: KitchenMeasurements;
  expiresAt: Date;
  /** Ordered by position. */
  photos: KitchenPhotoRecord[];
}

export type NewKitchenPhoto = Omit<KitchenPhotoRecord, 'position'>;

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
  /** Up to `limit` drafts with `expiresAt <= now`, with their object keys. */
  findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>>;
  deleteDrafts(ids: readonly string[]): Promise<number>;
}

export const KITCHEN_DRAFT_REPOSITORY = Symbol('KITCHEN_DRAFT_REPOSITORY');

const PHOTO_SELECT = { id: true, position: true, fullKey: true, thumbKey: true, width: true, height: true, byteSize: true } as const;
const DRAFT_SELECT = {
  id: true,
  status: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  expiresAt: true,
  photos: { select: PHOTO_SELECT, orderBy: { position: 'asc' } },
} as const;

interface DraftRow {
  id: string;
  status: 'draft';
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  expiresAt: Date;
  photos: KitchenPhotoRecord[];
}

function toRecord(row: DraftRow): KitchenDraftRecord {
  return {
    id: row.id,
    status: row.status,
    measurements: { lengthCm: row.lengthCm, widthCm: row.widthCm, heightCm: row.heightCm },
    expiresAt: row.expiresAt,
    photos: row.photos,
  };
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

  async findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>> {
    const rows = await this.prisma.kitchenProject.findMany({
      where: { status: 'draft', expiresAt: { lte: now } },
      select: { id: true, photos: { select: { fullKey: true, thumbKey: true } } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, keys: row.photos.flatMap((photo) => [photo.fullKey, photo.thumbKey]) }));
  }

  async deleteDrafts(ids: readonly string[]): Promise<number> {
    const { count } = await this.prisma.kitchenProject.deleteMany({ where: { id: { in: [...ids] }, status: 'draft' } });
    return count;
  }
}
