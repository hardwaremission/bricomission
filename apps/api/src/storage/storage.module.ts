import { Global, Module } from '@nestjs/common';
import { DIAGNOSTICS, type Diagnostics } from '../diagnostics/diagnostics.types.js';
import { InstrumentedObjectStorage } from '../diagnostics/instrument/storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import { readStorageConfig } from './storage.config.js';

/**
 * Object storage for user media (MinIO bucket `S3_BUCKET`, default `bricomission-media`).
 * The client is created without any network call, so the API boots while MinIO is down.
 */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [{ token: DIAGNOSTICS, optional: true }],
      useFactory: (diagnostics?: Diagnostics): ObjectStorage => {
        const storage = new S3ObjectStorage(readStorageConfig());
        return diagnostics?.enabled ? new InstrumentedObjectStorage(storage, diagnostics) : storage;
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
