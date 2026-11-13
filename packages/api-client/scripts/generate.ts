import { writeFileSync } from 'node:fs';
import { renderSchema, SCHEMA_PATH } from './schema.ts';

writeFileSync(SCHEMA_PATH, await renderSchema());
console.log(`api-client: wrote ${SCHEMA_PATH}`);
