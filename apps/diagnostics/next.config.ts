import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root, so standalone tracing keeps the workspace layout (apps/diagnostics/server.js).
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The recorded session of `/stream?source=replay` is read from disk at runtime.
  outputFileTracingIncludes: { '/stream': ['./replay/**/*'] },
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
