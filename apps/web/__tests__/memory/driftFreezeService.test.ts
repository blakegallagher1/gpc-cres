import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    driftFreezeState: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import {
  isSegmentFrozen,
  getDriftFreezeStatus,
  trackDrift,
  unfreezeSegment,
} from "@/lib/services/driftFreezeService";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SEGMENT_ID = "seg-001";

describe("isSegmentFrozen", () => {
  beforeEach(() => {
    prismaMock.driftFreezeState.findFirst.mockReset();
  });

  it("returns false when no state exists", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue(null);

    expect(await isSegmentFrozen(ORG_ID, SEGMENT_ID)).toBe(false);
  });

  it("returns true when frozen", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({ frozen: true });

    expect(await isSegmentFrozen(ORG_ID, SEGMENT_ID)).toBe(true);
  });

  it("returns false when not frozen", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({ frozen: false });

    expect(await isSegmentFrozen(ORG_ID, SEGMENT_ID)).toBe(false);
  });
});

describe("getDriftFreezeStatus", () => {
  beforeEach(() => {
    prismaMock.driftFreezeState.findFirst.mockReset();
  });

  it("returns default status when no state exists", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue(null);

    const status = await getDriftFreezeStatus(ORG_ID, SEGMENT_ID);

    expect(status.frozen).toBe(false);
    expect(status.consecutiveWorsenings).toBe(0);
    expect(status.lastMae).toBeNull();
    expect(status.previousMae).toBeNull();
    expect(status.frozenAt).toBeNull();
  });

  it("returns stored state", async () => {
    const frozenAt = new Date("2026-02-01");
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      frozen: true,
      consecutiveWorsenings: 3,
      lastMae: 0.25,
      previousMae: 0.20,
      frozenAt,
    });

    const status = await getDriftFreezeStatus(ORG_ID, SEGMENT_ID);

    expect(status.frozen).toBe(true);
    expect(status.consecutiveWorsenings).toBe(3);
    expect(status.lastMae).toBe(0.25);
    expect(status.frozenAt).toBe(frozenAt);
  });
});

describe("trackDrift", () => {
  beforeEach(() => {
    prismaMock.driftFreezeState.findFirst.mockReset();
    prismaMock.driftFreezeState.create.mockReset();
    prismaMock.driftFreezeState.update.mockReset();
  });

  it("creates new state on first call", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue(null);
    prismaMock.driftFreezeState.create.mockResolvedValue({});

    const result = await trackDrift(ORG_ID, SEGMENT_ID, 0.10);

    expect(result.frozen).toBe(false);
    expect(result.consecutiveWorsenings).toBe(0);
    expect(prismaMock.driftFreezeState.create).toHaveBeenCalled();
  });

  it("increments consecutive worsenings when MAE worsens", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      id: "state-1",
      consecutiveWorsenings: 1,
      lastMae: 0.10,
      previousMae: 0.08,
      frozen: false,
      frozenAt: null,
    });
    prismaMock.driftFreezeState.update.mockResolvedValue({});

    const result = await trackDrift(ORG_ID, SEGMENT_ID, 0.20); // worse

    expect(result.consecutiveWorsenings).toBe(2);
    expect(result.frozen).toBe(false);
  });

  it("resets consecutive worsenings when MAE improves", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      id: "state-1",
      consecutiveWorsenings: 2,
      lastMae: 0.20,
      previousMae: 0.15,
      frozen: false,
      frozenAt: null,
    });
    prismaMock.driftFreezeState.update.mockResolvedValue({});

    const result = await trackDrift(ORG_ID, SEGMENT_ID, 0.05); // improved

    expect(result.consecutiveWorsenings).toBe(0);
    expect(result.frozen).toBe(false);
  });

  it("triggers freeze after 3 consecutive worsenings", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      id: "state-1",
      consecutiveWorsenings: 2,
      lastMae: 0.20,
      previousMae: 0.15,
      frozen: false,
      frozenAt: null,
    });
    prismaMock.driftFreezeState.update.mockResolvedValue({});

    const result = await trackDrift(ORG_ID, SEGMENT_ID, 0.30); // 3rd worsening

    expect(result.consecutiveWorsenings).toBe(3);
    expect(result.frozen).toBe(true);
  });

  it("stays frozen once frozen (even if MAE improves)", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      id: "state-1",
      consecutiveWorsenings: 3,
      lastMae: 0.30,
      previousMae: 0.25,
      frozen: true,
      frozenAt: new Date("2026-02-01"),
    });
    prismaMock.driftFreezeState.update.mockResolvedValue({});

    const result = await trackDrift(ORG_ID, SEGMENT_ID, 0.05); // improved but already frozen

    expect(result.frozen).toBe(true);
  });
});

describe("unfreezeSegment", () => {
  beforeEach(() => {
    prismaMock.driftFreezeState.findFirst.mockReset();
    prismaMock.driftFreezeState.update.mockReset();
  });

  it("unfreezes and resets consecutive worsenings", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue({
      id: "state-1",
      frozen: true,
      consecutiveWorsenings: 3,
    });
    prismaMock.driftFreezeState.update.mockResolvedValue({});

    await unfreezeSegment(ORG_ID, SEGMENT_ID, "admin-user");

    expect(prismaMock.driftFreezeState.update).toHaveBeenCalledWith({
      where: { id: "state-1" },
      data: expect.objectContaining({
        frozen: false,
        consecutiveWorsenings: 0,
        unfrozenBy: "admin-user",
      }),
    });
  });

  it("no-ops when no state exists", async () => {
    prismaMock.driftFreezeState.findFirst.mockResolvedValue(null);

    await unfreezeSegment(ORG_ID, SEGMENT_ID, "admin-user");

    expect(prismaMock.driftFreezeState.update).not.toHaveBeenCalled();
  });
});
