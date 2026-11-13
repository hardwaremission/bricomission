import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root, so standalone tracing includes workspace packages (apps/web/server.js).
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@bricomission/api-client'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'cache-control', value: 'no-cache' },
          { key: 'content-type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
