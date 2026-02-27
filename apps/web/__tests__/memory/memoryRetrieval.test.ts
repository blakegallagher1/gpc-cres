import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("memoryRetrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    truthViewMock.mockResolvedValue({
      currentValues: {
        "comp.sale_price": { value: 2500000, source: "agent", verifiedAt: new Date().toISOString() },
      },
      openConflicts: [],
      corrections: [],
    });
  });

  it("retrieves tier0 items and ranked tier1 items", async () => {
    const tier0Record = makeVerifiedRecord({ tier: 0, economicWeight: 0.95 });
    const tier1Record = makeVerifiedRecord({ tier: 1 });
    const tier1Record2 = makeVerifiedRecord({ tier: 1, economicWeight: 0.5 });

    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([tier0Record]) // tier0 query
      .mockResolvedValueOnce([tier0Record, tier1Record, tier1Record2]); // stageA query

    const intent: IntentClassification = {
      intent: "underwrite",
      required_filters: { property_type: "industrial" },
      desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
      retrieval_k: 10,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "What's the cap rate for this industrial property?",
    });

    expect(result.tier0Items).toHaveLength(1);
    expect(result.tier0Items[0].tier).toBe(0);
    expect(result.tier1Items.length).toBeGreaterThanOrEqual(1);
    expect(result.totalTokensEstimate).toBeGreaterThan(0);
  });

  it("returns empty results when no memories exist", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);

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
      queryText: "Tell me about this property",
    });

    expect(result.tier0Items).toHaveLength(0);
    expect(result.tier1Items).toHaveLength(0);
    expect(result.tier2Items).toHaveLength(0);
  });

  it("ranks higher economic weight items above lower ones", async () => {
    const highWeight = makeVerifiedRecord({ economicWeight: 0.95 });
    const lowWeight = makeVerifiedRecord({ economicWeight: 0.2 });

    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce([lowWeight, highWeight]); // stageA

    const intent: IntentClassification = {
      intent: "comp_analysis",
      required_filters: {},
      desired_tier_budget: { tier0: 300, tier1: 1000, tier2: 200 },
      retrieval_k: 10,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "cap rate analysis",
    });

    if (result.tier1Items.length >= 2) {
      expect(result.tier1Items[0].score).toBeGreaterThanOrEqual(result.tier1Items[1].score);
    }
  });

  it("80%+ items have positive relevance scores", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeVerifiedRecord({
        payloadJson: {
          sale_price: 2500000 + i * 100000,
          cap_rate: 6.0 + i * 0.1,
          property_type: "industrial",
          market: "Baton Rouge",
        },
      }),
    );

    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce(records); // stageA

    const intent: IntentClassification = {
      intent: "comp_analysis",
      required_filters: {},
      desired_tier_budget: { tier0: 300, tier1: 1000, tier2: 200 },
      retrieval_k: 10,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "industrial cap rate Baton Rouge",
    });

    const positiveRelevance = result.tier1Items.filter((item) => item.score > 0);
    expect(positiveRelevance.length / Math.max(result.tier1Items.length, 1)).toBeGreaterThanOrEqual(0.8);
  });
});
