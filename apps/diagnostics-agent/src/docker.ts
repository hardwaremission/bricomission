// Docker Engine API over the unix socket. Read-only by construction: the method is always GET
// and the path must match the allowlist. A `:ro` mount of the socket does not restrict the API
// (ADR 0006), so this file is the only place the agent may talk to Docker.
import { request } from 'node:http';

export const DOCKER_SOCKET = '/var/run/docker.sock';

const ALLOWED_PATHS = [/^\/containers\/json(\?all=1)?$/, /^\/containers\/[0-9a-f]{12,64}\/json$/];

export function isAllowedDockerPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

/** `GET <path>` on the Docker socket. Rejects any path outside the allowlist before opening a connection. */
export function dockerGet(path: string, socketPath = DOCKER_SOCKET, timeoutMs = 3000): Promise<unknown> {
  if (!isAllowedDockerPath(path)) return Promise.reject(new Error(`docker path not allowed: ${path}`));
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, path, method: 'GET', headers: { Host: 'docker' }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`docker ${path}: HTTP ${res.statusCode}`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error as Error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`docker ${path}: timeout`)));
    req.on('error', reject);
    req.end();
  });
}
