import { beforeEach, describe, expect, it, vi } from "vitest";

const { createStrictJsonResponseMock } = vi.hoisted(() => ({
  createStrictJsonResponseMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/openai", () => ({
  createStrictJsonResponse: createStrictJsonResponseMock,
}));

import { classifyIntent } from "@/lib/services/intentClassifier";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("intentClassifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies underwriting queries correctly", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        intent: "underwrite",
        required_filters: { property_type: "industrial" },
        desired_tier_budget: { tier0: 500, tier1: 800, tier2: 200 },
        retrieval_k: 15,
      },
    });

    const result = await classifyIntent(
      "What's the projected NOI and cap rate for this industrial deal?",
      { orgId: ORG_ID, address: "123 Industrial Blvd" },
    );

    expect(result.intent).toBe("underwrite");
    expect(result.retrieval_k).toBe(15);
    expect(result.desired_tier_budget.tier0).toBeGreaterThan(0);
  });

  it("classifies comp analysis queries correctly", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        intent: "comp_analysis",
        required_filters: { property_type: "industrial", market: "Baton Rouge" },
        desired_tier_budget: { tier0: 300, tier1: 1000, tier2: 200 },
        retrieval_k: 20,
      },
    });

    const result = await classifyIntent(
      "Show me comparable sales for industrial properties in Baton Rouge",
      { orgId: ORG_ID },
    );

    expect(result.intent).toBe("comp_analysis");
    expect(result.required_filters).toHaveProperty("property_type", "industrial");
    expect(result.required_filters).toHaveProperty("market", "Baton Rouge");
  });

  it("classifies lender comparison queries correctly", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        intent: "lender_compare",
        required_filters: {},
        desired_tier_budget: { tier0: 300, tier1: 1000, tier2: 200 },
        retrieval_k: 10,
      },
    });

    const result = await classifyIntent(
      "Compare the lender terms we have on file",
      { orgId: ORG_ID },
    );

    expect(result.intent).toBe("lender_compare");
  });

  it("falls back to general on OpenAI failure", async () => {
    createStrictJsonResponseMock.mockRejectedValue(new Error("API failure"));

    const result = await classifyIntent(
      "Tell me about this property",
      { orgId: ORG_ID },
    );

    expect(result.intent).toBe("general");
    expect(result.retrieval_k).toBe(10);
  });

  it("falls back to general on Zod validation failure", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: { intent: "invalid_intent", retrieval_k: "not_a_number" },
    });

    const result = await classifyIntent(
      "Some message",
      { orgId: ORG_ID },
    );

    expect(result.intent).toBe("general");
  });

  it("passes entity context to OpenAI prompt", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        intent: "rehab_estimate",
        required_filters: {},
        desired_tier_budget: { tier0: 400, tier1: 800, tier2: 300 },
        retrieval_k: 8,
      },
    });

    await classifyIntent(
      "Estimate rehab costs for this property",
      { orgId: ORG_ID, address: "456 Oak St", parcelId: "P-456" },
    );

    expect(createStrictJsonResponseMock).toHaveBeenCalledTimes(1);
    const callArgs = createStrictJsonResponseMock.mock.calls[0][0];
    const systemContent = callArgs.input[0].content;
    expect(systemContent).toContain("456 Oak St");
    expect(systemContent).toContain("P-456");
  });
});
