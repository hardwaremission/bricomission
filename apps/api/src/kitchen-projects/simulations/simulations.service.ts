import { randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import type {
  CreateSimulationResponse,
  SelectSimulationResponse,
  SimulationListResponse,
  SimulationStatus,
  SimulationView,
} from '@bricomission/shared-types';
import { GpuQueueFullError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { DIAGNOSTICS, type Diagnostics } from '../../diagnostics/diagnostics.types.js';
import * as narrate from '../../diagnostics/narrate/simulation.js';
import { NULL_DIAGNOSTICS } from '../../diagnostics/null-diagnostics.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { StyleGalleryService } from '../../style-gallery/style-gallery.service.js';
import { draftError } from '../kitchen-draft.errors.js';
import type { KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { isReadyForGeneration } from '../readiness.js';
import { RENDER_CONFIG, type RenderConfig } from '../renders/render.config.js';
import { cropBefore, renderBucket } from '../renders/render-geometry.js';
import { buildRenderPrompt } from '../renders/render-prompt.js';
import { RendersService, renderKeys } from '../renders/renders.service.js';
import { type NewRender, RENDER_REPOSITORY, type RenderRepository } from '../renders/render.repository.js';
import { calculateWeights, referencesFromMoodboard, renderSeed, weightPercents } from './calculated-style.js';
import { SimulationRunner } from './simulation-runner.js';
import { SIMULATION_CONFIG, type SimulationConfig } from './simulation.config.js';
import { SIMULATION_REPOSITORY, type SimulationAggregate, type SimulationRepository } from './simulations.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Derived status of a Simulation: `active` until finished, then by the outcome of its Renders. */
export function simulationStatus(simulation: Pick<SimulationAggregate, 'stage' | 'renders'>): SimulationStatus {
  if (simulation.stage !== 'finished') return 'active';
  const succeeded = simulation.renders.filter((render) => render.status === 'succeeded').length;
  if (succeeded === simulation.renders.length) return 'succeeded';
  return succeeded === 0 ? 'failed' : 'partial';
}

/**
 * Simulations of claimed Kitchen Projects (feature simulations-ux-overhaul, Decisions 1, 7-9).
 * POST runs outside the GPU slot: readiness, the active check, the style (blend mode from the
 * platform setting, seeded weights), the "before" crops, then one insert of the Simulation and its
 * queued Renders under the project row lock; the {@link SimulationRunner} queues the GPU jobs.
 * Logs carry error class names only: never a prompt, seed, description, job id or backend body.
 */
@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(
    @Inject(SIMULATION_REPOSITORY) private readonly repo: SimulationRepository,
    @Inject(RENDER_REPOSITORY) private readonly renderRepo: RenderRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(RENDER_CONFIG) private readonly renderConfig: RenderConfig,
    @Inject(SIMULATION_CONFIG) private readonly config: SimulationConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly runner: SimulationRunner,
    private readonly renders: RendersService,
    private readonly gallery: StyleGalleryService,
    private readonly settings: PlatformSettingsService,
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics: Diagnostics = NULL_DIAGNOSTICS,
  ) {}

  async create(project: KitchenProjectRecord, ownerSub: string): Promise<CreateSimulationResponse> {
    if (!isReadyForGeneration(project)) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
    if (await this.db(() => this.repo.hasActive(project.id))) throw draftError(HttpStatus.CONFLICT, 'simulation_in_progress');

    const blendMode = await this.settings.getStyleBlendMode();
    const references = referencesFromMoodboard(project.moodboard);
    const styleSeed = randomInt(0, 2 ** 31);
    const isFirst = (await this.db(() => this.repo.countByProject(project.id))) === 0;
    const weights = calculateWeights(references.length, styleSeed, isFirst);
    narrate.styleWeights(this.diagnostics, { blendMode, isFirst, entries: references.map((reference, index) => ({ ...reference, weight: weights[index] as number })) });
    const dominant = buildRenderPrompt(project.moodboard, this.gallery);
    const simulationId = randomUUID();
    const createdAt = this.clock();

    const photos = [...project.photos].sort((a, b) => a.position - b.position).slice(0, this.config.maxPhotos);
    const newRenders: NewRender[] = [];
    const stored: string[] = [];
    try {
      for (const photo of photos) {
        const size = renderBucket(photo.width, photo.height);
        const id = randomUUID();
        const keys = renderKeys(project.id, id);
        const before = await cropBefore(await this.readObject(photo.fullKey), size);
        narrate.beforeCrop(this.diagnostics, { index: photo.position + 1, total: photos.length, width: size.width, height: size.height, bytes: before.length, key: keys.before });
        await this.storage.put(keys.before, before, 'image/jpeg');
        stored.push(keys.before);
        newRenders.push({
          id,
          kitchenProjectId: project.id,
          simulationId,
          photoId: photo.id,
          photoPosition: photo.position,
          mode: this.renderConfig.mode,
          prompt: dominant.positive,
          seed: renderSeed(styleSeed, photo.position),
          width: size.width,
          height: size.height,
          beforeKey: keys.before,
          createdAt,
        });
      }
    } catch (error) {
      this.logger.warn(`Simulation before image failed (${error instanceof Error ? error.name : 'unknown'})`);
      await this.deleteQuietly(stored);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }

    let created: SimulationAggregate | 'in_progress';
    try {
      created = await this.db(() =>
        this.repo.createQueued(
          {
            id: simulationId,
            kitchenProjectId: project.id,
            styleSeed,
            blendMode,
            styleWeights: references.map((reference, index) => ({ ...reference, weight: weights[index] as number })),
            styleText: dominant.text,
            styleKeywords: [],
            styleDegraded: false,
            createdAt,
          },
          newRenders,
        ),
      );
    } catch (error) {
      await this.deleteQuietly(stored);
      throw error;
    }
    if (created === 'in_progress') {
      await this.deleteQuietly(stored);
      throw draftError(HttpStatus.CONFLICT, 'simulation_in_progress');
    }

    try {
      await this.runner.start(created, { project, ownerSub, negativePrompt: dominant.negative, dominant: { styleId: dominant.styleId, text: dominant.text } });
    } catch (error) {
      await this.deleteQuietly(stored);
      try {
        await this.repo.delete(project.id, simulationId);
      } catch (dbError) {
        this.logger.warn(`Simulation row not removed (${dbError instanceof Error ? dbError.name : 'unknown'})`);
      }
      if (error instanceof GpuQueueFullError) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'gpu_queue_full');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
    return { simulation: this.view((await this.repo.find(project.id, simulationId)) ?? created) };
  }

  async list(project: KitchenProjectRecord): Promise<SimulationListResponse> {
    const simulations = await this.db(() => this.repo.listByProject(project.id));
    return { simulations: simulations.map((simulation) => this.view(simulation)) };
  }

  async get(project: KitchenProjectRecord, simulationId: string): Promise<SimulationView> {
    return this.view(await this.findOr404(project, simulationId));
  }

  /** Objects first (a storage failure keeps every row), then the row: Renders and the Budget cascade. */
  async delete(project: KitchenProjectRecord, simulationId: string): Promise<void> {
    const simulation = await this.findOr404(project, simulationId);
    if (simulation.stage !== 'finished') throw draftError(HttpStatus.CONFLICT, 'simulation_in_progress');
    const keys = simulation.renders.flatMap((render) => [render.beforeKey, render.fullKey, render.thumbKey].filter((key): key is string => key !== null));
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Simulation objects not removed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'storage_unavailable');
    }
    await this.db(() => this.repo.delete(project.id, simulation.id));
  }

  /** Retry of one failed Render: same row, prompt and seed, `attempts + 1`; 202 with its Simulation. */
  async retry(project: KitchenProjectRecord, renderId: string, ownerSub: string): Promise<CreateSimulationResponse> {
    const found = await this.db(() => this.renderRepo.find(project.id, renderId.toLowerCase()));
    if (!found) throw new NotFoundException();
    const result = await this.db(() => this.repo.beginRetry(project.id, found.simulationId, found.id, this.clock()));
    if (result === 'not_found') throw new NotFoundException();
    if (result === 'in_progress') throw draftError(HttpStatus.CONFLICT, 'simulation_in_progress');
    if (result === 'not_failed') throw draftError(HttpStatus.CONFLICT, 'render_not_failed');
    const dominant = buildRenderPrompt(project.moodboard, this.gallery);
    try {
      await this.runner.retry(result, found.id, { project, ownerSub, negativePrompt: dominant.negative, dominant: { styleId: dominant.styleId, text: dominant.text } });
    } catch (error) {
      if (error instanceof GpuQueueFullError) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'gpu_queue_full');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
    return { simulation: this.view((await this.repo.find(project.id, result.id)) ?? result) };
  }

  /** Selects a Simulation (only one with every Render succeeded) or clears the selection (null). */
  async select(project: KitchenProjectRecord, body: unknown): Promise<SelectSimulationResponse> {
    if (body === null || typeof body !== 'object' || Array.isArray(body) || !('simulationId' in body)) throw new BadRequestException();
    const id = (body as { simulationId: unknown }).simulationId;
    if (id !== null && (typeof id !== 'string' || !UUID.test(id))) throw new BadRequestException();
    const result = await this.db(() => this.repo.select(project.id, id === null ? null : (id as string).toLowerCase(), this.clock()));
    if (result === 'not_found') throw new NotFoundException();
    if (result === 'not_ready') throw draftError(HttpStatus.CONFLICT, 'simulation_not_ready');
    return { selectedSimulationId: id === null ? null : (id as string).toLowerCase() };
  }

  view(simulation: SimulationAggregate): SimulationView {
    const total = simulation.renders.length;
    const succeeded = simulation.renders.filter((render) => render.status === 'succeeded').length;
    const failed = simulation.renders.filter((render) => render.status === 'failed').length;
    const running = simulation.stage === 'rendering' ? simulation.renders.findIndex((render) => render.status === 'queued' || render.status === 'running') : -1;
    const percents = weightPercents((simulation.styleWeights ?? []).map((entry) => entry.weight));
    return {
      id: simulation.id,
      ordinal: simulation.ordinal,
      createdAt: simulation.createdAt.toISOString(),
      status: simulationStatus(simulation),
      stage: simulation.stage,
      progress: { total, succeeded, failed, current: running + 1 },
      selected: simulation.selected,
      blendMode: simulation.blendMode,
      styleDegraded: simulation.styleDegraded,
      style: {
        keywords: simulation.styleKeywords,
        references: (simulation.styleWeights ?? []).map((entry, index) => ({ kind: entry.kind, refId: entry.refId, weightPercent: percents[index] as number })),
      },
      renders: simulation.renders.map((render) => this.renders.view(render)),
      budget: simulation.budget,
    };
  }

  private async findOr404(project: KitchenProjectRecord, simulationId: string): Promise<SimulationAggregate> {
    const simulation = await this.db(() => this.repo.find(project.id, simulationId.toLowerCase()));
    if (!simulation) throw new NotFoundException();
    return simulation;
  }

  private async readObject(key: string): Promise<Buffer> {
    const { body } = await this.storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  private async deleteQuietly(keys: string[]): Promise<void> {
    try {
      await this.storage.deleteMany(keys);
    } catch (error) {
      this.logger.warn(`Orphan simulation objects left (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Simulation database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
