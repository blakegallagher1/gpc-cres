# SmartCAMA Playwright Enrichment Runner

Fetches sale price and tax amount from EBR SmartCAMA for parcels missing those fields in `property.parcel_assessor_enrichment`.

## How it works

1. Launches a visible Chromium browser via Playwright.
2. Reuses a persistent browser profile at `output/smartcama-browser-profile`.
3. Opens a known assessment page to test whether the saved SmartCAMA session is still verified.
4. If the profile is still verified, continues automatically with no prompt.
5. If verification expired, waits while you clear the challenge in the visible browser; no cookies are printed or stored outside the browser profile.
6. Cookies and anti-forgery token are captured from the browser session.
7. Browser remains open while the runner performs page-backed SmartCAMA lookups.
8. Fetches assessments through SmartCAMA's JSON endpoints using the verified browser request context.
9. Upserts results into `property.parcel_assessor_enrichment` with COALESCE (preserves existing values).
10. Writes checkpoint to `output/smartcama-checkpoint.json` after each batch.

## Prerequisites

- Playwright + Chromium: `pnpm exec playwright install chromium`
- DB access via `PROPERTY_DB_PSQL_CMD` env var or SSH to `bg` host

## Usage

```bash
# Dry run — shows config, does nothing
pnpm parcel:enrich:smartcama-pw:dry

# Enrich up to 100 parcels, conservative rate, batches of 20
pnpm parcel:enrich:smartcama-pw:apply -- --max-rows 100 --batch-size 20 --concurrency 1

# Resume after a stopped run; reuses the same persistent browser profile
pnpm parcel:enrich:smartcama-pw:apply -- --resume

# Force a fresh manual verification pass before scraping
pnpm parcel:enrich:smartcama-pw:apply -- --force-verify

# Use a different persistent browser profile
pnpm parcel:enrich:smartcama-pw:apply -- --profile-dir output/smartcama-browser-profile-2

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
| `--concurrency N` | 1 | Concurrent SmartCAMA requests; keep low to avoid SmartCAMA 429s |
| `--resume` | false | Resume from `output/smartcama-checkpoint.json` |
| `--assessment-numbers` | — | Comma-separated list (bypasses DB query) |
| `--profile-dir PATH` | `output/smartcama-browser-profile` | Persistent Playwright user profile that retains verified SmartCAMA state |
| `--verification-timeout-seconds N` | 300 | How long to wait for manual verification when the profile is not trusted |
| `--force-verify` | false | Always wait for a fresh verification pass before scraping |

## Verification strategy

The runner does not bypass SmartCAMA verification. It converts verification into a reusable, operator-cleared browser profile:

1. First run: Chromium opens visibly, and you clear the SmartCAMA challenge once.
2. Same or later run: the runner opens a known assessment page with the same profile.
3. If SmartCAMA still trusts the profile, scraping starts automatically.
4. If SmartCAMA expires the session, the runner waits for manual verification and then continues automatically.

## Rate limits and target order

The runner uses a stable hash order for DB-selected parcel IDs instead of starting at the smallest PRONO values. This avoids spending the first batches on a low-yield numeric range while still being repeatable with checkpoints.

SmartCAMA can return `429 Too Many Requests` when detail requests are too aggressive. The runner retries 429 responses with backoff and then stops instead of marking those rows as `not_found`.

## Checkpoint

Progress is saved to `output/smartcama-checkpoint.json` after each batch. Use `--resume` to skip already-processed IDs on the next run.

## Differences from `enrich_ebr_smartcama.ts`

| Feature | Old script | This script |
|---------|-----------|-------------|
| Auth | `SMARTCAMA_COOKIE` env var | Playwright browser session |
| Verification | Manual cookie copy each run | Persistent browser profile; manual only when SmartCAMA expires it |
| Concurrency | Sequential | Configurable (default 1, rate-limit aware) |
| Checkpoint | DB-only (NULL fields) | DB + file checkpoint |
| CLI | `--apply`, `--batch-size`, `--max-rows` | + `--dry-run`, `--resume`, `--concurrency`, `--profile-dir`, `--force-verify` |
