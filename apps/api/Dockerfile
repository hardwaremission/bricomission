# BricoMission API image. Build context: repository root (see compose.yaml).
# Base pinned to an exact tag; digest recorded in feature_list.json evidence.
FROM node:26.13.1-bookworm-slim AS base
ENV CHECKPOINT_DISABLE=1 \
    PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@10.34.9
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
# build = prisma generate (client emitted into src/generated) + tsc into dist/.
RUN pnpm --filter @bricomission/api build \
 && pnpm --filter @bricomission/api deploy --prod --legacy /out \
 && rm -rf /out/dist && cp -r apps/api/dist /out/dist

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CHECKPOINT_DISABLE=1
# OpenSSL for the Prisma schema engine (`prisma migrate deploy` in docker-entrypoint.sh).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
# Applies Prisma migrations best-effort, then runs node dist/main.js.
CMD ["sh", "docker-entrypoint.sh"]
