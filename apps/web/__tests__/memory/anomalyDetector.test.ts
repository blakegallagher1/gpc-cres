import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { computeAnomalyScore } from "@/lib/services/anomalyDetector";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("computeAnomalyScore", () => {
  beforeEach(() => {
    prismaMock.memoryVerified.findMany.mockReset();
  });

  it("returns 0 when payload has no numeric keys", async () => {
    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { notes: "some text" },
    });

    expect(score).toBe(0);
    expect(prismaMock.memoryVerified.findMany).not.toHaveBeenCalled();
  });

  it("returns 0 when fewer than 3 existing records", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { noi: 150000 } },
      { payloadJson: { noi: 155000 } },
    ]);

    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { noi: 999999 },
    });

    expect(score).toBe(0);
  });

  it("returns 0 for values within normal range (|z| <= 2)", async () => {
    // Historical NOIs cluster around 150000 with small variance
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { noi: 148000 } },
      { payloadJson: { noi: 150000 } },
      { payloadJson: { noi: 152000 } },
      { payloadJson: { noi: 149000 } },
      { payloadJson: { noi: 151000 } },
    ]);

    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { noi: 151500 }, // within normal range
    });

    expect(score).toBe(0);
  });

  it("returns > 0 for outlier values (|z| > 2)", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { noi: 148000 } },
      { payloadJson: { noi: 150000 } },
      { payloadJson: { noi: 152000 } },
      { payloadJson: { noi: 149000 } },
      { payloadJson: { noi: 151000 } },
    ]);

    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { noi: 500000 }, // way outside range
    });

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns 1 when all numeric keys are anomalous", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { noi: 100, cap_rate: 5 } },
      { payloadJson: { noi: 101, cap_rate: 5.1 } },
      { payloadJson: { noi: 102, cap_rate: 4.9 } },
      { payloadJson: { noi: 100, cap_rate: 5 } },
    ]);

    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { noi: 999999, cap_rate: 99 }, // both extreme outliers
    });

    expect(score).toBe(1);
  });

  it("flags any deviation when stddev is 0 (identical historical values)", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      { payloadJson: { noi: 150000 } },
      { payloadJson: { noi: 150000 } },
      { payloadJson: { noi: 150000 } },
    ]);

    const score = await computeAnomalyScore({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      payload: { noi: 150001 }, // even tiny deviation
    });

    expect(score).toBe(1);
  });
});
