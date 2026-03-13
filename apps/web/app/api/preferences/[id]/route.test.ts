import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  updateUserPreferenceMock,
  shouldUseAppDatabaseDevFallbackMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  updateUserPreferenceMock: vi.fn(),
  shouldUseAppDatabaseDevFallbackMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/preferenceService", () => ({
  updateUserPreference: updateUserPreferenceMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: shouldUseAppDatabaseDevFallbackMock,
}));

import { PATCH } from "./route";

describe("PATCH /api/preferences/[id]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    updateUserPreferenceMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await PATCH(
      new NextRequest("http://localhost/api/preferences/pref-1", {
        method: "PATCH",
        body: JSON.stringify({ confidence: 0.8 }),
      }),
      { params: Promise.resolve({ id: "pref-1" }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(updateUserPreferenceMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const res = await PATCH(
      new NextRequest("http://localhost/api/preferences/pref-1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "pref-1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Validation failed",
    });
    expect(updateUserPreferenceMock).not.toHaveBeenCalled();
  });

  it("returns 503 when app DB fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const res = await PATCH(
      new NextRequest("http://localhost/api/preferences/pref-1", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: "pref-1" }) },
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Preference storage is temporarily unavailable",
      degraded: true,
    });
    expect(updateUserPreferenceMock).not.toHaveBeenCalled();
  });

  it("updates a preference for the authenticated user", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    updateUserPreferenceMock.mockResolvedValue({
      id: "pref-1",
      confidence: 0.9,
      isActive: true,
    });

    const res = await PATCH(
      new NextRequest("http://localhost/api/preferences/pref-1", {
        method: "PATCH",
        body: JSON.stringify({ confidence: 0.9, isActive: true }),
      }),
      { params: Promise.resolve({ id: "pref-1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      preference: {
        id: "pref-1",
        confidence: 0.9,
        isActive: true,
      },
    });
    expect(updateUserPreferenceMock).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      preferenceId: "pref-1",
      confidence: 0.9,
      isActive: true,
    });
  });
});
