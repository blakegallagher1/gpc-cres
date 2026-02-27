import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    internalEntity: { findFirst: vi.fn() },
    memoryVerified: { findFirst: vi.fn(), findMany: vi.fn() },
    calibrationSegment: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    calibrationRecord: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { ingestOutcome } from "@/lib/services/calibrationService";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_OUTCOME_ID = "33333333-3333-4333-8333-333333333333";

describe("outcomeCapture (calibration ingestion)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    );
  });

  it("ingestOutcome creates CalibrationRecord rows using verified projections only and updates segment sampleN", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({
      canonicalAddress: "123 main st",
      type: "property",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    prismaMock.memoryVerified.findFirst.mockResolvedValue({
      payloadJson: { property_type: "industrial", market: "Baton Rouge" },
    });
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { metric_key: "noi", projected_value: 100 } },
    ]);

    prismaMock.calibrationSegment.findFirst.mockResolvedValue(null);
    prismaMock.calibrationSegment.create.mockResolvedValue({ id: "seg-1" });

    prismaMock.calibrationRecord.create.mockResolvedValue({ id: "rec-1" });
    prismaMock.calibrationRecord.findMany.mockResolvedValue([
      {
        metricKey: "noi",
        delta: 20,
        effectiveWeight: 1,
        volatilityClass: "stable",
        createdAt: new Date(),
      },
    ]);

    await ingestOutcome(
      ORG_ID,
      DEAL_OUTCOME_ID,
      ENTITY_ID,
      { noi: 110 }, // snapshot wins over current memory
      { noi: 130, exit_price: 999 }, // exit_price missing projection -> ignored
    );

    expect(prismaMock.memoryVerified.findMany).toHaveBeenCalledWith({
      where: {
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        factType: "projection",
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.calibrationRecord.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.calibrationRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        segmentId: "seg-1",
        dealOutcomeId: DEAL_OUTCOME_ID,
        metricKey: "noi",
        projectedValue: 110,
        actualValue: 130,
        delta: 20,
      }),
    });

    expect(prismaMock.calibrationSegment.updateMany).toHaveBeenCalled();
    const updateArgs = prismaMock.calibrationSegment.updateMany.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(updateArgs).toEqual(
      expect.objectContaining({
        where: { id: "seg-1", orgId: ORG_ID },
        data: expect.objectContaining({ sampleN: 1 }),
      }),
    );
  });
});

