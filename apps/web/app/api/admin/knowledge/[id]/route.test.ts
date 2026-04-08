import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  findKnowledgeRowMock,
  deleteKnowledgeRowMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  findKnowledgeRowMock: vi.fn(),
  deleteKnowledgeRowMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/admin/knowledge.service", () => ({
  findKnowledgeRow: findKnowledgeRowMock,
  deleteKnowledgeRow: deleteKnowledgeRowMock,
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/knowledge/[id]", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    findKnowledgeRowMock.mockReset();
    deleteKnowledgeRowMock.mockReset();

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
    expect(findKnowledgeRowMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the embedding does not belong to the org", async () => {
    findKnowledgeRowMock.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/knowledge/knowledge-1"),
      { params: Promise.resolve({ id: "knowledge-1" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(findKnowledgeRowMock).toHaveBeenCalledWith("knowledge-1", "org-1");
    expect(deleteKnowledgeRowMock).not.toHaveBeenCalled();
  });

  it("deletes the embedding when it belongs to the org", async () => {
    findKnowledgeRowMock.mockResolvedValue("knowledge-1");
    deleteKnowledgeRowMock.mockResolvedValue(undefined);

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/knowledge/knowledge-1"),
      { params: Promise.resolve({ id: "knowledge-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(findKnowledgeRowMock).toHaveBeenCalledWith("knowledge-1", "org-1");
    expect(deleteKnowledgeRowMock).toHaveBeenCalledWith("knowledge-1", "org-1");
  });
});
