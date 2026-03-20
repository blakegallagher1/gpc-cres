***
name: entitlement-os-phase-a-discovery
version: "1.1"
description: |
  Use when: A user requests Phase A completion/triage, asks for a consolidated route audit, or asks whether legacy URLs are now mapped in the Entitlement OS consolidation pass.
  Don't use when: The request is pure underwriting, valuation, market comps, parcel geometry, or post-consolidation analytics.
  Outputs: A phase-gated discovery report with route mapping, sidebar parity status, and explicit blockers with evidence paths.
***

## Prerequisites

- Request context is an entitlement workflow task and requests a phase-a entitlement audit.
- `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` and `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Phase_A_Remaining.md`.
- `docs/ENTITLEMENT_OS_META_AUDIT_2026-02-17.md` for prior verification state.
- Access to current app route tree and sidebar config.

## Steps

1. Confirm entitlement context is active and no unrelated skill should be loaded (`underwriting`, `parcel-ops`, `market-trajectory`, `data-extraction`, `property-report`).
2. Execute a strict Phase A check against the seven consolidation families: Runs, Prospecting, Automation, Portfolio, Deals, Reference, Deal Room.
3. For each Phase A item (`A1`–`A10`), record one of: `complete`, `partial`, `missing`, `blocked`.
4. Validate route migration contracts with source/destination evidence:
   - legacy route -> consolidated route/tab
   - removed route -> confirm redirect or removal rationale
5. Validate sidebar structure against the Phase A contract (Core, Pipeline, Intelligence, Settings groups only, no dead links).
6. Produce a dependency-safe output package:
   - completed items and file-level evidence,
   - unresolved gaps,
   - immediate next action items with owning file list.
7. If prior route behavior is missing, return `phase_a_requires_follow_up` with a minimal patch list.

## Validation

- At least 9 of the 10 `A` checkpoints are evaluated (`A1` through `A10`).
- No orphaned feature paths remain in sidebar navigation.
- Every redirect or removed route has a documented destination and evidence path.
- Outputs include a deterministic status object and a prioritized follow-up queue for blockers.

## Examples
### Good input -> expected output

- "Run Phase A discovery and list what is still missing."
- Expected: A JSON-like checklist with each `A1..A10` item status and evidence pointers (`Sidebar.tsx`, route handlers, and redirect pages).

### Bad input -> expected routing

- "Compute DSCR for this acquisition and produce sensitivity output." -> route to `underwriting`, not this phase.
