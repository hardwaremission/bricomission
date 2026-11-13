# Sample Catalog (synthetic)

`bricomission-sample-catalog.pdf` is a **clearly synthetic** Catalog used to develop and test the
local RAG index (feature `catalog-rag-ingestion`). Every product, SKU (`BM-SYN-*`) and price in it is
invented. It is not partner data and must never be shown as real pricing.

Contents (5 pages):

1. Cover: "SYNTHETIC SAMPLE - not real products or prices".
2. Kitchen cabinets (SKU, en / es name, unit, price in EUR).
3. Worktops and splashbacks, including `BM-SYN-WTP-300` "Oak laminate worktop 300 cm / Encimera
   laminada roble 300 cm", unit `unit`, `189.90 EUR`.
4. Sinks, taps and appliances.
5. A page drawn with shapes only and no text layer (ingestion skips it with a warning).

## Regenerate

```bash
./scripts/catalog/generate-sample-catalog.sh                     # writes this directory
./scripts/catalog/generate-sample-catalog.sh /some/dir --edition 2  # BM-SYN-WTP-300 at 199.90 EUR, nothing else changes
```

The output is byte-identical across runs (fixed metadata dates, built-in fonts). The generator is
`apps/api/scripts/generate-sample-catalog.ts`; the tests import the same builder and check that the
committed file matches it.

## Real Catalogs

Real partner Catalog PDFs do not belong in this directory or in git. Keep them in any local folder
and index it with:

```bash
docker compose --profile rag up -d --wait embedder
./scripts/catalog/ingest.sh /path/to/partner-catalogs
```

Only PDFs with a text layer are indexed; scanned pages are skipped (OCR is out of scope).
