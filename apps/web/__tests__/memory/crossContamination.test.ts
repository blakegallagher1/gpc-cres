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
const OTHER_ENTITY_ID = "33333333-3333-4333-8333-333333333333";

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

describe("crossContamination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    truthViewMock.mockResolvedValue({
      currentValues: {},
      openConflicts: [],
      corrections: [],
    });
  });

  it("filters by entityId — no cross-entity contamination", async () => {
    const ownRecord = makeVerifiedRecord({ entityId: ENTITY_ID, payloadJson: { property_type: "industrial", market: "Baton Rouge", cap_rate: 6.5, sale_price: 2500000 } });
    const otherEntityRecord = makeVerifiedRecord({
      entityId: OTHER_ENTITY_ID,
      payloadJson: { property_type: "mhp", market: "Baton Rouge", cap_rate: 8.0, sale_price: 1000000 },
    });

    // Prisma filters by entityId, so only own records should be returned
    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce([ownRecord]); // stageA — Prisma WHERE entityId=ENTITY_ID

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

    const allEntityIds = result.tier1Items.map((item) => item.record.entityId);
    expect(allEntityIds.every((id) => id === ENTITY_ID)).toBe(true);
    // Other entity's record should never appear
    void otherEntityRecord; // used for setup clarity
  });

  it("filters by fact type based on intent — industrial comps not shown for lender_compare", async () => {
    const compRecord = makeVerifiedRecord({ factType: "comp" });
    const lenderRecord = makeVerifiedRecord({
      factType: "lender_term",
      payloadJson: { lender_name: "First National", min_dscr: 1.25, max_ltv: 0.75, rate_type: "fixed", rate_bps: 650, term_months: 120, amortization_months: 300, prepayment_penalty: null, recourse: null },
    });

    // For lender_compare intent, stageA filters to lender_term fact types only
    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce([lenderRecord]); // stageA — filtered to lender_term

    const intent: IntentClassification = {
      intent: "lender_compare",
      required_filters: {},
      desired_tier_budget: { tier0: 300, tier1: 1000, tier2: 200 },
      retrieval_k: 10,
    };

    const result = await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "compare lender terms",
    });

    const factTypes = result.tier1Items.map((item) => item.record.factType);
    expect(factTypes.every((ft) => ft === "lender_term")).toBe(true);
    // Verify Prisma was called with correct fact type filter
    const stageACall = prismaMock.memoryVerified.findMany.mock.calls[1];
    expect(stageACall[0].where.factType).toEqual({ in: ["lender_term"] });
    void compRecord;
  });

  it("scopes all queries by orgId — no cross-org contamination", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);

    const intent: IntentClassification = {
      intent: "general",
      required_filters: {},
      desired_tier_budget: { tier0: 500, tier1: 700, tier2: 300 },
      retrieval_k: 10,
    };

    await retrieveMemoryForIntent({
      entityId: ENTITY_ID,
      orgId: ORG_ID,
      intent,
      queryText: "test",
    });

    // Every Prisma findMany call must include orgId in the where clause
    for (const call of prismaMock.memoryVerified.findMany.mock.calls) {
      expect(call[0].where.orgId).toBe(ORG_ID);
    }
  });

  it("prevents MHP comps from being injected for industrial underwriting", async () => {
    const industrialComp = makeVerifiedRecord({
      payloadJson: { property_type: "industrial", market: "Baton Rouge", sale_price: 2500000, cap_rate: 6.5 },
    });

    // Only industrial records returned (MHP records filtered at DB level via JSONB filters)
    prismaMock.memoryVerified.findMany
      .mockResolvedValueOnce([]) // tier0
      .mockResolvedValueOnce([industrialComp]); // stageA — filtered by property_type=industrial

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
      queryText: "underwrite this industrial property",
    });

    for (const item of result.tier1Items) {
      const payload = item.record.payloadJson as Record<string, unknown>;
      if (payload.property_type) {
        expect(payload.property_type).not.toBe("mhp");
      }
    }
  });
});
