***
name: entitlement-os-phase-c-financial-modeling
version: "1.1"
description: |
  Use when: The request is for entitlement-centered financial modeling, multi-scenario stress testing, sources-and-uses, or exit modeling during a deal workflow.
  Don't use when: User asks for pure zoning filing logic, portal routing, artifact generation, or raw parcel screening.
  Outputs: Deterministic financial model status, scenario outputs (base/upside/downside), risk-adjusted recommendation, and missing-input remediation list.
***

## Prerequisites

- `Entitlement_OS_Meta_Prompt.md` (`Phase C`) and `Entitlement_OS_Phase_B_Restart_Part_*.md` when entitlement structure exists.
- Baseline deal data in `DealTerms`, `EntitlementPath`, and current financial assumptions.
- Prior phase output from `entitlement-os-phase-b-zoning-analysis`.

## Steps

1. Confirm the input model and assumptions are complete:
   - rent roll data,
   - development budget assumptions,
   - capital stack assumptions.
2. Build or validate line-item budget structure:
   - acquisition,
   - soft/hard contingencies,
   - debt schedule assumptions.
3. Run baseline underwriting calculations:
   - NOI,
   - debt capacity,
   - DSCR,
   - IRR/pro forma equity returns.
4. Execute predefined scenario set:
   - Base,
   - Upside,
   - Downside,
   - rate shock,
   - recession/tenant loss scenarios.
5. Add exit scenario calculations when `Phase C` requires exit and refinance checks.
6. Run tax and after-tax IRR checks where closing date and disposition schedule are available.
7. Emit expected-value summary and explicit assumptions used for each scenario.

## Validation

- Baseline and at least three scenario outputs are present.
- Capital sources and uses include consistency check: total sources equals total uses.
- Model has explicit source-of-assumption tags (`derived from terms`, `user-entered`, `tool-estimated`).
- Risk outputs include confidence bands or directional impact comments.
- Missing required fields produce hard-fail recommendations, not silent defaults.

## Examples
### Good input -> expected output

- "Run phase C for deal `d-104` with base/upside/downside sensitivity and include tax-adjusted IRR."
- Expected: scenario comparison, capital stack consistency check, and exit-sensitive value bands.

### Bad input -> expected routing

- "Route this property in the new navigation sidebar." -> route to `entitlement-os/phase-a-discovery`, not this phase.
