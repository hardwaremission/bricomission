import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * App-wide setup shared by `main.ts` and the HTTP tests: shutdown hooks and
 * OpenAPI (Swagger UI at /docs, JSON at /docs-json, assets from swagger-ui-dist, bearer
 * security scheme for Keycloak tokens, `draftToken` API-key scheme for anonymous kitchen drafts). /docs and /docs-json are not Nest routes, so the
 * global AuthGuard never applies to them.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.enableShutdownHooks();
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
  return app;
}

/**
 * The OpenAPI document served at /docs-json. Also used by test/openapi-snapshot.spec.ts
 * to keep packages/api-client/openapi.json (the web client's contract) in sync.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BricoMission API')
    .setDescription('REST API for the BricoMission PWA and future native clients.')
    .setVersion(version)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Keycloak access token (realm BricoMission)' })
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Draft-Token', description: 'Anonymous kitchen draft token (returned once by POST /kitchen-projects/drafts)' },
      'draftToken',
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}
