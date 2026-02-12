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
});
