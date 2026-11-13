// Flat ESLint config shared by every workspace package.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/src/generated/**',
      // apps/web build output, Next's generated types and Playwright/Lighthouse output.
      '**/.next/**',
      '**/next-env.d.ts',
      '**/test-results/**',
      '**/playwright-report/**',
      // openapi-typescript output (packages/api-client), kept in sync by a drift test.
      'packages/api-client/src/schema.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      // Keep consistent-type-imports aware of NestJS constructor injection metadata.
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
