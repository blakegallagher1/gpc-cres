import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  propertyObservationUpsertMock,
  propertyObservationUpdateMock,
  propertyProfileUpsertMock,
  propertyLearningCandidateUpsertMock,
  propertyLearningEvalUpsertMock,
} = vi.hoisted(() => ({
  propertyObservationUpsertMock: vi.fn(),
  propertyObservationUpdateMock: vi.fn(),
  propertyProfileUpsertMock: vi.fn(),
  propertyLearningCandidateUpsertMock: vi.fn(),
  propertyLearningEvalUpsertMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    propertyObservation: {
      upsert: propertyObservationUpsertMock,
      update: propertyObservationUpdateMock,
    },
    propertyProfile: {
      upsert: propertyProfileUpsertMock,
    },
    propertyLearningCandidate: {
      upsert: propertyLearningCandidateUpsertMock,
    },
    propertyLearningEval: {
      upsert: propertyLearningEvalUpsertMock,
    },
  },
  Prisma: {},
}));

import { capturePropertyLearningObservation } from "./property-learning-control-plane.service";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("capturePropertyLearningObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyObservationUpsertMock.mockResolvedValue({
      id: "observation-1",
      observedAt: new Date("2026-04-26T09:00:00Z"),
    });
    propertyProfileUpsertMock.mockResolvedValue({
      id: "profile-1",
    });
    propertyLearningCandidateUpsertMock.mockImplementation((args: { create: { candidateKey: string } }) =>
      Promise.resolve({ id: `candidate:${args.create.candidateKey}` }),
    );
    propertyLearningEvalUpsertMock.mockResolvedValue({ id: "eval-1" });
    propertyObservationUpdateMock.mockResolvedValue({ id: "observation-1" });
  });

  it("writes a durable observation, profile, graded candidates, and evals", async () => {
    const result = await capturePropertyLearningObservation({
      orgId: ORG_ID,
      observationType: "parcel_lookup",
      parcelId: "01265342",
      address: "123 Main St.",
      parish: "East Baton Rouge",
      owner: "GPC Holdings LLC",
      zoning: "C2",
      floodZone: "X",
      acreage: 3.25,
      lat: 30.45,
      lng: -91.15,
      sourceRoute: "/api/parcels",
    });

    expect(result).toMatchObject({
      observationId: "observation-1",
      profileId: "profile-1",
      propertyKey: "parcel:01265342",
      observationKey: "parcel_lookup:01265342",
      candidateCount: 5,
      verifiedCandidateCount: 5,
      evalCount: 5,
    });
    expect(result?.sourceHash).toHaveLength(64);
    expect(result?.knowledgeText).toContain("Owner: GPC Holdings LLC");
    expect(result?.knowledgeMetadata).toMatchObject({
      entityType: "property",
      parcelId: "01265342",
      canonicalAddress: "123 main street",
      learningControlPlane: true,
    });

    expect(propertyObservationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_observationKey: {
            orgId: ORG_ID,
            observationKey: "parcel_lookup:01265342",
          },
        },
      }),
    );
    expect(propertyProfileUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_propertyKey: {
            orgId: ORG_ID,
            propertyKey: "parcel:01265342",
          },
        },
      }),
    );
    expect(propertyLearningCandidateUpsertMock).toHaveBeenCalledTimes(5);
    expect(propertyLearningEvalUpsertMock).toHaveBeenCalledTimes(5);
    expect(propertyLearningCandidateUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          candidateType: "owner",
          status: "verified",
          gradeScore: 1,
        }),
      }),
    );
    expect(propertyObservationUpdateMock).toHaveBeenCalledWith({
      where: { id: "observation-1" },
      data: { promotedAt: expect.any(Date) },
    });
  });

  it("skips malformed observations before writing", async () => {
    const result = await capturePropertyLearningObservation({
      orgId: ORG_ID,
      observationType: "parcel_lookup",
      parcelId: "",
      address: "",
      sourceRoute: "/api/parcels",
    });

    expect(result).toBeNull();
    expect(propertyObservationUpsertMock).not.toHaveBeenCalled();
    expect(propertyProfileUpsertMock).not.toHaveBeenCalled();
    expect(propertyLearningCandidateUpsertMock).not.toHaveBeenCalled();
    expect(propertyLearningEvalUpsertMock).not.toHaveBeenCalled();
  });
});
