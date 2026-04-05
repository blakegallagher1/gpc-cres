import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  queryRawUnsafeMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  queryRawUnsafeMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafeMock,
  },
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/knowledge/[id]", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    queryRawUnsafeMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
      authorizedBy: "admin_session",
      rule: { routePattern: "/api/admin/knowledge/[id]", authMode: "session", scopes: [] },
      key: null,
    });
  });

  it("returns the authorization response when access is denied", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/knowledge/knowledge-1"),
      { params: Promise.resolve({ id: "knowledge-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the embedding does not belong to the org", async () => {
    queryRawUnsafeMock.mockResolvedValueOnce([]);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/knowledge/knowledge-1"),
      { params: Promise.resolve({ id: "knowledge-1" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(queryRawUnsafeMock).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafeMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM knowledge_embeddings"),
      "knowledge-1",
      "org-1",
    );
  });

  it("deletes the embedding when it belongs to the org", async () => {
    queryRawUnsafeMock.mockResolvedValueOnce([{ id: "knowledge-1" }]).mockResolvedValueOnce([]);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/knowledge/knowledge-1"),
      { params: Promise.resolve({ id: "knowledge-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(queryRawUnsafeMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT id FROM knowledge_embeddings"),
      "knowledge-1",
      "org-1",
    );
    expect(queryRawUnsafeMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM knowledge_embeddings"),
      "knowledge-1",
      "org-1",
    );
  });
});