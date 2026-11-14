import { ApiProperty } from '@nestjs/swagger';
import type {
  BudgetErrorCode,
  BudgetLineItemView,
  BudgetStage,
  BudgetListResponse,
  BudgetStatus,
  BudgetTier,
  BudgetTierView,
  BudgetView,
  CreateBudgetResponse,
  GpuJobKind,
} from '@bricomission/shared-types';

const STATUSES: BudgetStatus[] = ['queued', 'running', 'succeeded', 'failed'];
const STAGES: BudgetStage[] = ['inventory', 'pricing'];
const TIERS: BudgetTier[] = ['luxury', 'high', 'medium', 'low'];
const KINDS: GpuJobKind[] = ['image', 'llm'];
const ERROR_CODES: BudgetErrorCode[] = ['adapter_error', 'timeout', 'interrupted', 'verification_failed'];

/** A verified Line Item (feature budget-tier-computation). Amounts are integer cents. No source quote. */
export class BudgetLineItemViewDto implements BudgetLineItemView {
  @ApiProperty({ example: 'Oak laminate worktop 300 cm' })
  name!: string;

  @ApiProperty({ example: 'BM-SYN-WTP-300' })
  sku!: string;

  @ApiProperty({ description: 'Catalog the price was verified against' })
  catalogName!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  pageNumber!: number;

  @ApiProperty({ example: 'unit' })
  unit!: string;

  @ApiProperty({ example: '2.5', description: 'Decimal string, at most two decimals' })
  quantity!: string;

  @ApiProperty({ example: '189.90', description: 'The price exactly as the Catalog prints it' })
  quotedPrice!: string;

  @ApiProperty({ type: 'integer', example: 18990 })
  unitPriceCents!: number;

  @ApiProperty({ type: 'integer', example: 47475, description: 'round_half_up(unitPriceCents x quantity), computed by code' })
  subtotalCents!: number;
}

export class BudgetTierViewDto implements BudgetTierView {
  @ApiProperty({ enum: TIERS })
  tier!: BudgetTier;

  @ApiProperty({ type: 'integer', description: 'Part before VAT (total - vat)' })
  subtotalCents!: number;

  @ApiProperty({ type: 'integer', description: 'VAT part of the total' })
  vatCents!: number;

  @ApiProperty({ type: 'integer', description: 'Sum of the item subtotals (catalog prices are VAT-inclusive)' })
  totalCents!: number;

  @ApiProperty({ type: [BudgetLineItemViewDto] })
  items!: BudgetLineItemViewDto[];
}

export class BudgetProgressDto {
  @ApiProperty({ type: 'integer', description: 'Images of the Simulation' })
  total!: number;

  @ApiProperty({ type: 'integer', description: 'Images read so far' })
  done!: number;
}

/** A Budget of an owned Kitchen Project. No prompt, token counts, job id or source quotes. */
export class BudgetViewDto implements BudgetView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The Simulation this Budget prices' })
  simulationId!: string;

  @ApiProperty({ enum: STATUSES })
  status!: BudgetStatus;

  @ApiProperty({ enum: STAGES, description: '`inventory` while the images are read ("Reading image n of N"), then `pricing`' })
  stage!: BudgetStage;

  @ApiProperty({ type: BudgetProgressDto })
  progress!: BudgetProgressDto;

  @ApiProperty({ description: 'True when the tiers were named by total rank after the last attempt was out of order (names only; no amount changed)' })
  relabeled!: boolean;

  @ApiProperty({ type: 'integer', nullable: true, description: '1-based GPU queue position while queued (when known)' })
  position!: number | null;

  @ApiProperty({ enum: KINDS, nullable: true, description: 'Kind of GPU work it waits behind while queued' })
  waitingFor!: GpuJobKind | null;

  @ApiProperty({ enum: ['EUR'] })
  currency!: 'EUR';

  @ApiProperty({ example: 21, description: 'VAT rate in percent' })
  vatPercent!: number;

  @ApiProperty({ enum: ERROR_CODES, nullable: true })
  errorCode!: BudgetErrorCode | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ type: 'integer', description: 'Verified Line Items over all tiers (0 until succeeded)' })
  lineItemsCount!: number;

  @ApiProperty({ type: [BudgetTierViewDto], description: 'Empty until succeeded; luxury, high, medium, low' })
  tiers!: BudgetTierViewDto[];
}

export class CreateBudgetResponseDto implements CreateBudgetResponse {
  @ApiProperty({ type: BudgetViewDto })
  budget!: BudgetViewDto;
}

export class BudgetListResponseDto implements BudgetListResponse {
  @ApiProperty({ type: [BudgetViewDto], description: 'Budgets of the selected Simulation, newest first (the current one plus an active or failed recompute)' })
  budgets!: BudgetViewDto[];
}
