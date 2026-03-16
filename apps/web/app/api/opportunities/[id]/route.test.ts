import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  resolveAuthMock,
  markSeenMock,
  dismissMatchMock,
  markPursuedMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  markSeenMock: vi.fn(),
  dismissMatchMock: vi.fn(),
  markPursuedMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/saved-search.service", () => ({
  SavedSearchService: class MockSavedSearchService {
    markSeen = markSeenMock;
    dismissMatch = dismissMatchMock;
    markPursued = markPursuedMock;
  },
}));

import { PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "44444444-4444-4444-8444-444444444444";

describe("/api/opportunities/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    markSeenMock.mockReset();
    dismissMatchMock.mockReset();
    markPursuedMock.mockReset();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/opportunities/${MATCH_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "seen" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid actions", async () => {
    const req = new NextRequest(`http://localhost/api/opportunities/${MATCH_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "archive" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("action");
    expect(markSeenMock).not.toHaveBeenCalled();
    expect(dismissMatchMock).not.toHaveBeenCalled();
    expect(markPursuedMock).not.toHaveBeenCalled();
  });

  it("passes scoped service errors through", async () => {
    dismissMatchMock.mockRejectedValue(new AppError("Forbidden", "FORBIDDEN", 403));

    const req = new NextRequest(`http://localhost/api/opportunities/${MATCH_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "dismiss" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(dismissMatchMock).toHaveBeenCalledWith(MATCH_ID, ORG_ID, USER_ID);
  });

  it("records pursued feedback for a valid match", async () => {
    markPursuedMock.mockResolvedValue({
      id: MATCH_ID,
      pursuedAt: "2026-03-16T12:00:00.000Z",
    });

    const req = new NextRequest(`http://localhost/api/opportunities/${MATCH_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "pursue" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: MATCH_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(markPursuedMock).toHaveBeenCalledWith(MATCH_ID, ORG_ID, USER_ID);
    expect(body).toEqual({
      match: {
        id: MATCH_ID,
        pursuedAt: "2026-03-16T12:00:00.000Z",
      },
    });
  });
});
