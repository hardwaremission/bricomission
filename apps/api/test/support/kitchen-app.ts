import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { KEY_RESOLVER } from '../../src/auth/token-verifier.service.js';
import { KITCHEN_CLOCK, KITCHEN_DRAFT_CONFIG, type KitchenDraftConfig } from '../../src/kitchen-projects/kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY } from '../../src/kitchen-projects/kitchen-drafts.repository.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../../src/storage/object-storage.js';
import { makeImage } from './images.js';
import { MemoryKitchenDraftRepository } from './memory-kitchen-draft-repository.js';
import { MemoryObjectStorage } from './memory-object-storage.js';
import { createTestKeys, signToken, type TestKeys } from './tokens.js';

export const DRAFTS = '/kitchen-projects/drafts';
export const HOMEOWNER_SUB = 'b0e2a1c4-0000-4000-8000-000000000001';
export const OTHER_SUB = 'b0e2a1c4-0000-4000-8000-0000000000aa';

/**
 * DB-free, MinIO-free, Keycloak-free AppModule for the login-gate-claim HTTP tests: in-memory
 * repository and storage, a controllable clock and a local JWKS (test/support/tokens.ts).
 */
export async function createKitchenApp() {
  const repo = new MemoryKitchenDraftRepository();
  const storage = new MemoryObjectStorage();
  const config: KitchenDraftConfig = { ttlDays: 7, cleanupIntervalMs: 0, maxOpen: 2000 };
  const clock = { now: new Date('2026-11-15T10:00:00.000Z') };
  const keys: TestKeys = await createTestKeys('kc-test-key');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
    .overrideProvider(KEY_RESOLVER)
    .useValue(keys.resolver)
    .overrideProvider(KITCHEN_DRAFT_REPOSITORY)
    .useValue(repo)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .overrideProvider(KITCHEN_DRAFT_CONFIG)
    .useValue(config)
    .overrideProvider(KITCHEN_CLOCK)
    .useValue(() => clock.now)
    .compile();
  const app: INestApplication = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  const jpeg = await makeImage(800, 600, 'jpeg');
  const http = () => request(app.getHttpServer());

  /** A Bearer token for `sub` with `roles` (default: a Homeowner). */
  const token = (sub = HOMEOWNER_SUB, roles = ['user']) => signToken(keys, { roles, claims: { sub } });

  /** Starts a draft; `ready` adds a photo, all three measurements and a gallery Moodboard Item. */
  async function seedDraft(parts: { photo?: boolean; measurements?: boolean; moodboard?: boolean; upload?: boolean } = { photo: true, measurements: true, moodboard: true }) {
    const res = await http().post(DRAFTS);
    expect(res.status).toBe(201);
    const draftToken: string = res.body.draftToken;
    const id: string = res.body.draft.id;
    if (parts.photo) {
      const photo = await http().post(`${DRAFTS}/current/photos`).set('X-Draft-Token', draftToken).attach('photo', jpeg, { filename: 'k.jpg', contentType: 'image/jpeg' });
      expect(photo.status).toBe(201);
    }
    if (parts.measurements) {
      const put = await http().put(`${DRAFTS}/current/measurements`).set('X-Draft-Token', draftToken).send({ lengthCm: 420, widthCm: 310, heightCm: 260 });
      expect(put.status).toBe(200);
    }
    if (parts.moodboard) {
      const pick = await http().post(`${DRAFTS}/current/moodboard/gallery-items`).set('X-Draft-Token', draftToken).send({ galleryImageId: 'modern-01' });
      expect(pick.status).toBe(201);
    }
    if (parts.upload) {
      const up = await http().post(`${DRAFTS}/current/moodboard/uploads`).set('X-Draft-Token', draftToken).attach('photo', jpeg, { filename: 'r.jpg', contentType: 'image/jpeg' });
      expect(up.status).toBe(201);
    }
    return { draftToken, id };
  }

  /** POST claim with an optional Bearer token and an optional draft token. */
  function claim(bearer: string | null, draftToken: string | null) {
    let req = http().post(`${DRAFTS}/current/claim`);
    if (bearer !== null) req = req.set('Authorization', `Bearer ${bearer}`);
    if (draftToken !== null) req = req.set('X-Draft-Token', draftToken);
    return req;
  }

  return { app, repo, storage, config, clock, keys, http, token, seedDraft, claim, jpeg };
}

export type KitchenApp = Awaited<ReturnType<typeof createKitchenApp>>;
