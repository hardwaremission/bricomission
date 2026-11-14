import { describe, expect, it } from 'vitest';
import { DraftCleanupService } from '../../src/kitchen-projects/draft-cleanup.service.js';
import { hashDraftToken } from '../../src/kitchen-projects/draft-token.js';
import type { KitchenDraftConfig } from '../../src/kitchen-projects/kitchen-projects.config.js';
import { MemoryKitchenDraftRepository } from '../support/memory-kitchen-draft-repository.js';
import { MemoryObjectStorage } from '../support/memory-object-storage.js';

const config: KitchenDraftConfig = { ttlDays: 7, cleanupIntervalMs: 0, maxOpen: 2000 };
const now = new Date('2026-11-14T10:00:00.000Z');

async function seed(repo: MemoryKitchenDraftRepository, storage: MemoryObjectStorage, expiresAt: Date, photos = 1) {
  const draft = await repo.create({ tokenHash: hashDraftToken(`token-${Math.random()}`), expiresAt });
  for (let i = 0; i < photos; i++) {
    const base = `kitchen-projects/${draft.id}/photos/p${i}`;
    await storage.put(`${base}/full.jpg`, Buffer.from('f'), 'image/jpeg');
    await storage.put(`${base}/thumb.jpg`, Buffer.from('t'), 'image/jpeg');
    await repo.addPhoto(draft.id, { id: `p${i}`, fullKey: `${base}/full.jpg`, thumbKey: `${base}/thumb.jpg`, width: 1, height: 1, byteSize: 1 }, 8, expiresAt);
  }
  return draft.id;
}

describe('DraftCleanupService', () => {
  it('deletes expired drafts: objects first, then rows; keeps live drafts', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    const expired = await seed(repo, storage, new Date(now.getTime() - 1), 2);
    const exact = await seed(repo, storage, now, 1);
    const live = await seed(repo, storage, new Date(now.getTime() + 1), 1);
    const service = new DraftCleanupService(repo, storage, config, () => now);

    expect(await service.runOnce()).toBe(2);
    expect([...repo.rows.keys()]).toEqual([live]);
    expect(storage.keys().some((key) => key.includes(expired) || key.includes(exact))).toBe(false);
    expect(storage.keys().filter((key) => key.includes(live))).toHaveLength(2);
  });

  it('deletes the Moodboard upload objects of expired drafts too (gallery items have none)', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    const expired = await seed(repo, storage, new Date(now.getTime() - 1), 1);
    const base = `kitchen-projects/${expired}/moodboard/m1`;
    await storage.put(`${base}/full.jpg`, Buffer.from('f'), 'image/jpeg');
    await storage.put(`${base}/thumb.jpg`, Buffer.from('t'), 'image/jpeg');
    const past = new Date(now.getTime() - 1);
    await repo.addMoodboardItem(
      expired,
      { id: 'm1', source: 'upload', galleryImageId: null, fullKey: `${base}/full.jpg`, thumbKey: `${base}/thumb.jpg`, width: 1, height: 1, byteSize: 1 },
      12,
      past,
    );
    await repo.addMoodboardItem(
      expired,
      { id: 'm2', source: 'gallery', galleryImageId: 'modern-01', fullKey: null, thumbKey: null, width: 1, height: 1, byteSize: null },
      12,
      past,
    );
    expect((await repo.findExpired(now, 50))[0]?.keys).toHaveLength(4);
    const service = new DraftCleanupService(repo, storage, config, () => now);

    expect(await service.runOnce()).toBe(1);
    expect(repo.rows.size).toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('keeps the rows when storage is down and finishes on the next run', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    const expired = await seed(repo, storage, new Date(now.getTime() - 1000), 1);
    const service = new DraftCleanupService(repo, storage, config, () => now);

    storage.down = true;
    expect(await service.runOnce()).toBe(0);
    expect(repo.rows.has(expired)).toBe(true);

    storage.down = false;
    expect(await service.runOnce()).toBe(1);
    expect(repo.rows.has(expired)).toBe(false);
    expect(storage.keys()).toEqual([]);
  });

  it('works through batches of 50 and survives a database failure', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    for (let i = 0; i < 120; i++) await seed(repo, storage, new Date(now.getTime() - 1), 0);
    const service = new DraftCleanupService(repo, storage, config, () => now);
    expect(await service.runOnce()).toBe(120);
    expect(repo.rows.size).toBe(0);

    repo.failNext = new Error('ECONNREFUSED');
    await expect(service.runOnce()).resolves.toBe(0);
  });

  it('runs on bootstrap and shares a sweep between concurrent calls', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    await seed(repo, storage, new Date(now.getTime() - 1), 1);
    const service = new DraftCleanupService(repo, storage, { ...config, cleanupIntervalMs: 60_000 }, () => now);
    const [a, b] = [service.runOnce(), service.runOnce()];
    expect(a).toBe(b);
    expect(await a).toBe(1);
    service.onApplicationBootstrap();
    service.onApplicationShutdown();
  });

  it('never touches claimed projects (login-gate-claim): no expiry, rows and objects stay', async () => {
    const repo = new MemoryKitchenDraftRepository();
    const storage = new MemoryObjectStorage();
    const tokenHash = hashDraftToken(`token-${Math.random()}`);
    const claimedDraft = await repo.create({ tokenHash, expiresAt: new Date(now.getTime() + 1) });
    const base = `kitchen-projects/${claimedDraft.id}/photos/c0`;
    await storage.put(`${base}/full.jpg`, Buffer.from('f'), 'image/jpeg');
    await storage.put(`${base}/thumb.jpg`, Buffer.from('t'), 'image/jpeg');
    await repo.addPhoto(claimedDraft.id, { id: 'c0', fullKey: `${base}/full.jpg`, thumbKey: `${base}/thumb.jpg`, width: 1, height: 1, byteSize: 1 }, 8, new Date(now.getTime() + 1));
    expect(await repo.claimByTokenHash(tokenHash, 'owner-sub', now)).not.toBe('not_found');
    const expired = await seed(repo, storage, new Date(now.getTime() - 1), 1);
    const later = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);
    const service = new DraftCleanupService(repo, storage, config, () => later);

    expect(await service.runOnce()).toBe(1);
    expect(repo.rows.has(expired)).toBe(false);
    expect(repo.rows.get(claimedDraft.id)).toMatchObject({ status: 'claimed', expiresAt: null });
    expect(storage.keys().filter((key) => key.includes(claimedDraft.id))).toHaveLength(2);
    expect(await repo.countOpen(now)).toBe(0);
  });
});
