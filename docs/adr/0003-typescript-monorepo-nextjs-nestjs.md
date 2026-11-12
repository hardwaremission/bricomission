# ADR 0003: TypeScript monorepo with Next.js PWA and NestJS REST API

## Status
Accepted (2026-11-12).

## Context

The PRD requires a mobile-first PWA now and a framework-agnostic REST API that a future native iOS app can reuse unchanged. The work is done by AI agents in single-session features under a 10-day deadline.

## Decision

pnpm workspace monorepo in TypeScript: `apps/web` (Next.js + Tailwind, API client only), `apps/api` (NestJS, REST + OpenAPI, Prisma on PostgreSQL, SSE), shared packages for types and a generated API client.

## Alternatives Considered

- **Next.js + FastAPI**: strong Python AI ecosystem, but two languages and duplicated types.
- **Next.js route handlers only**: fastest start, but couples the API to the web framework, against the PRD.

## Consequences

- One language and shared types across front and back end.
- The OpenAPI contract is the integration point for the future iOS client.
- AI-heavy tasks (RAG, PDF parsing) run in Node or are delegated to containerized services.
