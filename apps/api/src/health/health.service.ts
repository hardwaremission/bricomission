import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@bricomission/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';

/** Maximum time the database ping may take before it counts as down. */
export const DB_PING_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const up = await this.pingDatabase();
    return up ? { status: 'ok', database: 'up' } : { status: 'error', database: 'down' };
  }

  private async pingDatabase(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database ping timed out')), DB_PING_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch (error) {
      // Log the error class only: never leak messages that may embed connection details.
      this.logger.warn(`Database ping failed (${error instanceof Error ? error.name : 'unknown'})`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
