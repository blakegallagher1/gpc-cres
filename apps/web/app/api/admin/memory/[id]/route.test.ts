import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  deleteVerifiedMemoryMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  deleteVerifiedMemoryMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/admin/memory.service", () => ({
  deleteVerifiedMemory: deleteVerifiedMemoryMock,
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/memory/[id]", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    deleteVerifiedMemoryMock.mockReset();

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
    deleteVerifiedMemoryMock.mockResolvedValue(false);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/memory/memory-1"),
      { params: Promise.resolve({ id: "memory-1" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("deletes the record when it belongs to the org", async () => {
    deleteVerifiedMemoryMock.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/memory/memory-1"),
      { params: Promise.resolve({ id: "memory-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(deleteVerifiedMemoryMock).toHaveBeenCalledWith({
      id: "memory-1",
      orgId: "org-1",
    });
  });
});
