import { type DynamicModule, Inject, Logger, type MiddlewareConsumer, Module, type NestModule, Optional, RequestMethod } from '@nestjs/common';
import { correlationMiddleware } from './correlation.js';
import { createHttpEntryMiddleware } from './http-entry.js';
import { DiagnosticsController } from './diagnostics.controller.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { DiagnosticsTokenGuard } from './diagnostics-token.guard.js';
import { DIAGNOSTICS, DIAGNOSTICS_OPTIONS, type Diagnostics, type DiagnosticsOptions, MIN_TOKEN_LENGTH } from './diagnostics.types.js';
import { NullDiagnostics } from './null-diagnostics.js';

export interface DiagnosticsModuleOptions {
  /** Default: `DIAGNOSTICS_ENABLED === 'true'`. */
  enabled?: boolean;
  /** Default: `DIAGNOSTICS_TOKEN`. Shorter than 16 characters keeps the module off. */
  token?: string;
  adapters?: 'fake' | 'local';
  bufferSize?: number;
  bufferMaxMb?: number;
  heartbeatMs?: number;
  ingestPerSecond?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

const DEFAULT_BUFFER_SIZE = 1000;
const DEFAULT_BUFFER_MAX_MB = 32;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_INGEST_PER_SECOND = 200;

function positive(raw: string | undefined, fallback: number): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) && Number(raw.trim()) > 0 ? Number(raw.trim()) : fallback;
}

/**
 * Diagnostics bus (feature diagnostics-dashboard). Off unless `DIAGNOSTICS_ENABLED=true` and
 * `DIAGNOSTICS_TOKEN` has at least 16 characters: then every `/diagnostics/*` route is a plain 404, no
 * middleware is mounted and `NullDiagnostics` is the only provider (nothing is installed).
 */
@Module({})
export class DiagnosticsModule implements NestModule {
  constructor(
    @Optional() @Inject(DIAGNOSTICS_OPTIONS) private readonly options?: DiagnosticsOptions,
    @Optional() @Inject(DIAGNOSTICS) private readonly diagnostics?: Diagnostics,
  ) {}

  static register(options: DiagnosticsModuleOptions = {}): DynamicModule {
    const env = options.env ?? process.env;
    const wanted = options.enabled ?? env.DIAGNOSTICS_ENABLED === 'true';
    const token = options.token ?? env.DIAGNOSTICS_TOKEN ?? '';
    if (!wanted || token.length < MIN_TOKEN_LENGTH) {
      if (wanted) {
        new Logger(DiagnosticsModule.name).warn(`DIAGNOSTICS_ENABLED is true but DIAGNOSTICS_TOKEN has fewer than ${MIN_TOKEN_LENGTH} characters: diagnostics stay off`);
      }
      return {
        module: DiagnosticsModule,
        global: true,
        providers: [{ provide: DIAGNOSTICS, useValue: new NullDiagnostics() }],
        exports: [DIAGNOSTICS],
      };
    }
    const resolved: DiagnosticsOptions = {
      token,
      adapters: options.adapters ?? (env.AI_ADAPTERS === 'local' ? 'local' : 'fake'),
      bufferSize: options.bufferSize ?? positive(env.DIAGNOSTICS_BUFFER_SIZE, DEFAULT_BUFFER_SIZE),
      bufferMaxBytes: (options.bufferMaxMb ?? positive(env.DIAGNOSTICS_BUFFER_MAX_MB, DEFAULT_BUFFER_MAX_MB)) * 1024 * 1024,
      heartbeatMs: options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
      ingestPerSecond: options.ingestPerSecond ?? DEFAULT_INGEST_PER_SECOND,
      env,
      now: options.now ?? (() => Date.now()),
    };
    return {
      module: DiagnosticsModule,
      global: true,
      controllers: [DiagnosticsController],
      providers: [
        { provide: DIAGNOSTICS_OPTIONS, useValue: resolved },
        DiagnosticsService,
        DiagnosticsTokenGuard,
        { provide: DIAGNOSTICS, useExisting: DiagnosticsService },
      ],
      exports: [DIAGNOSTICS, DiagnosticsService],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    if (!this.options || !this.diagnostics) return;
    consumer.apply(correlationMiddleware, createHttpEntryMiddleware(this.diagnostics)).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
