import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}));

describe("GET /api/health/detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HEALTHCHECK_TOKEN = "health-token";
  });

  it("returns detailed health payload", async () => {
    const { prisma } = await import("@entitlement-os/db");

    (
      prisma as unknown as {
        $queryRawUnsafe: {
          mockResolvedValueOnce: (value: unknown) => unknown;
        };
      }
    )
      .$queryRawUnsafe.mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([{ migration_name: "20240202020202_init" }]);

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
    expect(payload.migrationVersion).toBe("20240202020202_init");
    expect(payload.workspaceVersions).toMatchObject({
      "@entitlement-os/db": "0.1.0",
      "gpc-agent-dashboard": "1.0.0",
    });
    expect(payload.timestamp).toBe(new Date(payload.timestamp).toISOString());
    expect(payload.uptimeSeconds).toBeTypeOf("number");
  });

  it("returns 401 when unauthorized", async () => {
    delete process.env.HEALTHCHECK_TOKEN;

    const { GET } = await import("@/app/api/health/detailed/route");

    const response = await GET(
      new NextRequest("http://localhost/api/health/detailed")
    );

    expect(response.status).toBe(401);
  });
});
