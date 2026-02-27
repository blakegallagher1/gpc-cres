import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockComputeConfidenceVector,
  mockComputeAnomalyScore,
  mockComputePromotionScore,
  mockComputeDynamicThreshold,
  mockExplainPromotionDecision,
  mockPropagateCausalImpact,
  mockFactTypeToDomain,
} = vi.hoisted(() => ({
  mockComputeConfidenceVector: vi.fn(),
  mockComputeAnomalyScore: vi.fn(),
  mockComputePromotionScore: vi.fn(),
  mockComputeDynamicThreshold: vi.fn(),
  mockExplainPromotionDecision: vi.fn(),
  mockPropagateCausalImpact: vi.fn(),
  mockFactTypeToDomain: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/confidenceScoring", () => ({
  computeConfidenceVector: mockComputeConfidenceVector,
}));

vi.mock("@/lib/services/anomalyDetector", () => ({
  computeAnomalyScore: mockComputeAnomalyScore,
}));

vi.mock("@/lib/services/promotionScoring", () => ({
  computePromotionScore: mockComputePromotionScore,
}));

vi.mock("@/lib/services/dynamicThreshold", () => ({
  computeDynamicThreshold: mockComputeDynamicThreshold,
}));

vi.mock("@/lib/services/promotionExplainer", () => ({
  explainPromotionDecision: mockExplainPromotionDecision,
}));

vi.mock("@/lib/services/causalPropagation", () => ({
  propagateCausalImpact: mockPropagateCausalImpact,
}));

vi.mock("@/lib/services/causalDag", () => ({
  factTypeToDomain: mockFactTypeToDomain,
}));

import { evaluateMemoryWrite } from "@/lib/services/causalTriggers";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_LOG_ID = "33333333-3333-4333-8333-333333333333";

const BASE_CONTEXT = {
  orgId: ORG_ID,
  entityId: ENTITY_ID,
  factType: "comp",
  sourceType: "user",
  payloadJson: { noi: 150000, cap_rate: 0.065 },
  economicWeight: 0.7,
  volatilityClass: "stable",
  eventLogId: EVENT_LOG_ID,
};

const MOCK_VECTOR = {
  structural_confidence: 0.9,
  source_reliability_score: 0.8,
  cross_memory_agreement_score: 0.7,
  calibration_support_score: 0.6,
  anomaly_score: 0.0,
};

const MOCK_THRESHOLD = {
  threshold: 0.65,
  baseThreshold: 0.65,
  adjustments: [],
};

function setupPromotedPipeline() {
  mockComputeConfidenceVector.mockResolvedValue({ ...MOCK_VECTOR });
  mockComputeAnomalyScore.mockResolvedValue(0.1);
  mockComputePromotionScore.mockReturnValue({ score: 0.75, contributions: {} });
  mockComputeDynamicThreshold.mockResolvedValue(MOCK_THRESHOLD);
  mockExplainPromotionDecision.mockReturnValue({
    promoted: true,
    score: 0.75,
    threshold: 0.65,
    factors: [],
    strongestFactor: "structural_confidence",
    weakestFactor: "calibration_support_score",
  });
}

function setupRejectedPipeline() {
  mockComputeConfidenceVector.mockResolvedValue({ ...MOCK_VECTOR });
  mockComputeAnomalyScore.mockResolvedValue(0.5);
  mockComputePromotionScore.mockReturnValue({ score: 0.45, contributions: {} });
  mockComputeDynamicThreshold.mockResolvedValue(MOCK_THRESHOLD);
  mockExplainPromotionDecision.mockReturnValue({
    promoted: false,
    score: 0.45,
    threshold: 0.65,
    factors: [],
    strongestFactor: "structural_confidence",
    weakestFactor: "anomaly_score",
  });
}

describe("evaluateMemoryWrite", () => {
  beforeEach(() => {
    mockComputeConfidenceVector.mockReset();
    mockComputeAnomalyScore.mockReset();
    mockComputePromotionScore.mockReset();
    mockComputeDynamicThreshold.mockReset();
    mockExplainPromotionDecision.mockReset();
    mockPropagateCausalImpact.mockReset();
    mockFactTypeToDomain.mockReset();
  });

  it("runs full pipeline and returns confidence vector with anomaly score injected", async () => {
    setupPromotedPipeline();
    mockFactTypeToDomain.mockReturnValue("noi");
    mockPropagateCausalImpact.mockResolvedValue({
      sourceDomain: "noi",
      steps: [],
      traceIds: [],
    });

    const result = await evaluateMemoryWrite(BASE_CONTEXT);

    expect(result.confidenceVector.anomaly_score).toBe(0.1);
    expect(mockComputeConfidenceVector).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        factType: "comp",
      }),
    );
    expect(mockComputeAnomalyScore).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        factType: "comp",
        payload: BASE_CONTEXT.payloadJson,
      }),
    );
  });

  it("triggers causal propagation when promoted and in a causal domain", async () => {
    setupPromotedPipeline();
    mockFactTypeToDomain.mockReturnValue("noi");
    mockPropagateCausalImpact.mockResolvedValue({
      sourceDomain: "noi",
      steps: [{ sourceDomain: "noi", targetDomain: "dscr" }],
      traceIds: ["trace-1"],
    });

    const result = await evaluateMemoryWrite(BASE_CONTEXT);

    expect(result.promotionDecision.promoted).toBe(true);
    expect(result.propagation).not.toBeNull();
    expect(result.propagation?.sourceDomain).toBe("noi");
    expect(mockPropagateCausalImpact).toHaveBeenCalledWith(
      ORG_ID,
      ENTITY_ID,
      EVENT_LOG_ID,
      "comp",
      0.7,
    );
  });

  it("does not trigger causal propagation when not promoted", async () => {
    setupRejectedPipeline();
    mockFactTypeToDomain.mockReturnValue("noi");

    const result = await evaluateMemoryWrite(BASE_CONTEXT);

    expect(result.promotionDecision.promoted).toBe(false);
    expect(result.propagation).toBeNull();
    expect(mockPropagateCausalImpact).not.toHaveBeenCalled();
  });

  it("does not trigger causal propagation when fact type has no domain", async () => {
    setupPromotedPipeline();
    mockFactTypeToDomain.mockReturnValue(null);

    const result = await evaluateMemoryWrite(BASE_CONTEXT);

    expect(result.promotionDecision.promoted).toBe(true);
    expect(result.propagation).toBeNull();
    expect(mockPropagateCausalImpact).not.toHaveBeenCalled();
  });

  it("passes promotion score and threshold to decision explainer", async () => {
    setupPromotedPipeline();
    mockFactTypeToDomain.mockReturnValue(null);

    await evaluateMemoryWrite(BASE_CONTEXT);

    expect(mockExplainPromotionDecision).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly_score: 0.1 }),
      { score: 0.75, contributions: {} },
      MOCK_THRESHOLD,
    );
  });

  it("passes volatilityClass to dynamic threshold", async () => {
    setupPromotedPipeline();
    mockFactTypeToDomain.mockReturnValue(null);

    await evaluateMemoryWrite({
      ...BASE_CONTEXT,
      volatilityClass: "high_volatility",
    });

    expect(mockComputeDynamicThreshold).toHaveBeenCalledWith(
      expect.objectContaining({
        volatilityClass: "high_volatility",
      }),
    );
  });
});
