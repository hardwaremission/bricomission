import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * Owner edit paths of claimed projects (simulations-ux-overhaul phase D) through the real Prisma
 * repository on a real PostgreSQL: owner mutations pass `expiresAt = null`, so a claimed row (no expiry,
 * status CHECK) must stay valid while photos, Moodboard items and Measurements change.
 * Needs a migrated database: set PRISMA_TEST_DATABASE_URL (a scratch pgvector container after
 * `prisma migrate deploy`). Skipped otherwise, so `pnpm -r test` stays database-free.
 */
const URL_ = process.env.PRISMA_TEST_DATABASE_URL?.trim();

describe.skipIf(!URL_)('PrismaKitchenDraftRepository owner edits on a real database', () => {
  it('adds, deletes and compacts photos and Moodboard items and updates Measurements of a claimed project', async () => {
    process.env.DATABASE_URL = URL_;
    const { PrismaService } = await import('../../src/prisma/prisma.service.js');
    const { PrismaKitchenDraftRepository } = await import('../../src/kitchen-projects/kitchen-drafts.repository.js');
    const prisma = new PrismaService();
    const repo = new PrismaKitchenDraftRepository(prisma);
    const now = new Date();
    try {
      const token = randomBytes(32);
      const draft = await repo.create({ tokenHash: createHash('sha256').update(token).digest(), expiresAt: new Date(now.getTime() + 86_400_000) });
      const photo = (n: number) => ({ id: randomUUID(), fullKey: `k/${draft.id}/p${n}/full.jpg`, thumbKey: `k/${draft.id}/p${n}/thumb.jpg`, width: 800, height: 600, byteSize: 1000 });
      const p0 = await repo.addPhoto(draft.id, photo(0), 8, new Date(now.getTime() + 86_400_000));
      expect(p0).not.toBe('limit_reached');
      const claim = await repo.claimByTokenHash(createHash('sha256').update(token).digest(), 'sub-db-test', now);
      expect(claim).toMatchObject({ created: true });

      // Owner mode: expiresAt null leaves the (null) expiry alone and the status CHECK holds.
      const a = await repo.addPhoto(draft.id, photo(1), 8, null);
      const b = await repo.addPhoto(draft.id, photo(2), 8, null);
      expect(a).toMatchObject({ position: 1 });
      expect(b).toMatchObject({ position: 2 });
      expect(await repo.addPhoto(draft.id, photo(3), 3, null)).toBe('limit_reached');
      const removed = await repo.deletePhoto(draft.id, (a as { id: string }).id, null);
      expect(removed).toMatchObject({ position: 1 });
      const owned = await repo.findOwned(draft.id, 'sub-db-test');
      expect(owned?.photos.map((p) => p.position)).toEqual([0, 1]);

      const gallery = await repo.addMoodboardItem(draft.id, { id: randomUUID(), source: 'gallery', galleryImageId: 'modern-01', fullKey: null, thumbKey: null, byteSize: null, width: 1216, height: 832 }, 12, null);
      expect(gallery).toMatchObject({ created: true });
      const again = await repo.addMoodboardItem(draft.id, { id: randomUUID(), source: 'gallery', galleryImageId: 'modern-01', fullKey: null, thumbKey: null, byteSize: null, width: 1216, height: 832 }, 12, null);
      expect(again).toMatchObject({ created: false });
      const itemId = (gallery as { item: { id: string } }).item.id;
      expect(await repo.deleteMoodboardItem(draft.id, itemId, null)).not.toBeNull();

      const updated = await repo.updateProjectMeasurements(draft.id, { lengthCm: 450, widthCm: 320, heightCm: 255 });
      expect(updated.measurements).toEqual({ lengthCm: 450, widthCm: 320, heightCm: 255 });
      const row = await prisma.$queryRaw<Array<{ status: string; expires_at: Date | null; owner_sub: string }>>`SELECT status::text, expires_at, owner_sub FROM kitchen_project WHERE id = ${draft.id}::uuid`;
      expect(row[0]).toMatchObject({ status: 'claimed', expires_at: null, owner_sub: 'sub-db-test' });
      await prisma.kitchenProject.delete({ where: { id: draft.id } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
