import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { ObjectStorage } from './object-storage.js';
import { ObjectNotFoundError, StorageUnavailableError } from './object-storage.js';
import type { StorageConfig } from './storage.config.js';

/** DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

/**
 * {@link ObjectStorage} over `@aws-sdk/client-s3` (path-style, MinIO). The bucket is private
 * (no policy is ever set) and created lazily on first use. Every SDK failure becomes a
 * StorageUnavailableError whose message is the SDK error class only (no hosts, no keys).
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly config: StorageConfig,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        // Only send/verify checksums when an operation requires them (MinIO compatibility).
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 2000, requestTimeout: 15000 },
      });
  }

  ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.createBucketIfMissing().catch((error: unknown) => {
        this.bucketReady = null;
        throw error;
      });
    }
    return this.bucketReady;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.call(() =>
      this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length })),
    );
  }

  async getStream(key: string): Promise<{ body: Readable; contentLength?: number }> {
    const out = await this.call(() => this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key })));
    if (!(out.Body instanceof Readable)) throw new StorageUnavailableError('UnexpectedBody');
    return { body: out.Body, contentLength: out.ContentLength };
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      const out = await this.call(() =>
        this.client.send(
          new DeleteObjectsCommand({ Bucket: this.config.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
        ),
      );
      if (out.Errors && out.Errors.length > 0) throw new StorageUnavailableError(`DeleteObjectsError:${out.Errors[0]?.Code ?? 'unknown'}`);
    }
  }

  private async createBucketIfMissing(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return;
    } catch (error) {
      if (!isStatus(error, 404)) throw toStorageError(error);
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      // Another process may have created it in between.
      if (error instanceof S3ServiceException && ['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)) return;
      throw toStorageError(error);
    }
  }

  private async call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toStorageError(error);
    }
  }
}

function isStatus(error: unknown, status: number): boolean {
  return error instanceof S3ServiceException && error.$metadata?.httpStatusCode === status;
}

function toStorageError(error: unknown): Error {
  if (error instanceof StorageUnavailableError || error instanceof ObjectNotFoundError) return error;
  if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || isStatus(error, 404))) return new ObjectNotFoundError(error.name);
  return new StorageUnavailableError(error instanceof Error ? error.name : 'unknown');
}
