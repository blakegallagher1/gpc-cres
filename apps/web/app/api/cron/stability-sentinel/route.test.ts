import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  automationEventCountMock,
  automationEventCreateMock,
  queryRawMock,
  sentryCaptureExceptionMock,
  sentryCaptureMessageMock,
  fetchMock,
} = vi.hoisted(() => ({
  automationEventCountMock: vi.fn(),
  automationEventCreateMock: vi.fn(),
  queryRawMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  sentryCaptureMessageMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    automationEvent: {
      count: automationEventCountMock,
      create: automationEventCreateMock,
    },
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
  captureMessage: sentryCaptureMessageMock,
}));

describe("GET /api/cron/stability-sentinel", () => {
  let GET: typeof import("./route").GET;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalProbeRuns = process.env.SENTINEL_PROBE_RUNS;
  const originalWebhookUrl = process.env.SENTINEL_ALERT_WEBHOOK_URL;
  const originalBaseUrl = process.env.BASE_URL;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);

    process.env.CRON_SECRET = "cron-secret";
    process.env.SENTINEL_PROBE_RUNS = "1";
    process.env.BASE_URL = "https://gallagherpropco.com";
    delete process.env.SENTINEL_ALERT_WEBHOOK_URL;

    automationEventCountMock.mockReset();
    automationEventCreateMock.mockReset();
    queryRawMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    sentryCaptureMessageMock.mockReset();
    fetchMock.mockReset();

    automationEventCountMock
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    queryRawMock.mockResolvedValue([{ dup_count: 0 }]);
    automationEventCreateMock.mockResolvedValue({});

    ({ GET } = await import("./route"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.CRON_SECRET = originalCronSecret;
    process.env.SENTINEL_PROBE_RUNS = originalProbeRuns;
    process.env.SENTINEL_ALERT_WEBHOOK_URL = originalWebhookUrl;
    process.env.BASE_URL = originalBaseUrl;
  });

  it("returns 401 when cron secret is invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/stability-sentinel", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns PASS when unauthenticated probes are auth-rejected", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const res = await GET(
      new Request("http://localhost/api/cron/stability-sentinel", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.verdict).toBe("PASS");
    expect(body.failCount).toBe(0);
    expect(body.warnCount).toBe(0);
    expect(body.probes.geometry).toHaveLength(1);
    expect(body.probes.db).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(automationEventCreateMock).not.toHaveBeenCalled();
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled();
  });

  it("skips the internal sentinel webhook and persists the alert directly", async () => {
    process.env.SENTINEL_ALERT_WEBHOOK_URL = "https://gallagherpropco.com/api/admin/sentinel-alerts";
    automationEventCountMock.mockReset();
    automationEventCountMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/agent/tools/execute")) {
        return Promise.resolve(new Response("method not allowed", { status: 405 }));
      }

      return Promise.resolve(new Response("unauthorized", { status: 401 }));
    });

    const res = await GET(
      new Request("http://localhost/api/cron/stability-sentinel", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.verdict).toBe("FAIL");
    expect(body.probes.db).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(automationEventCreateMock).toHaveBeenCalledTimes(1);
    expect(sentryCaptureMessageMock).toHaveBeenCalledTimes(1);
  });
});
