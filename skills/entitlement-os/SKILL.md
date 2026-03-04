***
name: entitlement-os
version: "1.0"
description: |
  Use when: User asks about zoning feasibility, entitlement flips, land-use analysis, variance strategy, municipal code compliance, or any multi-phase entitlement workflow.
  Don't use when: The request is single-lane and better handled by `underwriting`, `market-trajectory`, `data-extraction`, `parcel-ops`, or `property-report`.
  Outputs: Phase-scoped entitlement plan/report with dependencies, required evidence, and handoff-ready phase outputs.
***

## Prerequisites

- The request specifies a phase, roadmap item, or cross-phase objective.
- Source context available: `Entitlement_OS_Meta_Prompt.md`, `docs/ENTITLEMENT_OS_META_AUDIT_2026-02-17.md`, and `ROADMAP.md`.
- Phase references available under `skills/entitlement-os/phases/`.
- Required prior outputs are available for the selected phase:
  - Phase B depends on Phase A discovery output.
  - Phase C depends on Phase B zoning/land-use output.
  - Phase D depends on Phase C underwriting output.
  - Phase E depends on Phase D risk output.
  - Phase F depends on Phase E offer package output.
  - Phase G depends on Phase F diligence closeout output.

## Steps

1. Identify whether the ask is analysis-only or mutation and keep scope explicit.
2. Resolve the active phase and load exactly one phase sub-procedure file:
   - `skills/entitlement-os/phases/phase-a-discovery.md`
   - `skills/entitlement-os/phases/phase-b-zoning-analysis.md`
   - `skills/entitlement-os/phases/phase-c-financial-modeling.md`
   - `skills/entitlement-os/phases/phase-d-risk-assessment.md`
   - `skills/entitlement-os/phases/phase-e-offer-generation.md`
   - `skills/entitlement-os/phases/phase-f-due-diligence.md`
   - `skills/entitlement-os/phases/phase-g-closing.md`
3. Enforce phase sequencing before execution:
   - If prior-phase outputs are missing, return a blocked status and required upstream artifacts.
   - If prior-phase outputs exist, continue with the selected phase checklist.
4. Build a phase-specific checklist using only relevant architecture/security constraints.
5. Map requested outcomes to evidence files, tests, and roadmap status signals.
6. Return a phase summary that states complete, pending, and blocked items.

## Validation

- Exactly one primary phase route is chosen unless the user explicitly requests a multi-phase pass.
- Sequencing is enforced; no phase can skip its required prior-phase outputs.
- Output includes concrete evidence paths and acceptance checks.
- Security and org-scoping constraints are preserved in proposed implementation work.
- No phase is marked complete without verification evidence.

## Examples
### Good input → expected output

- "Show what remains in Phase C and what evidence already exists."
- Expected: Phase C checklist with done/pending items and file/test evidence.

### Bad input → expected routing

- "Score neighborhood momentum for ZIP 70808." → route to `market-trajectory`.
- "Process these uploaded PDFs and compare extracted terms." → route to `data-extraction`.
