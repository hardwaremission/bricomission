import { describe, expect, it } from 'vitest';
import { errorCodeForStatus, isRetryable, MOODBOARD_UPLOAD_URL, PHOTO_ACCEPT, precheckPhoto, uploadPhoto } from '../src/lib/kitchen-draft/upload';

const MB = 1024 * 1024;

describe('precheckPhoto', () => {
  it.each([
    [{ size: 1 * MB, type: 'image/jpeg', name: 'a.jpg' }, null],
    [{ size: 1 * MB, type: 'image/png', name: 'a.png' }, null],
    [{ size: 1 * MB, type: 'image/webp', name: 'a.webp' }, null],
    [{ size: 1 * MB, type: 'image/heic', name: 'a.heic' }, null],
    [{ size: 1 * MB, type: 'image/heif', name: 'a.heif' }, null],
    [{ size: 1 * MB, type: '', name: 'IMG_0001.HEIC' }, null],
    [{ size: 1 * MB, type: 'application/octet-stream', name: 'IMG_0001.heif' }, null],
    [{ size: 1 * MB, type: '', name: 'notes.txt' }, 'photo_unsupported_type'],
    [{ size: 1 * MB, type: 'image/gif', name: 'a.gif' }, 'photo_unsupported_type'],
    [{ size: 15 * MB, type: 'image/jpeg', name: 'a.jpg' }, null],
    [{ size: 15 * MB + 1, type: 'image/jpeg', name: 'a.jpg' }, 'photo_too_large'],
    [{ size: 16 * MB, type: 'image/heic', name: 'a.heic' }, 'photo_too_large'],
  ])('%j -> %s', (file, expected) => {
    expect(precheckPhoto(file)).toBe(expected);
  });

  it('the picker accepts JPEG, PNG, WebP and HEIC/HEIF', () => {
    expect(PHOTO_ACCEPT).toBe('image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif');
  });
});

describe('error mapping', () => {
  it.each([
    [413, undefined, 'photo_too_large'],
    [415, undefined, 'photo_unsupported_type'],
    [422, undefined, 'photo_too_small'],
    [409, undefined, 'photo_limit_reached'],
    [409, 'moodboard_limit_reached', 'moodboard_limit_reached'],
    [503, undefined, 'storage_unavailable'],
    [503, 'storage_unavailable', 'storage_unavailable'],
    [404, undefined, 'draft_missing'],
    [502, undefined, 'network'],
    [0, undefined, 'network'],
    [500, undefined, 'failed'],
    [400, 'photo_missing', 'failed'],
  ])('%i %s -> %s', (status, code, expected) => {
    expect(errorCodeForStatus(status, code)).toBe(expected);
  });

  it('Retry only where it can help', () => {
    expect(isRetryable('storage_unavailable')).toBe(true);
    expect(isRetryable('failed')).toBe(true);
    expect(isRetryable('photo_too_large')).toBe(false);
    expect(isRetryable('photo_unsupported_type')).toBe(false);
    expect(isRetryable('photo_too_small')).toBe(false);
  });
});

/** Minimal XMLHttpRequest stand-in driven by the test. */
class FakeXhr {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  responseType = '';
  method = '';
  url = '';
  body: unknown = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
}

describe('uploadPhoto', () => {
  it('posts multipart field photo, reports progress, then the created photo', async () => {
    const xhr = new FakeXhr();
    const progress: number[] = [];
    let uploaded = false;
    const pending = uploadPhoto(new Blob(['x']), { createXhr: () => xhr as unknown as XMLHttpRequest, onProgress: (p) => progress.push(p), onUploaded: () => (uploaded = true) });
    expect([xhr.method, xhr.url]).toEqual(['POST', '/api/kitchen-projects/drafts/current/photos']);
    expect((xhr.body as FormData).get('photo')).toBeInstanceOf(Blob);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 62, total: 100 });
    xhr.upload.onload?.();
    xhr.status = 201;
    xhr.responseText = JSON.stringify({ id: 'p1', position: 0 });
    xhr.onload?.();
    expect(await pending).toEqual({ ok: true, photo: { id: 'p1', position: 0 } });
    expect(progress).toEqual([62, 100]);
    expect(uploaded).toBe(true);
  });

  it('maps error bodies and network errors', async () => {
    const xhr = new FakeXhr();
    const pending = uploadPhoto(new Blob(['x']), { createXhr: () => xhr as unknown as XMLHttpRequest });
    xhr.status = 415;
    xhr.responseText = JSON.stringify({ code: 'photo_unsupported_type' });
    xhr.onload?.();
    expect(await pending).toEqual({ ok: false, code: 'photo_unsupported_type' });

    const offline = new FakeXhr();
    const pending2 = uploadPhoto(new Blob(['x']), { createXhr: () => offline as unknown as XMLHttpRequest });
    offline.onerror?.();
    expect(await pending2).toEqual({ ok: false, code: 'network' });
  });

  it('posts to another target when given (Moodboard references) and returns its 201 body', async () => {
    const xhr = new FakeXhr();
    const pending = uploadPhoto<{ id: string; source: string }>(new Blob(['x']), {
      createXhr: () => xhr as unknown as XMLHttpRequest,
      url: MOODBOARD_UPLOAD_URL,
    });
    expect([xhr.method, xhr.url]).toEqual(['POST', '/api/kitchen-projects/drafts/current/moodboard/uploads']);
    expect((xhr.body as FormData).get('photo')).toBeInstanceOf(Blob);
    xhr.status = 201;
    xhr.responseText = JSON.stringify({ id: 'm1', source: 'upload' });
    xhr.onload?.();
    expect(await pending).toEqual({ ok: true, photo: { id: 'm1', source: 'upload' } });
  });

  it('maps the Moodboard limit code', async () => {
    const xhr = new FakeXhr();
    const pending = uploadPhoto(new Blob(['x']), { createXhr: () => xhr as unknown as XMLHttpRequest, url: MOODBOARD_UPLOAD_URL });
    xhr.status = 409;
    xhr.responseText = JSON.stringify({ code: 'moodboard_limit_reached' });
    xhr.onload?.();
    expect(await pending).toEqual({ ok: false, code: 'moodboard_limit_reached' });
  });
});
