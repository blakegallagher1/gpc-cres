import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, listJurisdictionsMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listJurisdictionsMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listJurisdictions: listJurisdictionsMock,
}));

import { GET } from "./route";

describe("/api/jurisdictions route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listJurisdictionsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/jurisdictions"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(listJurisdictionsMock).not.toHaveBeenCalled();
  });
});
