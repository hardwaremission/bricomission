import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../../src/auth/auth.decorators.js';
import { createOpenApiDocument } from '../../src/app.setup.js';
import { DiagnosticsController } from '../../src/diagnostics/diagnostics.controller.js';
import { signToken } from '../support/tokens.js';
import { createDiagnosticsApp, type DiagnosticsTestApp, TOKEN } from './support.js';

const ROUTES: Array<['get' | 'post', string]> = [
  ['get', '/diagnostics/stream'],
  ['get', '/diagnostics/topology'],
  ['post', '/diagnostics/ingest'],
];

describe('diagnostics module off (disabled, short token, no flag)', () => {
  it.each([
    ['disabled flag', { enabled: false }],
    ['token under 16 characters', { enabled: true, token: 'short-token-15ch'.slice(0, 15) }],
    ['empty token', { enabled: true, token: '' }],
  ])('every route is a plain 404 (%s)', async (_name, options) => {
    const { app } = await createDiagnosticsApp(options);
    try {
      for (const [method, path] of ROUTES) {
        const res = await request(app.getHttpServer())[method](path).set('X-Diagnostics-Token', TOKEN).send([]);
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    } finally {
      await app.close();
    }
  });

  it('is off by default when the env has no flag (nothing installed)', async () => {
    const { app } = await createDiagnosticsApp({ enabled: undefined, token: undefined, env: {} });
    try {
      expect((await request(app.getHttpServer()).get('/diagnostics/topology')).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('diagnostics token guard (enabled)', () => {
  let t: DiagnosticsTestApp;
  beforeAll(async () => {
    t = await createDiagnosticsApp({ enabled: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  const server = () => t.app.getHttpServer();

  it.each(ROUTES)('%s %s: no token, wrong token and a query-string token give a generic 401', async (method, path) => {
    const sends = [
      request(server())[method](path).send([]),
      request(server())[method](path).set('X-Diagnostics-Token', 'wrong-token-wrong-token').send([]),
      request(server())[method](path).set('X-Diagnostics-Token', '').send([]),
      request(server())[method](`${path}?token=${TOKEN}&x-diagnostics-token=${TOKEN}`).send([]),
      request(server())[method](path).set('Authorization', `Bearer ${TOKEN}`).send([]),
    ];
    for (const res of await Promise.all(sends)) {
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBeUndefined();
      expect(JSON.stringify(res.body)).toBe(JSON.stringify({ message: 'Unauthorized', statusCode: 401 }));
      expect(JSON.stringify(res.body) + res.text).not.toContain(TOKEN);
    }
  });

  it('a valid Keycloak JWT (any role) does not open the routes', async () => {
    for (const roles of [['user'], ['professional'], ['admin']] as const) {
      const jwt = await signToken(t.keys, { roles: [...roles] });
      for (const [method, path] of ROUTES) {
        const res = await request(server())[method](path).set('Authorization', `Bearer ${jwt}`).send([]);
        expect(res.status, `${roles[0]} ${method} ${path}`).toBe(401);
      }
    }
  });

  it('a token that differs only in length or case is rejected, the right header opens', async () => {
    for (const bad of [TOKEN.toUpperCase(), `${TOKEN}x`, TOKEN.slice(0, -1)]) {
      expect((await request(server()).get('/diagnostics/topology').set('X-Diagnostics-Token', bad)).status).toBe(401);
    }
    expect((await request(server()).get('/diagnostics/topology').set('X-Diagnostics-Token', TOKEN)).status).toBe(200);
  });

  it('the controller is @Public (never accepts a JWT) and every handler needs the guard', () => {
    const reflector = new Reflector();
    expect(reflector.get(IS_PUBLIC_KEY, DiagnosticsController)).toBe(true);
    const guards = Reflect.getMetadata('__guards__', DiagnosticsController) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual(['DiagnosticsTokenGuard']);
    const handlers = Object.getOwnPropertyNames(DiagnosticsController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(['ingest', 'stream', 'topology']);
  });

  it('default-deny still holds for everything else: another route needs a JWT, not the diagnostics token', async () => {
    const res = await request(server()).get('/me').set('X-Diagnostics-Token', TOKEN);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });

  it('keeps the diagnostics routes out of the OpenAPI document', () => {
    const document = createOpenApiDocument(t.app);
    expect(Object.keys(document.paths).filter((p) => p.includes('diagnostics'))).toEqual([]);
    expect(JSON.stringify(document)).not.toContain('diagnostics');
  });
});

