# Build Brief

Source of truth for product intent: `Documentación del Proyecto_BricoMission.md` (PRD in section 3). This brief records the decisions taken in discovery on 2026-11-12.

## Problem

Homeowners cannot estimate the real cost of a kitchen renovation and cannot picture the result. Contractors waste time and money quoting undecided clients ("tire-kickers") who have no clear idea or purchase intent.

## Current Workaround / Existing System

Homeowners visit stores, collect scattered quotes, and guess from magazine photos. Contractors visit sites and prepare free quotes, most of which never convert. There is no tool that couples a realistic visualization with a catalog-grounded budget and a binding, fully specified request for quotes.

## Target Users

- **Homeowner** (B2C): plans, visualizes, and budgets a kitchen renovation on a mobile browser.
- **Professional** (B2B): employee of a Company (or a self-employed contractor) who bids on Dossiers.
- **Administrator**: internal operator who validates Companies, manages users and quotas, and configures the platform visually.

Roles and permissions: `docs/user-and-access-model.md`.

## Goals

1. Turn kitchen photos + measurements into photorealistic Renders that keep the real room geometry.
2. Produce a Budget in four tiers, grounded on partner Catalogs, refined by chat with a switchable Persona.
3. Offer two outcomes: DIY Shopping List PDF, or a locked Dossier on the Marketplace.
4. Run an anonymous, no-chat Marketplace that ends in a Contract with delay penalties and a Platform Commission.
5. Give the Administrator full visual control: Company validation, users, quotas, AI endpoints, storage, Payment Mode.
6. Run entirely on the local dev machine, with an offline fallback for every online dependency.
7. Ship a 15-minute demo video built with the pipeline of doc section 5.

## Non-Goals

- Native iOS app, LiDAR/ARKit capture, native push notifications (Phase 2).
- Renovation types other than kitchens (data model may allow it; no UI).
- Apple SSO and real SMS OTP.
- Chat between Homeowner and Professional.
- Real payments (only PayPal Sandbox or Simulated).
- Advanced/qualified electronic signature providers.
- Querying NotebookLM at runtime.
- Production hosting, scaling, or multi-region deployment.
- Importing 3D scans from third-party apps.

## MVP Slice

Scope decision: **the full PRD** is the MVP target (developer's choice, 2026-11-12), delivered by 2026-11-22. This is the main delivery risk (see `docs/risks-and-open-questions.md`); `/harness-starter` must order features so that the end-to-end demo path is done first and breadth comes later.

Priority order of the end-to-end demo path:

1. Infrastructure: Docker Compose stack, Keycloak realm with three roles, API + PWA skeleton, i18n plumbing.
2. Homeowner capture: anonymous photos + measurements + Moodboard, Login Gate.
3. AI: Render via ControlNet; Budget via local RAG + deterministic computation; Personas and Prompt Macros.
4. Outcomes: Shopping List PDF; Dossier publication.
5. Marketplace: Company registration and validation, Bids (editable, SSE notifications), acceptance, Contract PDF, Electronic Acceptance, commission checkout (Simulated, then PayPal Sandbox).
6. Admin Dashboard: users, validation queue, quotas, AI endpoints, MinIO credentials, Payment Mode, Bidding Window duration.
7. Breadth: all 11 locales, Google SSO, polish.

Key product decisions:

- Prices come from a local RAG index over Catalog PDFs. The LLM extracts structured Line Items citing the source; code validates the cited price and computes all totals, tiers, penalties, and commissions.
- Online with offline fallback: Google SSO and PayPal Sandbox work when online; Keycloak username/password, email OTP to a local mailbox, and Simulated payment work offline.
- Every validated Company sees every published Dossier; one Bid per Company, editable while the Dossier is open; the Homeowner can accept at any time; the Dossier expires when the Bidding Window ends without acceptance.
- Self-employed contractors register as one-member Companies with a NIF.
- Contracts use Electronic Acceptance (re-authentication plus recorded evidence and PDF hash).

Technical decisions: `docs/technical-discovery.md` and `docs/adr/`.

## Validation Plan

- Day-1 technical spike on the dev machine: llama.cpp MoE with experts in RAM, plus SDXL + ControlNet in ComfyUI on the RX 9070 XT, in Docker. Measure VRAM, tokens/s, and seconds per Render.
- Each feature is accepted only by the independent validator (`/feature-flow`).
- Final rehearsal: run the full demo path on a clean `docker compose up`, once online and once with the network disabled.

## Success Criteria

- A Homeowner goes from photos to an accepted Contract in one continuous session, on a mobile viewport.
- Every price on screen and in PDFs traces back to a Catalog source; recomputing a Budget gives identical totals.
- Renders keep the walls, window, door, and plumbing positions of the uploaded photo.
- A Professional sees company-wide Kitchen Projects with correct edit/read-only rights; the Homeowner never sees Company identity before acceptance.
- The Administrator performs every listed configuration from the UI, with no `.env` edits.
- The demo path works with the network disabled.
- The 15-minute video is rendered from the versioned HyperFrames project.

## Notes

- Deadline: 2026-11-22. Phase plan: doc section 4.2.
- Commission default 5 % and minimum delay penalty 50 €/day are assumptions, configurable by the Administrator.
