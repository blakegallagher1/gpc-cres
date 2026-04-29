# SmartCAMA Playwright Enrichment Runner

Fetches sale price and tax amount from EBR SmartCAMA for parcels missing those fields in `property.parcel_assessor_enrichment`.

## How it works

1. Launches a visible Chromium browser via Playwright.
2. Navigates to SmartCAMA's search page.
3. Pauses — you clear any verification challenge manually in the browser.
4. Press Enter in the terminal once the search page is loaded.
5. Cookies and anti-forgery token are captured from the browser session.
6. Browser closes; HTTP requests use the captured session.
7. Fetches assessments via `POST /Assessments/SearchAjax` + `POST /Assessments/FetchAssessment`.
8. Upserts results into `property.parcel_assessor_enrichment` with COALESCE (preserves existing values).
9. Writes checkpoint to `output/smartcama-checkpoint.json` after each batch.

## Prerequisites

- Playwright + Chromium: `pnpm exec playwright install chromium`
- DB access via `PROPERTY_DB_PSQL_CMD` env var or SSH to `bg` host

## Usage

```bash
# Dry run — shows config, does nothing
pnpm parcel:enrich:smartcama-pw:dry

# Enrich up to 100 parcels, 5 concurrent, batches of 20
pnpm parcel:enrich:smartcama-pw:apply -- --max-rows 100 --batch-size 20 --concurrency 5

# Resume after session expiry
pnpm parcel:enrich:smartcama-pw:apply -- --resume

# Target specific assessment numbers
pnpm parcel:enrich:smartcama-pw:apply -- --assessment-numbers "0123456,0234567,0345678"
```

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--apply` | — | Run the enrichment (required to write) |
| `--dry-run` | — | Print config and exit |
| `--max-rows N` | 1000 | Max parcels to query from DB |
| `--batch-size N` | 25 | Upsert batch size |
| `--concurrency N` | 3 | Concurrent SmartCAMA requests |
| `--resume` | false | Resume from `output/smartcama-checkpoint.json` |
| `--assessment-numbers` | — | Comma-separated list (bypasses DB query) |

## Checkpoint

Progress is saved to `output/smartcama-checkpoint.json` after each batch. Use `--resume` to skip already-processed IDs on the next run.

## Differences from `enrich_ebr_smartcama.ts`

| Feature | Old script | This script |
|---------|-----------|-------------|
| Auth | `SMARTCAMA_COOKIE` env var | Playwright browser session |
| Concurrency | Sequential | Configurable (default 3) |
| Checkpoint | DB-only (NULL fields) | DB + file checkpoint |
| CLI | `--apply`, `--batch-size`, `--max-rows` | + `--dry-run`, `--resume`, `--concurrency` |
