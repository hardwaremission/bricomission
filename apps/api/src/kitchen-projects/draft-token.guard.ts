import {
  createParamDecorator,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { DRAFT_TOKEN_HEADER, hashDraftToken, isDraftTokenFormat } from './draft-token.js';
import { type Clock, KITCHEN_CLOCK } from './kitchen-projects.config.js';
import { KITCHEN_DRAFT_REPOSITORY, type KitchenDraftRecord, type KitchenDraftRepository } from './kitchen-drafts.repository.js';

interface DraftRequest {
  headers: Record<string, string | string[] | undefined>;
  kitchenDraft?: KitchenDraftRecord;
}

/**
 * Authorizes the anonymous kitchen draft routes (which are `@Public()` for the JWT guard).
 * The `X-Draft-Token` header must have the token format and hash to a `draft` row that has
 * not expired. Missing, malformed, unknown and expired tokens all give the same generic 404,
 * so nobody can probe which drafts exist. A database failure gives 503.
 */
@Injectable()
export class DraftTokenGuard implements CanActivate {
  private readonly logger = new Logger(DraftTokenGuard.name);

  constructor(
    @Inject(KITCHEN_DRAFT_REPOSITORY) private readonly repo: KitchenDraftRepository,
    @Inject(KITCHEN_CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DraftRequest>();
    const token = request.headers[DRAFT_TOKEN_HEADER];
    if (!isDraftTokenFormat(token)) throw new NotFoundException();
    let draft: KitchenDraftRecord | null;
    try {
      draft = await this.repo.findActiveByTokenHash(hashDraftToken(token), this.clock());
    } catch (error) {
      this.logger.warn(`Draft lookup failed (${error instanceof Error ? error.name : 'unknown'})`);
      throw new ServiceUnavailableException();
    }
    if (!draft) throw new NotFoundException();
    request.kitchenDraft = draft;
    return true;
  }
}

/** Injects the draft resolved by {@link DraftTokenGuard}. */
export const CurrentDraft = createParamDecorator(
  (_data: unknown, context: ExecutionContext): KitchenDraftRecord => {
    const draft = context.switchToHttp().getRequest<DraftRequest>().kitchenDraft;
    if (!draft) throw new NotFoundException();
    return draft;
  },
);
