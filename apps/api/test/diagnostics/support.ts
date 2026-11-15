import 'reflect-metadata';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../../src/auth/auth.module.js';
import { KEY_RESOLVER } from '../../src/auth/token-verifier.service.js';
import { DiagnosticsModule, type DiagnosticsModuleOptions } from '../../src/diagnostics/diagnostics.module.js';
import { DiagnosticsService } from '../../src/diagnostics/diagnostics.service.js';
import { configureApp } from '../../src/app.setup.js';
import { createTestKeys, type TestKeys } from '../support/tokens.js';

export const TOKEN = 'test-diagnostics-token-123';

export interface DiagnosticsTestApp {
  app: INestApplication;
  keys: TestKeys;
  port: number;
  service: DiagnosticsService | undefined;
}

/** Nest app with the default-deny AuthModule and the diagnostics module (no database needed). */
export async function createDiagnosticsApp(options: DiagnosticsModuleOptions): Promise<DiagnosticsTestApp> {
  const keys = await createTestKeys('kc-diagnostics-key');
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, DiagnosticsModule.register({ token: TOKEN, ...options, env: options.env ?? {} })] })
    .overrideProvider(KEY_RESOLVER)
    .useValue(keys.resolver)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  let service: DiagnosticsService | undefined;
  try {
    service = moduleRef.get(DiagnosticsService, { strict: false });
  } catch {
    service = undefined; // module off: the service is not provided
  }
  return { app, keys, port, service };
}

export interface SseFrame {
  id?: string;
  event?: string;
  retry?: string;
  data?: unknown;
  comment?: string;
}

export interface OpenStream {
  status: number;
  headers: http.IncomingHttpHeaders;
  frames: SseFrame[];
  waitFor(predicate: (frames: SseFrame[]) => boolean, timeoutMs?: number): Promise<SseFrame[]>;
  close(): void;
}

function parseFrame(block: string): SseFrame | undefined {
  const frame: SseFrame = {};
  let any = false;
  for (const line of block.split('\n')) {
    if (line === '') continue;
    any = true;
    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trim();
      continue;
    }
    const idx = line.indexOf(':');
    const field = line.slice(0, idx);
    const value = line.slice(idx + 1).trimStart();
    if (field === 'data') frame.data = JSON.parse(value);
    else if (field === 'id' || field === 'event' || field === 'retry') frame[field] = value;
  }
  return any ? frame : undefined;
}

/** Opens `GET /diagnostics/stream` and collects parsed SSE frames until closed. */
export function openStream(port: number, headers: Record<string, string> = {}, path = '/diagnostics/stream'): Promise<OpenStream> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const frames: SseFrame[] = [];
      const waiters: Array<() => void> = [];
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let cut = buffer.indexOf('\n\n');
        while (cut >= 0) {
          const frame = parseFrame(buffer.slice(0, cut));
          if (frame) frames.push(frame);
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf('\n\n');
        }
        for (const wake of waiters.splice(0)) wake();
      });
      res.on('error', () => undefined);
      const stream: OpenStream = {
        status: res.statusCode ?? 0,
        headers: res.headers,
        frames,
        close: () => req.destroy(),
        waitFor: (predicate, timeoutMs = 3000) =>
          new Promise((resolveWait, rejectWait) => {
            const timer = setTimeout(() => rejectWait(new Error(`timeout; frames: ${JSON.stringify(frames).slice(0, 400)}`)), timeoutMs);
            const check = (): void => {
              if (predicate(frames)) {
                clearTimeout(timer);
                resolveWait(frames);
              } else waiters.push(check);
            };
            check();
          }),
      };
      resolve(stream);
    });
    req.on('error', reject);
  });
}
