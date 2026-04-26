import { beforeEach, describe, expect, it, vi } from "vitest";

const { createStrictJsonResponseMock } = vi.hoisted(() => ({
  createStrictJsonResponseMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/openai", () => ({
  createStrictJsonResponse: createStrictJsonResponseMock,
}));

import { synthesizePropertyLearningProfile } from "./property-learning-synthesizer.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("synthesizePropertyLearningProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStrictJsonResponseMock.mockResolvedValue({
      responseId: "resp_123",
      outputJson: {
        propertyKey: "parcel:01265342",
        summaryText: "Parcel 01265342 is a C2-zoned East Baton Rouge property.",
        profileFacts: { zoning: "C2" },
        profileSignals: { usefulForProspecting: true },
        candidates: [
          {
            candidateType: "zoning",
            statement: "01265342 zoning is C2.",
            payload: { zoning: "C2" },
            confidence: 0.88,
            sourceObservationKeys: ["parcel_lookup:01265342"],
          },
        ],
        conflictReview: { hasConflict: false, reasons: [] },
        promotionRecommendation: "promote",
        confidenceScore: 0.88,
      },
      toolSources: { webSearchSources: [], fileSearchResults: [] },
    });
  });

  it("uses GPT-5.5 Responses API strict JSON with cache-friendly prompts", async () => {
    const result = await synthesizePropertyLearningProfile({
      orgId: ORG_ID,
      propertyKey: "parcel:01265342",
      previousResponseId: "resp_prev",
      observations: [
        {
          observationKey: "parcel_lookup:01265342",
          observationType: "parcel_lookup",
          canonicalAddress: "123 main street",
          payloadJson: { zoning: "C2" },
          sourceHash: "a".repeat(64),
          observedAt: "2026-04-26T09:00:00Z",
        },
      ],
    });

    expect(result.responseId).toBe("resp_123");
    expect(result.synthesis.candidates[0]?.candidateType).toBe("zoning");
    expect(createStrictJsonResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        reasoning: { effort: "high" },
        promptCacheKey: "gpc-property-learning-synthesis-v1",
        previousResponseId: "resp_prev",
        store: false,
        promptCacheRetention: "24h",
        jsonSchema: expect.objectContaining({
          name: "property_learning_synthesis",
          strict: true,
        }),
      }),
    );
  });
});
