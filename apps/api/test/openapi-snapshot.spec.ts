import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOpenApiDocument } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Committed contract of the web client (packages/api-client). Regenerate with
// `pnpm --filter @bricomission/api openapi:export`, then
// `pnpm --filter @bricomission/api-client generate`.
const SNAPSHOT = fileURLToPath(new URL('../../../packages/api-client/openapi.json', import.meta.url));

describe('OpenAPI snapshot (packages/api-client/openapi.json)', () => {
  it('matches the document the API serves at /docs-json', async () => {
    // Debug routes are opt-in and must never enter the published contract.
    expect(process.env.GPU_BROKER_DEBUG_ENDPOINTS ?? 'false').not.toBe('true');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    try {
      // JSON round-trip drops undefined fields, exactly like the served /docs-json.
      const document: unknown = JSON.parse(JSON.stringify(createOpenApiDocument(app)));
      if (process.env.UPDATE_OPENAPI_SNAPSHOT === '1') {
        writeFileSync(SNAPSHOT, `${JSON.stringify(document, null, 2)}\n`);
      }
      const committed: unknown = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
      expect(committed, 'OpenAPI drift: run `pnpm --filter @bricomission/api openapi:export`').toEqual(document);
    } finally {
      await app.close();
    }
  });
});
