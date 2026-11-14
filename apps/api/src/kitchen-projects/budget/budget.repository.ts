import { Injectable } from '@nestjs/common';
import type { BudgetErrorCode, BudgetStatus, BudgetTier } from '@bricomission/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A verified Line Item row. Amounts are integer cents (BigInt in code, bigint in the database). */
export interface BudgetItemRecord {
  position: number;
  productName: string;
  sku: string;
  catalogName: string;
  pageNumber: number;
  /** The Catalog line the price was verified against (max 200 chars; internal). */
  sourceQuote: string;
  /** The price exactly as the Catalog prints it. */
  quotedPrice: string;
  unitPriceCents: bigint;
  quantity: string;
  quantityHundredths: number;
  unit: string;
  subtotalCents: bigint;
}

export interface BudgetTierRecord {
  tier: BudgetTier;
  subtotalCents: bigint;
  vatCents: bigint;
  totalCents: bigint;
  items: BudgetItemRecord[];
}

/** A `budget` row with its tiers (empty until `succeeded`). `prompt`, token counts and `gpuJobId` are internal. */
export interface BudgetRecord {
  id: string;
  kitchenProjectId: string;
  status: BudgetStatus;
  errorCode: BudgetErrorCode | null;
  currency: string;
  vatBps: number;
  attempts: number;
  prompt: string;
  promptTokens: number | null;
  completionTokens: number | null;
  gpuJobId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  tiers: BudgetTierRecord[];
}

export type NewBudget = Pick<BudgetRecord, 'id' | 'kitchenProjectId' | 'currency' | 'vatBps' | 'prompt' | 'createdAt'>;

export type CreateBudgetResult = BudgetRecord | 'in_progress' | 'limit_reached';

export interface BudgetSuccess {
  tiers: BudgetTierRecord[];
  attempts: number;
  promptTokens: number;
  completionTokens: number;
  finishedAt: Date;
}

/** Persistence of Budgets. Tests use an in-memory implementation with the same semantics. */
export interface BudgetRepository {
  /**
   * Under the project row lock: `in_progress` when a Budget of the project is queued or running,
   * `limit_reached` when it already has `maxNonFailed` non-failed Budgets, else inserts `queued`.
   */
  createQueued(budget: NewBudget, maxNonFailed: number): Promise<CreateBudgetResult>;
  /** Budgets of the project, newest first, with their tiers and Line Items. */
  listByProject(projectId: string): Promise<BudgetRecord[]>;
  find(projectId: string, budgetId: string): Promise<BudgetRecord | null>;
  setGpuJob(id: string, gpuJobId: string): Promise<void>;
  /** `queued -> running`; false when the row is no longer queued. */
  markRunning(id: string, startedAt: Date): Promise<boolean>;
  /** `running -> succeeded` and inserts the tiers and Line Items in one transaction; false when the row is no longer running. */
  markSucceeded(id: string, success: BudgetSuccess): Promise<boolean>;
  /** `queued|running -> failed`; false when the row was already terminal. */
  markFailed(id: string, errorCode: BudgetErrorCode, finishedAt: Date, attempts?: number): Promise<boolean>;
  delete(id: string): Promise<void>;
  /** Marks every queued/running Budget `failed` with `errorCode` (start-up recovery). */
  failActive(errorCode: BudgetErrorCode, finishedAt: Date): Promise<number>;
}

export const BUDGET_REPOSITORY = Symbol('BUDGET_REPOSITORY');

const ACTIVE: BudgetStatus[] = ['queued', 'running'];

type ItemRow = Omit<BudgetItemRecord, 'quantityHundredths'> & { quantityH: number; tier: BudgetTier };
type Row = Omit<BudgetRecord, 'errorCode' | 'tiers'> & {
  errorCode: string | null;
  tiers: { tier: BudgetTier; subtotalCents: bigint; vatCents: bigint; totalCents: bigint }[];
  lineItems: ItemRow[];
};

const TIER_ORDER: BudgetTier[] = ['luxury', 'high', 'medium', 'low'];

