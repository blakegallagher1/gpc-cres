import { describe, expect, it } from "vitest";

import { __testables } from "@/lib/services/entitlementIntelligence.service";

describe("entitlement intelligence feature primitives", () => {
  it("aggregates strategy-level rates and timeline percentiles with sample-size gating", () => {
    const features = __testables.buildEntitlementFeaturePrimitives({
      minSampleSize: 2,
      records: [
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "approved",
          timelineDays: 40,
          submittedAt: new Date("2025-01-01"),
          decisionAt: new Date("2025-02-10"),
          confidence: 0.9,
          riskFlags: ["traffic"],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "approved_with_conditions",
          timelineDays: null,
          submittedAt: new Date("2025-01-20"),
          decisionAt: new Date("2025-03-11"),
          confidence: 0.8,
          riskFlags: ["traffic", "flood"],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "denied",
          timelineDays: 70,
          submittedAt: new Date("2025-02-01"),
          decisionAt: new Date("2025-04-12"),
          confidence: 0.6,
          riskFlags: ["flood"],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "conditional_use_permit",
          strategyLabel: "Conditional Use Permit",
          decision: "approved",
          timelineDays: 25,
          submittedAt: new Date("2025-02-01"),
          decisionAt: new Date("2025-02-26"),
          confidence: 0.7,
          riskFlags: ["noise"],
          hearingBody: "Metro Council",
          applicationType: "Conditional Use Permit",
        },
      ],
    });

    expect(features.totalPrecedents).toBe(4);
    expect(features.strategyFeatures).toHaveLength(1);
    expect(features.strategyFeatures[0]).toMatchObject({
      groupKey: "rezoning",
      sampleSize: 3,
      approvalRate: 0.6667,
      conditionRate: 0.3333,
      denialRate: 0.3333,
      withdrawalRate: 0,
      timelineSampleSize: 3,
      timelineP50Days: 50,
      timelineP75Days: 70,
      timelineP90Days: 70,
      avgConfidence: 0.7667,
      latestDecisionAt: "2025-04-12",
    });
    expect(features.strategyFeatures[0]?.topRiskFlags.slice(0, 2)).toEqual([
      { riskFlag: "flood", count: 2, rate: 0.6667 },
      { riskFlag: "traffic", count: 2, rate: 0.6667 },
    ]);
  });

  it("uses unknown fallback buckets for missing hearing body and application type", () => {
    const features = __testables.buildEntitlementFeaturePrimitives({
      minSampleSize: 1,
      records: [
        {
          strategyKey: "site_plan",
          strategyLabel: "Site Plan",
          decision: "withdrawn",
          timelineDays: null,
          submittedAt: null,
          decisionAt: null,
          confidence: 0.5,
          riskFlags: [],
          hearingBody: null,
          applicationType: null,
        },
      ],
    });

    expect(features.hearingBodyFeatures[0]).toMatchObject({
      groupKey: "unknown_hearing_body",
      groupLabel: "unknown_hearing_body",
      sampleSize: 1,
      withdrawalRate: 1,
    });
    expect(features.applicationTypeFeatures[0]).toMatchObject({
      groupKey: "unknown_application_type",
      groupLabel: "unknown_application_type",
      sampleSize: 1,
      withdrawalRate: 1,
    });
  });

  it("summarizes graph edge influence features for connected strategy nodes", () => {
    const features = __testables.buildEntitlementFeaturePrimitives({
      minSampleSize: 1,
      records: [],
      nodes: [
        {
          id: "strategy-1",
          nodeType: "strategy_path",
          nodeKey: "rezoning",
          label: "Rezoning",
        },
        {
          id: "rule-1",
          nodeType: "jurisdiction_rule",
          nodeKey: "height_limit",
          label: "Height Limit",
        },
        {
          id: "condition-1",
          nodeType: "condition",
          nodeKey: "traffic_study",
          label: "Traffic Study",
        },
      ],
      edges: [
        {
          edgeType: "requires",
          weight: 0.8,
          fromNodeId: "strategy-1",
          toNodeId: "rule-1",
        },
        {
          edgeType: "requires",
          weight: 0.6,
          fromNodeId: "rule-1",
          toNodeId: "strategy-1",
        },
        {
          edgeType: "accelerates",
          weight: 0.3,
          fromNodeId: "strategy-1",
          toNodeId: "condition-1",
        },
      ],
    });

    expect(features.graphCoverage).toEqual({
      strategyNodeCount: 1,
      connectedNodeCount: 3,
      connectedEdgeCount: 3,
      nodeTypeCounts: {
        condition: 1,
        jurisdiction_rule: 1,
        strategy_path: 1,
      },
    });
    expect(features.edgeFeatures).toHaveLength(2);
    expect(features.edgeFeatures[0]).toEqual({
      edgeType: "requires",
      sampleSize: 2,
      averageWeight: 0.7,
      minWeight: 0.6,
      maxWeight: 0.8,
      connectedStrategyKeys: ["rezoning"],
      connectedNodeTypes: ["jurisdiction_rule", "strategy_path"],
    });
  });

  it("computes calibration diagnostics from confidence and observed outcomes", () => {
    const calibration = __testables.buildCalibrationSummary(
      [
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "approved",
          timelineDays: 45,
          submittedAt: new Date("2025-01-01"),
          decisionAt: new Date("2025-02-15"),
          confidence: 0.8,
          riskFlags: [],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "denied",
          timelineDays: 60,
          submittedAt: new Date("2025-01-10"),
          decisionAt: new Date("2025-03-11"),
          confidence: 0.7,
          riskFlags: ["traffic"],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "variance",
          strategyLabel: "Variance",
          decision: "approved_with_conditions",
          timelineDays: 30,
          submittedAt: new Date("2025-02-01"),
          decisionAt: new Date("2025-03-03"),
          confidence: 0.6,
          riskFlags: ["setback"],
          hearingBody: "Board of Adjustment",
          applicationType: "Variance",
        },
      ],
      1,
    );

    expect(calibration.overall).toEqual({
      sampleSize: 3,
      meanPredictedApproval: 0.7,
      observedApprovalRate: 0.6667,
      calibrationGap: 0.0333,
      brierScore: 0.23,
    });
    expect(calibration.byStrategy).toHaveLength(2);
    expect(calibration.byHearingBody).toHaveLength(2);
    expect(calibration.confidenceBuckets).toHaveLength(3);
  });

  it("computes KPI forecast-error diagnostics from precedents and historical snapshots", () => {
    const kpis = __testables.buildEntitlementKpiSummary({
      minSampleSize: 1,
      precedents: [
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "approved",
          timelineDays: 40,
          submittedAt: new Date("2025-01-01"),
          decisionAt: new Date("2025-02-10"),
          confidence: 0.8,
          riskFlags: [],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          decision: "denied",
          timelineDays: 60,
          submittedAt: new Date("2025-01-20"),
          decisionAt: new Date("2025-03-20"),
          confidence: 0.6,
          riskFlags: ["traffic"],
          hearingBody: "Planning Commission",
          applicationType: "Rezoning",
        },
        {
          strategyKey: "variance",
          strategyLabel: "Variance",
          decision: "approved_with_conditions",
          timelineDays: 30,
          submittedAt: new Date("2025-03-01"),
          decisionAt: new Date("2025-04-01"),
          confidence: 0.7,
          riskFlags: ["setback"],
          hearingBody: "Board of Adjustment",
          applicationType: "Variance",
        },
      ],
      snapshots: [
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          probabilityApproval: 0.8,
          expectedDaysP50: 45,
          createdAt: new Date("2025-01-15"),
        },
        {
          strategyKey: "rezoning",
          strategyLabel: "Rezoning",
          probabilityApproval: 0.3,
          expectedDaysP50: 55,
          createdAt: new Date("2025-03-01"),
        },
        {
          strategyKey: "variance",
          strategyLabel: "Variance",
          probabilityApproval: 0.65,
          expectedDaysP50: 25,
          createdAt: new Date("2025-03-20"),
        },
      ],
    });

    expect(kpis.sampleSize).toBe(3);
    expect(kpis.matchedPredictionCount).toBe(3);
    expect(kpis.predictionMatchRate).toBe(1);
    expect(kpis.medianDecisionDays).toBe(40);
    expect(kpis.medianTimelineAbsoluteErrorDays).toBe(5);
    expect(kpis.meanTimelineAbsoluteErrorDays).toBe(5);
    expect(kpis.meanPredictedApproval).toBe(0.5833);
    expect(kpis.observedApprovalRate).toBe(0.6667);
    expect(kpis.approvalCalibrationGap).toBe(-0.0834);
    expect(kpis.approvalBrierScore).toBe(0.0842);
    expect(kpis.approvalDirectionAccuracy).toBe(1);
    expect(kpis.byStrategy).toHaveLength(2);
    expect(kpis.byStrategy[0]).toMatchObject({
      strategyKey: "rezoning",
      sampleSize: 2,
      matchedPredictionCount: 2,
      meanPredictedApproval: 0.55,
      observedApprovalRate: 0.5,
      approvalCalibrationGap: 0.05,
      approvalBrierScore: 0.065,
      medianTimelineAbsoluteErrorDays: 5,
    });
    expect(kpis.trend).toHaveLength(3);
    expect(kpis.trend[0]).toMatchObject({
      month: "2025-02",
      sampleSize: 1,
      medianDecisionDays: 40,
      medianTimelineAbsoluteErrorDays: 5,
      approvalCalibrationGap: -0.2,
    });
  });
});
