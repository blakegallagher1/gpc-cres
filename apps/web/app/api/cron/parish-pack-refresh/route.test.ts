import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  jurisdictionFindManyMock,
  runWithCronMonitorMock,
  loggerInfoMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  jurisdictionFindManyMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdiction: {
      findMany: jurisdictionFindManyMock,
    },
  },
}));

vi.mock("@entitlement-os/openai", () => ({
  createStrictJsonResponse: vi.fn(),
}));

vi.mock("@entitlement-os/shared", () => ({
  zodToOpenAiJsonSchema: vi.fn(() => ({ type: "object" })),
  ParishPackSchema: {},
  validateParishPackSchemaAndCitations: vi.fn(),
}));

vi.mock("@entitlement-os/shared/evidence", () => ({
  computeEvidenceHash: vi.fn(),
  dedupeEvidenceCitations: vi.fn((citations: unknown[]) => citations),
}));

vi.mock("@entitlement-os/shared/crypto", () => ({
  hashJsonSha256: vi.fn(),
}));

vi.mock("@entitlement-os/evidence", () => ({
  captureEvidence: vi.fn(),
  withRetry: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  fetchObjectBytesFromGateway: vi.fn(),
  systemAuth: vi.fn(),
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
  serializeErrorForLogs: serializeErrorForLogsMock,
}));

vi.mock("@sentry/nextjs", () => ({}));

import { GET } from "./route";

describe("GET /api/cron/parish-pack-refresh", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    jurisdictionFindManyMock.mockReset();
    runWithCronMonitorMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    runWithCronMonitorMock.mockImplementation(({ handler }: { handler: () => Promise<Response> }) =>
      handler(),
    );
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runWithCronMonitorMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid sku filter", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh?sku=INVALID", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid sku" });
    expect(jurisdictionFindManyMock).not.toHaveBeenCalled();
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "parish-pack-refresh",
        schedule: "0 4 * * 0",
      }),
    );
  });

  it("returns an empty summary when there are no jurisdictions to refresh", async () => {
    jurisdictionFindManyMock.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      message: "No jurisdictions to refresh",
      stats: { total: 0, refreshed: 0, skipped: 0 },
    });
    expect(jurisdictionFindManyMock).toHaveBeenCalledWith({
      where: undefined,
      include: {
        seedSources: { where: { active: true } },
      },
    });
  });
});