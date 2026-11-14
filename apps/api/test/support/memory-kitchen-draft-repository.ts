import type { KitchenMeasurements } from '@bricomission/shared-types';
import {
  type AddMoodboardItemResult,
  type KitchenDraftRecord,
  type KitchenDraftRepository,
  type KitchenPhotoRecord,
  type MoodboardItemRecord,
  type NewKitchenPhoto,
  type NewMoodboardItem,
  objectKeys,
} from '../../src/kitchen-projects/kitchen-drafts.repository.js';

interface Row {
  id: string;
  tokenHash: Buffer;
  measurements: KitchenMeasurements;
  expiresAt: Date;
  photos: KitchenPhotoRecord[];
  moodboard: MoodboardItemRecord[];
}

/** In-memory KitchenDraftRepository with the Prisma implementation's semantics. */
export class MemoryKitchenDraftRepository implements KitchenDraftRepository {
  readonly rows = new Map<string, Row>();
  failNext: Error | null = null;
  private seq = 0;

  async countOpen(now: Date): Promise<number> {
    this.maybeFail();
    return [...this.rows.values()].filter((row) => row.expiresAt > now).length;
  }

  async create({ tokenHash, expiresAt }: { tokenHash: Buffer; expiresAt: Date }): Promise<KitchenDraftRecord> {
    this.maybeFail();
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    const row: Row = { id, tokenHash: Buffer.from(tokenHash), measurements: { lengthCm: null, widthCm: null, heightCm: null }, expiresAt, photos: [], moodboard: [] };
    this.rows.set(id, row);
    return this.record(row);
  }

  async findActiveByTokenHash(tokenHash: Buffer, now: Date): Promise<KitchenDraftRecord | null> {
    this.maybeFail();
    const row = [...this.rows.values()].find((candidate) => candidate.tokenHash.equals(tokenHash));
    return row && row.expiresAt > now ? this.record(row) : null;
  }

  async updateMeasurements(id: string, measurements: KitchenMeasurements, expiresAt: Date): Promise<KitchenDraftRecord> {
    this.maybeFail();
    const row = this.get(id);
    row.measurements = { ...measurements };
    row.expiresAt = expiresAt;
    return this.record(row);
  }

  async addPhoto(id: string, photo: NewKitchenPhoto, maxPhotos: number, expiresAt: Date): Promise<KitchenPhotoRecord | 'limit_reached'> {
    this.maybeFail();
    const row = this.get(id);
    if (row.photos.length >= maxPhotos) return 'limit_reached';
    const created = { ...photo, position: row.photos.length };
    row.photos.push(created);
    row.expiresAt = expiresAt;
    return { ...created };
  }

  async deletePhoto(id: string, photoId: string, expiresAt: Date): Promise<KitchenPhotoRecord | null> {
    this.maybeFail();
    const row = this.get(id);
    const photo = row.photos.find((candidate) => candidate.id === photoId);
    if (!photo) return null;
    row.photos = row.photos.filter((candidate) => candidate.id !== photoId).map((candidate) => ({
      ...candidate,
      position: candidate.position > photo.position ? candidate.position - 1 : candidate.position,
    }));
    row.expiresAt = expiresAt;
    return { ...photo };
  }

  async addMoodboardItem(id: string, item: NewMoodboardItem, maxItems: number, expiresAt: Date): Promise<AddMoodboardItemResult> {
    this.maybeFail();
    const row = this.get(id);
    const existing = item.galleryImageId === null ? undefined : row.moodboard.find((candidate) => candidate.galleryImageId === item.galleryImageId);
    if (existing) return { item: { ...existing }, created: false };
    if (row.moodboard.length >= maxItems) return 'limit_reached';
    const created = { ...item, position: row.moodboard.length };
    row.moodboard.push(created);
    row.expiresAt = expiresAt;
    return { item: { ...created }, created: true };
  }

  async deleteMoodboardItem(id: string, itemId: string, expiresAt: Date): Promise<MoodboardItemRecord | null> {
    this.maybeFail();
    const row = this.get(id);
    const item = row.moodboard.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    row.moodboard = row.moodboard.filter((candidate) => candidate.id !== itemId).map((candidate) => ({
      ...candidate,
      position: candidate.position > item.position ? candidate.position - 1 : candidate.position,
    }));
    row.expiresAt = expiresAt;
    return { ...item };
  }

  async findExpired(now: Date, limit: number): Promise<Array<{ id: string; keys: string[] }>> {
    this.maybeFail();
    return [...this.rows.values()]
      .filter((row) => row.expiresAt <= now)
      .slice(0, limit)
      .map((row) => ({ id: row.id, keys: [...row.photos, ...row.moodboard].flatMap(objectKeys) }));
  }

  async deleteDrafts(ids: readonly string[]): Promise<number> {
    this.maybeFail();
    let count = 0;
    for (const id of ids) if (this.rows.delete(id)) count++;
    return count;
  }

  private get(id: string): Row {
    const row = this.rows.get(id);
    if (!row) throw new Error('RecordNotFound');
    return row;
  }

  private record(row: Row): KitchenDraftRecord {
    return {
      id: row.id,
      status: 'draft',
      measurements: { ...row.measurements },
      expiresAt: row.expiresAt,
      photos: [...row.photos].sort((a, b) => a.position - b.position).map((photo) => ({ ...photo })),
      moodboard: [...row.moodboard].sort((a, b) => a.position - b.position).map((item) => ({ ...item })),
    };
  }

  private maybeFail() {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}
