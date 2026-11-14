# Build Brief

Source of truth for product intent: `Documentación del Proyecto_BricoMission.md` (PRD in section 3). This brief records the decisions taken in discovery on 2026-11-12.

> **Scope update (2026-11-15).** The MVP delivered to the tutors is now the 16 features already `accepted` in `feature_list.json` plus one new feature, `diagnostics-dashboard`, which closes it (a separate localhost-only desktop web with a live blueprint-style graph of the whole architecture, narrated log and per-module CPU/RAM/VRAM/GPU widgets). The other 22 features carry `"phase": "phase-2"` and are out of the delivered MVP (next phase, outside the project presented to the tutors). The original goals, priority order and decisions below are kept as the original plan; items marked **[Phase 2]** are not part of the delivered MVP. The demo video shows the app in a portrait browser next to the dashboard in a desktop browser.

## Problem

Homeowners cannot estimate the real cost of a kitchen renovation and cannot picture the result. Contractors waste time and money quoting undecided clients ("tire-kickers") who have no clear idea or purchase intent.

## Current Workaround / Existing System

Homeowners visit stores, collect scattered quotes, and guess from magazine photos. Contractors visit sites and prepare free quotes, most of which never convert. There is no tool that couples a realistic visualization with a catalog-grounded budget and a binding, fully specified request for quotes.

## Target Users

- **Homeowner** (B2C): plans, visualizes, and budgets a kitchen renovation on a mobile browser.
- **Professional** (B2B) [Phase 2 functionality]: employee of a Company (or a self-employed contractor) who bids on Dossiers.
- **Administrator** [Phase 2 functionality]: internal operator who validates Companies, manages users and quotas, and configures the platform visually.

The three roles stay defined and seeded in the Keycloak realm (2026-11-15); only the Professional and Administrator functions are deferred.

Roles and permissions: `docs/user-and-access-model.md`.

## Goals

Original goals (2026-11-12). Delivered MVP (2026-11-15): goals 1, 2 (four tiers only), 6 and 7, plus the diagnostics dashboard goal added below; goals 2 (chat and Persona part), 3, 4 and 5 are [Phase 2].

1. Turn kitchen photos + measurements into photorealistic Renders that keep the real room geometry.
2. Produce a Budget in four tiers, grounded on partner Catalogs, refined by chat with a switchable Persona.
3. Offer two outcomes: DIY Shopping List PDF, or a locked Dossier on the Marketplace.
4. Run an anonymous, no-chat Marketplace that ends in a Contract with delay penalties and a Platform Commission.
5. Give the Administrator full visual control: Company validation, users, quotas, AI endpoints, storage, Payment Mode.
6. Run entirely on the local dev machine, with an offline fallback for every online dependency.
7. Ship a 15-minute demo video built with the pipeline of doc section 5.
8. (Added 2026-11-15, MVP) Explain the architecture by itself with the `diagnostics-dashboard`: a live blueprint-style graph of every container and API module, with animated connections, a narrated log and CPU/RAM/VRAM/GPU widgets, shown next to the portrait app in the demo.

## Non-Goals

Delivered-MVP non-goals added 2026-11-15 (moved to Phase 2): budget chat, Personas and Prompt Macros; DIY Shopping List PDF; Dossier publication and the whole Marketplace (Company registration and validation, Bids, acceptance, live notifications, Contract PDF, Electronic Acceptance, commission checkout with Simulated and PayPal Sandbox); the Administrator panel (users, quotas, service endpoints, marketplace settings); Google SSO; per-account language preference; render declutter.

Original non-goals:

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

**Updated 2026-11-15:** the delivered MVP priority order is: (1) Infrastructure (Compose, AI services, API and PWA skeleton, Keycloak realm with three roles and email-code login, brand and splash); (2) Homeowner capture (photos and measurements in cm, Moodboard with Style Gallery, Login Gate claim); (3) AI (GPU job broker, ControlNet Renders, catalog RAG ingestion, four verified Budget Tiers, Simulations with My simulations and a Budget per simulation); (4) `diagnostics-dashboard`. The list below is the original plan (2026-11-12); its items 3 (Personas and Prompt Macros), 4, 5, 6 and 7 (Google SSO) are [Phase 2].

Original scope decision: **the full PRD** is the MVP target (developer's choice, 2026-11-12), delivered by 2026-11-22. This is the main delivery risk (see `docs/risks-and-open-questions.md`); `/harness-starter` must order features so that the end-to-end demo path is done first and breadth comes later.

Original priority order of the end-to-end demo path (superseded 2026-11-15, see above):

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

Original criteria (2026-11-12). Delivered MVP (2026-11-15): the photo-to-Render-and-Budget part of the first criterion, the Catalog traceability, Render geometry, offline demo and video criteria apply; the Contract, Professional and Administrator criteria are [Phase 2]. Added: the diagnostics dashboard lets a viewer follow which components take part in a flow without reading code.

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
