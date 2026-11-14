# BricoMission

AI-powered kitchen renovation platform connecting homeowners (B2C) with professional contractors (B2B).

> Status: MVP in progress. MVP target: **2026-11-22**. Built as the final project of the *AI Expert* course (DevExpert.io), with zero hand-written code: every line is produced by AI agents following a spec-driven harness.

> **MVP scope (2026-11-15):** the MVP delivered to the tutors covers Capture, Moodboard with Style Gallery, Login Gate, ControlNet Renders, four verified Budget Tiers and Simulations, plus a new `diagnostics-dashboard` that closes it: a separate desktop web showing the whole architecture as a live blueprint-style graph. The budget chat and personas, DIY shopping list, marketplace, contracts, payments, quotas, Admin panel, Google SSO and the other items marked *[Phase 2]* below are the next phase and are not built yet.

## The problem

Homeowners don't know what a renovation really costs and struggle to picture the result. Contractors lose time and money on undecided clients who request quotes with no clear idea or intent to buy.

## The solution

1. **Capture** — the homeowner uploads photos of the kitchen and enters its measurements.
2. **Visualize** — ControlNet (depth/canny) generates photorealistic redesigns that keep the room's real geometry (walls, windows, doors, water inlets).
3. **Budget by conversation** — an LLM computes four budget tiers (Luxury, High, Medium, Low) grounded on real partner catalogs, then refines them through chat *[Phase 2: chat and personas]*. Four switchable assistant personas: Strict Foreman, Empathetic Designer, Frugal Friend, Neutral *[Phase 2]*.
4. **Choose a path**
   - **DIY** *[Phase 2]*: an exact, executable shopping list (SKUs, quantities, prices) as PDF.
   - **Marketplace** *[Phase 2]*: a locked, fully specified dossier goes to verified professionals, who submit anonymous sealed bids within 15 days. No chat, no bypass. The accepted bid produces a digital contract with calculated delay penalties and a platform success commission.

## Roles

The three roles are defined and seeded in the Keycloak realm. The Professional and Administrator functions below are Phase 2 (decision 2026-11-15) and are not built yet.

| Role | Scope |
| --- | --- |
| **User** (homeowner) | Plans, visualizes and budgets the renovation; lazy login right before costly AI calls. |
| **Professional** (contractor) [Phase 2] | Registers with corporate email, company name and tax ID; validated by an admin; sees company-wide projects (own: editable, co-workers': read-only). |
| **Administrator** [Phase 2] | Fully visual control panel: users, professional validation, AI/token quotas (per-user override and reset), AI endpoints, object-storage credentials, payment mode (simulated / PayPal Sandbox). |

## Planned architecture

- **Client**: mobile-first PWA (Next.js + Tailwind), 11 languages (en, es, fr, de, it, pt, nl, sv, no, da, fi).
- **API**: framework-agnostic REST, ready for a future native iOS client.
- **Identity**: Keycloak (`BricoMission` realm) — RBAC, SSO, OTP.
- **Data & files**: PostgreSQL; MinIO (S3-compatible) object storage.
- **AI**: provider-agnostic layer with hot-swappable endpoints — local models via Ollama / lemonade-server on an AMD Radeon 9070 XT, cloud fallback; ControlNet image pipeline.
- **Real time**: Server-Sent Events for bid notifications *[Phase 2]*.
- **Diagnostics dashboard** (MVP, planned): separate localhost-only desktop web with a live blueprint-style graph of every container and API module, a narrated log and per-module CPU/RAM/VRAM/GPU widgets.
- **Infrastructure**: every service runs in Docker containers orchestrated with Docker Compose v2.
- **Offline demo**: everything runs locally with no cloud dependencies.
- **Dev machine**: Linux CachyOS, Ryzen 9 5950X, 64 GB RAM, Radeon RX 9070 XT 16 GB. VRAM limits which local models can be loaded at the same time.

## How it is built

Spec-driven development with the DevExpert harness and Claude Code:

```
build-brief      -> product context, domain model, design system
harness-starter  -> AGENTS.md, init.sh, PROGRESS.md, feature_list.json
feature-flow     -> planner -> implementer -> independent validator (per feature)
github-flow      -> isolated git worktrees, conventional commits, pull requests
```

The demo video is the final step. It shows the app in a portrait browser next to the diagnostics dashboard in a desktop browser. The narration is recorded in the developer's own voice and timed with local speech-to-text. Screenshots are captured through the browser MCP. Everything is assembled with [HyperFrames](https://github.com/heygen-com/hyperframes) in 1080p, and the project is versioned under `presentation/`.

UI screens are designed by the agent inside OpenPencil through MCP, reviewed by the developer, and implemented strictly from the approved design. GitHub issues and pull requests are automated through the GitHub MCP server.

## Roadmap after the MVP

Phase 2: the marketplace (dossier, bids, contracts, commission and payments), the Admin panel and quotas, budget chat and personas, DIY shopping list, Google SSO and per-account language preference. Then: native iOS app (SwiftUI) with LiDAR/ARKit room scanning replacing manual measurements, and native push notifications.

## Repository contents

- `Documentación del Proyecto_BricoMission.md` — project definition and PRD (Spanish, PRD section in English).
- `CLAUDE.md` — operating rules for AI agents.
- `docs/` — development log (daily conversation exports).
