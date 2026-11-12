// Prisma 7 configuration: the datasource URL lives here, not in schema.prisma.
// DATABASE_URL may be absent for `prisma generate` (lint/test need no database).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
