import {
  BadRequestException,
  createParamDecorator,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.types.js';
import { KITCHEN_DRAFT_REPOSITORY, type KitchenDraftRepository, type KitchenProjectRecord } from './kitchen-drafts.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OwnedProjectRequest extends AuthRequest {
  params: Record<string, string | undefined>;
  kitchenProject?: KitchenProjectRecord;
}

/**
 * Authorizes the owner routes `/kitchen-projects/:projectId/...` (feature login-gate-claim). It
 * runs after the global AuthGuard (401) and RolesGuard (403). A malformed id gives 400; a
 * project that is unknown, still a draft or owned by another Account gives the same generic
 * 404, so nobody can probe which projects exist. A database failure gives 503. Later features
 * (controlnet-render, budget-tier-computation) reuse it with {@link CurrentProject}.
 */
@Injectable()
export class OwnedProjectGuard implements CanActivate {
  private readonly logger = new Logger(OwnedProjectGuard.name);

  constructor(@Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnedProjectRequest>();
    const projectId = request.params.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) throw new BadRequestException();
    // AuthGuard guarantees the caller; without one nothing is owned.
    const sub = request.user?.sub;
    if (!sub) throw new NotFoundException();
    let project: KitchenProjectRecord | null;
    try {
      project = await this.repo.findOwned(projectId.toLowerCase(), sub);
    } catch (error) {
      this.logger.warn(`Project lookup failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
    if (!project) throw new NotFoundException();
    request.kitchenProject = project;
    return true;
  }
}

/** Injects the claimed project resolved by {@link OwnedProjectGuard}. */
export const CurrentProject = createParamDecorator((_data: unknown, context: ExecutionContext): KitchenProjectRecord => {
  const project = context.switchToHttp().getRequest<OwnedProjectRequest>().kitchenProject;
  if (!project) throw new NotFoundException();
  return project;
});
