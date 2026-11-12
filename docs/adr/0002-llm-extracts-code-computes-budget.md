# ADR 0002: LLM extracts priced Line Items, code computes all amounts

## Status
Accepted (2026-11-12).

## Context

Prices must never be invented. NotebookLM has no runtime API, so prices come from a local RAG index over Catalog PDFs. Local LLMs are unreliable at arithmetic and non-deterministic across runs, but Budgets, Contracts, penalties, and commissions must be exact and reproducible.

## Decision

The LLM, using RAG, returns schema-constrained JSON Line Items (product, SKU, Catalog, source reference, cited unit price, quantity, unit). The API verifies that each cited price appears in the retrieved source chunk and rejects unverified items. All subtotals, Budget Tier totals, taxes, delay penalties, and Platform Commission are computed by API code with decimal arithmetic.

## Alternatives Considered

- **LLM computes totals**: simpler, but wrong or drifting totals.
- **Curated product database instead of RAG**: most deterministic, but the developer chose RAG over Catalog PDFs.

## Consequences

- Budgets are reproducible and auditable; every price is traceable to a Catalog source.
- Requires structured output support in the LLM server and a verification step that can reject items, with retries.
- Prompt Macros and chat only change Line Items; they never change math.
