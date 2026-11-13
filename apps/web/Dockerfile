# BricoMission web PWA image (Next.js standalone). Build context: repository root (see compose.yaml).
# Base pinned to an exact tag; digest recorded in feature_list.json evidence.
FROM node:26.13.1-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.9
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile --filter @bricomission/web...
COPY tsconfig.base.json ./
COPY packages/api-client packages/api-client
COPY apps/web apps/web
RUN pnpm --filter @bricomission/web build

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Standalone output keeps the monorepo layout (outputFileTracingRoot = repo root).
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
