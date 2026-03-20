***
name: entitlement-os-phase-f-due-diligence
version: "1.1"
description: |
  Use when: User asks for diligence execution, document-driven diligence status, artifact validation, or due diligence closeout criteria before transition to closing.
  Don't use when: The request only checks high-level portfolio outcomes or pre-offer phase logic.
  Outputs: Diligence completion map, open-item tracker, and a structured closeout readiness signal.
***

## Prerequisites

- `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` (`Phase F`) and `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Phase_A_Remaining.md` if any workflow re-baselining is required.
- Deal docs from title/survey/environmental/financing/financial phases.
- Evidence traceability: extraction IDs, upload IDs, and extraction schema versions.

## Steps

1. Validate diligence category coverage:
   - title,
   - survey,
   - environmental,
   - financing commitments,
   - appraisal/document compliance.
2. Run extraction integrity checks on recently uploaded evidence:
   - schema extraction success,
   - missing key fields,
   - unresolved OCR or parser errors.
3. Reconcile document-derived findings with structured records:
   - `PropertyTitle`,
   - `PropertySurvey`,
   - `EnvironmentalAssessment`,
   - `DealFinancing`.
4. Build open-item map by owner, due date, and dependency.
5. Generate a go/no-go decision candidate:
   - `approve_to_close`,
   - `hold_for_fixes`,
   - `reject`.
6. Prepare the closing handoff packet:
   - evidence list,
   - unresolved risk summary,
   - required approvals still pending.

## Validation

- Every diligence bucket has `complete | partial | missing`.
- At least one trace path links each open item to evidence source.
- No hidden defaults: missing extractions produce explicit collection tasks.
- Decision output includes closeout blocker list with owners.

## Examples
### Good input -> expected output

- "Prepare phase F due-diligence status for `d-104`, including what blocks closing."
- Expected: diligence ledger by category and a structured `hold_for_fixes` closeout recommendation.

### Bad input -> expected routing

- "Compute concentration risk scores across portfolio." -> route to `entitlement-os/phase-g-closing`.
