import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    evidenceSource: { findMany: vi.fn() },
    jurisdiction: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("@/lib/server/chatgptAppsClient", () => ({
  getParcelGeometry: vi.fn(),
}));

describe("API Route Auth Guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/evidence returns 401 when unauthenticated", async () => {
    const { resolveAuth } = await import("@/lib/auth/resolveAuth");
    (resolveAuth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const { prisma } = await import("@entitlement-os/db");
    const { GET } = await import("@/app/api/evidence/route");

    const res = await GET(new Request("http://localhost/api/evidence") as never);

    expect(res.status).toBe(401);
    expect((prisma as unknown as { evidenceSource: { findMany: unknown } }).evidenceSource.findMany).not.toHaveBeenCalled();
  });

  it("GET /api/jurisdictions returns 401 when unauthenticated", async () => {
    const { resolveAuth } = await import("@/lib/auth/resolveAuth");
    (resolveAuth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const { prisma } = await import("@entitlement-os/db");
    const { GET } = await import("@/app/api/jurisdictions/route");

    const res = await GET();

    expect(res.status).toBe(401);
    expect((prisma as unknown as { jurisdiction: { findMany: unknown } }).jurisdiction.findMany).not.toHaveBeenCalled();
  });

  it("POST /api/external/chatgpt-apps/parcel-geometry returns 401 when unauthenticated (no rate limit burn)", async () => {
    const { resolveAuth } = await import("@/lib/auth/resolveAuth");
    (resolveAuth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);

    const { checkRateLimit } = await import("@/lib/server/rateLimiter");
    const { getParcelGeometry } = await import("@/lib/server/chatgptAppsClient");
    const { POST } = await import("@/app/api/external/chatgpt-apps/parcel-geometry/route");

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId: "parcel-1" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(getParcelGeometry).not.toHaveBeenCalled();
  });
});

