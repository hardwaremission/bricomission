import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_BLEND_MODE, PlatformSettingsService } from '../../src/platform-settings/platform-settings.service.js';
import { createKitchenApp, type KitchenApp } from '../support/kitchen-app.js';
import { MemoryPlatformSettingRepository } from '../support/memory-platform-setting-repository.js';

const ADMIN_SUB = 'b0e2a1c4-0000-4000-8000-0000000000ad';

describe('platform settings: style blend mode (Decision 2, Scenario 6)', () => {
  it('reads both when the row is missing, invalid or unreadable', async () => {
    const repo = new MemoryPlatformSettingRepository();
    const service = new PlatformSettingsService(repo);
    expect(DEFAULT_STYLE_BLEND_MODE).toBe('both');
    expect(await service.getStyleBlendMode()).toBe('both');
    for (const value of [{ mode: 'nope' }, 'x', 5, null, {}, { mode: 3 }]) {
      repo.rows.set('style_blend_mode', { key: 'style_blend_mode', value, updatedAt: new Date(), updatedBy: null });
      expect(await service.getStyleBlendMode(), JSON.stringify(value)).toBe('both');
    }
    repo.failNext = new Error('db down');
    expect(await service.getStyleBlendMode()).toBe('both');
  });

  it('reads every valid stored mode and writes with the actor', async () => {
    const repo = new MemoryPlatformSettingRepository();
    const service = new PlatformSettingsService(repo);
    for (const mode of ['ip_adapter', 'vlm_text', 'both'] as const) {
      await service.setStyleBlendMode(mode, ADMIN_SUB, new Date('2026-11-15T10:00:00.000Z'));
      expect(await service.getStyleBlendMode()).toBe(mode);
    }
    expect(repo.rows.get('style_blend_mode')).toMatchObject({ value: { mode: 'both' }, updatedBy: ADMIN_SUB });
  });

  describe('admin routes', () => {
    let k: KitchenApp;
    afterEach(async () => {
      await k?.app.close();
    });
    const path = '/admin/settings/style-blend';

    it('GET and PUT are admin-only; PUT validates the mode and persists it', async () => {
      k = await createKitchenApp();
      const admin = `Bearer ${await k.token(ADMIN_SUB, ['admin'])}`;
      expect((await k.http().get(path)).status).toBe(401);
      expect((await k.http().put(path).send({ mode: 'vlm_text' })).status).toBe(401);
      for (const roles of [['user'], ['professional']]) {
        const bearer = `Bearer ${await k.token(ADMIN_SUB, roles)}`;
        expect((await k.http().get(path).set('Authorization', bearer)).status, `get ${roles}`).toBe(403);
        expect((await k.http().put(path).set('Authorization', bearer).send({ mode: 'vlm_text' })).status, `put ${roles}`).toBe(403);
      }
      expect(k.platformSettings.rows.size).toBe(0);
      expect((await k.http().get(path).set('Authorization', admin)).body).toEqual({ mode: 'both' });
      for (const body of [{}, { mode: 'nope' }, { mode: 3 }, { mode: null }, []]) {
        expect((await k.http().put(path).set('Authorization', admin).send(body as object)).status, JSON.stringify(body)).toBe(400);
      }
      expect(k.platformSettings.rows.size).toBe(0);
      const put = await k.http().put(path).set('Authorization', admin).send({ mode: 'vlm_text' });
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ mode: 'vlm_text' });
      expect((await k.http().get(path).set('Authorization', admin)).body).toEqual({ mode: 'vlm_text' });
      expect(k.platformSettings.rows.get('style_blend_mode')).toMatchObject({ value: { mode: 'vlm_text' }, updatedBy: ADMIN_SUB });
    });

    it('OpenAPI: documented as bearer-only admin routes', async () => {
      k = await createKitchenApp();
      const doc = (await k.http().get('/docs-json')).body;
      for (const method of ['get', 'put'] as const) {
        const op = doc.paths[path][method];
        expect(op.security).toEqual([{ bearer: [] }]);
        expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '401', '403']));
      }
      expect(Object.keys(doc.paths[path].put.responses)).toContain('400');
    });
  });
});
