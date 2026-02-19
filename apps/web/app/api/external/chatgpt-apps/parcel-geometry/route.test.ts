import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  checkRateLimitMock,
  getParcelGeometryMock,
  captureChatGptAppsErrorMock,
  propertyDbRpcMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getParcelGeometryMock: vi.fn(),
  captureChatGptAppsErrorMock: vi.fn(),
  propertyDbRpcMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/server/chatgptAppsClient", () => ({
  getParcelGeometry: getParcelGeometryMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureChatGptAppsError: captureChatGptAppsErrorMock,
}));

vi.mock("@entitlement-os/openai", () => ({
  propertyDbRpc: propertyDbRpcMock,
}));

describe("POST /api/external/chatgpt-apps/parcel-geometry", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    checkRateLimitMock.mockReset();
    getParcelGeometryMock.mockReset();
    captureChatGptAppsErrorMock.mockReset();
    propertyDbRpcMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    checkRateLimitMock.mockReturnValue(true);
    ({ POST } = await import("./route"));
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc", detailLevel: "low" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input body", async () => {
    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ detailLevel: "low" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns geometry payload on happy path", async () => {
    getParcelGeometryMock.mockResolvedValue({
      ok: true,
      requestId: "req-1",
      data: {
        bbox: [-91.2, 30.3, -91.1, 30.4],
        centroid: { lat: 30.35, lng: -91.15 },
        area_sqft: 1000,
        geom_simplified: JSON.stringify({ type: "Polygon", coordinates: [] }),
        srid: 4326,
        dataset_version: "v1",
      },
      durationMs: 20,
    });

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty("geom_simplified");
  });
});
