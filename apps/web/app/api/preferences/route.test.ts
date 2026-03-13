import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listUserPreferencesMock,
  shouldUseAppDatabaseDevFallbackMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listUserPreferencesMock: vi.fn(),
  shouldUseAppDatabaseDevFallbackMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/preferenceService", () => ({
  listUserPreferences: listUserPreferencesMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: shouldUseAppDatabaseDevFallbackMock,
}));

import { GET } from "./route";

describe("GET /api/preferences", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listUserPreferencesMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/preferences"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(listUserPreferencesMock).not.toHaveBeenCalled();
  });

  it("returns preferences for the authenticated user", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    listUserPreferencesMock.mockResolvedValue([
      { id: "pref-1", category: "COMMUNICATION", key: "style", value: "concise" },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/preferences"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      preferences: [
        { id: "pref-1", category: "COMMUNICATION", key: "style", value: "concise" },
      ],
    });
    expect(listUserPreferencesMock).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("returns an empty degraded payload when app DB fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const res = await GET(new NextRequest("http://localhost/api/preferences"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ preferences: [], degraded: true });
    expect(listUserPreferencesMock).not.toHaveBeenCalled();
  });
});
