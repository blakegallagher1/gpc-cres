***
name: entitlement-os-phase-b-zoning-analysis
version: "1.1"
description: |
  Use when: User asks for entitlement baseline modeling, zoning-path setup, or asks whether legal path, milestones, or entitlements records are loaded for a deal.
  Don't use when: The request is only about UI navigation, artifact templates, pure market-comps, or financial modeling without entitlement state capture.
  Outputs: Entitlement baseline dossier with deal terms, entitlement path state, milestone map, and required follow-up evidence list.
***

## Prerequisites

- `Entitlement_OS_Meta_Prompt.md` (`Phase B`) and `Entitlement_OS_Phase_B_Restart_Part_1_B1_B2.md`.
- Entitlement phase A output when this is part of a multi-phase workflow.
- Deal context containing `dealId` and current `orgId`.
- Existing API/DB state for `deal terms` and `entitlement path` records.

## Steps

1. Identify the active deal and confirm scope (`B1`/`B2` style entitlement-path setup).
2. Reconcile jurisdiction constraints against proposed use:
   - current zoning,
   - allowed uses,
   - hearing/decision milestones,
   - variance/special-use fallback risk.
3. Validate or initialize `DealTerms` and `EntitlementPath` schema fields if missing.
4. Produce a zoning compliance matrix:
   - required filings,
   - estimated timeline,
   - blocking conditions,
   - likely path recommendation (`CUP`/`Rezoning`/`Variance`).
5. Link outputs to downstream phases:
   - Stage financial assumptions (`C`),
   - Stage risk scoring (`D`),
   - Stage offer/rule constraints (`E`).
6. Return explicit artifacts:
   - entitlements recommendation,
   - required evidence tags,
   - risk flags requiring Phase D escalation.

## Validation

- Output includes `DealTerms` and `EntitlementPath` presence checks or creation plan.
- Recommended path states legal dependencies and decision points explicitly.
- Timeline outputs include at least one of: pre-app, application, hearing, or decision milestone.
- All recommendations include confidence and blockers.
- No invented legal claims without a defined source field in the output.

## Examples
### Good input -> expected output

- "For deal `d-104`, assess whether a variance or CUP is the likely path and return required filing milestones."
- Expected: `EntitlementPath`-scoped recommendation plus milestone checklist and blocker list.

### Bad input -> expected routing

- "Generate a tenant acquisition risk matrix." -> route to `entitlement-os/phase-d-risk-assessment` or `underwriting`, not this phase.
