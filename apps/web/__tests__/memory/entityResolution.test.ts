import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    internalEntity: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("server-only", () => ({}));

import { normalizeAddress, resolveEntityId } from "@/lib/services/entityResolution";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("normalizeAddress", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalizeAddress("  123 Main ST  ")).toBe("123 main street");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeAddress("123   Main    Street")).toBe("123 main street");
  });

  it("standardizes abbreviations", () => {
    expect(normalizeAddress("456 Oak Ave")).toBe("456 oak avenue");
    expect(normalizeAddress("789 Pine Dr.")).toBe("789 pine drive");
    expect(normalizeAddress("101 Elm Blvd")).toBe("101 elm boulevard");
    expect(normalizeAddress("202 Maple Ln")).toBe("202 maple lane");
    expect(normalizeAddress("303 Cedar Ct")).toBe("303 cedar court");
    expect(normalizeAddress("404 Birch Rd")).toBe("404 birch road");
    expect(normalizeAddress("505 Walnut Hwy")).toBe("505 walnut highway");
  });

  it("is idempotent", () => {
    const addr = "123 Main Street, Baton Rouge, LA 70801";
    expect(normalizeAddress(normalizeAddress(addr))).toBe(
      normalizeAddress(addr),
    );
  });
});

describe("resolveEntityId", () => {
  beforeEach(() => {
    prismaMock.internalEntity.findFirst.mockReset();
    prismaMock.internalEntity.create.mockReset();
  });

  it("looks up by parcelId first", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue({ id: "entity-1" });

    const result = await resolveEntityId({
      parcelId: "parcel-abc",
      orgId: ORG_ID,
    });

    expect(result).toBe("entity-1");
    expect(prismaMock.internalEntity.findFirst).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, parcelId: "parcel-abc" },
      select: { id: true },
    });
  });

  it("looks up by canonicalAddress when no parcelId match", async () => {
    prismaMock.internalEntity.findFirst
      .mockResolvedValueOnce(null) // parcelId miss
      .mockResolvedValueOnce({ id: "entity-2" }); // address hit

    const result = await resolveEntityId({
      address: "123 Main St",
      parcelId: "parcel-miss",
      orgId: ORG_ID,
    });

    expect(result).toBe("entity-2");
  });

  it("creates new entity when not found by address", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue(null);
    prismaMock.internalEntity.create.mockResolvedValue({ id: "new-entity" });

    const result = await resolveEntityId({
      address: "456 Oak Ave",
      orgId: ORG_ID,
    });

    expect(result).toBe("new-entity");
    expect(prismaMock.internalEntity.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        canonicalAddress: "456 oak avenue",
        parcelId: null,
        type: "property",
      },
      select: { id: true },
    });
  });

  it("creates entity with parcelId only when no address", async () => {
    prismaMock.internalEntity.findFirst.mockResolvedValue(null);
    prismaMock.internalEntity.create.mockResolvedValue({ id: "parcel-entity" });

    const result = await resolveEntityId({
      parcelId: "parcel-new",
      orgId: ORG_ID,
    });

    expect(result).toBe("parcel-entity");
    expect(prismaMock.internalEntity.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        parcelId: "parcel-new",
        type: "property",
      },
      select: { id: true },
    });
  });

  it("throws when neither address nor parcelId provided", async () => {
    await expect(
      resolveEntityId({ orgId: ORG_ID }),
    ).rejects.toThrow("Either address or parcelId must be provided");
  });
});
