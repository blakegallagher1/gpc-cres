***
name: entitlement-os-phase-e-offer-generation
version: "1.1"
description: |
  Use when: User requests offer-package logic, offer readiness checks, or asks whether approvals/contingencies are aligned after financial and risk phases.
  Don't use when: User request is for baseline risk setup only (`phase-d-risk-assessment`) or pre-offer due diligence artifact execution.
  Outputs: Offer-ready gating summary, readiness checklist, and required approvals matrix for offer progression.
***

## Prerequisites

- `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` (`Phase E`) and phase outputs `B`, `C`, `D`.
- Active deal with financial assumptions, risk register, and timeline milestones.
- Current offer policy/contingency templates.

## Steps

1. Validate offer prerequisites:
   - final or near-final `EntitlementPath`,
   - pricing assumptions,
   - financing structure.
2. Reconcile all contingencies against live risk/risk-owner state:
   - zoning/entitlement contingency status,
   - financing commitment conditions,
   - environmental/title/survey blockers.
3. Generate a structured offer checklist:
   - required signatures,
   - legal documents,
   - deadlines tied to milestones.
4. Build an approval matrix:
   - decision owner,
   - approval condition,
   - evidence proof (route path, file hash, timestamp).
5. Emit hold points:
   - missing appraisal/financing confirmation,
   - unresolved title/survey exceptions,
   - unresolved risk status above `gate` or `block`.
6. Return an offer readiness status and exact remediation list.

## Validation

- Offer artifacts include a price/terms summary and explicit condition references.
- Every contingency has a responsible owner and status.
- Missing approvals are surfaced as blocking conditions, not warnings.
- Output is deterministic by phase inputs (no inferred pricing assumptions).

## Examples
### Good input -> expected output

- "Produce phase E offer readiness for deal `d-104` and identify contingencies before board approval."
- Expected: offer checklist, readiness score, and explicit blockers with owner/date.

### Bad input -> expected routing

- "Run due diligence auto-extraction for uploaded phase I docs." -> route to `entitlement-os/phase-f-due-diligence`.
