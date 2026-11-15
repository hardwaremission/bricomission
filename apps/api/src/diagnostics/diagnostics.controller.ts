import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { DiagnosticsEvent, DiagnosticsTopology } from '@bricomission/shared-types';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { DiagnosticsTokenGuard } from './diagnostics-token.guard.js';
import { DIAGNOSTICS_OPTIONS, type DiagnosticsOptions } from './diagnostics.types.js';
import { validateIngestEvent } from './event.js';
import type { RingEntry } from './ring-buffer.js';
import { buildTopology, topologyConfigFromEnv } from './topology.js';

export const MAX_INGEST_EVENTS = 100;
export const MAX_INGEST_BODY_BYTES = 256 * 1024;
/** A stream whose socket buffers more than this is a stuck client: it is closed and may reconnect. */
const MAX_PENDING_WRITE_BYTES = 4 * 1024 * 1024;

function frame(event: string, data: unknown, id?: number, retry?: number): string {
  let out = '';
  if (retry !== undefined) out += `retry: ${retry}\n`;
  if (id !== undefined) out += `id: ${id}\n`;
  return `${out}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function positiveInt(raw: unknown): number | undefined {
  return typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
}

/**
 * Diagnostics routes (stream, topology, ingest). Mounted only when diagnostics are enabled, hidden from
 * OpenAPI, `@Public()` (the Keycloak guard never applies; the shared token guard does).
 */
@Public()
@ApiExcludeController()
@UseGuards(DiagnosticsTokenGuard)
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    private readonly service: DiagnosticsService,
    @Inject(DIAGNOSTICS_OPTIONS) private readonly options: DiagnosticsOptions,
  ) {}

  /** Raw SSE (not `@Sse`): explicit ids, `hello` without an id, `: ping` comments, `retry: 500`. */
  @Get('stream')
  stream(@Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (chunk: string): void => {
      if (res.writableEnded || res.destroyed) return;
      res.write(chunk);
      if (res.writableLength > MAX_PENDING_WRITE_BYTES) res.end();
    };
    const send = (entry: RingEntry<DiagnosticsEvent>): void => write(frame('diagnostics', entry.value, entry.seq));

    const lastEventId = positiveInt(req.headers['last-event-id']) ?? 0;
    const replayN = positiveInt(req.query.replay);
    write(frame('hello', this.service.hello(), undefined, 500));
    // Replay and subscribe in the same tick: nothing can be emitted in between.
    for (const entry of this.service.replay(lastEventId, replayN)) send(entry);
    const unsubscribe = this.service.subscribe(send);
    const heartbeat = setInterval(() => write(': ping\n\n'), this.options.heartbeatMs);
    heartbeat.unref();

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  @Get('topology')
  topology(): DiagnosticsTopology {
    return buildTopology(topologyConfigFromEnv(this.options.env, this.service.bootId, this.options.adapters));
  }

  /** Events from the web BFF. Fire-and-forget on its side; every event is validated and re-redacted here. */
  @Post('ingest')
  @HttpCode(HttpStatus.NO_CONTENT)
  ingest(@Req() req: Request, @Body() body: unknown): void {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_INGEST_BODY_BYTES) throw new PayloadTooLargeException();
    if (!Array.isArray(body) || body.length === 0 || body.length > MAX_INGEST_EVENTS) {
      throw new BadRequestException(`body must be an array of 1 to ${MAX_INGEST_EVENTS} events`);
    }
    const now = this.options.now();
    const drafts = [];
    for (const raw of body) {
      const checked = validateIngestEvent(raw, now);
      if (!checked.ok) throw new BadRequestException(checked.error);
      drafts.push(checked.draft);
    }
    if (!this.service.allowIngest(drafts.length)) throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    for (const draft of drafts) this.service.ingest(draft);
  }
}
