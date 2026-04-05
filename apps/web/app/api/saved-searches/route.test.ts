import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  resolveAuthMock,
  getAllMock,
  createMock,
  deleteManyMock,
  runSearchesMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  deleteManyMock: vi.fn(),
  runSearchesMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/saved-search.service", () => ({
  SavedSearchService: class MockSavedSearchService {
    getAll = getAllMock;
    create = createMock;
    deleteMany = deleteManyMock;
    runSearches = runSearchesMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET, PATCH, POST } from "./route";

describe("/api/saved-searches route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getAllMock.mockReset();
    createMock.mockReset();
    deleteManyMock.mockReset();
    runSearchesMock.mockReset();
    captureExceptionMock.mockReset();
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/saved-searches"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("lists saved searches for the scoped user", async () => {
    getAllMock.mockResolvedValue([{ id: "search-1", name: "IOS leads" }]);
    const res = await GET(new NextRequest("http://localhost/api/saved-searches"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ searches: [{ id: "search-1", name: "IOS leads" }] });
    expect(getAllMock).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("creates a saved search", async () => {
    createMock.mockResolvedValue({ id: "search-2", name: "Truck parking" });
    const req = new NextRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: JSON.stringify({ name: "Truck parking", criteria: { parishes: ["EBR"] } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ search: { id: "search-2", name: "Truck parking" } });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        name: "Truck parking",
        criteria: { parishes: ["EBR"] },
      }),
    );
  });

  it("returns 400 for invalid bulk PATCH payloads", async () => {
    const req = new NextRequest("http://localhost/api/saved-searches", {
      method: "PATCH",
      body: JSON.stringify({ action: "delete", ids: ["not-a-uuid"] }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ids.0");
  });

  it("runs multiple saved searches through PATCH", async () => {
    runSearchesMock.mockResolvedValue({ requested: 1, executed: 1, skipped: 0, results: [], errors: [] });
    const req = new NextRequest("http://localhost/api/saved-searches", {
      method: "PATCH",
      body: JSON.stringify({ action: "run", ids: ["11111111-1111-4111-8111-111111111111"] }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      action: "run",
      result: { requested: 1, executed: 1, skipped: 0, results: [], errors: [] },
    });
  });

  it("surfaces AppError failures during bulk mutation", async () => {
    deleteManyMock.mockRejectedValue(new AppError("Forbidden", "FORBIDDEN", 403));
    const req = new NextRequest("http://localhost/api/saved-searches", {
      method: "PATCH",
      body: JSON.stringify({ action: "delete", ids: ["11111111-1111-4111-8111-111111111111"] }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});