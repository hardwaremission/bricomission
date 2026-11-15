import { defineConfig } from 'vitest/config';

// Unit tests only (no browser, no Docker, no network): reducers, routing, formatting, SSE parsing.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
