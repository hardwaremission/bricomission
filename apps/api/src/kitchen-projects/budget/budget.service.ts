import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BudgetErrorCode, BudgetListResponse, BudgetView, CreateBudgetResponse } from '@bricomission/shared-types';
import { contentText, type LlmAdapter } from '../../ai/adapters/llm-adapter.js';
import { LLM_ADAPTER } from '../../ai/ai.tokens.js';
import { GpuJobFailedError, GpuQueueFullError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../../ai/jobs/gpu-job-broker.service.js';
import { CatalogSearchService } from '../../catalog/catalog-search.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { draftError } from '../kitchen-draft.errors.js';
import type { KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { isReadyForGeneration } from '../readiness.js';
import { RENDER_REPOSITORY, type RenderRecord, type RenderRepository } from '../renders/render.repository.js';
import { SIMULATION_CONFIG, type SimulationConfig } from '../simulations/simulation.config.js';
import { FirstSubmit, scaleReference } from '../simulations/simulation-runner.js';
import { SIMULATION_REPOSITORY, isReady, type SimulationAggregate, type SimulationRepository } from '../simulations/simulations.repository.js';
import { BUDGET_CONFIG, type BudgetConfig } from './budget.config.js';
import { BUDGET_REPOSITORY, type BudgetRecord, type BudgetRepository, type BudgetTierRecord } from './budget.repository.js';
import { toSafeNumber } from './budget-math.js';
import { BUDGET_JSON_SCHEMA, buildFeedback, buildTiers, extractBudget, isComplete, type Extraction } from './budget-engine/budget-extraction.js';
import { buildInventoryMessages, extendQueries, INVENTORY_SCHEMA, type MergedElement, mergeInventories, parseInventory, readStoredInventory, type RenderInventory } from './budget-engine/inventory.js';
import { buildBudgetMessages, buildBudgetQueries, QUERY_LIMIT, type RetrievedChunk, selectChunks } from './budget-engine/budget-prompt.js';
import { assignPriceBands } from './budget-engine/price-bands.js';
import { buildOrderFeedback, isStrictlyOrdered, relabelByTotal } from './budget-engine/tier-order.js';

/** Completion cap: 4 tiers x 5 short items stay well under it (about 40 s at 25 tok/s; measured 25.5 tok/s). */
const MAX_COMPLETION_TOKENS = 1500;
/** Completion cap of one inventory read (a short JSON list, about 10 s). */
// 500 truncated the JSON on real kitchens (finish_reason `length`, 570-690 tokens needed): the read was silently skipped.
const INVENTORY_MAX_TOKENS = 1200;

/** Progress of one Budget run, shared with the failure path (the broker hides the job's own error class). */
interface JobState {
  attempts: number;
  /** Every attempt ended without four tiers of verified Line Items (or the ranking could not fix equal totals). */
  verificationFailed: boolean;
}

type RetrievalHits = Awaited<ReturnType<CatalogSearchService['search']>>['results'];

/**
 * Budgets of claimed Kitchen Projects (budget-tier-computation, simulations-ux-overhaul, ADR 0002).
 * A Budget belongs to the selected Simulation. The POST runs outside the GPU slot: readiness,
 * selection, base Catalog retrieval (fixed category queries, fails fast), the `queued` insert under
 * the project row lock. A background pipeline then reads each Render image with the vision model (one
 * separate `llm` broker job per uncached image, cached on the Render), merges the inventories in code
 * (max count per category), extends the retrieval queries, and runs one pricing job: up to
 * `maxAttempts` LLM calls, each verified against the cited chunks and computed in `budget-math`, the
 * tier totals must satisfy luxury > high > medium > low (retry with feedback, then relabel by total as
 * the last resort). The old Budget of the Simulation stays until the new one succeeds. Logs carry
 * error class names only: never a prompt, price, job id or backend body.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly repo: BudgetRepository,
    @Inject(SIMULATION_REPOSITORY) private readonly simulations: SimulationRepository,
    @Inject(RENDER_REPOSITORY) private readonly renderRepo: RenderRepository,
    @Inject(LLM_ADAPTER) private readonly llm: LlmAdapter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(BUDGET_CONFIG) private readonly config: BudgetConfig,
    @Inject(SIMULATION_CONFIG) private readonly simulationConfig: SimulationConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly broker: GpuJobBrokerService,
    private readonly search: CatalogSearchService,
  ) {}

  async create(project: KitchenProjectRecord, ownerSub: string): Promise<CreateBudgetResponse> {
    if (!isReadyForGeneration(project)) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
    const selected = await this.db(() => this.simulations.findSelected(project.id));
    if (!selected) throw draftError(HttpStatus.CONFLICT, 'no_simulation_selected');
    if (!isReady(selected)) throw draftError(HttpStatus.CONFLICT, 'simulation_not_ready');
    const baseQueries = buildBudgetQueries();
    const baseHits = await this.retrieve(baseQueries);
    const baseChunks = selectChunks(baseHits, this.config.chunkLimit, undefined, baseQueries);
    if (baseChunks.length === 0) throw draftError(HttpStatus.CONFLICT, 'catalog_empty');
    const messages = buildBudgetMessages(project.measurements, baseChunks, undefined, { bands: assignPriceBands(baseChunks) });
    const renders = selected.renders;
    const pending = renders.filter((render) => readStoredInventory(render.inventory) === null);
    const id = randomUUID();
    const created = await this.db(() =>
      this.repo.createQueued({
        id,
        kitchenProjectId: project.id,
        simulationId: selected.id,
        currency: 'EUR',
        vatBps: this.config.vatBps,
        prompt: messages.map((m) => contentText(m.content)).join('\n\n'),
        createdAt: this.clock(),
        stage: pending.length > 0 ? 'inventory' : 'pricing',
        progressDone: renders.length - pending.length,
        progressTotal: renders.length,
      }),
    );
    if (created === 'in_progress') throw draftError(HttpStatus.CONFLICT, 'budget_in_progress');

    const state: JobState = { attempts: 0, verificationFailed: false };
    const first = new FirstSubmit();
    void this.pipeline(created, project, selected, baseHits, baseQueries, ownerSub, state, first);
    try {
      await first.promise;
    } catch (error) {
      await this.discard(created);
      if (error instanceof GpuQueueFullError) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'gpu_queue_full');
      throw error;
    }
    return { budget: this.view((await this.repo.find(project.id, id)) ?? created) };
  }

  /** Budgets of the selected Simulation (the current one plus an active or failed recompute); empty without a selection. */
  async list(project: KitchenProjectRecord): Promise<BudgetListResponse> {
    const selected = await this.db(() => this.simulations.findSelected(project.id));
    if (!selected) return { budgets: [] };
    const budgets = await this.db(() => this.repo.listBySimulation(selected.id));
    return { budgets: budgets.map((budget) => this.view(budget)) };
  }

  async get(project: KitchenProjectRecord, budgetId: string): Promise<BudgetView> {
    const budget = await this.db(() => this.repo.find(project.id, budgetId.toLowerCase()));
    if (!budget) throw new NotFoundException();
    return this.view(budget);
  }

  view(budget: BudgetRecord): BudgetView {
    const queued = budget.status === 'queued' && budget.gpuJobId ? this.broker.get(budget.gpuJobId) : undefined;
    const tiers = budget.status === 'succeeded' ? budget.tiers : [];
    return {
      id: budget.id,
      simulationId: budget.simulationId,
      status: budget.status,
      stage: budget.stage,
      progress: { total: budget.progressTotal, done: budget.progressDone },
      relabeled: budget.relabeled,
      position: queued?.status === 'queued' ? queued.position : null,
      waitingFor: queued?.status === 'queued' ? queued.waitingFor : null,
      currency: 'EUR',
      vatPercent: budget.vatBps / 100,
      errorCode: budget.errorCode,
      createdAt: budget.createdAt.toISOString(),
      startedAt: budget.startedAt?.toISOString() ?? null,
      finishedAt: budget.finishedAt?.toISOString() ?? null,
      lineItemsCount: tiers.reduce((sum, tier) => sum + tier.items.length, 0),
      tiers: tiers.map((tier) => ({
        tier: tier.tier,
        subtotalCents: toSafeNumber(tier.subtotalCents),
        vatCents: toSafeNumber(tier.vatCents),
        totalCents: toSafeNumber(tier.totalCents),
        items: tier.items.map((item) => ({
          name: item.productName,
          sku: item.sku,
          catalogName: item.catalogName,
          pageNumber: item.pageNumber,
          unit: item.unit,
          quantity: item.quantity,
          quotedPrice: item.quotedPrice,
          unitPriceCents: toSafeNumber(item.unitPriceCents),
          subtotalCents: toSafeNumber(item.subtotalCents),
        })),
      })),
    };
  }

  /** Catalog RAG search per query (limit 5 each); any failure is `embedding_unavailable`, before any row or broker submit. */
  private async retrieve(queries: readonly string[]): Promise<RetrievalHits[]> {
    try {
      return await Promise.all(queries.map(async (query) => (await this.search.search({ query, limit: QUERY_LIMIT })).results));
    } catch (error) {
      this.logger.warn(`Budget catalog search failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'embedding_unavailable');
    }
  }

  /** Background run of one Budget: inventory jobs, then the pricing job. Never throws; failures end the row `failed`. */
  private async pipeline(
    budget: BudgetRecord,
    project: KitchenProjectRecord,
    simulation: SimulationAggregate,
    baseHits: RetrievalHits[],
    baseQueries: string[],
    ownerSub: string,
    state: JobState,
    first: FirstSubmit,
  ): Promise<void> {
    try {
      const inventories = await this.readInventories(budget, simulation.renders, ownerSub, first);
      const merged = mergeInventories(inventories);
      await this.repo.setProgress(budget.id, 'pricing', budget.progressTotal, budget.progressTotal).catch(() => undefined);
      const { chunks, queries } = await this.finalChunks(baseHits, baseQueries, merged);
      const bands = assignPriceBands(chunks);
      this.logger.log(`Budget retrieval: ${queries.length} queries, ${chunks.length} chunks, ${merged.length} inventory categories`);
      const handle = await this.submit(first, ownerSub, budget.id, ({ signal }) => this.price(budget, project, chunks, merged, bands, signal, state));
      await handle.result;
    } catch (error) {
      if (error instanceof GpuQueueFullError && !first.isSettled) {
        first.fail(error); // the caller answers 429 and removes the row
        return;
      }
      await this.onFailed(budget, error, state);
    } finally {
      first.ok();
    }
  }

  /** One `llm` job per Render image without a cached inventory, one after the other. A failed read only skips that image. */
  private async readInventories(budget: BudgetRecord, renders: RenderRecord[], ownerSub: string, first: FirstSubmit): Promise<RenderInventory[]> {
    const found: RenderInventory[] = [];
    let done = budget.progressDone;
    for (const render of renders) {
      const cached = readStoredInventory(render.inventory);
      if (cached) {
        found.push(cached);
        continue;
      }
      try {
        const handle = await this.submit(first, ownerSub, budget.id, ({ signal }) => this.readInventory(budget, render, signal));
        const inventory = (await handle.result) as RenderInventory | null;
        if (inventory) found.push(inventory);
      } catch (error) {
        if (error instanceof GpuQueueFullError && !first.isSettled) throw error;
        this.logger.warn(`Budget inventory skipped for one image (${error instanceof Error ? error.name : 'unknown'})`);
      }
      done++;
      await this.repo.setProgress(budget.id, 'inventory', done, budget.progressTotal).catch(() => undefined);
    }
    return found;
  }

  /** The job body of one inventory read: image scaled to <= 768 px, vision call, parse, cache on the Render. */
  private async readInventory(budget: BudgetRecord, render: RenderRecord, signal: AbortSignal): Promise<RenderInventory | null> {
    await this.repo.markRunning(budget.id, this.clock());
    if (!render.fullKey) return null;
    const image = await scaleReference(await this.readObject(render.fullKey));
    const result = await this.llm.complete({ messages: buildInventoryMessages(image), jsonSchema: INVENTORY_SCHEMA, maxTokens: INVENTORY_MAX_TOKENS, task: 'inventory' }, signal);
    if (signal.aborted) return null;
    const inventory = parseInventory(result.text);
    if (!inventory) this.logger.warn('Vision inventory answer was not valid JSON (image skipped)');
    if (inventory) await this.renderRepo.setInventory(render.id, inventory).catch(() => undefined);
    return inventory;
  }

  /** Base chunks, or (when the merged inventory adds queries) base plus the extra queries' hits. A failed extra search keeps the base. */
  private async finalChunks(baseHits: RetrievalHits[], baseQueries: string[], merged: MergedElement[]): Promise<{ chunks: RetrievedChunk[]; queries: string[] }> {
    const queries = extendQueries(baseQueries, merged);
    const extra = queries.slice(baseQueries.length);
    let hits = baseHits;
    if (extra.length > 0) {
      try {
        hits = [...baseHits, ...(await this.retrieve(extra))];
      } catch {
        return { chunks: selectChunks(baseHits, this.config.chunkLimit, undefined, baseQueries), queries: baseQueries };
      }
    }
    return { chunks: selectChunks(hits, this.config.chunkLimit, undefined, queries), queries };
  }

  /** Submits an `llm` job. While the queue is full a later job waits and retries; the very first one throws (429). */
  private async submit<T>(first: FirstSubmit, ownerSub: string, budgetId: string, run: (ctx: { signal: AbortSignal }) => Promise<T>) {
    for (let attempt = 1; ; attempt++) {
      try {
        const handle = this.broker.submit('llm', run, { ownerRef: ownerSub });
        await this.repo.setGpuJob(budgetId, handle.jobId).catch(() => undefined);
        first.ok();
        return handle;
      } catch (error) {
        if (!(error instanceof GpuQueueFullError) || !first.isSettled || attempt >= this.simulationConfig.queueRetryMax) throw error;
        await new Promise((resolve) => setTimeout(resolve, this.simulationConfig.queueRetryMs));
      }
    }
  }

  /**
   * The pricing job: up to `maxAttempts` LLM calls. An attempt is accepted when every tier kept a
   * verified Line Item AND the totals are strictly ordered. Otherwise the next attempt gets feedback
   * (verification reasons or the totals). After the last attempt the latest complete (verified) answer is
   * relabelled by total rank; equal totals, or no complete answer at all, fail `verification_failed`.
   */
  private async price(
    budget: BudgetRecord,
    project: KitchenProjectRecord,
    chunks: RetrievedChunk[],
    inventory: MergedElement[],
    bands: ReturnType<typeof assignPriceBands>,
    signal: AbortSignal,
    state: JobState,
  ): Promise<void> {
    await this.repo.markRunning(budget.id, this.clock());
    let feedback: string | undefined;
    let promptTokens = 0;
    let completionTokens = 0;
    let lastComplete: BudgetTierRecord[] | null = null;
    let prompt = '';
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      state.attempts = attempt;
      const messages = buildBudgetMessages(project.measurements, chunks, feedback, { inventory, bands });
      prompt = messages.map((m) => contentText(m.content)).join('\n\n');
      const result = await this.llm.complete({ messages, jsonSchema: BUDGET_JSON_SCHEMA, maxTokens: MAX_COMPLETION_TOKENS, task: 'budget' }, signal);
      promptTokens += result.promptTokens;
      completionTokens += result.completionTokens;
      if (signal.aborted) return; // timed out meanwhile: the failure path owns the row
      const extraction: Extraction = extractBudget(result.text, chunks);
      if (!isComplete(extraction)) {
        feedback = buildFeedback(extraction);
        continue;
      }
      const tiers = buildTiers(extraction.items, budget.vatBps);
      lastComplete = tiers;
      if (isStrictlyOrdered(tiers)) return this.succeed(budget, { tiers, relabeled: false, prompt, attempts: attempt, promptTokens, completionTokens });
      feedback = buildOrderFeedback(tiers);
    }
    const relabeled = lastComplete ? relabelByTotal(lastComplete) : null;
    if (!relabeled) {
      state.verificationFailed = true;
      throw new Error('budget verification failed');
    }
    this.logger.warn('Budget tiers relabelled by total rank after the last attempt');
    return this.succeed(budget, { tiers: relabeled, relabeled: true, prompt, attempts: this.config.maxAttempts, promptTokens, completionTokens });
  }

  private async succeed(budget: BudgetRecord, result: { tiers: BudgetTierRecord[]; relabeled: boolean; prompt: string; attempts: number; promptTokens: number; completionTokens: number }): Promise<void> {
    const done = await this.repo.markSucceeded(budget.id, { ...result, finishedAt: this.clock() });
    if (!done) this.logger.warn('Budget result dropped: the row was no longer running');
  }

  private async readObject(key: string): Promise<Buffer> {
    const { body } = await this.storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  private async onFailed(budget: BudgetRecord, error: unknown, state: JobState): Promise<void> {
    const code: BudgetErrorCode =
      state.verificationFailed ? 'verification_failed' : error instanceof GpuJobFailedError && (error.code === 'timeout' || error.code === 'adapter_error') ? error.code : 'adapter_error';
    try {
      await this.repo.markFailed(budget.id, code, this.clock(), state.attempts);
    } catch (dbError) {
      this.logger.warn(`Budget failure not stored (${dbError instanceof Error ? dbError.name : 'unknown'})`);
    }
    this.logger.warn(`Budget failed (${code})`);
  }

  private async discard(budget: BudgetRecord): Promise<void> {
    try {
      await this.repo.delete(budget.id);
    } catch (error) {
      this.logger.warn(`Budget row not removed (${error instanceof Error ? error.name : 'unknown'})`);
    }
  }

  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Budget database call failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
  }
}
