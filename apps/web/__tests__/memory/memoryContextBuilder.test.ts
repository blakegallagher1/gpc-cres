import { beforeEach, describe, expect, it, vi } from "vitest";

const { classifyIntentMock, retrieveMemoryForIntentMock } = vi.hoisted(() => ({
  classifyIntentMock: vi.fn(),
  retrieveMemoryForIntentMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/intentClassifier", () => ({
  classifyIntent: classifyIntentMock,
}));

vi.mock("@/lib/services/memoryRetrieval", () => ({
  retrieveMemoryForIntent: retrieveMemoryForIntentMock,
}));

import { buildMemoryContext } from "@/lib/services/memoryContextBuilder";
import { DEFAULT_INTENT_CLASSIFICATION } from "@/lib/schemas/intentClassification";
import { INJECTION_BUDGET } from "@/lib/services/injectionBudget";

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

describe("memoryContextBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when entityId is not provided", async () => {
    const result = await buildMemoryContext({
      userMessage: "hello",
      orgId: ORG_ID,
    });

    expect(result).toBeNull();
    expect(classifyIntentMock).not.toHaveBeenCalled();
    expect(retrieveMemoryForIntentMock).not.toHaveBeenCalled();
  });

  it("returns null when retrieval returns empty tiers", async () => {
    classifyIntentMock.mockResolvedValue(DEFAULT_INTENT_CLASSIFICATION);
    retrieveMemoryForIntentMock.mockResolvedValue({
      tier0Items: [],
      tier1Items: [],
      tier2Items: [],
      totalTokensEstimate: 0,
    });

    const result = await buildMemoryContext({
      userMessage: "hello",
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result).toBeNull();
  });

  it("formats tier0 items under [Key Facts] section", async () => {
    classifyIntentMock.mockResolvedValue(DEFAULT_INTENT_CLASSIFICATION);
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

    expect(result).not.toBeNull();
    expect(result?.contextBlock).toContain("[Key Facts (always-injected)]");
    expect(result?.itemCount).toBe(1);
  });

  it("formats tier1 items with intent label", async () => {
    classifyIntentMock.mockResolvedValue({
      intent: "lender_compare",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
      retrieval_k: 10,
    });
    retrieveMemoryForIntentMock.mockResolvedValue({
      tier0Items: [],
      tier1Items: [
        {
          tier: 1,
          score: 0.8,
          record: makeRecord({
            factType: "lender_term",
            sourceType: "user",
            tier: 1,
            payloadJson: { condition_rating: "good", min_dscr: 1.2 },
          }),
        },
      ],
      tier2Items: [],
      totalTokensEstimate: 150,
    });

    const result = await buildMemoryContext({
      userMessage: "Compare lender terms",
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result?.contextBlock).toContain("[Relevant Memory (lender_compare)]");
  });

  it("truncates context block when it exceeds TOTAL_CONTEXT_TOKENS * 4 chars", async () => {
    classifyIntentMock.mockResolvedValue(DEFAULT_INTENT_CLASSIFICATION);
    retrieveMemoryForIntentMock.mockResolvedValue({
      tier0Items: [
        {
          tier: 0,
          score: 0.7,
          record: makeRecord({
            payloadJson: {
              notes: "x".repeat(15000),
            },
          }),
        },
      ],
      tier1Items: [],
      tier2Items: [],
      totalTokensEstimate: 3000,
    });

    const result = await buildMemoryContext({
      userMessage: "Need details",
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result?.contextBlock).toBeDefined();
    expect(result?.contextBlock.length).toBeLessThanOrEqual(
      INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS * 4,
    );
  });
});
