import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * App-wide setup shared by `main.ts` and the HTTP tests: shutdown hooks and
 * OpenAPI (Swagger UI at /docs, JSON at /docs-json, assets from swagger-ui-dist).
 */
export function configureApp(app: INestApplication): INestApplication {
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle('BricoMission API')
    .setDescription('REST API for the BricoMission PWA and future native clients.')
    .setVersion(version)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return app;
}
