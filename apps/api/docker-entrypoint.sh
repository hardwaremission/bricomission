#!/bin/sh
# api container entrypoint (feature catalog-rag-ingestion): apply pending Prisma
# migrations best-effort, then start the API. If PostgreSQL is down or the migration
# fails, log it and start anyway: the API boots with the database down and /health
# reports it (api-skeleton behavior). scripts/catalog/ingest.sh also runs migrate deploy.
set -u
if timeout "${MIGRATE_TIMEOUT_SECONDS:-60}" ./node_modules/.bin/prisma migrate deploy; then
  echo "migrations applied"
else
  echo "WARNING: migrations not applied (database unreachable or migration error); starting the API anyway" >&2
fi
exec node dist/main.js
