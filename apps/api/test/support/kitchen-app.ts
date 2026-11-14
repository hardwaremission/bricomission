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
import { MemoryRenderRepository } from './memory-render-repository.js';
import { IMAGE_ADAPTER } from '../../src/ai/ai.tokens.js';
import { FakeImageAdapter } from '../../src/ai/adapters/fake-image.adapter.js';
import type { FakeAdapterOptions } from '../../src/ai/adapters/fake-adapter.support.js';
import { DEFAULT_RENDER_CONTROL, RENDER_CONFIG, type RenderConfig } from '../../src/kitchen-projects/renders/render.config.js';
import { RENDER_REPOSITORY } from '../../src/kitchen-projects/renders/render.repository.js';
import { LLM_ADAPTER } from '../../src/ai/ai.tokens.js';
import { FakeLlmAdapter } from '../../src/ai/adapters/fake-llm.adapter.js';
import type { LlmAdapter } from '../../src/ai/adapters/llm-adapter.js';
import { CatalogSearchService } from '../../src/catalog/catalog-search.service.js';
import { BUDGET_CONFIG, DEFAULT_BUDGET_CONFIG, type BudgetConfig } from '../../src/kitchen-projects/budget/budget.config.js';
import { BUDGET_REPOSITORY } from '../../src/kitchen-projects/budget/budget.repository.js';
import { MemoryBudgetRepository } from './memory-budget-repository.js';
import { GPU_BROKER_OPTIONS } from '../../src/ai/ai.tokens.js';
import { DEFAULT_GPU_BROKER_OPTIONS, type GpuBrokerOptions } from '../../src/ai/jobs/gpu-broker.options.js';
import { createTestKeys, signToken, type TestKeys } from './tokens.js';

export const DRAFTS = '/kitchen-projects/drafts';
export const HOMEOWNER_SUB = 'b0e2a1c4-0000-4000-8000-000000000001';
export const OTHER_SUB = 'b0e2a1c4-0000-4000-8000-0000000000aa';

export interface KitchenAppOptions {
  /** Options of the fake image adapter (gates, delay). */
  image?: FakeAdapterOptions;
  renderConfig?: Partial<RenderConfig>;
  /** A pre-filled Render repository (recovery tests). */
  renders?: MemoryRenderRepository;
  broker?: Partial<GpuBrokerOptions>;
  /** The LLM adapter (default: the deterministic fake with its JSON mode). */
  llm?: LlmAdapter;
  llmOptions?: FakeAdapterOptions;
  budgetConfig?: Partial<BudgetConfig>;
  /** A pre-filled Budget repository (recovery tests). */
  budgets?: MemoryBudgetRepository;
  /** Chunks the Catalog search returns for every query (default: the sample catalog's worktop and cabinet lines), or an error to throw. */
  catalogHits?: CatalogHit[] | Error;
}

export type CatalogHit = { chunkId: string; documentId: string; catalogName: string; fileName: string; pageNumber: number; text: string; score: number; matchedSku: boolean };

/** Two chunks that print the sample catalog's real lines (edition 1, `BM-SYN-WTP-300` at 189.90). */
export const SAMPLE_HITS: CatalogHit[] = [
  {
    chunkId: 'c1',
    documentId: 'd1',
    catalogName: 'BricoMission Sample Kitchen Catalog',
    fileName: 'bricomission-sample-catalog.pdf',
    pageNumber: 3,
    score: 0.9,
    matchedSku: false,
    text: [
      'Worktops and splashbacks',
      'BM-SYN-WTP-300 | Oak laminate worktop 300 cm / Encimera laminada roble 300 cm | unit | 189.90 EUR',
      'BM-SYN-WTP-240 | White quartz worktop 240 cm / Encimera cuarzo blanco 240 cm | unit | 649.00 EUR',
      'BM-SYN-SPL-TIL | Ceramic metro tile 10x20 / Azulejo metro ceramico 10x20 | m2 | 24.90 EUR',
    ].join('\n'),
  },
  {
    chunkId: 'c2',
    documentId: 'd1',
    catalogName: 'BricoMission Sample Kitchen Catalog',
    fileName: 'bricomission-sample-catalog.pdf',
    pageNumber: 2,
    score: 0.8,
    matchedSku: false,
    text: [
      'Kitchen cabinets',
      'BM-SYN-CAB-040 | Base cabinet 40 cm white / Mueble bajo 40 cm blanco | unit | 96.50 EUR',
      'BM-SYN-CAB-060 | Base cabinet 60 cm white / Mueble bajo 60 cm blanco | unit | 129.00 EUR',
      'BM-SYN-WAL-060 | Wall cabinet 60 cm / Mueble alto 60 cm | unit | 88.40 EUR',
    ].join('\n'),
  },
];

/**
 * DB-free, MinIO-free, Keycloak-free, GPU-free AppModule for the kitchen project HTTP tests: in-memory
 * repository and storage, a controllable clock and a local JWKS (test/support/tokens.ts).
 */
export async function createKitchenApp(options: KitchenAppOptions = {}) {
  const repo = new MemoryKitchenDraftRepository();
  const renders = options.renders ?? new MemoryRenderRepository();
  const image = new FakeImageAdapter(options.image ?? {});
  const renderConfig: RenderConfig = { mode: 'canny', maxPerProject: 10, control: DEFAULT_RENDER_CONTROL, ...options.renderConfig };
  const budgets = options.budgets ?? new MemoryBudgetRepository();
  // Tests that inject a scripted adapter only read `calls`; the fake also has `maxActive`.
  const llm = (options.llm ?? new FakeLlmAdapter(options.llmOptions ?? {})) as FakeLlmAdapter;
  const budgetConfig: BudgetConfig = { ...DEFAULT_BUDGET_CONFIG, ...options.budgetConfig };
  const catalogHits = options.catalogHits ?? SAMPLE_HITS;
  const searchCalls = { count: 0 };
  const search = {
    search: async (params: { query: string; limit: number }) => {
      searchCalls.count++;
      if (catalogHits instanceof Error) throw catalogHits;
      return { query: params.query, results: catalogHits.slice(0, params.limit) };
    },
  };
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
    .overrideProvider(RENDER_REPOSITORY)
    .useValue(renders)
    .overrideProvider(IMAGE_ADAPTER)
    .useValue(image)
    .overrideProvider(RENDER_CONFIG)
    .useValue(renderConfig)
    .overrideProvider(BUDGET_REPOSITORY)
    .useValue(budgets)
    .overrideProvider(BUDGET_CONFIG)
    .useValue(budgetConfig)
    .overrideProvider(LLM_ADAPTER)
    .useValue(llm)
    .overrideProvider(CatalogSearchService)
    .useValue(search)
    .overrideProvider(GPU_BROKER_OPTIONS)
    .useValue({ ...DEFAULT_GPU_BROKER_OPTIONS, ...options.broker })
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

  return { app, moduleRef, repo, renders, budgets, llm, budgetConfig, searchCalls, image, renderConfig, storage, config, clock, keys, http, token, seedDraft, claim, jpeg };
}

export type KitchenApp = Awaited<ReturnType<typeof createKitchenApp>>;
