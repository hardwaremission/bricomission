/** S3/MinIO settings from env. Admin-editable credentials arrive with admin-service-endpoints. */
export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const DEFAULT_S3_BUCKET = 'bricomission-media';

export function readStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    endpoint: env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    region: env.S3_REGION || 'us-east-1',
    accessKeyId: env.S3_ACCESS_KEY ?? '',
    secretAccessKey: env.S3_SECRET_KEY ?? '',
    bucket: env.S3_BUCKET || DEFAULT_S3_BUCKET,
  };
}
