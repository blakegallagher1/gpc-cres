***
name: market-trajectory
version: "1.0"
description: |
  Use when: User asks for market trends, comp trajectory, submarket performance, absorption, permit momentum, or forward trajectory analysis.
  Don't use when: The request is primarily `underwriting`, `entitlement-os`, `parcel-ops`, `data-extraction`, or `property-report`.
  Outputs: Market analysis report with trend metrics, scenario bands/confidence intervals, and cited source assumptions.
***

## Prerequisites

- Geography is defined (ZIP, neighborhood, corridor, or parish scope).
- Data tool paths are available in `market-trajectory-agent/` and parcel context tools in `packages/openai/src/tools/propertyDbTools.ts`.
- Time window and scoring lens are explicit (for example 12-month permit trend).

## Steps

1. Pull permit activity and normalize it to the requested geography/time window.
2. Collect neighborhood-change indicators (business openings, amenity signals, related place patterns).
3. Join parcel context where needed to avoid area-level overgeneralization.
4. Score and label momentum tiers with transparent weighting.
5. Return ranked findings plus caveats for sparse or conflicting data.

## Validation

- Each area has a clear score label and supporting evidence points.
- Method and lookback period are stated explicitly.
- Missing data and blind spots are disclosed, not inferred away.
- Output format matches request (table summary vs GeoJSON).

## Examples
### Good input → expected output

- "Rank 70808, 70810, and Mid City by 12-month momentum using permits plus place indicators."
- Expected: Ranked area summary with scores, signal counts, and caveats.

### Bad input → expected routing

- "Build debt sizing and return sensitivities for this acquisition." → route to `underwriting`.
- "Produce an investment memo PDF from this deal." → route to `property-report`.
