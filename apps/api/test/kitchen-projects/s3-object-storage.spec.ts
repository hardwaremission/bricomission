import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectNotFoundError, StorageUnavailableError } from '../../src/storage/object-storage.js';
import { S3ObjectStorage } from '../../src/storage/s3-object-storage.js';

const BUCKET = 'test-media';

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// A minimal path-style S3 stub on 127.0.0.1:0 (no MinIO, no network).
describe('S3ObjectStorage against a local S3 stub', () => {
  let server: Server;
  let endpoint: string;
  let bucketExists = false;
  const objects = new Map<string, { body: Buffer; type: string }>();
  const calls: string[] = [];

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const [, bucket, ...rest] = url.pathname.split('/');
      const key = decodeURIComponent(rest.join('/'));
      calls.push(`${req.method} ${url.pathname}${url.search}`);
      const body = await readBody(req);
      if (bucket !== BUCKET) return res.writeHead(400).end();
      if (!key && req.method === 'HEAD') return res.writeHead(bucketExists ? 200 : 404).end();
      if (!key && req.method === 'PUT') {
        bucketExists = true;
        return res.writeHead(200).end();
      }
      if (!key && req.method === 'POST' && url.searchParams.has('delete')) {
        for (const match of body.toString('utf8').matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(match[1] ?? '');
        return res.writeHead(200, { 'content-type': 'application/xml' }).end('<?xml version="1.0"?><DeleteResult></DeleteResult>');
      }
      if (req.method === 'PUT') {
        objects.set(key, { body, type: String(req.headers['content-type']) });
        return res.writeHead(200, { etag: '"x"' }).end();
      }
      if (req.method === 'GET') {
        const object = objects.get(key);
        if (!object) {
          return res
            .writeHead(404, { 'content-type': 'application/xml' })
            .end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        }
        return res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length }).end(object.body);
      }
      return res.writeHead(405).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const storage = () => new S3ObjectStorage({ endpoint, region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's', bucket: BUCKET });

  it('creates the bucket lazily once, then puts, reads and deletes objects (path-style)', async () => {
    const s3 = storage();
    await s3.put('kitchen-projects/p/photos/a/full.jpg', Buffer.from('full'), 'image/jpeg');
    await s3.put('kitchen-projects/p/photos/a/thumb.jpg', Buffer.from('thumb'), 'image/jpeg');
    expect(calls.filter((call) => call === `HEAD /${BUCKET}/`)).toHaveLength(1);
    expect(calls.filter((call) => call === `PUT /${BUCKET}/`)).toHaveLength(1);
    expect(objects.get('kitchen-projects/p/photos/a/full.jpg')).toEqual({ body: Buffer.from('full'), type: 'image/jpeg' });

    const { body } = await s3.getStream('kitchen-projects/p/photos/a/thumb.jpg');
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('thumb');

    await expect(s3.getStream('kitchen-projects/p/photos/missing/full.jpg')).rejects.toBeInstanceOf(ObjectNotFoundError);

    await s3.deleteMany(['kitchen-projects/p/photos/a/full.jpg', 'kitchen-projects/p/photos/a/thumb.jpg']);
    expect(objects.size).toBe(0);
  });

  it('reuses an existing bucket without creating it', async () => {
    const before = calls.filter((call) => call === `PUT /${BUCKET}/`).length;
    await storage().put('x/full.jpg', Buffer.from('x'), 'image/jpeg');
    expect(calls.filter((call) => call === `PUT /${BUCKET}/`)).toHaveLength(before);
  });

  it('unreachable storage gives StorageUnavailableError without hosts in the message', async () => {
    const down = new S3ObjectStorage({ endpoint: 'http://127.0.0.1:9', region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's', bucket: BUCKET });
    const error = await down.put('k', Buffer.from('x'), 'image/jpeg').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageUnavailableError);
    expect(String((error as Error).message)).not.toContain('127.0.0.1');
    await expect(down.deleteMany(['k'])).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
