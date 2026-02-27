import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    innovationQueue: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import {
  checkNovelty,
  queueForReview,
  getPendingInnovations,
  reviewInnovation,
} from "@/lib/services/noveltyDetector";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("checkNovelty", () => {
  it("flags as novel when high reliability + low agreement", () => {
    const result = checkNovelty(0.8, 0.2);

    expect(result.isNovel).toBe(true);
    expect(result.reason).toContain("Novel");
  });

  it("not novel when reliability < 0.7", () => {
    const result = checkNovelty(0.5, 0.1);

    expect(result.isNovel).toBe(false);
    expect(result.reason).toBe("");
  });

  it("not novel when agreement >= 0.3", () => {
    const result = checkNovelty(0.9, 0.5);

    expect(result.isNovel).toBe(false);
  });

  it("not novel at exact boundary (reliability=0.7, agreement=0.3)", () => {
    const result = checkNovelty(0.7, 0.3);

    expect(result.isNovel).toBe(false);
  });

  it("novel at exact boundary (reliability=0.7, agreement=0.29)", () => {
    const result = checkNovelty(0.7, 0.29);

    expect(result.isNovel).toBe(true);
  });
});

describe("queueForReview", () => {
  beforeEach(() => {
    prismaMock.innovationQueue.create.mockReset();
  });

  it("creates innovation queue record", async () => {
    prismaMock.innovationQueue.create.mockResolvedValue({ id: "inno-1" });

    const result = await queueForReview({
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "comp",
      sourceReliability: 0.8,
      agreementScore: 0.1,
      noveltyReason: "test reason",
    });

    expect(result.id).toBe("inno-1");
    expect(prismaMock.innovationQueue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        factType: "comp",
      }),
    });
  });
});

describe("getPendingInnovations", () => {
  beforeEach(() => {
    prismaMock.innovationQueue.findMany.mockReset();
  });

  it("queries with orgId scope and pending status", async () => {
    prismaMock.innovationQueue.findMany.mockResolvedValue([]);

    await getPendingInnovations(ORG_ID, 10);

    expect(prismaMock.innovationQueue.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});

describe("reviewInnovation", () => {
  beforeEach(() => {
    prismaMock.innovationQueue.update.mockReset();
  });

  it("sets status to approved on approve", async () => {
    prismaMock.innovationQueue.update.mockResolvedValue({});

    await reviewInnovation(ORG_ID, "inno-1", "user-1", "approve");

    expect(prismaMock.innovationQueue.update).toHaveBeenCalledWith({
      where: { id: "inno-1", orgId: ORG_ID },
      data: expect.objectContaining({
        status: "approved",
        reviewedBy: "user-1",
        reviewDecision: "approve",
      }),
    });
  });

  it("sets status to rejected on reject", async () => {
    prismaMock.innovationQueue.update.mockResolvedValue({});

    await reviewInnovation(ORG_ID, "inno-1", "user-1", "reject");

    expect(prismaMock.innovationQueue.update).toHaveBeenCalledWith({
      where: { id: "inno-1", orgId: ORG_ID },
      data: expect.objectContaining({
        status: "rejected",
        reviewDecision: "reject",
      }),
    });
  });
});
