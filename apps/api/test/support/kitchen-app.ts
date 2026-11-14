import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import { MemorySimulationRepository } from './memory-simulation-repository.js';
import { MemoryReferenceTraitRepository } from './memory-reference-trait-repository.js';
import { MemoryPlatformSettingRepository } from './memory-platform-setting-repository.js';
import { REFERENCE_TRAIT_REPOSITORY } from '../../src/kitchen-projects/simulations/reference-traits.repository.js';
import { DEFAULT_SIMULATION_CONFIG, SIMULATION_CONFIG, type SimulationConfig } from '../../src/kitchen-projects/simulations/simulation.config.js';
import { SIMULATION_REPOSITORY } from '../../src/kitchen-projects/simulations/simulations.repository.js';
import { PLATFORM_SETTING_REPOSITORY } from '../../src/platform-settings/platform-settings.repository.js';
import { IMAGE_ADAPTER } from '../../src/ai/ai.tokens.js';
import { FakeImageAdapter } from '../../src/ai/adapters/fake-image.adapter.js';
import type { FakeAdapterOptions } from '../../src/ai/adapters/fake-adapter.support.js';
import { DEFAULT_RENDER_CONTROL, RENDER_CONFIG, type RenderConfig } from '../../src/kitchen-projects/renders/render.config.js';
import { RENDER_REPOSITORY } from '../../src/kitchen-projects/renders/render.repository.js';
import { LLM_ADAPTER } from '../../src/ai/ai.tokens.js';
import { FakeLlmAdapter, type FakeLlmOptions } from '../../src/ai/adapters/fake-llm.adapter.js';
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
  /** A pre-filled Simulation repository (recovery tests); build it over the same `renders` and `budgets`. */
  simulations?: MemorySimulationRepository;
  simulationConfig?: Partial<SimulationConfig>;
  /** The vision cache and the platform settings (default: empty). */
  traits?: MemoryReferenceTraitRepository;
  platformSettings?: MemoryPlatformSettingRepository;
  broker?: Partial<GpuBrokerOptions>;
  /** The LLM adapter (default: the deterministic fake with its JSON mode). */
  llm?: LlmAdapter;
  llmOptions?: FakeLlmOptions;
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
  const renderConfig: RenderConfig = { mode: 'canny', control: DEFAULT_RENDER_CONTROL, ...options.renderConfig };
  const budgets = options.budgets ?? new MemoryBudgetRepository();
  const simulations = options.simulations ?? new MemorySimulationRepository(renders, budgets);
  const traits = options.traits ?? new MemoryReferenceTraitRepository();
  const platformSettings = options.platformSettings ?? new MemoryPlatformSettingRepository();
  const simulationConfig: SimulationConfig = { ...DEFAULT_SIMULATION_CONFIG, queueRetryMs: 10, queueRetryMax: 3, ...options.simulationConfig };
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
    .overrideProvider(SIMULATION_REPOSITORY)
    .useValue(simulations)
    .overrideProvider(REFERENCE_TRAIT_REPOSITORY)
    .useValue(traits)
    .overrideProvider(PLATFORM_SETTING_REPOSITORY)
    .useValue(platformSettings)
    .overrideProvider(SIMULATION_CONFIG)
    .useValue(simulationConfig)
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

  /** A claimed, ready project of `sub` with `photos` photos (the others are portrait) and a gallery pick plus an own reference. */
  async function ownedProject(sub = HOMEOWNER_SUB, photos = 1, parts: { gallery?: boolean; upload?: boolean } = { gallery: true, upload: true }) {
    const seeded = await seedDraft({ photo: true, measurements: true, moodboard: parts.gallery ?? true, upload: parts.upload ?? false });
    for (let i = 1; i < photos; i++) {
      const portrait = await makeImage(600 + 10 * i, 900, 'jpeg');
      const res = await http().post(`${DRAFTS}/current/photos`).set('X-Draft-Token', seeded.draftToken).attach('photo', portrait, { filename: 'p.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
    }
    const claimed = await claim(await token(sub), seeded.draftToken);
    expect(claimed.status).toBe(200);
    return claimed.body.project as { id: string; photos: Array<{ id: string }> };
  }

  const bearer = async (sub = HOMEOWNER_SUB, roles = ['user']) => `Bearer ${await token(sub, roles)}`;

  /** POST a Simulation; returns the supertest response. */
  async function createSimulation(projectId: string, sub = HOMEOWNER_SUB) {
    return http().post(`/kitchen-projects/${projectId}/simulations`).set('Authorization', await bearer(sub));
  }

  /** Polls the Simulation until it is finished (fake jobs finish within milliseconds). */
  async function settleSimulation(projectId: string, simulationId: string, sub = HOMEOWNER_SUB) {
    for (let i = 0; i < 300; i++) {
      const res = await http().get(`/kitchen-projects/${projectId}/simulations/${simulationId}`).set('Authorization', await bearer(sub));
      if (res.body.stage === 'finished') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('simulation did not settle');
  }

  /** Creates a Simulation, waits for it and selects it (the precondition of a Budget). */
  async function selectedSimulation(projectId: string) {
    const created = await createSimulation(projectId);
    expect(created.status).toBe(202);
    const done = await settleSimulation(projectId, created.body.simulation.id);
    expect(done.status).toBe('succeeded');
    const put = await http().put(`/kitchen-projects/${projectId}/selected-simulation`).set('Authorization', await bearer()).send({ simulationId: done.id });
    expect(put.status).toBe(200);
    return done as { id: string };
  }

  /**
   * Seeds a finished Simulation whose Renders (`renders`, default 1; one per photo position) all succeeded,
   * straight into the memory repositories (no GPU adapters involved). Each Render's `full` image is stored
   * (the Budget's inventory job reads it).
   */
  function seedReadySimulation(projectId: string, options: { selected?: boolean; id?: string; renders?: number } = {}) {
    const id = options.id ?? randomUUID();
    const now = new Date('2026-11-15T09:00:00.000Z');
    const records = Array.from({ length: options.renders ?? 1 }, (_, position) => {
      const renderId = randomUUID();
      const base = `kitchen-projects/${projectId}/renders/${renderId}`;
      storage.objects.set(`${base}/full.jpg`, { body: Buffer.from(jpeg), contentType: 'image/jpeg' });
      return {
        id: renderId,
        kitchenProjectId: projectId,
        simulationId: id,
        photoId: null,
        photoPosition: position,
        attempts: 1,
        status: 'succeeded' as const,
        mode: 'canny' as const,
        prompt: 'p',
        seed: 1,
        width: 1216,
        height: 832,
        beforeKey: `${base}/before.jpg`,
        fullKey: `${base}/full.jpg`,
        thumbKey: `${base}/thumb.jpg`,
        errorCode: null,
        gpuJobId: null,
        inventory: null,
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        seconds: 1,
      };
    });
    return simulations.seed({ id, kitchenProjectId: projectId, selected: options.selected ?? true }, records);
  }

  return { ownedProject, seedReadySimulation, bearer, createSimulation, settleSimulation, selectedSimulation, app, moduleRef, repo, renders, simulations, traits, platformSettings, simulationConfig, budgets, llm, budgetConfig, searchCalls, image, renderConfig, storage, config, clock, keys, http, token, seedDraft, claim, jpeg };
}

export type KitchenApp = Awaited<ReturnType<typeof createKitchenApp>>;
