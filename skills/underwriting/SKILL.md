***
name: underwriting
version: "1.0"
description: |
  Use when: User input includes rent roll, expenses, purchase price, debt terms, or asks for NOI, cap rate, DSCR, cash-on-cash, or IRR analysis.
  Don't use when: The request is primarily `market-trajectory`, `entitlement-os`, `data-extraction`, `parcel-ops`, or `property-report`.
  Outputs: Structured JSON underwriting model plus a markdown summary with assumptions, metrics, sensitivities, and recommendation.
***

## Prerequisites

- Deal context: `orgId` and either `dealId` or fully specified assumptions.
- Tooling path available in repo: `packages/openai/src/tools/calculationTools.ts`, `packages/openai/src/tools/dealTools.ts`, and `packages/openai/src/tools/documentTools.ts`.
- If extraction data exists, treat it as first-pass input before manual overrides.

## Steps

1. Pull source assumptions from extractions and deal terms using document/deal tools.
2. Reconcile extraction-vs-deal conflicts and record any assumption overrides.
3. Run baseline calculations for NOI, debt sizing, DSCR, equity returns, and hold/exit outputs.
4. Run at least one downside or sensitivity case (rate, rent, cap rate, or timeline stress).
5. Return a recommendation with rationale and unresolved risks.

## Validation

- Assumptions are tagged as document-derived vs manually set.
- Output includes baseline plus at least one stressed scenario.
- Any missing required input is called out explicitly (fail closed, no fabricated fields).
- Recommendation is tied to metrics, not narrative only.

## Examples
### Good input → expected output

- "Underwrite deal `d-103` using uploaded rent roll + PSA and show base vs downside IRR."
- Expected: Underwriting summary with provenance, base/downside metrics, and recommendation.

### Bad input → expected routing

- "Run zoning/flood screens for 3154 College Dr." → route to `parcel-ops`.
- "Generate a buyer teaser PDF for this deal." → route to `property-report`.
