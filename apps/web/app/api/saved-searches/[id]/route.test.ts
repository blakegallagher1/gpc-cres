import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  resolveAuthMock,
  getByIdMock,
  updateMock,
  deleteMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getByIdMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@/lib/services/saved-search.service", () => ({
  SavedSearchService: class MockSavedSearchService {
    getById = getByIdMock;
    update = updateMock;
    delete = deleteMock;
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { DELETE, GET, PATCH } from "./route";

describe("/api/saved-searches/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getByIdMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    captureExceptionMock.mockReset();
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/saved-searches/search-1"), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns the saved search with matches", async () => {
    getByIdMock.mockResolvedValue({ id: "search-1", name: "IOS leads" });
    const res = await GET(new NextRequest("http://localhost/api/saved-searches/search-1"), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ search: { id: "search-1", name: "IOS leads" } });
  });

  it("updates a saved search", async () => {
    updateMock.mockResolvedValue({ id: "search-1", name: "Updated" });
    const req = new NextRequest("http://localhost/api/saved-searches/search-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated", alertEnabled: true }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "search-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ search: { id: "search-1", name: "Updated" } });
  });

  it("surfaces AppError for missing saved search", async () => {
    getByIdMock.mockRejectedValue(new AppError("Not found", "NOT_FOUND", 404));
    const res = await GET(new NextRequest("http://localhost/api/saved-searches/search-1"), {
      params: Promise.resolve({ id: "search-1" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("deletes a saved search", async () => {
    const req = new NextRequest("http://localhost/api/saved-searches/search-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "search-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteMock).toHaveBeenCalledWith("search-1", "org-1", "user-1");
  });
});