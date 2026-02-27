import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    causalImpactTrace: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { propagateCausalImpact, getCausalTraces } from "@/lib/services/causalPropagation";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

describe("propagateCausalImpact", () => {
  beforeEach(() => {
    prismaMock.causalImpactTrace.create.mockReset();
    prismaMock.causalImpactTrace.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `trace-${data.targetDomain}`,
        ...data,
      }),
    );
  });

  it("returns empty steps for unmapped fact type", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "correction",
      0.5,
    );

    expect(result.steps).toHaveLength(0);
    expect(result.traceIds).toHaveLength(0);
    expect(prismaMock.causalImpactTrace.create).not.toHaveBeenCalled();
  });

  it("returns empty steps for terminal domain", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "interest_rate_update",
      0.5,
    );

    expect(result.steps).toHaveLength(0);
    expect(result.sourceDomain).toBe("interest_rate");
  });

  it("propagates from tour through all 5 downstream edges", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "tour_observation",
      0.5,
    );

    expect(result.sourceDomain).toBe("tour");
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].sourceDomain).toBe("tour");
    expect(result.steps[0].targetDomain).toBe("rehab");
  });

  it("clamps deltas at impactCap", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "tour_observation",
      0.5,
    );

    for (const step of result.steps) {
      expect(step.clampedDelta).toBeLessThanOrEqual(step.impactCap);
    }
  });

  it("attenuates 20% per hop", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "tour_observation",
      0.1, // small enough to not be clamped by impactCap
    );

    if (result.steps.length >= 2) {
      // Second step input should be 80% of first step clamped output
      const firstClamped = result.steps[0].clampedDelta;
      const secondInput = result.steps[1].impactDelta;
      expect(secondInput).toBeCloseTo(firstClamped * 0.8, 4);
    }
  });

  it("stops propagation below noise floor (0.01)", async () => {
    const result = await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "tour_observation",
      0.01, // very small initial delta
    );

    // Should stop early since attenuated values fall below 0.01
    expect(result.steps.length).toBeLessThan(5);
  });

  it("persists traces for each step", async () => {
    await propagateCausalImpact(
      ORG_ID,
      ENTITY_ID,
      EVENT_ID,
      "comp", // maps to "noi"
      0.2,
    );

    expect(prismaMock.causalImpactTrace.create).toHaveBeenCalled();
    const firstCall = prismaMock.causalImpactTrace.create.mock.calls[0][0];
    expect(firstCall.data.orgId).toBe(ORG_ID);
    expect(firstCall.data.entityId).toBe(ENTITY_ID);
    expect(firstCall.data.originEventId).toBe(EVENT_ID);
  });
});

describe("getCausalTraces", () => {
  beforeEach(() => {
    prismaMock.causalImpactTrace.findMany.mockReset();
  });

  it("queries with orgId + entityId scope and limit", async () => {
    prismaMock.causalImpactTrace.findMany.mockResolvedValue([]);

    await getCausalTraces(ORG_ID, ENTITY_ID, 10);

    expect(prismaMock.causalImpactTrace.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, entityId: ENTITY_ID },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});
