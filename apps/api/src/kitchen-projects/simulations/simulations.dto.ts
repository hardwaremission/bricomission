import { ApiProperty } from '@nestjs/swagger';
import type {
  BudgetStatus,
  CreateSimulationResponse,
  SelectSimulationRequest,
  SelectSimulationResponse,
  SimulationListResponse,
  SimulationProgress,
  SimulationStage,
  SimulationStatus,
  SimulationStyleReference,
  SimulationStyleView,
  SimulationView,
  StyleBlendMode,
} from '@bricomission/shared-types';
import { RenderViewDto } from '../renders/renders.dto.js';

const STATUSES: SimulationStatus[] = ['active', 'succeeded', 'partial', 'failed'];
const STAGES: SimulationStage[] = ['describing', 'rendering', 'finished'];
const BLEND_MODES: StyleBlendMode[] = ['ip_adapter', 'vlm_text', 'both'];
const BUDGET_STATUSES: BudgetStatus[] = ['queued', 'running', 'succeeded', 'failed'];

export class SimulationProgressDto implements SimulationProgress {
  @ApiProperty({ type: 'integer', example: 3, description: 'Renders of the Simulation (one per Photo)' })
  total!: number;

  @ApiProperty({ type: 'integer' })
  succeeded!: number;

  @ApiProperty({ type: 'integer' })
  failed!: number;

  @ApiProperty({ type: 'integer', description: '1-based Render being generated ("n of N") while rendering, else 0' })
  current!: number;
}

export class SimulationStyleReferenceDto implements SimulationStyleReference {
  @ApiProperty({ enum: ['gallery', 'upload'] })
  kind!: 'gallery' | 'upload';

  @ApiProperty({ description: 'Style Gallery image id, or the Moodboard item id of an upload' })
  refId!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 100, description: 'Share of the blend; the shares of a Simulation sum to 100' })
  weightPercent!: number;
}

export class SimulationStyleViewDto implements SimulationStyleView {
  @ApiProperty({ type: [String], description: 'The strongest merged style terms (empty when the style is degraded)' })
  keywords!: string[];

  @ApiProperty({ type: [SimulationStyleReferenceDto] })
  references!: SimulationStyleReferenceDto[];
}

export class SimulationBudgetRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: BUDGET_STATUSES })
  status!: BudgetStatus;
}

/** A Simulation of an owned Kitchen Project. No seed, prompt, vision description, inventory or job id. */
export class SimulationViewDto implements SimulationView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Per project, never reused ("Simulation N")' })
  ordinal!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ enum: STATUSES, description: '`active` until finished, then `succeeded` (every Render), `partial` or `failed`' })
  status!: SimulationStatus;

  @ApiProperty({ enum: STAGES })
  stage!: SimulationStage;

  @ApiProperty({ type: SimulationProgressDto })
  progress!: SimulationProgressDto;

  @ApiProperty({ description: 'The project\'s selected Simulation (the one a Budget is computed for)' })
  selected!: boolean;

  @ApiProperty({ enum: BLEND_MODES, description: 'Blend mode copied from the platform setting at creation' })
  blendMode!: StyleBlendMode;

  @ApiProperty({ description: 'The vision step failed (or the Simulation was migrated): the text style is the dominant style only' })
  styleDegraded!: boolean;

  @ApiProperty({ type: SimulationStyleViewDto })
  style!: SimulationStyleViewDto;

  @ApiProperty({ type: [RenderViewDto], description: 'In Photo order' })
  renders!: RenderViewDto[];

  @ApiProperty({ type: SimulationBudgetRefDto, nullable: true, description: 'The current Budget of this Simulation, if any' })
  budget!: SimulationBudgetRefDto | null;
}

export class CreateSimulationResponseDto implements CreateSimulationResponse {
  @ApiProperty({ type: SimulationViewDto })
  simulation!: SimulationViewDto;
}

export class SimulationListResponseDto implements SimulationListResponse {
  @ApiProperty({ type: [SimulationViewDto], description: 'Newest first' })
  simulations!: SimulationViewDto[];
}

export class SelectSimulationRequestDto implements SelectSimulationRequest {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true, description: 'A finished Simulation with every Render succeeded, or null to clear the selection' })
  simulationId!: string | null;
}

export class SelectSimulationResponseDto implements SelectSimulationResponse {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  selectedSimulationId!: string | null;
}
