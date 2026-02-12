const {
  dbMock,
  predictEntitlementStrategiesMock,
  getEntitlementIntelligenceKpisMock,
  createAutomationTaskMock,
} = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn() },
      task: { findFirst: vi.fn() },
    },
  },
  predictEntitlementStrategiesMock: vi.fn(),
  getEntitlementIntelligenceKpisMock: vi.fn(),
  createAutomationTaskMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/entitlementIntelligence.service", () => ({
  predictEntitlementStrategies: predictEntitlementStrategiesMock,
  getEntitlementIntelligenceKpis: getEntitlementIntelligenceKpisMock,
}));
vi.mock("@/lib/automation/notifications", () => ({
  createAutomationTask: createAutomationTaskMock,
}));

import type { EntitlementStrategyPrediction } from "@entitlement-os/shared";
import {
  __testables,
  runEntitlementStrategyAutopilot,
} from "@/lib/services/entitlementStrategyAutopilot.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";
const JURISDICTION_ID = "33333333-3333-4333-8333-333333333333";

const BASE_DEAL = {
  id: DEAL_ID,
  name: "Bluebonnet Truck Yard",
  sku: "TRUCK_PARKING",
  status: "PREAPP",
  jurisdictionId: JURISDICTION_ID,
};

const BASE_PREDICTIONS: EntitlementStrategyPrediction[] = [
  {
    strategyKey: "conditional_use_permit",
    strategyLabel: "Conditional Use Permit",
    probabilityApproval: 0.7,
    probabilityLow: 0.54,
    probabilityHigh: 0.82,
    expectedDaysP50: 84,
    expectedDaysP75: 108,
    expectedDaysP90: 130,
    sampleSize: 14,
    approvalCount: 9,
    conditionalApprovalCount: 3,
    timelineSampleSize: 13,
    confidenceScore: 0.77,
    modelVersion: "entitlement_graph_v1",
    rationale: {
      minSampleSize: 1,
      approvalRateRaw: 0.64,
      priorAlpha: 2,
      priorBeta: 2,
      frictionRatio: 0.2,
      timelineCoverage: 0.93,
    },
  },
  {
    strategyKey: "by_right",
    strategyLabel: "By Right",
    probabilityApproval: 0.64,
    probabilityLow: 0.51,
    probabilityHigh: 0.76,
    expectedDaysP50: 38,
    expectedDaysP75: 52,
    expectedDaysP90: 68,
    sampleSize: 10,
    approvalCount: 6,
    conditionalApprovalCount: 2,
    timelineSampleSize: 9,
    confidenceScore: 0.7,
    modelVersion: "entitlement_graph_v1",
    rationale: {
      minSampleSize: 1,
      approvalRateRaw: 0.6,
      priorAlpha: 2,
      priorBeta: 2,
      frictionRatio: 0.1,
      timelineCoverage: 0.9,
    },
  },
];

describe("entitlement strategy autopilot ranking", () => {
  it("ranks candidates using approval + speed composite score", () => {
    const ranked = __testables.rankStrategyCandidates(BASE_PREDICTIONS);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.strategyKey).toBe("by_right");
    expect(ranked[1]?.strategyKey).toBe("conditional_use_permit");
    expect(ranked[0]!.compositeScore).toBeGreaterThan(ranked[1]!.compositeScore);
  });

  it("holds recommendation when KPI drift thresholds are breached", () => {
    const recommendation = __testables.buildRecommendationPayload({
      kpis: {
        sampleSize: 21,
        matchedPredictionCount: 15,
        medianDecisionDays: 78,
        medianTimelineAbsoluteErrorDays: 48,
        approvalCalibrationGap: 0.04,
      },
      rankedCandidates: __testables.rankStrategyCandidates(BASE_PREDICTIONS),
    });

    expect(recommendation.status).toBe("hold");
    expect(recommendation.reasonCode).toBe("kpi_drift_detected");
    expect(recommendation.recommendedStrategy).toBeNull();
  });

  it("holds recommendation when no strategy predictions are available", () => {
    const recommendation = __testables.buildRecommendationPayload({
      kpis: {
        sampleSize: 18,
        matchedPredictionCount: 12,
        medianDecisionDays: 62,
        medianTimelineAbsoluteErrorDays: 14,
        approvalCalibrationGap: -0.03,
      },
      rankedCandidates: [],
    });

    expect(recommendation.status).toBe("hold");
    expect(recommendation.reasonCode).toBe("no_predictions");
  });
});

describe("runEntitlementStrategyAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbMock.prisma.deal.findFirst.mockResolvedValue(BASE_DEAL);
    predictEntitlementStrategiesMock.mockResolvedValue({
      predictions: BASE_PREDICTIONS,
    });
    getEntitlementIntelligenceKpisMock.mockResolvedValue({
      sampleSize: 22,
      matchedPredictionCount: 16,
      medianDecisionDays: 68,
      medianTimelineAbsoluteErrorDays: 11,
      approvalCalibrationGap: 0.02,
    });
  });

  it("creates actionable tasks when recommendation is eligible", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    createAutomationTaskMock
      .mockResolvedValueOnce({ id: "task-summary" })
      .mockResolvedValueOnce({ id: "task-checklist" });

    const result = await runEntitlementStrategyAutopilot({
      orgId: ORG_ID,
      dealId: DEAL_ID,
      jurisdictionId: JURISDICTION_ID,
      materializeTasks: true,
    });

    expect(result.success).toBe(true);
    expect(result.recommendation.status).toBe("recommended");
    expect(result.tasksCreated).toBe(2);
    expect(result.createdTaskIds).toEqual(["task-summary", "task-checklist"]);
    expect(createAutomationTaskMock).toHaveBeenCalledTimes(2);
    expect(createAutomationTaskMock.mock.calls[0][0].title).toContain("Entitlement strategy autopilot");
    expect(createAutomationTaskMock.mock.calls[0][0].orgId).toBe(ORG_ID);
    expect(createAutomationTaskMock.mock.calls[0][0].dealId).toBe(DEAL_ID);
  });

  it("skips task materialization when open autopilot tasks already exist", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "existing-open-task" });

    const result = await runEntitlementStrategyAutopilot({
      orgId: ORG_ID,
      dealId: DEAL_ID,
      jurisdictionId: JURISDICTION_ID,
      materializeTasks: true,
    });

    expect(result.success).toBe(true);
    expect(result.recommendation.status).toBe("recommended");
    expect(result.tasksCreated).toBe(0);
    expect(result.skippedTaskCreationReason).toBe("open_autopilot_tasks_exist");
    expect(createAutomationTaskMock).not.toHaveBeenCalled();
  });

  it("returns hold recommendation and does not create tasks when KPI guardrails fail", async () => {
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    getEntitlementIntelligenceKpisMock.mockResolvedValue({
      sampleSize: 22,
      matchedPredictionCount: 16,
      medianDecisionDays: 74,
      medianTimelineAbsoluteErrorDays: 43,
      approvalCalibrationGap: -0.17,
    });

    const result = await runEntitlementStrategyAutopilot({
      orgId: ORG_ID,
      dealId: DEAL_ID,
      jurisdictionId: JURISDICTION_ID,
      materializeTasks: true,
    });

    expect(result.success).toBe(true);
    expect(result.recommendation.status).toBe("hold");
    expect(result.recommendation.reasonCode).toBe("kpi_drift_detected");
    expect(result.tasksCreated).toBe(0);
    expect(result.skippedTaskCreationReason).toBe("recommendation_not_actionable");
    expect(createAutomationTaskMock).not.toHaveBeenCalled();
  });
});
