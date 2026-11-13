import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * App-wide setup shared by `main.ts` and the HTTP tests: shutdown hooks and
 * OpenAPI (Swagger UI at /docs, JSON at /docs-json, assets from swagger-ui-dist, bearer
 * security scheme for Keycloak tokens). /docs and /docs-json are not Nest routes, so the
 * global AuthGuard never applies to them.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle('BricoMission API')
    .setDescription('REST API for the BricoMission PWA and future native clients.')
    .setVersion(version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Keycloak access token (realm BricoMission)' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return app;
}
