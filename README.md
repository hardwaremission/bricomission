# BricoMission

AI-powered kitchen renovation platform connecting homeowners (B2C) with professional contractors (B2B).

> Status: discovery phase. MVP target: **2026-11-22**. Built as the final project of the *AI Expert* course (DevExpert.io), with zero hand-written code: every line is produced by AI agents following a spec-driven harness.

## The problem

Homeowners don't know what a renovation really costs and struggle to picture the result. Contractors lose time and money on undecided clients who request quotes with no clear idea or intent to buy.

## The solution

1. **Capture** — the homeowner uploads photos of the kitchen and enters its measurements.
2. **Visualize** — ControlNet (depth/canny) generates photorealistic redesigns that keep the room's real geometry (walls, windows, doors, water inlets).
3. **Budget by conversation** — an LLM computes four budget tiers (Luxury, High, Medium, Low) grounded on real partner catalogs, then refines them through chat. Four switchable assistant personas: Strict Foreman, Empathetic Designer, Frugal Friend, Neutral.
4. **Choose a path**
   - **DIY**: an exact, executable shopping list (SKUs, quantities, prices) as PDF.
   - **Marketplace**: a locked, fully specified dossier goes to verified professionals, who submit anonymous sealed bids within 15 days. No chat, no bypass. The accepted bid produces a digital contract with calculated delay penalties and a platform success commission.

## Roles

| Role | Scope |
| --- | --- |
| **User** (homeowner) | Plans, visualizes and budgets the renovation; lazy login right before costly AI calls. |
| **Professional** (contractor) | Registers with corporate email, company name and tax ID; validated by an admin; sees company-wide projects (own: editable, co-workers': read-only). |
| **Administrator** | Fully visual control panel: users, professional validation, AI/token quotas (per-user override and reset), AI endpoints, object-storage credentials, payment mode (simulated / PayPal Sandbox). |

## Planned architecture

- **Client**: mobile-first PWA (Next.js + Tailwind), 11 languages (en, es, fr, de, it, pt, nl, sv, no, da, fi).
- **API**: framework-agnostic REST, ready for a future native iOS client.
- **Identity**: Keycloak (`BricoMission` realm) — RBAC, SSO, OTP.
- **Data & files**: native PostgreSQL; MinIO (S3-compatible) object storage.
- **AI**: provider-agnostic layer with hot-swappable endpoints — local models via Ollama / lemonade-server on an AMD Radeon 9070 XT, cloud fallback; ControlNet image pipeline.
- **Real time**: Server-Sent Events for bid notifications.
- **Offline demo**: everything runs locally, no Docker, no cloud dependencies.

## How it is built

Spec-driven development with the DevExpert harness and Claude Code:

```
build-brief      -> product context, domain model, design system
harness-starter  -> AGENTS.md, init.ps1, PROGRESS.md, feature_list.json
feature-flow     -> planner -> implementer -> independent validator (per feature)
github-flow      -> isolated git worktrees, conventional commits, pull requests
```

UI screens are designed by the agent inside OpenPencil through MCP, reviewed by the developer, and implemented strictly from the approved design. GitHub issues and pull requests are automated through the GitHub MCP server.

## Roadmap after the MVP

Native iOS app (SwiftUI) with LiDAR/ARKit room scanning replacing manual measurements, and native push notifications.

## Repository contents

- `2026-11-06_11.27_Documentación del Proyecto_BricoMission.md` — project definition and PRD (Spanish, PRD section in English).
- `CLAUDE.md` — operating rules for AI agents.
- `docs/` — development log (daily conversation exports).
