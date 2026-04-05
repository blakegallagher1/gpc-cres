import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  resolveAuthMock,
  runSearchMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runSearchMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/saved-search.service", () => ({
  SavedSearchService: class MockSavedSearchService {
    runSearch = runSearchMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { POST } from "./route";

describe("POST /api/saved-searches/[id]/run", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    runSearchMock.mockReset();
    captureExceptionMock.mockReset();
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/saved-searches/search-1/run", { method: "POST" }), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("runs the saved search for the scoped user", async () => {
    runSearchMock.mockResolvedValue({ newMatches: 2, totalMatches: 5 });
    const res = await POST(new NextRequest("http://localhost/api/saved-searches/search-1/run", { method: "POST" }), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ newMatches: 2, totalMatches: 5 });
    expect(runSearchMock).toHaveBeenCalledWith("search-1", "org-1", "user-1");
  });

  it("surfaces AppError responses", async () => {
    runSearchMock.mockRejectedValue(new AppError("Search not found", "NOT_FOUND", 404));
    const res = await POST(new NextRequest("http://localhost/api/saved-searches/search-1/run", { method: "POST" }), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Search not found" });
  });
});