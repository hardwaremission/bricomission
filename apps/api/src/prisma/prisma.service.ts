import { Inject, Injectable, Logger, type OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { currentCorrelationId } from '../diagnostics/correlation.js';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { type PrismaQueryEvent, PrismaQueryReporter } from '../diagnostics/instrument/prisma.js';

/**
 * Prisma client for the whole API. It connects lazily on the first query, so the
 * app boots even when PostgreSQL is unreachable; `/health` reports that state.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() @Inject(DIAGNOSTICS) diagnostics?: Diagnostics) {
    const traced = diagnostics?.enabled === true;
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 2000,
      }),
      // Query events only when diagnostics are on: nothing is subscribed otherwise.
      ...(traced ? { log: [{ emit: 'event' as const, level: 'query' as const }] } : {}),
    });
    if (traced) {
      const reporter = new PrismaQueryReporter(diagnostics, currentCorrelationId);
      (this as unknown as { $on(event: 'query', listener: (e: PrismaQueryEvent) => void): void }).$on('query', (event) => reporter.report(event));
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {
      this.logger.warn('Prisma disconnect failed during shutdown');
    }
  }
}
