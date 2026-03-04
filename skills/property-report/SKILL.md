***
name: property-report
version: "1.0"
description: |
  Use when: User requests a property report, investment memo, offering memorandum, IC packet, or presentation deck artifact.
  Don't use when: The request is primarily `underwriting`, `parcel-ops`, `data-extraction`, `market-trajectory`, or `entitlement-os`.
  Outputs: Formatted property report artifact package (PPTX/PDF) plus generation status and evidence trace.
***

## Prerequisites

- Deal context is available (`orgId`, `dealId`, target artifact type).
- Generation path available via `packages/openai/src/tools/artifactTools.ts` and `apps/web/app/api/deals/[id]/artifacts/route.ts`.
- Required upstream inputs for the selected artifact are present.

## Steps

1. Map the request to a supported artifact type and verify stage prerequisites.
2. Check prerequisite data (for example parcels, triage outputs, comparison set).
3. Trigger artifact generation through the tool or route pathway.
4. Capture artifact metadata (id/type/version/status) and any blocking conditions.
5. Return retrieval details and next actions if generation is blocked.

## Validation

- Unsupported artifact type fails fast with a clear reason.
- Stage/data gating is explicit in the response.
- Successful output includes artifact identity and status.
- No success claim if generation did not complete.

## Examples
### Good input → expected output

- "Generate `TRIAGE_PDF` for deal `d-220` and return artifact metadata."
- Expected: Artifact status payload with id/type/version and retrieval path.

### Bad input → expected routing

- "Find C-2 parcels over 1 acre near LSU." → route to `parcel-ops`.
- "Extract lease terms from uploaded docs and compare to stored deal fields." → route to `data-extraction`.
