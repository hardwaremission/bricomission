import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { DIAGNOSTICS } from '../../src/diagnostics/diagnostics.types.js';
import { NullDiagnostics } from '../../src/diagnostics/null-diagnostics.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

describe('AppModule with DIAGNOSTICS_ENABLED unset (default)', () => {
  it('provides only NullDiagnostics and answers 404 on every diagnostics route', async () => {
    expect(process.env.DIAGNOSTICS_ENABLED ?? 'false').not.toBe('true');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn(), $disconnect: vi.fn() })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    try {
      const diagnostics = moduleRef.get(DIAGNOSTICS);
      expect(diagnostics).toBeInstanceOf(NullDiagnostics);
      expect(diagnostics.enabled).toBe(false);
      const server = app.getHttpServer();
      for (const path of ['/diagnostics/stream', '/diagnostics/topology']) {
        expect((await request(server).get(path).set('X-Diagnostics-Token', 'bm-diagnostics-dev-token')).status).toBe(404);
      }
      expect((await request(server).post('/diagnostics/ingest').send([])).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
