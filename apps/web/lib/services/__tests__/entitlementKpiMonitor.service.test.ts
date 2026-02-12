import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/services/entitlementKpiMonitor.service";

type KpiSnapshotInput = Parameters<typeof __testables.evaluateKpiDrift>[0];

describe("entitlement KPI drift evaluation", () => {
  it("is ineligible when sample sizes are below monitoring minimums", () => {
    const evaluation = __testables.evaluateKpiDrift({
      sampleSize: 4,
      matchedPredictionCount: 3,
      medianTimelineAbsoluteErrorDays: 42,
      approvalCalibrationGap: 0.22,
      medianDecisionDays: 70,
    } as KpiSnapshotInput);

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.breaches).toEqual([]);
  });

  it("flags timeline MAE breach when error exceeds guardrail", () => {
    const evaluation = __testables.evaluateKpiDrift({
      sampleSize: 20,
      matchedPredictionCount: 15,
      medianTimelineAbsoluteErrorDays: 38,
      approvalCalibrationGap: 0.02,
      medianDecisionDays: 65,
    } as KpiSnapshotInput);

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.breaches).toEqual(["timeline_mae"]);
  });

  it("flags calibration drift by absolute gap", () => {
    const evaluation = __testables.evaluateKpiDrift({
      sampleSize: 25,
      matchedPredictionCount: 14,
      medianTimelineAbsoluteErrorDays: 19,
      approvalCalibrationGap: -0.19,
      medianDecisionDays: 58,
    } as KpiSnapshotInput);

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.breaches).toEqual(["calibration_gap"]);
  });
});

describe("entitlement KPI alert rendering", () => {
  it("builds deterministic monitor keys", () => {
    const monitorKey = __testables.buildMonitorKey("j-1", {
      eligible: true,
      breaches: ["calibration_gap", "timeline_mae"],
      values: {
        sampleSize: 18,
        matchedPredictionCount: 10,
        medianTimelineAbsoluteErrorDays: 37.22,
        approvalCalibrationGap: -0.15321,
        medianDecisionDays: 44,
      },
    });

    expect(monitorKey).toBe("j-1|calibration_gap,timeline_mae|mae:37.2|gap:-0.1532");
  });

  it("renders alert title and body with threshold context", () => {
    const evaluation = {
      eligible: true,
      breaches: ["timeline_mae"] as const,
      values: {
        sampleSize: 27,
        matchedPredictionCount: 17,
        medianTimelineAbsoluteErrorDays: 41,
        approvalCalibrationGap: 0.09,
        medianDecisionDays: 74,
      },
    };
    const title = __testables.buildAlertTitle("East Baton Rouge", [...evaluation.breaches]);
    const body = __testables.buildAlertBody({
      jurisdictionName: "East Baton Rouge",
      evaluation,
    });

    expect(title).toContain("timeline drift");
    expect(body).toContain("Timeline MAE: 41d");
    expect(body).toContain("threshold 30d");
    expect(body).toContain("Sample size: 27, matched predictions: 17.");
  });
});
