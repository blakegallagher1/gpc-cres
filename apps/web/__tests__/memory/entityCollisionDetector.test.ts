import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    internalEntity: {
      findMany: vi.fn(),
    },
    entityCollisionAlert: {
      findFirst: vi.fn(),
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
  detectCollisions,
  persistCollisionAlerts,
  getPendingCollisions,
  resolveCollision,
} from "@/lib/services/entityCollisionDetector";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("detectCollisions", () => {
  beforeEach(() => {
    prismaMock.internalEntity.findMany.mockReset();
  });

  it("detects highly similar addresses", async () => {
    prismaMock.internalEntity.findMany.mockResolvedValue([
      { id: "e1", address: "123 Main Street" },
      { id: "e2", address: "123 Main St" },
    ]);

    const alerts = await detectCollisions(ORG_ID);

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].entityIdA).toBe("e1");
    expect(alerts[0].entityIdB).toBe("e2");
    expect(alerts[0].similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("does not flag very different addresses", async () => {
    prismaMock.internalEntity.findMany.mockResolvedValue([
      { id: "e1", address: "123 Main Street, Baton Rouge" },
      { id: "e2", address: "999 Elm Avenue, New Orleans" },
    ]);

    const alerts = await detectCollisions(ORG_ID);

    expect(alerts).toHaveLength(0);
  });

  it("skips entities without addresses", async () => {
    prismaMock.internalEntity.findMany.mockResolvedValue([
      { id: "e1", address: "123 Main Street" },
      { id: "e2", address: null },
      { id: "e3", address: "" },
    ]);

    const alerts = await detectCollisions(ORG_ID);

    expect(alerts).toHaveLength(0);
  });

  it("returns empty when no entities exist", async () => {
    prismaMock.internalEntity.findMany.mockResolvedValue([]);

    const alerts = await detectCollisions(ORG_ID);

    expect(alerts).toHaveLength(0);
  });

  it("caps entity fetch at 500", async () => {
    prismaMock.internalEntity.findMany.mockResolvedValue([]);

    await detectCollisions(ORG_ID);

    expect(prismaMock.internalEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });
});

describe("persistCollisionAlerts", () => {
  beforeEach(() => {
    prismaMock.entityCollisionAlert.findFirst.mockReset();
    prismaMock.entityCollisionAlert.create.mockReset();
  });

  it("creates new alert when no existing pending", async () => {
    prismaMock.entityCollisionAlert.findFirst.mockResolvedValue(null);
    prismaMock.entityCollisionAlert.create.mockResolvedValue({});

    const count = await persistCollisionAlerts(ORG_ID, [
      {
        entityIdA: "e1",
        entityIdB: "e2",
        addressA: "123 Main",
        addressB: "123 Main St",
        similarity: 0.9,
      },
    ]);

    expect(count).toBe(1);
    expect(prismaMock.entityCollisionAlert.create).toHaveBeenCalled();
  });

  it("skips already-existing pending alerts", async () => {
    prismaMock.entityCollisionAlert.findFirst.mockResolvedValue({ id: "existing" });

    const count = await persistCollisionAlerts(ORG_ID, [
      {
        entityIdA: "e1",
        entityIdB: "e2",
        addressA: "123 Main",
        addressB: "123 Main St",
        similarity: 0.9,
      },
    ]);

    expect(count).toBe(0);
    expect(prismaMock.entityCollisionAlert.create).not.toHaveBeenCalled();
  });
});

describe("getPendingCollisions", () => {
  beforeEach(() => {
    prismaMock.entityCollisionAlert.findMany.mockReset();
  });

  it("queries with orgId scope and pending status", async () => {
    prismaMock.entityCollisionAlert.findMany.mockResolvedValue([]);

    await getPendingCollisions(ORG_ID, 10);

    expect(prismaMock.entityCollisionAlert.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});

describe("resolveCollision", () => {
  beforeEach(() => {
    prismaMock.entityCollisionAlert.update.mockReset();
  });

  it("updates alert with resolution", async () => {
    prismaMock.entityCollisionAlert.update.mockResolvedValue({});

    await resolveCollision(ORG_ID, "alert-1", "user-1", "merge");

    expect(prismaMock.entityCollisionAlert.update).toHaveBeenCalledWith({
      where: { id: "alert-1", orgId: ORG_ID },
      data: expect.objectContaining({
        status: "resolved",
        resolvedBy: "user-1",
        resolution: "merge",
      }),
    });
  });
});
