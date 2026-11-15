import type { Readable } from 'node:stream';
import type { ObjectStorage } from '../../storage/object-storage.js';
import type { Diagnostics } from '../diagnostics.types.js';
import { errorLabel } from './llm.js';

/** Decorates object storage (node `storage-client` > `minio`, kind `object`): key, bytes and ms, never the body. */
export class InstrumentedObjectStorage implements ObjectStorage {
  constructor(
    private readonly inner: ObjectStorage,
    private readonly diagnostics: Diagnostics,
  ) {}

  ensureBucket(): Promise<void> {
    return this.inner.ensureBucket();
  }

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.run(`PUT ${key}`, { op: 'put', key, bytes: body.length, contentType }, () => this.inner.put(key, body, contentType));
  }

  async getStream(key: string): Promise<{ body: Readable; contentLength?: number }> {
    return this.run(`GET ${key}`, { op: 'get', key }, async () => {
      const result = await this.inner.getStream(key);
      return result;
    });
  }

  deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return this.inner.deleteMany(keys);
    return this.run(`deleteMany (${keys.length} key${keys.length === 1 ? '' : 's'})`, { op: 'deleteMany', count: keys.length, keys: keys.slice(0, 20) }, () => this.inner.deleteMany(keys));
  }

  private async run<T>(summary: string, payload: Record<string, unknown>, call: () => Promise<T>): Promise<T> {
    const span = this.diagnostics.span({ from: 'storage-client', to: 'minio', kind: 'object', summary, payload });
    try {
      const result = await call();
      span.end({ payload, ok: true });
      return result;
    } catch (error) {
      span.end({ summary: `failed (${errorLabel(error)})`, payload, ok: false });
      throw error;
    }
  }
}
