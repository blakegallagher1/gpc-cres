import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SOURCE_INGEST_ALERT_TAG = "source-ingestion-stale-offender";
const {
  jurisdictionSeedSourceFindManyMock,
  jurisdictionSeedSourceCreateMock,
  parishPackVersionFindManyMock,
  evidenceSnapshotFindFirstMock,
  runCreateMock,
  runUpdateMock,
  orgMembershipFindManyMock,
  captureEvidenceMock,
  withTimeoutMock,
  createBatchNotificationMock,
  notificationFindManyMock,
} = vi.hoisted(() => ({
  jurisdictionSeedSourceFindManyMock: vi.fn(),
  jurisdictionSeedSourceCreateMock: vi.fn(),
  parishPackVersionFindManyMock: vi.fn(),
  evidenceSnapshotFindFirstMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  orgMembershipFindManyMock: vi.fn(),
  captureEvidenceMock: vi.fn(),
  withTimeoutMock: vi.fn(),
  createBatchNotificationMock: vi.fn(),
  notificationFindManyMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdictionSeedSource: {
      findMany: jurisdictionSeedSourceFindManyMock,
      create: jurisdictionSeedSourceCreateMock,
    },
    parishPackVersion: {
      findMany: parishPackVersionFindManyMock,
    },
    evidenceSnapshot: {
      findFirst: evidenceSnapshotFindFirstMock,
    },
    run: {
      create: runCreateMock,
      update: runUpdateMock,
    },
    orgMembership: {
      findMany: orgMembershipFindManyMock,
    },
    notification: {
      findMany: notificationFindManyMock,
    },
  },
}));

vi.mock("@entitlement-os/evidence", () => ({
  captureEvidence: captureEvidenceMock,
  withTimeout: withTimeoutMock,
}));

vi.mock("@/lib/db/supabaseAdmin", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/lib/services/notification.service", () => ({
  getNotificationService: () => ({
    createBatch: createBatchNotificationMock,
  }),
}));

import { GET } from "./route";

function setupSourceIngestionMocks() {
  jurisdictionSeedSourceFindManyMock.mockImplementation((args) =>
    args?.include
      ? [
          {
            jurisdictionId: "jurisdiction-1",
            url: "https://official.example.gov/zoning",
            jurisdiction: {
              id: "jurisdiction-1",
              name: "Sample Parish",
              orgId: "org-1",
              officialDomains: ["official.example.gov"],
            },
            purpose: "seed",
          },
          {
            jurisdictionId: "jurisdiction-1",
            url: "https://external.example.net/zoning",
            jurisdiction: {
              id: "jurisdiction-1",
              name: "Sample Parish",
              orgId: "org-1",
              officialDomains: ["official.example.gov"],
            },
            purpose: "seed",
          },
        ]
      : [
          {
            jurisdictionId: "jurisdiction-1",
            url: "https://official.example.gov/zoning",
          },
          {
            jurisdictionId: "jurisdiction-1",
            url: "https://external.example.net/zoning",
          },
        ]
  );

  parishPackVersionFindManyMock.mockResolvedValue([]);
  evidenceSnapshotFindFirstMock.mockResolvedValue({
    retrievedAt: new Date("2026-01-10T12:00:00.000Z"),
  });
  captureEvidenceMock.mockImplementation(async () => {
    throw new Error("503 upstream error");
  });
  withTimeoutMock.mockImplementation(async (promise: Promise<unknown>) => promise);
  runCreateMock.mockResolvedValue({ id: "run-source-ingest-1" });
  runUpdateMock.mockResolvedValue({});
  orgMembershipFindManyMock.mockResolvedValue([{ userId: "user-1" }]);
  notificationFindManyMock.mockResolvedValue([]);
  createBatchNotificationMock.mockResolvedValue([]);
}

