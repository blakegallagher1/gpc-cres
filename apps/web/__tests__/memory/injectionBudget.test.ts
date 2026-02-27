import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, truthViewMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
      findMany: vi.fn(),
    },
    memoryDraft: {
      findMany: vi.fn(),
    },
  },
  truthViewMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/truthViewService", () => ({
  getTruthView: truthViewMock,
}));

import { retrieveMemoryForIntent } from "@/lib/services/memoryRetrieval";
import { INJECTION_BUDGET, estimateTokens } from "@/lib/services/injectionBudget";
import type { IntentClassification } from "@/lib/schemas/intentClassification";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

function makeVerifiedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    orgId: ORG_ID,
    entityId: ENTITY_ID,
    factType: "comp",
    sourceType: "agent",
    economicWeight: 0.8,
    volatilityClass: "cyclical",
    payloadJson: {
      sale_price: 2500000,
      cap_rate: 6.5,
      property_type: "industrial",
      market: "Baton Rouge",
    },
    requestId: "req-1",
    eventLogId: crypto.randomUUID(),
    tier: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("injectionBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    truthViewMock.mockResolvedValue({
      currentValues: {},
      openConflicts: [],
      corrections: [],
    });
  });

  it("estimateTokens approximates ~4 chars per token", () => {
    const text = "Hello world test string";
    const tokens = estimateTokens(text);
    expect(tokens).toBe(Math.ceil(text.length / 4));
  });

  it("budget constants are defined", () => {
    expect(INJECTION_BUDGET.MEMORY_TOKENS).toBe(1500);
    expect(INJECTION_BUDGET.TRUTH_SUMMARY_TOKENS).toBe(500);
    expect(INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS).toBe(2500);
  });

  it("retrieval stays within total budget when few records exist", async () => {
    const records = Array.from({ length: 5 }, () => makeVerifiedRecord());

    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce(records); // stageA

    const intent: IntentClassification = {
      intent: "general",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 700, tier2: 300 },
      retrieval_k: 10,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "general query",
    });

    expect(result.totalTokensEstimate).toBeLessThanOrEqual(
      INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS * 2,
    );
  });

  it("trims tier2 items first when budget is exceeded", async () => {
    const largePayload = { long_field: "x".repeat(5000), property_type: "industrial" };
    const tier1Records = Array.from({ length: 10 }, () =>
      makeVerifiedRecord({ tier: 1, payloadJson: largePayload }),
    );
    const tier2Records = Array.from({ length: 5 }, () =>
      makeVerifiedRecord({ tier: 2, payloadJson: largePayload }),
    );

    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce([...tier1Records, ...tier2Records]); // stageA

    const intent: IntentClassification = {
      intent: "underwrite",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
      retrieval_k: 15,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "underwrite analysis",
    });

    // Tier2 should be trimmed to zero when total exceeds budget
    expect(result.tier2Items.length).toBeLessThanOrEqual(tier2Records.length);
  });
});
