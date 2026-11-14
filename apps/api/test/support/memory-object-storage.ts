import { Readable } from 'node:stream';
import { ObjectNotFoundError, type ObjectStorage, StorageUnavailableError } from '../../src/storage/object-storage.js';

/** In-memory ObjectStorage for DB-free tests. `down = true` simulates MinIO being unreachable. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  down = false;
  bucketChecks = 0;

  async ensureBucket(): Promise<void> {
    this.bucketChecks++;
    this.assertUp();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async getStream(key: string): Promise<{ body: Readable; contentLength?: number }> {
    this.assertUp();
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError('NoSuchKey');
    return { body: Readable.from([object.body]), contentLength: object.body.length };
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    this.assertUp();
    for (const key of keys) this.objects.delete(key);
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  private assertUp() {
    if (this.down) throw new StorageUnavailableError('TimeoutError');
  }
}
