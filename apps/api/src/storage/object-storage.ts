import type { Readable } from 'node:stream';

/** Nest injection token of the {@link ObjectStorage} implementation. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * Private object storage (MinIO, S3-compatible). Keys are opaque paths inside one bucket.
 * Implementations throw {@link StorageUnavailableError} when the backend is unreachable or
 * fails, and {@link ObjectNotFoundError} for a missing key on read.
 */
export interface ObjectStorage {
  /** Creates the bucket when missing. Idempotent; implementations cache success per process. */
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<{ body: Readable; contentLength?: number }>;
  /** Deletes the keys; missing keys are not an error. */
  deleteMany(keys: readonly string[]): Promise<void>;
}

export class StorageUnavailableError extends Error {
  override readonly name = 'StorageUnavailableError';
}

export class ObjectNotFoundError extends Error {
  override readonly name = 'ObjectNotFoundError';
}
