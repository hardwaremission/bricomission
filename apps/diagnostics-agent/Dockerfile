# BricoMission diagnostics metrics agent. Build context: repository root (see compose.yaml).
# Base pinned to an exact tag (same as the API image). The runtime stage holds only the compiled
# agent: Node stdlib, no node_modules.
FROM node:26.13.1-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@10.34.9
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/diagnostics-agent/package.json apps/diagnostics-agent/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/diagnostics-agent apps/diagnostics-agent
RUN pnpm --filter @bricomission/diagnostics-agent build

FROM node:26.13.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3300
WORKDIR /app
COPY --from=build /repo/apps/diagnostics-agent/dist ./dist
RUN printf '{"name":"diagnostics-agent","private":true,"type":"module"}\n' > package.json
# root is required: the Docker socket is root:docker 660 and reading another container's
# /proc/<pid>/fd needs CAP_SYS_PTRACE held by root (spike A1). compose.yaml drops every other
# capability, mounts the root filesystem read-only and sets no-new-privileges.
USER root
EXPOSE 3300
CMD ["node", "dist/main.js"]
