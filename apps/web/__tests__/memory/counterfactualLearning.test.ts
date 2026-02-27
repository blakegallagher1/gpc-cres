import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    counterfactualDealLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import {
  logCounterfactual,
  getCounterfactualLogs,
  getOutcomeSummary,
} from "@/lib/services/counterfactualLearning";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("logCounterfactual", () => {
  beforeEach(() => {
    prismaMock.counterfactualDealLog.create.mockReset();
  });

  it("creates a deal outcome log", async () => {
    prismaMock.counterfactualDealLog.create.mockResolvedValue({ id: "cf-1" });

    const result = await logCounterfactual({
      orgId: ORG_ID,
      dealId: "deal-123",
      outcome: "lost",
      rejectionReason: "Price too high",
      stageAtClose: "LOI",
      lessonsLearned: "Should have bid lower",
    });

    expect(result.id).toBe("cf-1");
    expect(prismaMock.counterfactualDealLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        dealId: "deal-123",
        outcome: "lost",
        rejectionReason: "Price too high",
        stageAtClose: "LOI",
      }),
    });
  });

  it("handles missing optional fields with null", async () => {
    prismaMock.counterfactualDealLog.create.mockResolvedValue({ id: "cf-2" });

    await logCounterfactual({
      orgId: ORG_ID,
      dealId: "deal-456",
      outcome: "won",
      stageAtClose: "CLOSED",
    });

    expect(prismaMock.counterfactualDealLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rejectionReason: null,
        projectionSnapshot: null,
        actualMetrics: null,
        lessonsLearned: null,
      }),
    });
  });
});

describe("getCounterfactualLogs", () => {
  beforeEach(() => {
    prismaMock.counterfactualDealLog.findMany.mockReset();
  });

  it("queries with orgId scope", async () => {
    prismaMock.counterfactualDealLog.findMany.mockResolvedValue([]);

    await getCounterfactualLogs(ORG_ID);

    expect(prismaMock.counterfactualDealLog.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("filters by outcome when specified", async () => {
    prismaMock.counterfactualDealLog.findMany.mockResolvedValue([]);

    await getCounterfactualLogs(ORG_ID, { outcome: "lost" });

    expect(prismaMock.counterfactualDealLog.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, outcome: "lost" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("respects custom limit", async () => {
    prismaMock.counterfactualDealLog.findMany.mockResolvedValue([]);

    await getCounterfactualLogs(ORG_ID, { limit: 10 });

    expect(prismaMock.counterfactualDealLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});

describe("getOutcomeSummary", () => {
  beforeEach(() => {
    prismaMock.counterfactualDealLog.groupBy.mockReset();
  });

  it("aggregates outcomes into summary object", async () => {
    prismaMock.counterfactualDealLog.groupBy.mockResolvedValue([
      { outcome: "won", _count: { id: 5 } },
      { outcome: "lost", _count: { id: 3 } },
      { outcome: "passed", _count: { id: 2 } },
    ]);

    const summary = await getOutcomeSummary(ORG_ID);

    expect(summary.won).toBe(5);
    expect(summary.lost).toBe(3);
    expect(summary.passed).toBe(2);
  });

  it("returns empty object when no logs exist", async () => {
    prismaMock.counterfactualDealLog.groupBy.mockResolvedValue([]);

    const summary = await getOutcomeSummary(ORG_ID);

    expect(Object.keys(summary)).toHaveLength(0);
  });
});
