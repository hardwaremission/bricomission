import { Global, Module } from '@nestjs/common';
import { OBJECT_STORAGE } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import { readStorageConfig } from './storage.config.js';

/**
 * Object storage for user media (MinIO bucket `S3_BUCKET`, default `bricomission-media`).
 * The client is created without any network call, so the API boots while MinIO is down.
 */
@Global()
@Module({
  providers: [{ provide: OBJECT_STORAGE, useFactory: () => new S3ObjectStorage(readStorageConfig()) }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
