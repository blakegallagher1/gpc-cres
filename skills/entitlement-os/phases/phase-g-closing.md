***
name: entitlement-os-phase-g-closing
version: "1.1"
description: |
  Use when: User asks for closing analytics, outcome calibration, or portfolio-level readiness after due diligence.
  Don't use when: The request is for active phase offer setup, transaction filing, or non-financial due diligence tracking.
  Outputs: Closure-capable portfolio analytics report with concentration, velocity, capital deployment, debt maturity, and calibration outcomes.
***

## Prerequisites

- `docs/archive/2026-03-20-root-cleanup/Entitlement_OS_Meta_Prompt.md` (`Phase G`) and closing handoff inputs from `phase-f-due-diligence`.
- Portfolio service read-path access scoped by `orgId`.
- Historical triage predictions and outcome metrics available for calibration.

## Steps

1. Collect live closing outputs:
   - completed milestones,
   - active deals,
   - `DealRisk` aggregate,
   - portfolio debt and equity deployment snapshots.
2. Compute concentration risk dimensions:
   - by parish,
   - by SKU,
   - by lender.
3. Compute throughput and quality metrics:
   - time-in-stage median/p90,
   - stage kill rates,
   - funnel leakage by pipeline transition.
4. Build capital deployment and debt-maturity views:
   - committed vs deployed,
   - debt due in 12 months,
   - refinance exposure.
5. Perform outcome-vs-prediction calibration:
   - pre-purchase IRR vs. actual,
   - timeline delta,
   - risk bias score.
6. Return a closeout signal:
   - pass/fail on operational thresholds,
   - alert list for concentration/debt exposure,
   - recommendation for governance review if calibration drift exceeds policy.

## Validation

- All metrics derive from live persistence endpoints (no hard-coded placeholders).
- Threshold logic for HHI and debt maturity risk includes explicit breach labels.
- Calibration checks include at least one quantitative bias metric.
- Closing output separates active, exited, and killed cohorts.

## Examples
### Good input -> expected output

- "Run Phase G closing analytics for this org and show any concentration or debt maturity alerts."
- Expected: metrics report with HHI, velocity, capital deployment, debt wall, and calibration delta results.

### Bad input -> expected routing

- "Run Phase C base/downside underwriting scenario." -> route to `entitlement-os/phase-c-financial-modeling`.
