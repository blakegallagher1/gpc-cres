import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  classifyIntentMock,
  retrieveMemoryForIntentMock,
  getCalibrationSegmentForEntityMock,
  getCalibrationDeltaMock,
} = vi.hoisted(() => ({
  classifyIntentMock: vi.fn(),
  retrieveMemoryForIntentMock: vi.fn(),
  getCalibrationSegmentForEntityMock: vi.fn(),
  getCalibrationDeltaMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@gpc/server/services/intent-classifier.service", () => ({
  classifyIntent: classifyIntentMock,
}));

vi.mock("@gpc/server/services/memory-retrieval.service", () => ({
  retrieveMemoryForIntent: retrieveMemoryForIntentMock,
}));

vi.mock("@gpc/server/services/calibration.service", () => ({
  getCalibrationSegmentForEntity: getCalibrationSegmentForEntityMock,
  getCalibrationDelta: getCalibrationDeltaMock,
}));

import { buildMemoryContext } from "@/lib/services/memoryContextBuilder";

const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    orgId: ORG_ID,
    entityId: ENTITY_ID,
    factType: "comp",
    sourceType: "agent",
    economicWeight: 0.8,
    volatilityClass: "stable",
    payloadJson: { sale_price: 2500000, cap_rate: 6.5 },
    requestId: "request-1",
    eventLogId: "event-1",
    tier: 0,
    createdAt: new Date("2026-02-15T00:00:00Z"),
    ...overrides,
  };
}

describe("calibrationInjection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects [Calibration Adjustments] when intent is underwrite", async () => {
    classifyIntentMock.mockResolvedValue({
      intent: "underwrite",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
      retrieval_k: 10,
    });
    retrieveMemoryForIntentMock.mockResolvedValue({
      tier0Items: [{ tier: 0, score: 0.9, record: makeRecord() }],
      tier1Items: [],
      tier2Items: [],
      totalTokensEstimate: 120,
    });

    getCalibrationSegmentForEntityMock.mockResolvedValue({
      orgId: ORG_ID,
      propertyType: "industrial",
      market: "Baton Rouge",
      strategy: "default",
      leverageBand: "default",
      vintageYear: 2026,
    });
    getCalibrationDeltaMock.mockResolvedValue([
      { metricKey: "noi", bias: 0.1, confidence: 0.75, sampleN: 10 },
    ]);

    const result = await buildMemoryContext({
      userMessage: "Underwrite this deal",
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result?.contextBlock).toContain("[Calibration Adjustments]");
    expect(result?.contextBlock).toContain("sampleN: 10");
    expect(result?.contextBlock).toContain("confidence: 0.75");
    expect(result?.contextBlock).toContain("noi: bias +0.1000");
  });

  it("does not inject calibration for non-underwrite intents", async () => {
    classifyIntentMock.mockResolvedValue({
      intent: "general",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
      retrieval_k: 10,
    });
    retrieveMemoryForIntentMock.mockResolvedValue({
      tier0Items: [{ tier: 0, score: 0.9, record: makeRecord() }],
      tier1Items: [],
      tier2Items: [],
      totalTokensEstimate: 120,
    });

    const result = await buildMemoryContext({
      userMessage: "hello",
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(getCalibrationSegmentForEntityMock).not.toHaveBeenCalled();
    expect(getCalibrationDeltaMock).not.toHaveBeenCalled();
    expect(result?.contextBlock).not.toContain("[Calibration Adjustments]");
  });
});
