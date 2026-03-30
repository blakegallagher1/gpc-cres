import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    orgMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getPropertyDbConfigOrNull: vi.fn(),
}));

describe("GET /api/health/detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HEALTHCHECK_TOKEN = "health-token";
    process.env.LOCAL_API_URL = "http://gateway.test";
    process.env.LOCAL_API_KEY = "gateway-key";
    delete process.env.DATABASE_URL;
  });

  it("returns detailed health payload", async () => {
    const { prisma } = await import("@entitlement-os/db");
    const { getPropertyDbConfigOrNull } = await import("@/lib/server/propertyDbEnv");

    (
      prisma as unknown as {
        $queryRawUnsafe: {
          mockResolvedValueOnce: (value: unknown) => unknown;
        };
      }
    )
      .$queryRawUnsafe.mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([{ migration_name: "20240202020202_init" }]);
    (
      getPropertyDbConfigOrNull as unknown as { mockReturnValue: (v: unknown) => void }
    ).mockReturnValue({
      url: "http://gateway.test",
      key: "gateway-key",
    });

    const { GET } = await import("@/app/api/health/detailed/route");

    const response = await GET(
      new NextRequest("http://localhost/api/health/detailed", {
        headers: { "x-health-token": "health-token" },
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dbStatus.ok).toBe(true);
    expect(payload.dbStatus.latencyMs).toBeTypeOf("number");
    expect(payload.propertyDb).toMatchObject({
      dbMode: "gateway",
      gatewayConfigured: true,
      directUrlConfigured: false,
    });
    expect(payload.migrationVersion).toBe("20240202020202_init");
    expect(payload.timestamp).toBe(new Date(payload.timestamp).toISOString());
    expect(payload.uptimeSeconds).toBeTypeOf("number");
  });

  it("returns 401 when unauthorized", async () => {
    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;
    process.env.NEXTAUTH_SECRET = "legacy-nextauth-secret";

    try {
      const { GET } = await import("@/app/api/health/detailed/route");
      const { getToken } = await import("next-auth/jwt");

      const response = await GET(
        new NextRequest("http://localhost/api/health/detailed")
      );

      expect(response.status).toBe(401);
      expect(getToken).toHaveBeenCalled();
    } finally {
      process.env.HEALTHCHECK_TOKEN = "health-token";
    }
  });
});
