import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { errors } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { KEY_RESOLVER } from '../src/auth/token-verifier.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestKeys, signToken, unsignedToken } from './support/tokens.js';
import type { TestKeys } from './support/tokens.js';

// DB-free, Keycloak-free HTTP tests: KEY_RESOLVER is a local JWKS from a generated RS256
// key pair, or a failing resolver standing in for an unreachable Keycloak.
const queryRaw = vi.fn<() => Promise<unknown>>();
let keys: TestKeys;
let resolverFailure: Error | undefined;
const resolver: JWTVerifyGetKey = (header, token) =>
  resolverFailure ? Promise.reject(resolverFailure) : keys.resolver(header, token);

describe('HTTP auth: /me, /admin/ping and the global guards', () => {
  let app: INestApplication;
  let foreign: TestKeys;

  beforeAll(async () => {
    keys = await createTestKeys('kc-test-key');
    foreign = await createTestKeys('kc-other-key');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw, $disconnect: vi.fn() })
      .overrideProvider(KEY_RESOLVER)
      .useValue(resolver)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  describe('GET /admin/ping', () => {
    it('without a token gives 401 with WWW-Authenticate: Bearer', async () => {
      const res = await get('/admin/ping');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer realm="BricoMission"');
    });

    it('with a user token gives 403', async () => {
      const res = await get('/admin/ping', await signToken(keys, { roles: ['user'] }));
      expect(res.status).toBe(403);
      expect(res.headers['www-authenticate']).toBeUndefined();
    });

    it('with a professional token gives 403', async () => {
      const res = await get('/admin/ping', await signToken(keys, { roles: ['professional'] }));
      expect(res.status).toBe(403);
    });

    it('with an admin token gives 200 {"status":"ok"}', async () => {
      const res = await get('/admin/ping', await signToken(keys, { roles: ['admin'] }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /me', () => {
    it('with a user token gives 200 {sub, username, email, roles}', async () => {
      const res = await get('/me', await signToken(keys, { roles: ['user', 'offline_access'] }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sub: 'b0e2a1c4-0000-4000-8000-000000000001',
        username: 'bm-homeowner',
        email: 'homeowner@bricomission.local',
        roles: ['user'],
      });
    });

    it('without a token gives 401', async () => {
      const res = await get('/me');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer realm="BricoMission"');
    });
  });

  describe('invalid tokens give 401 without leaking details', () => {
    it.each([
      ['expired', () => signToken(keys, { roles: ['admin'], expiresIn: -60 })],
      ['wrong iss', () => signToken(keys, { roles: ['admin'], claims: { iss: 'http://evil.example/realms/BricoMission' } })],
      ['wrong aud', () => signToken(keys, { roles: ['admin'], claims: { aud: 'some-other-client' } })],
      ['signed by another key', () => signToken(foreign, { roles: ['admin'], kid: 'kc-test-key' })],
      ['alg none', () => Promise.resolve(unsignedToken(['admin']))],
      ['malformed', () => Promise.resolve('abc.def.ghi')],
    ])('%s', async (_case, make) => {
      const token = await make();
      const res = await get('/admin/ping', token);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer realm="BricoMission"');
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expect(res.text).not.toContain(token.split('.')[1] || token);
    });

    it('non-Bearer scheme', async () => {
      const token = await signToken(keys, { roles: ['admin'] });
      const res = await request(app.getHttpServer()).get('/admin/ping').set('Authorization', `Basic ${token}`);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer realm="BricoMission"');
    });
  });

  describe('key resolver failures give 503', () => {
    it.each([
      ['JWKS timeout', new errors.JWKSTimeout()],
      ['JWKS unreachable', new TypeError('fetch failed: connect ECONNREFUSED keycloak:8080 secret-detail')],
    ])('%s', async (_case, failure) => {
      const token = await signToken(keys, { roles: ['admin'] });
      resolverFailure = failure;
      try {
        const res = await get('/admin/ping', token);
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ message: 'Service Unavailable', statusCode: 503 });
        expect(res.text).not.toMatch(/secret-detail|ECONNREFUSED|timed out/);
      } finally {
        resolverFailure = undefined;
      }
    });
  });

  describe('public routes', () => {
    it('GET /health returns 200 without a token', async () => {
      queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });

    it('GET /docs-json declares bearer security on /me and /admin/ping with 401/403', async () => {
      const res = await get('/docs-json');
      expect(res.status).toBe(200);
      expect(res.body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
      const me = res.body.paths['/me'].get;
      const ping = res.body.paths['/admin/ping'].get;
      expect(me.security).toEqual([{ bearer: [] }]);
      expect(ping.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(me.responses)).toEqual(expect.arrayContaining(['200', '401']));
      expect(Object.keys(ping.responses)).toEqual(expect.arrayContaining(['200', '401', '403']));
      expect(res.body.paths['/health'].get.security).toBeUndefined();
    });
  });
});
