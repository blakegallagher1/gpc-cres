***
name: data-extraction
version: "1.0"
description: |
  Use when: User asks to pull property data, fetch county records, scrape assessor sources, normalize external payloads, or batch-import parcels.
  Don't use when: The request is primarily `underwriting`, `entitlement-os`, `market-trajectory`, `parcel-ops`, or `property-report`.
  Outputs: Structured property data JSON (returned payload and/or DB-ready records) with source, quality, and ingest status.
***

## Prerequisites

- Data source scope is defined (county API, assessor endpoint, gateway feed, or CSV batch).
- Service paths are available in `services/`, `packages/server/`, and data ingress routes/tools.
- Org scope and dedupe keys are defined before write-back (parcel id, assessor id, normalized address).

## Steps

1. Validate source contract and required auth/context for the requested extraction run.
2. Fetch raw records from allowlisted source(s) with retry, throttling, and deterministic paging.
3. Normalize fields to repo data contracts (parcel id/address/owner/sale attributes as available).
4. Apply quality checks (schema validation, dedupe, missing critical fields, parse failures).
5. Return JSON output and, when requested, stage DB-ready records with ingest summary.

## Validation

- Source payloads pass schema validation before downstream use.
- Output includes source provenance, extracted timestamp, and record counts.
- Failed records are returned in a structured error bucket (not silently dropped).
- Writes are org-scoped and idempotent by stable external keys where available.

## Examples
### Good input → expected output

- "Fetch East Baton Rouge assessor records for these 250 parcel IDs and return normalized JSON."
- Expected: JSON payload with normalized property rows, per-source stats, and ingest-ready status.

### Bad input → expected routing

- "Run parcel geometry fallback debugging for this address." → route to `parcel-ops`.
- "Calculate DSCR and IRR from this rent roll." → route to `underwriting`.
