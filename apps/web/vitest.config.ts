import { defineConfig } from 'vitest/config';

// Unit tests only (no browser, no Docker). Browser E2E lives in e2e/ (Playwright).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
