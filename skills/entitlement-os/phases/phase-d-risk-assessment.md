***
name: entitlement-os-phase-d-risk-assessment
version: "1.1"
description: |
  Use when: User asks for formal risk register execution, risk scoring, mitigation sequencing, or Phase D escalation logic before offer/closure progression.
  Don't use when: The request is only about raw financial math, route consolidation, or artifact generation without risk posture.
  Outputs: Prioritized risk register, mitigation plan, and a phase advancement gate signal (`proceed`, `gate`, `block`).
***

## Prerequisites

- `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` (`Phase D`) and entitlement-specific tool inventory.
- `Entitlement_OS_Phase_B_Restart_Part_3_B5.md` for baseline risk model fields.
- `DealRisk`-eligible data from prior phases (`B3`–`D`).

## Steps

1. Load all known risk inputs:
   - entitlement path constraints,
   - environmental findings,
   - financing terms,
   - market and execution assumptions.
2. Normalize into categories:
   - environmental,
   - entitlement/legal,
   - financial,
   - operational,
   - market.
3. Score each risk with explicit severity and probability values.
4. Generate mitigations with:
   - owner,
   - target date,
   - acceptance criteria.
5. Mark phase gate status:
   - `proceed` for controlled risks,
   - `gate` for unresolved but workable items,
   - `block` for stopping conditions.
6. Create and update `DealRisk` output objects for all unresolved high/critical items.
7. Return portfolio-level rollup signals if repeated risk classes cluster by category.

## Validation

- Each risk has category, severity, probability, and mitigation metadata.
- No risk card is emitted without a required next action and owner.
- Blocking risks are called out first and prevent downstream phase advancement.
- Portfolio clustering check is included when more than 3 risks share one category.

## Examples
### Good input -> expected output

- "Generate the Phase D risk register for `d-104` and show which risks block closing."
- Expected: categorized risk table with severity/probability, mitigation owners, and a clear phase gate status.

### Bad input -> expected routing

- "Draft the buyer teaser PDF." -> route to `property-report` or `entitlement-os/phase-f-due-diligence`.