describe("GET /api/cron/source-ingestion", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    delete process.env.SOURCE_INGEST_ALERT_QUIET_START_HOUR;
    delete process.env.SOURCE_INGEST_ALERT_QUIET_END_HOUR;

    jurisdictionSeedSourceFindManyMock.mockReset();
    jurisdictionSeedSourceCreateMock.mockReset();
    parishPackVersionFindManyMock.mockReset();
    evidenceSnapshotFindFirstMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    orgMembershipFindManyMock.mockReset();
    captureEvidenceMock.mockReset();
    withTimeoutMock.mockReset();
    createBatchNotificationMock.mockReset();
    notificationFindManyMock.mockReset();
    vi.useRealTimers();
  });

  it("returns 401 when cron secret is invalid", async () => {
    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns prioritized stale offender summaries and manifest-backed notification metadata", async () => {
    // Pin clock to 14:00 UTC (outside quiet hours 22-06 UTC) so alert dispatch is not suppressed
    vi.useFakeTimers({ now: new Date("2026-02-01T14:00:00.000Z"), shouldAdvanceTime: true });
    setupSourceIngestionMocks();

    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stats.orgsProcessed).toBe(1);
    expect(body.stats.staleSources).toBe(2);
    expect(body.stats.discoveryCount).toBe(0);
    expect(body.stats.staleRatios).toHaveLength(1);

    const orgSummary = body.stats.staleRatios[0];
    expect(orgSummary).toMatchObject({
      orgId: "org-1",
      staleRatio: 1,
      staleOffenderCount: 2,
    });
    expect(orgSummary.staleOffenders).toHaveLength(2);
    expect(orgSummary.staleOffenders[0].url).toBe(
      "https://official.example.gov/zoning",
    );
    expect(orgSummary.staleOffenders[0].isOfficial).toBe(true);
    expect(orgSummary.staleOffenders[1].isOfficial).toBe(false);
    expect(orgSummary.sourceManifestHash).toBeTruthy();

    const notificationArgs = createBatchNotificationMock.mock.calls[0][0];
    expect(createBatchNotificationMock).toHaveBeenCalledTimes(1);
    expect(notificationArgs).toHaveLength(1);
    expect(notificationArgs[0]).toMatchObject({
      title: "Source ingestion: stale seed sources detected",
      userId: "user-1",
      actionUrl: "/jurisdictions",
      priority: "HIGH",
      metadata: expect.objectContaining({
        sourceIngestAlertTag: SOURCE_INGEST_ALERT_TAG,
        staleOffenderCount: 2,
        staleSourceManifestHash: orgSummary.sourceManifestHash,
      }),
    });

    const updateArgs = runUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.outputJson.staleSourceOffenders).toHaveLength(2);
    expect(updateArgs.data.outputJson.sourceManifest).toHaveLength(2);
  });

  it("suppresses alerting during quiet hours", async () => {
    setupSourceIngestionMocks();

    const now = new Date();
    const currentHour = now.getUTCHours();
    const quietStart = ((currentHour + 23) % 24).toString();
    const quietEnd = ((currentHour + 1) % 24).toString();
    process.env.SOURCE_INGEST_ALERT_QUIET_START_HOUR = quietStart;
    process.env.SOURCE_INGEST_ALERT_QUIET_END_HOUR = quietEnd;

    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(createBatchNotificationMock).not.toHaveBeenCalled();
  });

  it("suppresses duplicate alert dispatch when manifest hash repeats within dedupe window", async () => {
    setupSourceIngestionMocks();

    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const firstRunRes = await GET(req);
    const firstRunBody = await firstRunRes.json();
    const manifestHash = firstRunBody.stats.staleRatios[0].sourceManifestHash;

    createBatchNotificationMock.mockClear();
    notificationFindManyMock.mockResolvedValue([
      {
        id: "prior-alert-1",
        createdAt: new Date("2026-02-14T10:00:00.000Z"),
        metadata: {
          sourceIngestAlertTag: SOURCE_INGEST_ALERT_TAG,
          staleSourceManifestHash: manifestHash,
          staleOffenderCount: 2,
          offenderSignature: "prior-manifest-stable",
        },
      },
    ]);

    const secondRunRes = await GET(req);
    expect(secondRunRes.status).toBe(200);
    await secondRunRes.json();
    expect(createBatchNotificationMock).not.toHaveBeenCalled();
  });

  it("escalates alert severity after consecutive offender repetitions", async () => {
    setupSourceIngestionMocks();

    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const firstRunRes = await GET(req);
    const firstRunBody = await firstRunRes.json();
    const manifestHash = firstRunBody.stats.staleRatios[0].sourceManifestHash;

    createBatchNotificationMock.mockClear();
    notificationFindManyMock.mockResolvedValue([
      {
        id: "prior-alert-1",
        createdAt: new Date("2026-02-14T10:00:00.000Z"),
        metadata: {
          sourceIngestAlertTag: SOURCE_INGEST_ALERT_TAG,
          staleSourceManifestHash: manifestHash,
          staleOffenderCount: 2,
          offenderSignature: "prior-manifest-stable-1",
        },
      },
      {
        id: "prior-alert-2",
        createdAt: new Date("2026-02-14T09:00:00.000Z"),
        metadata: {
          sourceIngestAlertTag: SOURCE_INGEST_ALERT_TAG,
          staleSourceManifestHash: manifestHash,
          staleOffenderCount: 2,
          offenderSignature: "prior-manifest-stable-2",
        },
      },
    ]);

    const secondRunRes = await GET(req);
    const secondRunBody = await secondRunRes.json();
    const notifications = createBatchNotificationMock.mock.calls[0][0];

    expect(secondRunRes.status).toBe(200);
    expect(secondRunBody.ok).toBe(true);
    expect(createBatchNotificationMock).toHaveBeenCalledTimes(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: "Source ingestion: repeated stale-offender pattern detected",
      priority: "CRITICAL",
      metadata: expect.objectContaining({
        staleSourceManifestHash: manifestHash,
      }),
    });
  });
});
