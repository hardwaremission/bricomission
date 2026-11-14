import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import type { ImageReference } from '../../ai/adapters/image-adapter.js';
import type { LlmAdapter } from '../../ai/adapters/llm-adapter.js';
import { LLM_ADAPTER } from '../../ai/ai.tokens.js';
import { GpuQueueFullError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../../ai/jobs/gpu-job-broker.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { StyleGalleryService } from '../../style-gallery/style-gallery.service.js';
import type { KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { RENDER_REPOSITORY, type RenderRecord, type RenderRepository } from '../renders/render.repository.js';
import { composeRenderPositive } from '../renders/render-prompt.js';
import { RendersService } from '../renders/renders.service.js';
import { ipAdapterWeight } from './calculated-style.js';
import { REFERENCE_TRAIT_REPOSITORY, type ReferenceTraitRepository } from './reference-traits.repository.js';
import { SIMULATION_CONFIG, type SimulationConfig } from './simulation.config.js';
import { SIMULATION_REPOSITORY, type SimulationAggregate, type SimulationRepository, type StyleResult } from './simulations.repository.js';
import { buildStyleTraitsMessages, mergeTraits, parseStyleTraits, readStoredTraits, STYLE_TRAITS_SCHEMA, type StyleTraits } from './style-traits.js';

/** Longest edge of an image that leaves the API towards a model (bounds vision tokens and IP-Adapter cost). */
export const REFERENCE_MAX_EDGE = 768;
const TRAITS_MAX_TOKENS = 400;

/** What the runner needs besides the Simulation row. */
export interface RunContext {
  project: KitchenProjectRecord;
  ownerSub: string;
  negativePrompt: string;
  /** The dominant-style text (no prefix/suffix): used by `ip_adapter` and as the fallback when the vision step fails. */
  dominant: { styleId: string | null; text: string };
}

interface LoadedReference {
  weight: number;
  image: Buffer;
  hash: string;
}

/** Scales to <= 768 px on the longest edge and re-encodes: the bytes (and their hash) are stable. */
export async function scaleReference(source: Buffer): Promise<Buffer> {
  return sharp(source).rotate().resize({ width: REFERENCE_MAX_EDGE, height: REFERENCE_MAX_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/** Resolves once the first GPU job is submitted; rejects when that submit fails (queue full -> 429). */
export class FirstSubmit {
  private settled = false;
  readonly promise: Promise<void>;
  private resolveFn!: () => void;
  private rejectFn!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise<void>((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
  }

  get isSettled(): boolean {
    return this.settled;
  }

  ok(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolveFn();
    }
  }

  fail(error: unknown): void {
    if (!this.settled) {
      this.settled = true;
      this.rejectFn(error);
    }
  }
}

/**
 * Orchestrates one Simulation (feature simulations-ux-overhaul, Decision 7): stage `describing`
 * (one `llm` job that reads every reference not yet cached; skipped for blend mode `ip_adapter`),
 * then stage `rendering`: one `image` job per Render, submitted one after the other so the broker
 * queue never holds N of them and "n of N" is exact. Every GPU call goes through the broker.
 * `start` resolves after the first submit (so a full queue gives 429) and keeps running in the
 * background. The Simulation always ends `finished`, even after errors; recovery covers a restart.
 */
@Injectable()
export class SimulationRunner {
  private readonly logger = new Logger(SimulationRunner.name);

  constructor(
    @Inject(SIMULATION_REPOSITORY) private readonly sims: SimulationRepository,
    @Inject(RENDER_REPOSITORY) private readonly renderRepo: RenderRepository,
    @Inject(REFERENCE_TRAIT_REPOSITORY) private readonly traits: ReferenceTraitRepository,
    @Inject(LLM_ADAPTER) private readonly llm: LlmAdapter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(SIMULATION_CONFIG) private readonly config: SimulationConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly broker: GpuJobBrokerService,
    private readonly renders: RendersService,
    private readonly gallery: StyleGalleryService,
  ) {}

  /** Runs a new Simulation. Rejects with `GpuQueueFullError` when its first job could not be queued (nothing ran). */
  start(simulation: SimulationAggregate, ctx: RunContext): Promise<void> {
    const first = new FirstSubmit();
    void this.execute(simulation, ctx, first).catch((error: unknown) => {
      this.logger.warn(`Simulation run failed (${error instanceof Error ? error.name : 'unknown'})`);
      first.fail(error);
    });
    return first.promise;
  }

  /** Re-runs one failed Render of a Simulation (same prompt, seed and style). Rejects like {@link start}. */
  retry(simulation: SimulationAggregate, renderId: string, ctx: RunContext): Promise<void> {
    const first = new FirstSubmit();
    void (async () => {
      try {
        const render = simulation.renders.find((candidate) => candidate.id === renderId);
        if (render) await this.renderAll(simulation, [render], ctx, await this.loadReferences(simulation, ctx.project), first);
        else first.ok();
      } catch (error) {
        this.logger.warn(`Simulation retry failed (${error instanceof Error ? error.name : 'unknown'})`);
        first.fail(error);
      } finally {
        await this.finish(simulation);
      }
    })();
    return first.promise;
  }

  private async execute(simulation: SimulationAggregate, ctx: RunContext, first: FirstSubmit): Promise<void> {
    try {
      const references = await this.loadReferences(simulation, ctx.project);
      const style = await this.resolveStyle(simulation, ctx, references, first);
      await this.sims.setStyle(simulation.id, style, this.clock());
      await this.sims.setStage(simulation.id, 'rendering', this.clock());
      const queued = simulation.renders.map((render) => ({ ...render, prompt: style.prompt }));
      await this.renderAll(simulation, queued, ctx, references, first);
    } finally {
      await this.finish(simulation);
    }
  }

  /** Ends the run: a Render left `queued` by an unexpected error fails (no-op for terminal ones), then the stage is `finished`. */
  private async finish(simulation: SimulationAggregate): Promise<void> {
    try {
      for (const render of simulation.renders) await this.renderRepo.markFailed(render.id, 'adapter_error', this.clock());
      await this.sims.setStage(simulation.id, 'finished', this.clock());
    } catch (error) {
      this.logger.warn(`Simulation stage not stored (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  /** The style of the Simulation for its blend mode (Decision 2 and 3); never throws on vision failures. */
  private async resolveStyle(simulation: SimulationAggregate, ctx: RunContext, references: LoadedReference[], first: FirstSubmit): Promise<StyleResult> {
    const dominant: StyleResult = {
      styleText: ctx.dominant.text,
      styleKeywords: ctx.dominant.styleId ? [ctx.dominant.styleId] : [],
      styleDegraded: false,
      prompt: composeRenderPositive(ctx.dominant.text),
    };
    if (simulation.blendMode === 'ip_adapter') return dominant;
    const degraded: StyleResult = { ...dominant, styleKeywords: [], styleDegraded: true };
    if (references.length === 0) return degraded;
    let described: Map<string, StyleTraits>;
    try {
      described = await this.describe(references, ctx.ownerSub, first);
    } catch (error) {
      if (error instanceof GpuQueueFullError && !first.isSettled) throw error; // the caller answers 429
      this.logger.warn(`Style description failed (${error instanceof Error ? error.name : 'unknown'})`);
      return degraded;
    }
    const entries = references.flatMap((reference) => {
      const traits = described.get(reference.hash);
      return traits ? [{ traits, weight: reference.weight }] : [];
    });
    if (entries.length === 0) return degraded;
    const merged = mergeTraits(entries, simulation.styleSeed);
    if (merged.text === '') return degraded;
    return { styleText: merged.text, styleKeywords: merged.keywords, styleDegraded: false, prompt: composeRenderPositive(merged.text) };
  }

  /** Traits per image hash: cache first, then one `llm` job over the images still unknown. */
  private async describe(references: LoadedReference[], ownerSub: string, first: FirstSubmit): Promise<Map<string, StyleTraits>> {
    const model = this.config.llmModel;
    const hashes = [...new Set(references.map((reference) => reference.hash))];
    const result = new Map<string, StyleTraits>();
    const cached = await this.traits.getMany(hashes, model);
    for (const [hash, raw] of cached) {
      const traits = readStoredTraits(raw);
      if (traits) result.set(hash, traits);
    }
    const missing = hashes.filter((hash) => !result.has(hash)).map((hash) => references.find((reference) => reference.hash === hash) as LoadedReference);
    if (missing.length === 0) return result;
    const handle = this.broker.submit(
      'llm',
      async ({ signal }) => {
        const found = new Map<string, StyleTraits>();
        for (const reference of missing) {
          const answer = await this.llm.complete({ messages: buildStyleTraitsMessages(reference.image), jsonSchema: STYLE_TRAITS_SCHEMA, maxTokens: TRAITS_MAX_TOKENS, task: 'style_traits' }, signal);
          const traits = parseStyleTraits(answer.text);
          if (!traits) continue;
          found.set(reference.hash, traits);
          await this.traits.put(reference.hash, model, traits).catch(() => undefined);
        }
        return found;
      },
      { ownerRef: ownerSub },
    );
    first.ok();
    for (const [hash, traits] of (await handle.result) as Map<string, StyleTraits>) result.set(hash, traits);
    return result;
  }

  /** One image job per Render, one after the other. A submit that keeps failing fails that Render only. */
  private async renderAll(simulation: SimulationAggregate, renders: RenderRecord[], ctx: RunContext, references: LoadedReference[], first: FirstSubmit): Promise<void> {
    const input = { negativePrompt: ctx.negativePrompt, references: this.imageReferences(simulation, references), ownerSub: ctx.ownerSub };
    for (const render of renders) {
      let job: { done: Promise<void> } | null = null;
      for (let attempt = 1; job === null; attempt++) {
        try {
          job = this.renders.submit(render, input);
        } catch (error) {
          if (!(error instanceof GpuQueueFullError)) throw error;
          if (!first.isSettled) throw error; // the very first job: the caller answers 429
          if (attempt >= this.config.queueRetryMax) break;
          await new Promise((resolve) => setTimeout(resolve, this.config.queueRetryMs));
        }
      }
      first.ok();
      if (job === null) {
        await this.renderRepo.markFailed(render.id, 'adapter_error', this.clock()).catch(() => false);
        continue;
      }
      await job.done;
    }
    first.ok();
  }

  private imageReferences(simulation: SimulationAggregate, references: LoadedReference[]): ImageReference[] {
    if (simulation.blendMode === 'vlm_text' || references.length === 0) return [];
    const base = simulation.blendMode === 'both' ? this.config.bothBase : this.config.ipAdapterBase;
    const total = references.reduce((sum, reference) => sum + reference.weight, 0) || 1;
    return references.map((reference) => ({ image: reference.image, weight: ipAdapterWeight(base, references.length, reference.weight / total) }));
  }

  /** The Simulation's references (stored weights) with their scaled images; unreadable ones are skipped. */
  private async loadReferences(simulation: SimulationAggregate, project: KitchenProjectRecord): Promise<LoadedReference[]> {
    const loaded: LoadedReference[] = [];
    for (const entry of simulation.styleWeights ?? []) {
      try {
        const source = entry.kind === 'gallery' ? await this.gallery.content(entry.refId, 'full') : await this.readUpload(project, entry.refId);
        if (!source) continue;
        const image = await scaleReference(source);
        loaded.push({ weight: entry.weight, image, hash: createHash('sha256').update(image).digest('hex') });
      } catch (error) {
        this.logger.warn(`Style reference skipped (${error instanceof Error ? error.name : 'unknown'})`);
      }
    }
    return loaded;
  }

  private async readUpload(project: KitchenProjectRecord, itemId: string): Promise<Buffer | null> {
    const item = project.moodboard.find((candidate) => candidate.id === itemId);
    if (!item?.fullKey) return null;
    const { body } = await this.storage.getStream(item.fullKey);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }
}
