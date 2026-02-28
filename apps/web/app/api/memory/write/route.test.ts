import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, resolveEntityIdMock, memoryWriteGateMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  resolveEntityIdMock: vi.fn(),
  memoryWriteGateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/entityResolution", () => ({
  resolveEntityId: resolveEntityIdMock,
}));

vi.mock("@/lib/services/memoryWriteGate", () => ({
  memoryWriteGate: memoryWriteGateMock,
}));

import { POST } from "./route";

describe("POST /api/memory/write", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveEntityIdMock.mockReset();
    memoryWriteGateMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/memory/write", {
      method: "POST",
      body: JSON.stringify({ input_text: "test", address: "123 Main St, Baton Rouge, LA 70801" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(resolveEntityIdMock).not.toHaveBeenCalled();
    expect(memoryWriteGateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when input_text is missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const req = new NextRequest("http://localhost/api/memory/write", {
      method: "POST",
      body: JSON.stringify({ address: "123 Main St, Baton Rouge, LA 70801" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "input_text is required" });
  });

  it("returns 400 when no entity/address/parcel context is available", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const req = new NextRequest("http://localhost/api/memory/write", {
      method: "POST",
      body: JSON.stringify({ input_text: "Sold for $4,500,000 on 2/23/26." }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "At least one of entity_id, address, or parcel_id is required",
    });
  });

  it("derives address from input_text and resolves entity before writing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    resolveEntityIdMock.mockResolvedValue("entity-from-address");
    memoryWriteGateMock.mockResolvedValue({
      decision: "draft",
      structuredMemoryWrite: { payload: { sale_price: 4500000 } },
      reasons: ["Conflict detected on keys: sale_price"],
    });

    const req = new NextRequest("http://localhost/api/memory/write", {
      method: "POST",
      body: JSON.stringify({
        input_text:
          "I heard that 7611 Burbank Dr, Baton Rouge, LA 70820 sold for $4,500,000 on 2/23/26",
        entity_id: "hallucinated-entity-id",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(resolveEntityIdMock).toHaveBeenCalledWith({
      address: "7611 Burbank Dr, Baton Rouge, LA 70820",
      parcelId: undefined,
      type: undefined,
      orgId: "org-1",
    });
    expect(memoryWriteGateMock).toHaveBeenCalledWith(
      "I heard that 7611 Burbank Dr, Baton Rouge, LA 70820 sold for $4,500,000 on 2/23/26",
      {
        entityId: "entity-from-address",
        orgId: "org-1",
        address: "7611 Burbank Dr, Baton Rouge, LA 70820",
        parcelId: undefined,
      },
    );
    expect(body.decision).toBe("draft");
  });
});
