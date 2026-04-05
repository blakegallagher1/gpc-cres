import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  memoryVerifiedFindFirstMock,
  memoryVerifiedDeleteManyMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  memoryVerifiedFindFirstMock: vi.fn(),
  memoryVerifiedDeleteManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    memoryVerified: {
      findFirst: memoryVerifiedFindFirstMock,
      deleteMany: memoryVerifiedDeleteManyMock,
    },
  },
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/memory/[id]", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    memoryVerifiedFindFirstMock.mockReset();
    memoryVerifiedDeleteManyMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
      authorizedBy: "admin_session",
      rule: { routePattern: "/api/admin/memory/[id]", authMode: "session", scopes: [] },
      key: null,
    });
  });

  it("returns the authorization response when access is denied", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/memory/memory-1"),
      { params: Promise.resolve({ id: "memory-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the record does not belong to the org", async () => {
    memoryVerifiedFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/memory/memory-1"),
      { params: Promise.resolve({ id: "memory-1" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(memoryVerifiedDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes the record when it belongs to the org", async () => {
    memoryVerifiedFindFirstMock.mockResolvedValue({ id: "memory-1", orgId: "org-1" });
    memoryVerifiedDeleteManyMock.mockResolvedValue({ count: 1 });

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/memory/memory-1"),
      { params: Promise.resolve({ id: "memory-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(memoryVerifiedFindFirstMock).toHaveBeenCalledWith({
      where: { id: "memory-1", orgId: "org-1" },
    });
    expect(memoryVerifiedDeleteManyMock).toHaveBeenCalledWith({
      where: { id: "memory-1", orgId: "org-1" },
    });
  });
});