function toRecord(row: Row): BudgetRecord {
  const { tiers, lineItems, errorCode, ...rest } = row;
  return {
    ...rest,
    errorCode: errorCode as BudgetErrorCode | null,
    tiers: [...tiers]
      .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
      .map((tier) => ({
        ...tier,
        items: lineItems
          .filter((item) => item.tier === tier.tier)
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            position: item.position,
            productName: item.productName,
            sku: item.sku,
            catalogName: item.catalogName,
            pageNumber: item.pageNumber,
            sourceQuote: item.sourceQuote,
            quotedPrice: item.quotedPrice,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            quantityHundredths: item.quantityH,
            unit: item.unit,
            subtotalCents: item.subtotalCents,
          })),
      })),
  };
}

const INCLUDE = { tiers: true, lineItems: true } as const;

@Injectable()
export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  createQueued(budget: NewBudget, maxNonFailed: number): Promise<CreateBudgetResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent Budget requests of the same project.
      await tx.$queryRaw`SELECT id FROM kitchen_project WHERE id = ${budget.kitchenProjectId}::uuid FOR UPDATE`;
      const active = await tx.budget.count({ where: { kitchenProjectId: budget.kitchenProjectId, status: { in: ACTIVE } } });
      if (active > 0) return 'in_progress' as const;
      const kept = await tx.budget.count({ where: { kitchenProjectId: budget.kitchenProjectId, status: { not: 'failed' } } });
      if (kept >= maxNonFailed) return 'limit_reached' as const;
      return toRecord(await tx.budget.create({ data: { ...budget, status: 'queued' }, include: INCLUDE }));
    });
  }

  async listByProject(projectId: string): Promise<BudgetRecord[]> {
    const rows = await this.prisma.budget.findMany({ where: { kitchenProjectId: projectId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: INCLUDE });
    return rows.map(toRecord);
  }

  async find(projectId: string, budgetId: string): Promise<BudgetRecord | null> {
    const row = await this.prisma.budget.findFirst({ where: { id: budgetId, kitchenProjectId: projectId }, include: INCLUDE });
    return row ? toRecord(row) : null;
  }

  async setGpuJob(id: string, gpuJobId: string): Promise<void> {
    await this.prisma.budget.update({ where: { id }, data: { gpuJobId } });
  }

  async markRunning(id: string, startedAt: Date): Promise<boolean> {
    const { count } = await this.prisma.budget.updateMany({ where: { id, status: 'queued' }, data: { status: 'running', startedAt } });
    return count === 1;
  }

  markSucceeded(id: string, success: BudgetSuccess): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.budget.updateMany({
        where: { id, status: 'running' },
        data: { status: 'succeeded', attempts: success.attempts, promptTokens: success.promptTokens, completionTokens: success.completionTokens, finishedAt: success.finishedAt },
      });
      if (count !== 1) return false;
      await tx.budgetTier.createMany({
        data: success.tiers.map((tier) => ({ budgetId: id, tier: tier.tier, subtotalCents: tier.subtotalCents, vatCents: tier.vatCents, totalCents: tier.totalCents })),
      });
      await tx.budgetLineItem.createMany({
        data: success.tiers.flatMap((tier) =>
          tier.items.map((item) => ({
            budgetId: id,
            tier: tier.tier,
            position: item.position,
            productName: item.productName,
            sku: item.sku,
            catalogName: item.catalogName,
            pageNumber: item.pageNumber,
            sourceQuote: item.sourceQuote,
            quotedPrice: item.quotedPrice,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            quantityH: item.quantityHundredths,
            unit: item.unit,
            subtotalCents: item.subtotalCents,
          })),
        ),
      });
      return true;
    });
  }

  async markFailed(id: string, errorCode: BudgetErrorCode, finishedAt: Date, attempts?: number): Promise<boolean> {
    const { count } = await this.prisma.budget.updateMany({
      where: { id, status: { in: ACTIVE } },
      data: { status: 'failed', errorCode, finishedAt, ...(attempts === undefined ? {} : { attempts }) },
    });
    return count === 1;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.budget.deleteMany({ where: { id } });
  }

  async failActive(errorCode: BudgetErrorCode, finishedAt: Date): Promise<number> {
    const { count } = await this.prisma.budget.updateMany({ where: { status: { in: ACTIVE } }, data: { status: 'failed', errorCode, finishedAt } });
    return count;
  }
}
