import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("POST /api/map/isochrone", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/map/isochrone", {
      method: "POST",
      body: JSON.stringify({ lat: 30.45, lng: -91.18, minutes: 10 }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth has no org scope", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: "" });

    const req = new NextRequest("http://localhost/api/map/isochrone", {
      method: "POST",
      body: JSON.stringify({ lat: 30.45, lng: -91.18, minutes: 10 }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/map/isochrone", {
      method: "POST",
      body: JSON.stringify({ lat: 95, lng: -91.18, minutes: 0 }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns an isochrone polygon for valid input", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{ duration: 120 }],
      }),
    } as Response);

    const req = new NextRequest("http://localhost/api/map/isochrone", {
      method: "POST",
      body: JSON.stringify({ lat: 30.45, lng: -91.18, minutes: 10 }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.polygon)).toBe(true);
    expect(body.polygon.length).toBe(17);
    expect(fetchMock).toHaveBeenCalled();
  });
});
