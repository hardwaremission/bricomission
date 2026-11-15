# BricoMission diagnostics dashboard image (Next.js standalone). Build context: repository root (see compose.yaml).
# Base pinned to an exact tag (same as the web and API images). Fonts, icons and the graph library are
# bundled at build time: the running container makes no request outside the compose network.
FROM node:26.13.1-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.34.9
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/diagnostics/package.json apps/diagnostics/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile --filter @bricomission/diagnostics...
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/diagnostics apps/diagnostics
RUN pnpm --filter @bricomission/diagnostics build

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Standalone output keeps the monorepo layout (outputFileTracingRoot = repo root); it includes replay/.
COPY --from=build --chown=node:node /repo/apps/diagnostics/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/diagnostics/.next/static ./apps/diagnostics/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/diagnostics/server.js"]
