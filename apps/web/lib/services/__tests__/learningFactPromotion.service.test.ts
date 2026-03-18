import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, memoryWriteGateMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      run: {
        findFirst: vi.fn(),
      },
      deal: {
        findFirst: vi.fn(),
      },
      internalEntity: {
        findFirst: vi.fn(),
      },
    },
  },
  memoryWriteGateMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/memoryWriteGate", () => ({
  memoryWriteGate: memoryWriteGateMock,
}));

import { promoteCandidateFactsFromRun } from "../learningFactPromotion.service";

describe("promoteCandidateFactsFromRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      outcome: {
        entityId: "entity-1",
      },
      parcels: [],
    });
    dbMock.prisma.internalEntity.findFirst.mockResolvedValue({
      id: "entity-1",
      canonicalAddress: "123 Main St",
      parcelId: "parcel-1",
    });
    memoryWriteGateMock.mockResolvedValue({
      decision: "verified",
      structuredMemoryWrite: null,
      reasons: [],
    });
  });

  it("promotes only when the confidence threshold is met", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      dealId: "deal-1",
      outputJson: {
        confidence: 0.91,
        missingEvidence: [],
        finalOutput:
          "Comparable sale correction: sold for $3,200,000 at a 6.2% cap rate.",
      },
    });

    const result = await promoteCandidateFactsFromRun({
      orgId: "org-1",
      runId: "run-1",
      dealId: "deal-1",
      status: "succeeded",
    });

    expect(result).toEqual({
      attempted: 1,
      verified: 1,
      drafted: 0,
      rejected: 0,
    });
    expect(memoryWriteGateMock).toHaveBeenCalledTimes(1);
  });

  it("skips promotion when missing evidence exists", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      dealId: "deal-1",
      outputJson: {
        confidence: 0.95,
        missingEvidence: ["Need one more citation."],
        finalOutput:
          "Comparable sale correction: sold for $3,200,000 at a 6.2% cap rate.",
      },
    });

    const result = await promoteCandidateFactsFromRun({
      orgId: "org-1",
      runId: "run-1",
      dealId: "deal-1",
      status: "succeeded",
    });

    expect(result).toEqual({
      attempted: 0,
      verified: 0,
      drafted: 0,
      rejected: 0,
    });
    expect(memoryWriteGateMock).not.toHaveBeenCalled();
  });

  it("calls memoryWriteGate only for whitelisted fact classes", async () => {
    dbMock.prisma.run.findFirst.mockResolvedValue({
      dealId: "deal-1",
      outputJson: {
        confidence: 0.9,
        missingEvidence: [],
        finalOutput: [
          "General recommendation: proceed cautiously and confirm assumptions.",
          "Lender term correction: 65% LTV, 1.25 DSCR, 25-year amortization.",
        ].join("\n"),
      },
    });

    await promoteCandidateFactsFromRun({
      orgId: "org-1",
      runId: "run-1",
      dealId: "deal-1",
      status: "succeeded",
    });

    expect(memoryWriteGateMock).toHaveBeenCalledTimes(1);
    expect(memoryWriteGateMock).toHaveBeenCalledWith(
      expect.stringContaining("Lender term addition or correction"),
      expect.objectContaining({
        entityId: "entity-1",
        orgId: "org-1",
      }),
    );
  });
});
