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

/** A claimed Kitchen Project (login-gate-claim): owned by a Keycloak `sub`, never expires. */
export interface KitchenProjectRecord {
  id: string;
  status: 'claimed';
  ownerSub: string;
  claimedAt: Date;
  measurements: KitchenMeasurements;
  /** Ordered by position. */
  photos: KitchenPhotoRecord[];
  /** Ordered by position. */
  moodboard: MoodboardItemRecord[];
}

/**
 * Result of {@link KitchenDraftRepository.claimByTokenHash}: the claimed project and whether
 * this call claimed it (`created: false` = already claimed by the same `sub`, nothing changed).
 */
export type ClaimResult = { record: KitchenProjectRecord; created: boolean } | 'not_found';

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
  /** Owner edit (simulations-ux-overhaul, Decision 14): replaces the measurements of a claimed project (no expiry to move). */
  updateProjectMeasurements(id: string, measurements: KitchenMeasurements): Promise<KitchenProjectRecord>;
  /**
   * The mutations below also serve claimed projects: `expiresAt = null` leaves the expiry alone
   * (a claimed row has none and its status CHECK forbids one), a date slides a draft's expiry.
   *
   * Appends a photo at position = current count, under a row lock on the draft that re-checks
   * the limit. Returns `limit_reached` when the draft already holds `maxPhotos` photos.
   */
  addPhoto(id: string, photo: NewKitchenPhoto, maxPhotos: number, expiresAt: Date | null): Promise<KitchenPhotoRecord | 'limit_reached'>;
  /** Deletes the photo and compacts the positions after it. Null when it is not in this draft. */
  deletePhoto(id: string, photoId: string, expiresAt: Date | null): Promise<KitchenPhotoRecord | null>;
  /**
   * Appends a Moodboard Item at position = current count, under a row lock on the draft that
   * re-checks the limit. A gallery image already in the Moodboard is returned as is
   * (`created: false`, nothing changes). Returns `limit_reached` when the draft already holds
   * `maxItems` items.
   */
  addMoodboardItem(id: string, item: NewMoodboardItem, maxItems: number, expiresAt: Date | null): Promise<AddMoodboardItemResult>;
  /** Deletes the item and compacts the positions after it. Null when it is not in this draft. */
  deleteMoodboardItem(id: string, itemId: string, expiresAt: Date | null): Promise<MoodboardItemRecord | null>;
  /** Up to `limit` drafts with `expiresAt <= now`, with their object keys (photos and Moodboard uploads). */
  findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>>;
  deleteDrafts(ids: readonly string[]): Promise<number>;
  /**
   * Claims the draft whose token hash matches for `ownerSub`, under the draft row lock: a live
   * `draft` becomes `claimed` (owner, `claimedAt = now`, no expiry; same id and content). A
   * project already claimed by the same `sub` is returned unchanged (`created: false`).
   * Unknown hash, expired draft or another owner: `not_found`.
   */
  claimByTokenHash(tokenHash: Buffer, ownerSub: string, now: Date): Promise<ClaimResult>;
  /** The claimed project `id` if `ownerSub` owns it; null otherwise (unknown, a draft, another owner). */
  findOwned(id: string, ownerSub: string): Promise<KitchenProjectRecord | null>;
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
  ownerSub: true,
  claimedAt: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  expiresAt: true,
  photos: { select: PHOTO_SELECT, orderBy: { position: 'asc' } },
  moodboardItems: { select: MOODBOARD_SELECT, orderBy: { position: 'asc' } },
} as const;

interface ProjectRow {
  id: string;
  status: 'draft' | 'claimed';
  ownerSub: string | null;
  claimedAt: Date | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  expiresAt: Date | null;
  photos: KitchenPhotoRecord[];
  moodboardItems: MoodboardItemRecord[];
}

/** Draft queries filter `status = draft`, whose CHECK guarantees an expiry. */
function toRecord(row: ProjectRow): KitchenDraftRecord {
  if (row.status !== 'draft' || row.expiresAt === null) throw new Error('KitchenProjectNotDraft');
  return {
    id: row.id,
    status: 'draft',
    measurements: { lengthCm: row.lengthCm, widthCm: row.widthCm, heightCm: row.heightCm },
    expiresAt: row.expiresAt,
    photos: row.photos,
    moodboard: row.moodboardItems,
  };
}

