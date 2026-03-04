***
name: parcel-ops
version: "1.0"
description: |
  Use when: User asks about parcel lookup, geometry retrieval, bbox queries, vector tile operations, parcel screening, or map-path diagnostics.
  Don't use when: The request is primarily `entitlement-os`, `underwriting`, `market-trajectory`, `data-extraction`, or `property-report`.
  Outputs: Parcel geometry/attribute payloads or a map diagnostics report with fallback-path evidence.
***

## Prerequisites

- Input includes an address, parcel id, or structured filter criteria.
- Property data tools are available via `packages/openai/src/tools/propertyDbTools.ts` and `apps/web/app/api/parcels/route.ts`.
- Any deal linkage requirements include org-scoped identifiers.

## Steps

1. Choose lookup path: address search, parcel-id detail fetch, or structured query.
2. Run required screens (zoning, flood, soils, wetlands, EPA, traffic, or full batch).
3. If geometry resolution fails, apply fallback order: direct lookup, normalized-address lookup, RPC fallback.
4. Consolidate findings into a concise parcel intelligence response.
5. Return clear limitations and safe error framing when upstream data is partial.

## Validation

- Lookup path matches input type and requested scope.
- Results include parcel identifier(s) and source-backed screen findings.
- Governed query constraints are respected (read-only and bounded behavior).
- Failures are explicit and actionable, never silently swallowed.

## Examples
### Good input → expected output

- "Find parcels near 222 St Louis St and run full screening on the top hit."
- Expected: Parcel result with screening summary, key risks, and any data gaps.

### Bad input → expected routing

- "What is left to close Phase F of Entitlement OS?" → route to `entitlement-os`.
- "Score neighborhood trajectory for 70810." → route to `market-trajectory`.
