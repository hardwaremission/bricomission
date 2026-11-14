import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BudgetErrorCode, BudgetListResponse, BudgetView, CreateBudgetResponse } from '@bricomission/shared-types';
import type { LlmAdapter } from '../../ai/adapters/llm-adapter.js';
import { LLM_ADAPTER } from '../../ai/ai.tokens.js';
import { GpuJobFailedError, GpuQueueFullError } from '../../ai/jobs/gpu-job-broker.errors.js';
import { GpuJobBrokerService } from '../../ai/jobs/gpu-job-broker.service.js';
import { CatalogSearchService } from '../../catalog/catalog-search.service.js';
import { draftError } from '../kitchen-draft.errors.js';
import type { KitchenProjectRecord } from '../kitchen-drafts.repository.js';
import { type Clock, KITCHEN_CLOCK } from '../kitchen-projects.config.js';
import { isReadyForGeneration } from '../readiness.js';
import { BUDGET_CONFIG, type BudgetConfig } from './budget.config.js';
import { BUDGET_REPOSITORY, type BudgetRecord, type BudgetRepository } from './budget.repository.js';
import { toSafeNumber } from './budget-math.js';
import { BUDGET_JSON_SCHEMA, buildFeedback, buildTiers, extractBudget, isComplete, type Extraction } from './budget-engine/budget-extraction.js';
import { buildBudgetMessages, buildBudgetQueries, QUERY_LIMIT, type RetrievedChunk, selectChunks } from './budget-engine/budget-prompt.js';

/** Completion cap: 4 tiers x 5 short items stay well under it (about 40 s at 25 tok/s; measured 25.5 tok/s). */
const MAX_COMPLETION_TOKENS = 1500;

/** Progress of one job, shared with the failure path (the broker hides the job's own error class). */
interface JobState {
  attempts: number;
  /** Every attempt ended without four tiers of verified Line Items. */
  verificationFailed: boolean;
}


/**
 * Budgets of claimed Kitchen Projects (feature budget-tier-computation, ADR 0002). The POST runs
 * outside the GPU slot: readiness, Catalog retrieval (fixed category queries), the `queued`
 * insert under the project row lock, then `broker.submit('llm', ...)`. The job asks the LLM for
 * the four tiers (one JSON-schema call, one retry with feedback), verifies every quoted price
 * against its cited chunk, computes all amounts in `budget-math` and stores them. Logs carry
 * error class names only: never a prompt, price, job id or backend body.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly repo: BudgetRepository,
    @Inject(LLM_ADAPTER) private readonly llm: LlmAdapter,
    @Inject(BUDGET_CONFIG) private readonly config: BudgetConfig,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
    private readonly broker: GpuJobBrokerService,
    private readonly search: CatalogSearchService,
  ) {}

  async create(project: KitchenProjectRecord, ownerSub: string): Promise<CreateBudgetResponse> {
    if (!isReadyForGeneration(project)) throw draftError(HttpStatus.CONFLICT, 'project_incomplete');
    const chunks = await this.retrieve();
    const messages = buildBudgetMessages(project.measurements, chunks);
    const id = randomUUID();
    const created = await this.db(() =>
      this.repo.createQueued(
        { id, kitchenProjectId: project.id, currency: 'EUR', vatBps: this.config.vatBps, prompt: messages.map((m) => m.content).join('\n\n'), createdAt: this.clock() },
        this.config.maxPerProject,
      ),
    );
    if (created === 'in_progress') throw draftError(HttpStatus.CONFLICT, 'budget_in_progress');
    if (created === 'limit_reached') throw draftError(HttpStatus.CONFLICT, 'budget_limit_reached');

    const state: JobState = { attempts: 0, verificationFailed: false };
    let handle;
    try {
      handle = this.broker.submit('llm', ({ signal }) => this.run(created, project, chunks, signal, state), { ownerRef: ownerSub });
    } catch (error) {
      await this.discard(created);
      if (error instanceof GpuQueueFullError) throw draftError(HttpStatus.TOO_MANY_REQUESTS, 'gpu_queue_full');
      throw error;
    }
    created.gpuJobId = handle.jobId;
    handle.result.catch((error: unknown) => this.onFailed(created, error, state));
    try {
      await this.repo.setGpuJob(id, handle.jobId);
    } catch (error) {
      this.logger.warn(`Budget job id not stored (${error instanceof Error ? error.name : 'unknown'})`);
    }
    return { budget: this.view(created) };
  }

  async list(project: KitchenProjectRecord): Promise<BudgetListResponse> {
    const budgets = await this.db(() => this.repo.listByProject(project.id));
    return { budgets: budgets.map((budget) => this.view(budget)), maxBudgets: this.config.maxPerProject };
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
      status: budget.status,
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

  /** Fixed category queries over the Catalog RAG index; fails before any row or broker submit. */
  private async retrieve(): Promise<RetrievedChunk[]> {
    let hits;
    try {
      hits = await Promise.all(buildBudgetQueries().map(async (query) => (await this.search.search({ query, limit: QUERY_LIMIT })).results));
    } catch (error) {
      this.logger.warn(`Budget catalog search failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw draftError(HttpStatus.SERVICE_UNAVAILABLE, 'embedding_unavailable');
    }
    const chunks = selectChunks(hits, this.config.chunkLimit);
    if (chunks.length === 0) throw draftError(HttpStatus.CONFLICT, 'catalog_empty');
    return chunks;
  }

  /** The GPU job: `running`, up to `maxAttempts` LLM calls, verification, math, `succeeded`. */
  private async run(budget: BudgetRecord, project: KitchenProjectRecord, chunks: RetrievedChunk[], signal: AbortSignal, state: JobState): Promise<void> {
    await this.repo.markRunning(budget.id, this.clock());
    let feedback: string | undefined;
    let promptTokens = 0;
    let completionTokens = 0;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      state.attempts = attempt;
      const result = await this.llm.complete({ messages: buildBudgetMessages(project.measurements, chunks, feedback), jsonSchema: BUDGET_JSON_SCHEMA, maxTokens: MAX_COMPLETION_TOKENS }, signal);
      promptTokens += result.promptTokens;
      completionTokens += result.completionTokens;
      if (signal.aborted) return; // timed out meanwhile: the failure path owns the row
      const extraction: Extraction = extractBudget(result.text, chunks);
      if (isComplete(extraction)) {
        const done = await this.repo.markSucceeded(budget.id, {
          tiers: buildTiers(extraction.items, budget.vatBps),
          attempts: attempt,
          promptTokens,
          completionTokens,
          finishedAt: this.clock(),
        });
        if (!done) this.logger.warn('Budget result dropped: the row was no longer running');
        return;
      }
      feedback = buildFeedback(extraction);
    }
    state.verificationFailed = true;
    throw new Error('budget verification failed');
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