function toProjectRecord(row: ProjectRow): KitchenProjectRecord {
  if (row.status !== 'claimed' || row.ownerSub === null || row.claimedAt === null) throw new Error('KitchenProjectNotClaimed');
  return {
    id: row.id,
    status: 'claimed',
    ownerSub: row.ownerSub,
    claimedAt: row.claimedAt,
    measurements: { lengthCm: row.lengthCm, widthCm: row.widthCm, heightCm: row.heightCm },
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

  async updateProjectMeasurements(id: string, measurements: KitchenMeasurements): Promise<KitchenProjectRecord> {
    const row = await this.prisma.kitchenProject.update({ where: { id }, data: { ...measurements }, select: DRAFT_SELECT });
    return toProjectRecord(row);
  }

  addPhoto(id: string, photo: NewKitchenPhoto, maxPhotos: number, expiresAt: Date | null): Promise<KitchenPhotoRecord | 'limit_reached'> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent uploads to the same draft.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const count = await tx.kitchenPhoto.count({ where: { kitchenProjectId: id } });
      if (count >= maxPhotos) return 'limit_reached' as const;
      const created = await tx.kitchenPhoto.create({
        data: { ...photo, kitchenProjectId: id, position: count },
        select: PHOTO_SELECT,
      });
      if (expiresAt) await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return created;
    });
  }

  deletePhoto(id: string, photoId: string, expiresAt: Date | null): Promise<KitchenPhotoRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const photo = await tx.kitchenPhoto.findFirst({ where: { id: photoId, kitchenProjectId: id }, select: PHOTO_SELECT });
      if (!photo) return null;
      await tx.kitchenPhoto.delete({ where: { id: photoId } });
      await tx.kitchenPhoto.updateMany({
        where: { kitchenProjectId: id, position: { gt: photo.position } },
        data: { position: { decrement: 1 } },
      });
      if (expiresAt) await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return photo;
    });
  }

  addMoodboardItem(id: string, item: NewMoodboardItem, maxItems: number, expiresAt: Date | null): Promise<AddMoodboardItemResult> {
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
      if (expiresAt) await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
      return { item: created, created: true };
    });
  }

  deleteMoodboardItem(id: string, itemId: string, expiresAt: Date | null): Promise<MoodboardItemRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const item = await tx.moodboardItem.findFirst({ where: { id: itemId, kitchenProjectId: id }, select: MOODBOARD_SELECT });
      if (!item) return null;
      await tx.moodboardItem.delete({ where: { id: itemId } });
      await tx.moodboardItem.updateMany({
        where: { kitchenProjectId: id, position: { gt: item.position } },
        data: { position: { decrement: 1 } },
      });
      if (expiresAt) await tx.kitchenProject.update({ where: { id }, data: { expiresAt } });
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

  async claimByTokenHash(tokenHash: Buffer, ownerSub: string, now: Date): Promise<ClaimResult> {
    const candidate = await this.prisma.kitchenProject.findUnique({ where: { draftTokenHash: new Uint8Array(tokenHash) }, select: { id: true } });
    if (!candidate) return 'not_found';
    const { id } = candidate;
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent claims (and draft edits) of this project; the state is read again
      // after the lock, so the loser of a race sees the winner's claim.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.kitchenProject.findUnique({ where: { id }, select: DRAFT_SELECT });
      if (!row) return 'not_found' as const;
      if (row.status === 'claimed') {
        return row.ownerSub === ownerSub ? { record: toProjectRecord(row), created: false } : ('not_found' as const);
      }
      if (row.expiresAt === null || row.expiresAt <= now) return 'not_found' as const;
      const claimed = await tx.kitchenProject.update({
        where: { id },
        data: { status: 'claimed', ownerSub, claimedAt: now, expiresAt: null },
        select: DRAFT_SELECT,
      });
      return { record: toProjectRecord(claimed), created: true };
    });
  }

  async findOwned(id: string, ownerSub: string): Promise<KitchenProjectRecord | null> {
    const row = await this.prisma.kitchenProject.findFirst({ where: { id, status: 'claimed', ownerSub }, select: DRAFT_SELECT });
    return row ? toProjectRecord(row) : null;
  }
}
