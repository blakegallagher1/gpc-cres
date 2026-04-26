import { beforeEach, describe, expect, it, vi } from "vitest";

const { capturePropertyLearningObservationMock, replaceKnowledgeEntryMock } = vi.hoisted(() => ({
  capturePropertyLearningObservationMock: vi.fn(),
  replaceKnowledgeEntryMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("./property-learning-control-plane.service", () => ({
  capturePropertyLearningObservation: capturePropertyLearningObservationMock,
}));

vi.mock("../search/knowledge-base.service", () => ({
  replaceKnowledgeEntry: replaceKnowledgeEntryMock,
}));

import { capturePropertyObservations } from "./property-observation.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("capturePropertyObservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturePropertyLearningObservationMock.mockResolvedValue({
      observationId: "observation-1",
      profileId: "profile-1",
      propertyKey: "parcel:01265342",
      observationKey: "parcel_lookup:01265342",
      sourceHash: "a".repeat(64),
      candidateCount: 2,
      verifiedCandidateCount: 2,
      evalCount: 2,
      knowledgeText: "Observation type: parcel_lookup\nParcel ID: 01265342",
      knowledgeMetadata: {
        entityType: "property",
        parcelId: "01265342",
        learningControlPlane: true,
      },
    });
    replaceKnowledgeEntryMock.mockResolvedValue({ id: "knowledge-1" });
  });

  it("captures durable property learning data before mirroring to knowledge embeddings", async () => {
    const result = await capturePropertyObservations([
      {
        orgId: ORG_ID,
        observationType: "parcel_lookup",
        parcelId: "01265342",
        address: "123 Main St",
        owner: "GPC Holdings LLC",
        sourceRoute: "/api/parcels",
      },
    ]);

    expect(capturePropertyLearningObservationMock).toHaveBeenCalledOnce();
    expect(replaceKnowledgeEntryMock).toHaveBeenCalledWith(
      ORG_ID,
      "agent_analysis",
      "property_observation:parcel_lookup:01265342",
      "Observation type: parcel_lookup\nParcel ID: 01265342",
      {
        entityType: "property",
        parcelId: "01265342",
        learningControlPlane: true,
        propertyObservationId: "observation-1",
        propertyProfileId: "profile-1",
        propertyCandidateCount: 2,
        propertyVerifiedCandidateCount: 2,
        propertyEvalCount: 2,
      },
    );
    expect(result).toEqual({
      captured: 1,
      durableObservations: 1,
      verifiedCandidates: 2,
    });
  });

  it("does not mirror malformed observations that the control plane rejects", async () => {
    capturePropertyLearningObservationMock.mockResolvedValue(null);

    const result = await capturePropertyObservations([
      {
        orgId: ORG_ID,
        observationType: "parcel_lookup",
        parcelId: "",
        address: "",
        sourceRoute: "/api/parcels",
      },
    ]);

    expect(replaceKnowledgeEntryMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      captured: 0,
      durableObservations: 0,
      verifiedCandidates: 0,
    });
  });
});
